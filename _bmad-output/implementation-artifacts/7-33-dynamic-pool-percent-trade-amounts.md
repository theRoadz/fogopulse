# Story 7.33: Dynamic Pool-Percent Trade Amounts for Trade Bot

Status: done
Created: 2026-03-26
Epic: 7 - Platform Polish & UX
Sprint: Current
Priority: Medium — Market Realism

## Story

As a platform operator,
I want the trade bot to dynamically size its trades as a percentage of the total pool reserves,
so that trade amounts scale naturally with pool liquidity instead of being hardcoded values that may be too large or too small relative to the pool.

## Problem

The trade bot currently uses hardcoded `TRADE_BOT_MIN_AMOUNT` and `TRADE_BOT_MAX_AMOUNT` from `.env` to determine trade sizes. This creates a mismatch between trade size and pool size:

- A $200 max trade is fine for a $10K pool but is meaningless noise for a $1M pool
- The same $200 max trade could be dangerously large for a $500 pool, creating outsized positions
- As pools grow or shrink, operators must manually update env vars to keep trade sizes proportional
- Different pools (BTC vs FOGO) may have wildly different liquidity, but share the same static limits

### Current Flow

1. `loadConfig()` reads `TRADE_BOT_MIN_AMOUNT` (default 0.5 USDC) and `TRADE_BOT_MAX_AMOUNT` (default 5.0 USDC) from `.env`
2. These static values are passed to every strategy via `ctx.config.minAmount` / `ctx.config.maxAmount`
3. Strategies pick amounts within this fixed range regardless of pool size
4. Final amount is clamped to `[minAmount, maxAmount]` in `executeTrade()` (line 1426)

### What Already Exists

The trade bot **already reads all the data needed** to solve this:
- Pool reserves (`yes_reserves`, `no_reserves`) are parsed in `parsePoolAccount()` and available in `StrategyContext.pool`
- On-chain `max_trade_amount` is parsed from `GlobalConfig` and refreshed every 5 minutes
- New epoch detection already reads fresh pool data (line 1253)

## Solution

Add two optional env vars: `TRADE_BOT_MAX_POOL_PERCENT` and `TRADE_BOT_MIN_POOL_PERCENT`. When `MAX_POOL_PERCENT` is set, the bot computes effective min/max trade amounts from pool reserves at each epoch start.

### How It Works

1. At epoch start, read `poolData.yesReserves + poolData.noReserves` = total pool USDC
2. `effectiveMaxAmount = totalPool * (MAX_POOL_PERCENT / 100)`
3. `effectiveMinAmount = totalPool * (MIN_POOL_PERCENT / 100)` (or 10% of max if MIN not set)
4. Cap `effectiveMaxAmount` at on-chain `globalConfig.maxTradeAmount`
5. Floor both at $0.10 to prevent dust trades
6. These effective amounts override `config.minAmount` / `config.maxAmount` in the StrategyContext

### Key Design Decisions

1. **Per-epoch recomputation** — Pool reserves change between epochs (deposits, withdrawals, rebalancing), so amounts are recalculated each epoch
2. **Two separate env vars** — `MIN_POOL_PERCENT` and `MAX_POOL_PERCENT` give operators explicit control over the range
3. **Backward compatible** — When neither env var is set, behavior is identical to current (static min/max)
4. **On-chain hard cap respected** — `globalConfig.maxTradeAmount` always caps the computed max
5. **Strategy-transparent** — Strategies don't need changes; they already read `ctx.config.minAmount/maxAmount` which we override

### Example

Pool with $10,000 total reserves, `MAX_POOL_PERCENT=5`, `MIN_POOL_PERCENT=0.5`:
- `effectiveMaxAmount = $10,000 * 5% = $500`
- `effectiveMinAmount = $10,000 * 0.5% = $50`
- If on-chain `max_trade_amount` is $100, then `effectiveMaxAmount` is capped at $100

## Acceptance Criteria

