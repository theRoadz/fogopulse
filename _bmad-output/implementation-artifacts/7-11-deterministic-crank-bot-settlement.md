# Story 7.11: Deterministic Crank Bot — Eliminate Settlement Failures via Action Chaining

Status: review
Created: 2026-03-19
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As the protocol operator,
I want the crank bot to chain all epoch lifecycle actions deterministically,
so that epochs never get stuck open due to polling lag or oracle staleness failures.

## Problem

The crank bot uses a polling-based state machine to detect epoch lifecycle transitions. This introduces random lag at two critical points:

**1. Freeze detection lag (up to 10s):**
- Bot polls every 10s during Open state (`NORMAL_POLL_INTERVAL_MS`, `crank-bot.ts:1336`)
- When `currentTime >= freezeTime`, it calls `ADVANCE_EPOCH` — but may be up to 10s late

**2. Settlement detection lag (up to 5s):**
- Bot polls every 5s during Frozen state (`FROZEN_POLL_INTERVAL_MS`, `crank-bot.ts:1337`)
- When `currentTime >= endTime`, it fetches a Pyth price and calls `SETTLE_EPOCH`

**3. Oracle staleness rejection:**
- On-chain `settle_epoch` validates: `|publish_time - end_time| <= oracle_staleness_threshold_settle` (`settle_epoch.rs:188-192`)
- Current threshold is 10 seconds (`initialize-protocol.ts:54`)
- Combined polling lag (up to 5s) + retry cycles (3 retries with exponential backoff: 1s, 2s, 4s = up to ~7s) can push the Pyth `publish_time` beyond 10s from `end_time`
- Result: `OracleDataStale` error → epoch stays open until manual intervention

**Impact:** In rare cases, epochs remain stuck in Frozen state indefinitely, requiring manual admin settlement. This disrupts the trading cycle and erodes user trust.

**Parent Story:** [Story 3.1.1: Implement Crank Bot](3-1.1-implement-crank-bot.md)

## Root Cause

The bot treats each action independently — after completing one action (e.g., `ADVANCE_EPOCH`), it returns to the main loop, sleeps for the poll interval, fetches state again, and re-evaluates. This is wasteful because the bot already knows exactly when the next action should occur.

The bot already implements chaining for `SETTLE_EPOCH → CREATE_EPOCH` (`crank-bot.ts:1193`: "Chaining: Creating next epoch immediately..."), proving the pattern works. It just needs to be extended to the full lifecycle.

## Design Decisions

1. **Deterministic chaining over faster polling.** Instead of just polling faster, chain all actions: `CREATE → sleep(freezeTime) → ADVANCE → sleep(endTime) → SETTLE → CREATE → ...`. This eliminates lag entirely for the happy path.

2. **Reduced frozen poll (5s → 2s) as restart fallback.** If the bot crashes and restarts mid-epoch, it won't have chaining context. The 2s frozen poll ensures fast recovery via the existing state machine.

3. **Wider staleness threshold (10s → 15s) as safety net.** Even with chaining, network delays and RPC congestion can cause settlement lag. 15s is still tight enough for 5-minute epochs (5% window) but gives breathing room for retries.

4. **Extract shared `settleAndCreateNext()` helper.** The settlement + withdrawal processing + create-next-epoch logic is currently in the `SETTLE_EPOCH` case. Extracting it avoids duplication since both `ADVANCE_EPOCH` chaining and `SETTLE_EPOCH` fallback need it.

## Acceptance Criteria

1. **Given** the bot creates a new epoch, **When** it succeeds, **Then** it calculates `freezeTime` from the epoch account, sleeps until that time, and immediately advances (no polling gap)
2. **Given** the bot advances an epoch to Frozen, **When** it succeeds (via chaining or polling), **Then** it calculates `endTime`, sleeps until that time, and immediately settles (no polling gap)
3. **Given** the bot settles an epoch, **When** `autoCreateEpoch` is enabled, **Then** it immediately creates the next epoch and chains into the full lifecycle (existing behavior, now part of the full chain)
4. **Given** the bot restarts during a Frozen epoch, **When** it detects the Frozen state via polling, **Then** it polls every 2 seconds (not 5) and chains into settlement once `endTime` passes
5. **Given** the oracle staleness threshold is set to 15 seconds, **When** the bot settles with a Pyth price up to 15s from `end_time`, **Then** settlement succeeds without `OracleDataStale`
6. **Given** `isShuttingDown` becomes true during a sleep, **When** the sleep resolves, **Then** the bot skips remaining chained actions and exits gracefully

## Tasks / Subtasks

### Task 1: Extract `settleAndCreateNext()` helper (AC: #3)

**File:** `crank-bot/crank-bot.ts`

- [x] 1.1: Extracted settlement logic into `settleAndCreateNext(epochPda, epochId, feedId)` async function returning `ChainResult | null`. The function: fetches Pyth price → settles epoch → processes pending withdrawals → optionally creates next epoch (if `autoCreateEpoch` enabled) → fetches new epoch timing data for continued chaining.

