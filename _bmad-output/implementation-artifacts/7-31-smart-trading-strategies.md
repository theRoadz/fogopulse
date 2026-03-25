# Story 7.31: Smart Trading Strategies for Trade Bot

Status: done
Created: 2026-03-24
Epic: 7 - Platform Polish & UX
Sprint: Current
Priority: Medium — Market Realism

## Story

As a platform operator,
I want the trade bots to use intelligent strategies based on price momentum and pool imbalance,
so that simulated trading activity looks realistic and creates natural-looking market dynamics rather than random noise.

## Problem

The trade bot (Story 7.22) currently uses **pure randomization** for all trading decisions:
- **Direction**: 50/50 coin flip (`Math.random() < 0.5`)
- **Amount**: Uniform random between min and max
- **Timing**: Uniform random within trading window

This produces random noise that doesn't resemble real user behavior. Real traders react to price movements, look for value in pool imbalances, and vary their conviction. The current bot creates activity volume but the trading patterns are obviously artificial — all directions are equally likely regardless of whether the asset just moved 1% up or down.

### Specific Issues

1. **No price awareness**: Bot ignores the epoch's start price and current oracle price entirely. A 0.5% BTC move up should bias traders toward UP, but the bot still bets 50/50.
2. **No pool awareness**: Bot ignores CPMM reserves. When one side is heavily overweight, the other side offers better odds — real traders would exploit this.
3. **No timing intelligence**: Trades are uniformly distributed across the window. Real traders might wait for more information (trade late) or act on conviction early.
4. **One-size-fits-all**: Every asset uses the same random strategy. Different assets may warrant different approaches (e.g., BTC momentum vs FOGO random).

## Solution

Add a **Strategy Pattern** to the trade bot with 5 configurable strategies that use on-chain data (epoch start price, live Pyth oracle prices, pool reserves) to make intelligent direction and amount decisions.

### Strategies

1. **Random** — Existing 50/50 behavior (preserved as default/fallback)
2. **Momentum** — If current price > start price, bias toward UP. Tuned for 5-min epochs (0.01% threshold)
3. **Contrarian** — Opposite of momentum. If price moved up a lot, bet DOWN expecting reversion (0.05% threshold)
4. **Pool Imbalance** — Read yesReserves vs noReserves from CPMM. Bet the side with better odds (cheaper shares)
5. **Composite** — Weighted combination of momentum + pool imbalance + random noise

### Key Design Decisions

1. **Single file** — All code stays in `trade-bot.ts`, matching existing codebase pattern (no module split)
2. **Separate Pyth WebSocket** — Trade bot runs as independent process from crank-bot, needs its own WS connection
3. **Graceful degradation** — If Pyth feed unavailable, all strategies fall back to random (never crashes)
4. **Per-asset strategy overrides** — Different assets can use different strategies via `TRADE_BOT_STRATEGY_BTC` etc.
5. **5-min epoch tuning** — Thresholds calibrated for typical 5-min crypto price movements (0.01-0.1%)

### Momentum Thresholds (5-min epoch calibration)

| Price Move | Bot Response | UP Probability | Bet Size |
|---|---|---|---|
| < 0.01% (flat) | Random fallback | 50% | Random |
| 0.01-0.05% | Light bias | ~55-65% | Medium |
| 0.05-0.08% | Medium bias | ~65-75% | Medium-Large |
| 0.08-0.1%+ | Strong bias | ~75-85% (capped) | Near max |

For BTC at ~$67k: 0.01% = ~$6.70 (very common in 5 min), 0.1% = ~$67 (notable candle).

## Acceptance Criteria

1. **Given** `TRADE_BOT_STRATEGY=random`, **When** trading, **Then** behavior is identical to current (50/50 direction, random amount)
2. **Given** `TRADE_BOT_STRATEGY=momentum` and price moved up > 0.01%, **When** a trade executes, **Then** the bot biases toward UP with probability proportional to the move magnitude
3. **Given** `TRADE_BOT_STRATEGY=contrarian` and price moved up > 0.05%, **When** a trade executes, **Then** the bot biases toward DOWN (betting on mean-reversion)
4. **Given** `TRADE_BOT_STRATEGY=pool_imbalance` and yesReserves are significantly higher than noReserves, **When** a trade executes, **Then** the bot biases toward UP (cheaper shares on that side)
5. **Given** `TRADE_BOT_STRATEGY=composite`, **When** a trade executes, **Then** the bot combines momentum + pool imbalance + noise signals with configurable weights
6. **Given** a non-random strategy and no `PYTH_ACCESS_TOKEN`, **When** a trade executes, **Then** the bot gracefully falls back to random (no crash)
7. **Given** `TRADE_BOT_STRATEGY_BTC=momentum` and `TRADE_BOT_STRATEGY_ETH=contrarian`, **When** each market trades, **Then** BTC uses momentum and ETH uses contrarian independently
8. **Given** `TRADE_BOT_TIME_BIAS=late`, **When** trades are scheduled, **Then** trades cluster in the last 40% of the trading window
9. **Given** any strategy, **When** it returns a direction and amount, **Then** the existing buy_position, claiming, and safety-check logic all continues to work unchanged