1. **Given** `TRADE_BOT_MAX_POOL_PERCENT=5` and `TRADE_BOT_MIN_POOL_PERCENT=0.5`, **When** a new epoch starts with $10K pool, **Then** effective trade range is $50-$500 USDC
2. **Given** only `TRADE_BOT_MAX_POOL_PERCENT=5` (no min set), **When** a new epoch starts, **Then** effective min auto-computes to 10% of max (0.5% of pool)
3. **Given** neither pool percent var is set, **When** the bot runs, **Then** behavior is identical to current (uses static `MIN_AMOUNT`/`MAX_AMOUNT`)
4. **Given** computed max exceeds on-chain `max_trade_amount`, **When** a new epoch starts, **Then** effective max is capped at the on-chain limit
5. **Given** pool reserves are near zero, **When** a new epoch starts, **Then** effective amounts floor at $0.10 (no zero-amount trades)
6. **Given** pool percent mode is active, **When** epoch logs print, **Then** they show the computed range (e.g., "Pool-percent: pool=10000.00 USDC, 0.5%-5% => range=50.00-500.00 USDC")
7. **Given** any existing strategy (random, momentum, contrarian, pool_imbalance, composite), **When** pool percent mode is active, **Then** the strategy uses the dynamic range without code changes to the strategy itself
8. **Given** `max_trade_amount` is set very high on-chain, **When** user clicks the "Max" quick-amount button, **Then** the amount respects `wallet_cap_bps` (not just `max_trade_amount` and balance)
9. **Given** user has an existing position in the selected direction, **When** user clicks "Max", **Then** the amount accounts for the existing position against the wallet cap

## Architecture

### Config Changes

```typescript
interface TradeBotConfig {
  // ... existing fields ...
  maxPoolPercent: number | null  // null = use static maxAmount
  minPoolPercent: number | null  // null = use static minAmount (or auto 10% of max)
}
```

### MarketMonitor Changes

```typescript
class MarketMonitor {
  // ... existing fields ...
  private effectiveMinAmount: number  // recomputed per epoch
  private effectiveMaxAmount: number  // recomputed per epoch
}
```

### Epoch-Start Computation (in poll() new-epoch block)

```typescript
if (this.config.maxPoolPercent !== null) {
  const totalPoolUsdc = Number(poolData.yesReserves + poolData.noReserves) / 1e6
  let computedMax = totalPoolUsdc * (this.config.maxPoolPercent / 100)
  let computedMin = this.config.minPoolPercent !== null
    ? totalPoolUsdc * (this.config.minPoolPercent / 100)
    : computedMax * 0.1

  const onChainMaxUsdc = Number(this.globalConfig.maxTradeAmount) / 1e6
  if (onChainMaxUsdc > 0) computedMax = Math.min(computedMax, onChainMaxUsdc)

  computedMax = Math.max(0.10, computedMax)
  computedMin = Math.max(0.10, Math.min(computedMin, computedMax))

  this.effectiveMinAmount = computedMin
  this.effectiveMaxAmount = computedMax
}
```

### executeTrade Override

```typescript
// Override config with effective amounts for strategy context
const effectiveConfig = { ...this.config, minAmount: this.effectiveMinAmount, maxAmount: this.effectiveMaxAmount }
// Use effectiveConfig in StrategyContext instead of this.config
// Use this.effectiveMinAmount/MaxAmount for final clamping
```

### New Environment Variables

```env
# Optional: Trade amounts as % of total pool reserves (overrides MIN/MAX_AMOUNT when set)
# Recomputed each epoch from (yes_reserves + no_reserves).
# Still respects on-chain max_trade_amount as hard cap.
# TRADE_BOT_MAX_POOL_PERCENT=5
# TRADE_BOT_MIN_POOL_PERCENT=0.5
```

## Critical Reference Files