- [x] 1.2: Refactored `SETTLE_EPOCH` case to call `settleAndCreateNext()` and enter `runChainLoop()` if a new epoch was created.

### Task 2: Chain freeze after create (AC: #1, #2, #3)

**File:** `crank-bot/crank-bot.ts` — `CREATE_EPOCH` case

- [x] 2.1: After epoch creation, fetch new epoch account via `connection.getAccountInfo(epochPda)` + `parseEpochAccount()` to get `freezeTime` and `endTime`.

- [x] 2.2: Implemented in `runChainLoop()` — calculates `waitToFreeze = max(0, (freezeTime - now) * 1000)` and `await sleep(waitToFreeze)`.

- [x] 2.3: Implemented in `runChainLoop()` — if `!isShuttingDown`, calls `buildAndSendAdvanceEpochTx` to advance to Frozen.

- [x] 2.4: Implemented in `runChainLoop()` — calculates `waitToEnd = max(0, (endTime - now) * 1000)` and `await sleep(waitToEnd)`.

- [x] 2.5: Implemented in `runChainLoop()` — calls `settleAndCreateNext()`, if it returns new epoch times, continues the `while (!isShuttingDown)` loop with updated timing.

### Task 3: Chain settle after advance — polling fallback path (AC: #2, #4)

**File:** `crank-bot/crank-bot.ts` — `ADVANCE_EPOCH` case

- [x] 3.1: After advance confirms, calculates `waitToEnd` and sleeps until `endTime`.

- [x] 3.2: If `!isShuttingDown`, calls `settleAndCreateNext()`. If it returns new epoch times, enters `runChainLoop()` for continuous chaining.

### Task 4: Reduce frozen poll interval (AC: #4)

**File:** `crank-bot/crank-bot.ts`

- [x] 4.1: Changed `FROZEN_POLL_INTERVAL_MS` from `5000` to `2000` with updated comment: "2s when frozen (fallback for bot restarts)".

### Task 5: Increase oracle staleness threshold (AC: #5)

**File:** `anchor/scripts/initialize-protocol.ts`

- [x] 5.1: Changed `oracleStalenessThresholdSettle` from `10` to `15`. Updated comment to "15 seconds max age for settlement".

- [x] 5.2: **Deployment note documented:** If protocol is already initialized on devnet/mainnet, admin must call `update_config` instruction to update the on-chain value.

### Task 6: Verification (AC: all)

- [ ] 6.1: Bot starts and enters continuous chain: create → "Waiting Xs until freezeTime" → advance → "Waiting Xs until endTime" → settle → create → ...
- [ ] 6.2: Kill bot mid-freeze, restart → recovers via 2s polling, chains from advance → settle → create
- [ ] 6.3: Graceful shutdown during sleep → bot exits without attempting further chain actions

## Technical Notes

- The existing `sleep()` function (`crank-bot.ts:1006-1018`) checks `isShuttingDown` every 1 second, so long sleeps (e.g., 285s waiting for freezeTime) will respond to shutdown signals within 1 second.
- The `CREATE_EPOCH` chain enters `runChainLoop()` which handles the full lifecycle. Errors thrown inside the chain bubble up to the main loop's `try/catch`, which logs and continues — falling back to polling-based recovery on the next cycle.
- `settleAndCreateNext()` uses `withRetry()` for all RPC calls and Pyth fetches, matching the existing retry pattern.
- `ChainResult` interface carries `freezeTime`, `endTime`, `epochPda`, and `epochId` for continued chaining.
- No automated tests: crank bot is a standalone operational script requiring live FOGO testnet + Pyth WebSocket. Task 6 verification items are manual operational checks.

## Dev Agent Record

### Implementation Plan
- Extract `settleAndCreateNext()` helper with `ChainResult` return type
- Create `runChainLoop()` for the deterministic advance → settle → create cycle
- Wire all three action cases (CREATE, ADVANCE, SETTLE) into the chain
- Reduce frozen poll interval and increase staleness threshold

### Completion Notes
- All 5 implementation tasks completed (Tasks 1-5)
- TypeScript compilation passes clean (`tsc --noEmit --esModuleInterop --target ES2020`)
- `settleAndCreateNext()` extracted with full settlement + withdrawal + create-next logic
- `runChainLoop()` implements the continuous deterministic lifecycle
- All three action cases chain into the loop: CREATE → full chain, ADVANCE → settle + chain, SETTLE → settle + chain
- Graceful shutdown handled via `isShuttingDown` checks after every `sleep()` call
- Task 6 verification items are manual operational checks (bot requires live FOGO testnet)

## File List

- `crank-bot/crank-bot.ts` — Extracted `settleAndCreateNext()` helper, added `runChainLoop()`, updated CREATE_EPOCH/ADVANCE_EPOCH/SETTLE_EPOCH cases with chaining, reduced frozen poll to 2s
- `anchor/scripts/initialize-protocol.ts` — Changed `oracleStalenessThresholdSettle` from 10 to 15

## Change Log

- **2026-03-19** — Initial implementation: deterministic chaining, extracted helper, 2s frozen poll fallback, 15s staleness threshold