## Architecture

### New Types

```typescript
interface ExtendedPoolData extends PoolData {
  yesReserves: bigint
  noReserves: bigint
}

interface ExtendedEpochData extends EpochData {
  startPrice: bigint      // u64, Pyth 8-decimal fixed point
  startConfidence: bigint
}

interface PriceSnapshot {
  price: number           // human-readable USD
  confidence: number
  timestamp: number       // ms
}

interface TradeDecision {
  direction: number       // 0=Up, 1=Down
  amount: number          // USDC
  reason: string          // for logging
}

interface StrategyContext {
  asset: Asset
  epoch: ExtendedEpochData
  pool: ExtendedPoolData
  currentPrice: PriceSnapshot | null
  config: TradeBotConfig
  globalConfig: GlobalConfigData
  nowSeconds: number
}

interface TradingStrategy {
  name: string
  decide(ctx: StrategyContext): TradeDecision | null  // null = skip trade
}
```

### Parser Extensions

**parsePoolAccount** — Currently skips `yes_reserves` and `no_reserves` at byte offsets 40-56. Must read them:
```
Offset 40: yes_reserves (8B u64)
Offset 48: no_reserves  (8B u64)
```

**parseEpochAccount** — Currently skips `start_price` and `start_confidence` at byte offsets 65-81. Must read them:
```
Offset 65: start_price      (8B u64, Pyth format with exponent -8)
Offset 73: start_confidence  (8B u64)
```

### TradeBotPriceManager

Lightweight Pyth Lazer WebSocket client:
- Subscribes with `formats: ['json']` for parsed price values
- Stores `Map<feedId, PriceSnapshot>`
- Public `getPrice(feedId): PriceSnapshot | null` (null if stale >30s)
- Auto-reconnect on disconnect
- Feed IDs: `{ BTC: 1, ETH: 2, SOL: 6, FOGO: 2923 }`

### Strategy Decision Flow

```
executeTrade(bot, epochData)
  │
  ├── Existing safety checks (paused, trade count, epoch state, balance)
  │
  ├── NEW: Fetch current price from TradeBotPriceManager
  ├── NEW: Re-fetch pool account for fresh reserves
  ├── NEW: Build StrategyContext
  ├── NEW: Call strategy.decide(ctx)
  │    ├── Returns { direction, amount, reason } → use these
  │    └── Returns null → skip trade
  │
  └── Existing: build instruction, send tx, track trade, log result
```

### Environment Variables (new)

```env
# Strategy selection (default: random — backwards compatible)
TRADE_BOT_STRATEGY=composite          # random|momentum|contrarian|pool_imbalance|composite
TRADE_BOT_TIME_BIAS=uniform           # early|late|uniform

# Per-asset strategy overrides (optional)
TRADE_BOT_STRATEGY_BTC=momentum
TRADE_BOT_STRATEGY_ETH=contrarian
TRADE_BOT_STRATEGY_SOL=composite
TRADE_BOT_STRATEGY_FOGO=random

# Momentum params
STRATEGY_MOMENTUM_THRESHOLD_PCT=0.0001   # 0.01% min move to trigger (tuned for 5-min epochs)
STRATEGY_MOMENTUM_MAX_BIAS=0.85          # max probability bias

# Contrarian params
STRATEGY_CONTRARIAN_THRESHOLD_PCT=0.0005 # 0.05% min move (needs bigger move to bet against)
STRATEGY_CONTRARIAN_MAX_BIAS=0.80

# Pool imbalance params
STRATEGY_IMBALANCE_THRESHOLD=0.10        # 10% reserve imbalance to trigger

# Composite weights (should sum to ~1.0)
STRATEGY_COMPOSITE_MOMENTUM_WEIGHT=0.5
STRATEGY_COMPOSITE_IMBALANCE_WEIGHT=0.3
STRATEGY_COMPOSITE_NOISE_WEIGHT=0.2
```

## Critical Reference Files

| File | Purpose |
|------|---------|
| `crank-bot/trade-bot.ts` | Primary file to modify — all strategy code goes here |
| `crank-bot/crank-bot.ts` | Reference for PythPriceManager WebSocket pattern (lines 553-749) and PYTH_FEED_IDS (lines 73-78) |
| `crank-bot/.env.example` | Add new strategy env vars |

## Tasks / Subtasks

### Task 1: Extend existing parsers (AC: #2, #4)