| File | Purpose |
|------|---------|
| `crank-bot/trade-bot.ts` | Primary file — trade bot pool-percent changes |
| `crank-bot/.env.example` | Add new env var documentation |
| `anchor/programs/fogopulse/src/state/pool.rs` | Pool account struct (yes_reserves, no_reserves, wallet_cap_bps) |
| `anchor/programs/fogopulse/src/state/config.rs` | GlobalConfig struct (max_trade_amount) |
| `web/src/components/trading/quick-amount-buttons.tsx` | Max button — accept walletCapMax prop |
| `web/src/components/trading/trade-ticket.tsx` | Compute walletCapMax from pool data |
| `web/src/lib/cap-utils.ts` | Cap calculation utilities (reference, no changes) |

## Tasks / Subtasks

### Task 1: Add pool percent fields to TradeBotConfig (AC: #3)

- [x] 1.1: Add `maxPoolPercent: number | null` and `minPoolPercent: number | null` to `TradeBotConfig` interface (line 130)
- [x] 1.2: Parse `TRADE_BOT_MAX_POOL_PERCENT` and `TRADE_BOT_MIN_POOL_PERCENT` in `loadConfig()` (line 312)
- [x] 1.3: Add validation: both must be >0 and <=50, min must be <= max
- [x] 1.4: Log pool-percent config at startup if set

### Task 2: Add effective amount fields to MarketMonitor (AC: #1, #2)

- [x] 2.1: Add `effectiveMinAmount` and `effectiveMaxAmount` private fields to `MarketMonitor` class (line 1167)
- [x] 2.2: Initialize from `config.minAmount` / `config.maxAmount` in constructor

### Task 3: Recompute effective amounts at epoch start (AC: #1, #2, #4, #5, #6)

- [x] 3.1: In the "New epoch detected" block (after line 1273), compute effective amounts from pool reserves when `maxPoolPercent` is set
- [x] 3.2: Cap computed max at on-chain `globalConfig.maxTradeAmount`
- [x] 3.3: Floor at $0.10 to prevent dust trades
- [x] 3.4: Log the computed range

### Task 4: Use effective amounts in executeTrade (AC: #7)

- [x] 4.1: Override `config.minAmount`/`maxAmount` with effective amounts in StrategyContext (line 1408)
- [x] 4.2: Use effective amounts for final amount clamping (line 1426)

### Task 5: Update .env.example documentation

- [x] 5.1: Add commented-out `TRADE_BOT_MAX_POOL_PERCENT` and `TRADE_BOT_MIN_POOL_PERCENT` with description

### Task 6: UI Max button respects wallet cap (AC: #8, #9)

- [x] 6.1: Add `walletCapMax` prop to `QuickAmountButtons` component
- [x] 6.2: Factor `walletCapMax` into Max button click handler and fixed-amount button disabled logic
- [x] 6.3: Compute `walletCapMax` in `TradeTicket` from pool `wallet_cap_bps`, direction, and existing position
- [x] 6.4: Pass `walletCapMax` to `QuickAmountButtons`

## File Changes

| File | Action | Lines |
|------|--------|-------|
| `crank-bot/trade-bot.ts` | Edit interface | ~130 |
| `crank-bot/trade-bot.ts` | Edit loadConfig() | ~312-350 |
| `crank-bot/trade-bot.ts` | Edit MarketMonitor class fields | ~1167 |
| `crank-bot/trade-bot.ts` | Edit MarketMonitor constructor | ~1203 |
| `crank-bot/trade-bot.ts` | Edit poll() epoch detection | ~1273 |
| `crank-bot/trade-bot.ts` | Edit executeTrade() | ~1408, 1426 |
| `crank-bot/.env.example` | Add env var docs | end of file |
| `web/src/components/trading/quick-amount-buttons.tsx` | Add walletCapMax prop | 5, 40, 53 |
| `web/src/lib/cap-utils.ts` | Add calculateGrossFromNetLamports, calculateWalletCapMaxGross | 67-103 |
| `web/src/components/trading/trade-ticket.tsx` | Compute walletCapMax via cap-utils, pass as prop | 3, 14-15, ~137, ~318 |

## Dev Agent Record

### Implementation Summary

All changes contained in two files:

**`crank-bot/trade-bot.ts`:**
- Added `maxPoolPercent` and `minPoolPercent` fields to `TradeBotConfig` interface
- Added parsing of `TRADE_BOT_MAX_POOL_PERCENT` and `TRADE_BOT_MIN_POOL_PERCENT` in `loadConfig()` with validation (0-50 range, min <= max)
- Added `effectiveMinAmount` / `effectiveMaxAmount` fields to `MarketMonitor` class, initialized from static config
- Added pool-percent recomputation in the "New epoch detected" block — reads pool reserves, computes amounts, caps at on-chain `maxTradeAmount`, floors at $0.10
- Updated `executeTrade()` to pass effective amounts into `StrategyContext` and use them for final amount clamping
- Updated USDC balance check to use effective min amount
- Added startup log line when pool-percent mode is active

**`crank-bot/.env.example`:**
- Added documented `TRADE_BOT_MAX_POOL_PERCENT` and `TRADE_BOT_MIN_POOL_PERCENT` entries

### Decisions
- Min amount defaults to 10% of max when `MIN_POOL_PERCENT` is not set (matches existing 0.5/5.0 ratio)
- Floor of $0.10 prevents dust trades when pool is nearly empty
- Strategies remain untouched — amounts are overridden in the config spread into StrategyContext

### UI Max Button Fix (Task 6)

**`web/src/components/trading/quick-amount-buttons.tsx`:**
- Added `walletCapMax` prop to interface and destructuring
- Max button click handler now uses `Math.min(balance, maxTradeAmount, walletCapMax)` (all optional)
- Fixed-amount buttons ($5, $10, $20) disabled when amount exceeds wallet cap
- Updated aria-label to reflect effective max

**`web/src/components/trading/trade-ticket.tsx`:**
- Added `useMemo` import and `PER_WALLET_CAP_BPS`, `TRADING_FEE_BPS` constants import
- Added `walletCapMax` computation via `useMemo` — derives max gross USDC from pool's `walletCapBps`, subtracting existing position in selected direction, converting net cap to gross via fee rate
- Passed `walletCapMax` to `QuickAmountButtons`

### Design Note: wallet_cap_bps as primary governor
- `max_trade_amount` on-chain can be set very high (safety net only)
- `wallet_cap_bps` (default 500 = 5% of pool) is the real scaling limit — per-pool, percentage-based
- Trade bot `POOL_PERCENT` should be set well below `wallet_cap_bps` (e.g., 2% vs 5% cap)
- UI Max button now respects wallet cap, preventing confusing "Max = $50K" followed by cap error

### Code Review Fixes (AI)

**Reviewer:** Code Review Agent, 2026-03-26

**Fixes applied:**
1. **H1 — Duplicate cap logic:** Refactored `trade-ticket.tsx` to use new `calculateWalletCapMaxGross()` utility in `cap-utils.ts` instead of inline cap math. Eliminates duplication with `calculateWalletCapRemaining()`.
2. **M1 — Inline fee inversion:** Added `calculateGrossFromNetLamports()` utility to `cap-utils.ts`, used by `calculateWalletCapMaxGross()`. Centralizes fee math.
3. **M2 — Missing docstring:** Added `TRADE_BOT_MAX_POOL_PERCENT` and `TRADE_BOT_MIN_POOL_PERCENT` to `trade-bot.ts` file header env var list.
4. **L2 — Aria-label readability:** Extracted `effectiveMax` computation to a variable in `quick-amount-buttons.tsx`, simplifying both the click handler and aria-label.

**Files changed by review:**
- `web/src/lib/cap-utils.ts` — Added `calculateGrossFromNetLamports()` and `calculateWalletCapMaxGross()` utilities
- `web/src/components/trading/trade-ticket.tsx` — Refactored walletCapMax to use cap-utils utility
- `web/src/components/trading/quick-amount-buttons.tsx` — Extracted effectiveMax variable
- `crank-bot/trade-bot.ts` — Updated file header docstring