- [x] 1.1: Modify `parsePoolAccount` to read `yes_reserves` (offset 40) and `no_reserves` (offset 48) into `ExtendedPoolData`
- [x] 1.2: Modify `parseEpochAccount` to read `start_price` (offset 65) and `start_confidence` (offset 73) into `ExtendedEpochData`
- [x] 1.3: Update all references to use the extended return types

### Task 2: Add strategy types and interfaces (AC: all)

- [x] 2.1: Add `ExtendedPoolData`, `ExtendedEpochData`, `PriceSnapshot`, `TradeDecision`, `StrategyContext`, `TradingStrategy` interfaces
- [x] 2.2: Add `StrategyName` type and strategy-related config fields to `TradeBotConfig`
- [x] 2.3: Add `PYTH_FEED_IDS` constant and `PYTH_WS_URL` constant

### Task 3: Implement TradeBotPriceManager (AC: #6)

- [x] 3.1: Create `TradeBotPriceManager` class with Pyth Lazer WebSocket subscription (json format)
- [x] 3.2: Implement `getPrice(feedId)` with staleness check (>30s = null)
- [x] 3.3: Implement auto-reconnect on disconnect
- [x] 3.4: Implement graceful connect/disconnect lifecycle

### Task 4: Implement strategy classes (AC: #1-#5)

- [x] 4.1: Implement `RandomStrategy` — extract existing 50/50 logic into strategy class
- [x] 4.2: Implement `MomentumStrategy` — price comparison with 0.01% threshold, scaled bias and amount
- [x] 4.3: Implement `ContrarianStrategy` — inverse of momentum with 0.05% threshold
- [x] 4.4: Implement `PoolImbalanceStrategy` — reserves comparison with 10% threshold
- [x] 4.5: Implement `CompositeStrategy` — weighted combination of momentum + imbalance + noise
- [x] 4.6: Implement `createStrategy(name)` factory function

### Task 5: Add time bias to scheduling (AC: #8)

- [x] 5.1: Modify `scheduleTrades` to apply time bias (early/late/uniform) to delay range

### Task 6: Extend config and wire everything together (AC: #7, #9)

- [x] 6.1: Extend `loadConfig()` to parse all new strategy env vars (strategy, timeBias, per-asset overrides, params)
- [x] 6.2: Modify `MarketMonitor` constructor to accept `strategy` and `priceManager` params
- [x] 6.3: Modify `executeTrade` to build `StrategyContext` and call `strategy.decide()` instead of random
- [x] 6.4: Modify `main()` to create `TradeBotPriceManager` and per-asset strategies, pass to MarketMonitors
- [x] 6.5: Update `.env.example` with all new strategy env vars

## File List

| File | Action | Description |
|------|--------|-------------|
| `crank-bot/trade-bot.ts` | MODIFIED | Add strategy pattern, TradeBotPriceManager, extended parsers, strategy classes, config extensions |
| `crank-bot/.env.example` | MODIFIED | Add strategy configuration env vars |

## Dev Agent Record

### Implementation Notes

- All strategy code added to `trade-bot.ts` (single-file pattern, no module split)
- Extended `parsePoolAccount` to read `yesReserves` and `noReserves` (offsets 40, 48) — previously skipped
- Extended `parseEpochAccount` to read `startPrice` and `startConfidence` (offsets 65, 73) — previously skipped
- `TradeBotPriceManager` modeled on crank-bot's `PythPriceManager` but subscribes with same format and parses both `parsed` and `solana` message types for maximum compatibility
- Pyth price stored as `price * 10^exponent` to get human-readable USD values
- Momentum thresholds tuned for 5-min epochs: 0.01% (0.0001) triggers bias, 0.1% (0.001) gives strong conviction
- Contrarian threshold higher (0.05%) — needs bigger move before betting against the trend
- Composite strategy uses `tanh` for momentum signal normalization — maps small moves linearly, dampens extreme values
- All strategies degrade gracefully to RandomStrategy when no price data available
- Strategy `decide()` returns `null` only if the strategy explicitly wants to skip — currently all strategies always return a decision
- `executeTrade` now re-fetches pool account for fresh reserves used by PoolImbalanceStrategy
- Time bias modifies the delay range in `scheduleTrades`: early = [1s, 40% window], late = [60% window, 100%], uniform = full window
- TypeScript compiles cleanly with no errors
- No new dependencies — `ws` already in package.json from crank-bot

### Completion Notes

All 6 tasks (17 subtasks) implemented. TypeScript compiles cleanly. Changes are backwards-compatible — default strategy is `random` which produces identical behavior to the previous implementation.

## Change Log

- **2026-03-24**: Implemented smart trading strategies (Story 7.31). Added 5 configurable strategies (random, momentum, contrarian, pool_imbalance, composite), TradeBotPriceManager for live Pyth oracle prices, per-asset strategy overrides, time bias scheduling, and extended account parsers to read pool reserves and epoch start prices. Updated `.env.example` with all new strategy configuration env vars.
