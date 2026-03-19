# Story 7.6: Multi-Pool Crank Bot

Status: done
Created: 2026-03-18
Completed: 2026-03-19
Epic: 7 - Platform Polish & UX
Sprint: Backlog

## Overview

The crank bot (`crank-bot/crank-bot.ts`) currently manages the epoch lifecycle (create, advance, settle) and LP withdrawal processing for a **single pool** at a time, defaulting to BTC via the `POOL_ASSET` env var. To support all 4 markets simultaneously, the bot needs to be extended to run independent pool runners concurrently within a single process, sharing a persistent Pyth WebSocket connection, wallet, and RPC connection.

Additionally, the FOGO Pyth Lazer feed ID needs to be updated from a placeholder (`0`/`1`) to its actual value (`2923`), which is now confirmed stable on Pyth Lazer.

**FRs Covered:** FR1 (multi-asset support), operational automation
**Dependencies:** Story 7.5 (epoch creation enabled for all markets)

### Already Implemented (commit be511cb)

The following was added as part of Stories 5.7/5.7.1 and is already in the codebase:
- **Withdrawal processing** — `findPendingWithdrawals()`, `buildAndSendProcessWithdrawalTx()`, `processPendingWithdrawals()` (~190 lines)
- **`crank_process_withdrawal` instruction support** — permissionless, crank bot pays TX fee
- **Pool layout update** — `pending_withdrawal_shares` field handled in `parsePoolAccount()`
- **Chained withdrawal processing** — runs between `settle_epoch` and `create_epoch` in `runCycle()`
- **`@solana/spl-token` dependency** — already added to package.json
- **Pool-prefixed logging** in withdrawal functions (e.g., `[${poolAsset}]` pattern)

### Already Implemented (Story 7.11 — Deterministic Crank Bot Settlement)

The following was added as part of Story 7.11 and is already in the codebase:
- **`ChainResult` interface** — `{ freezeTime, endTime, epochPda, epochId }` for chaining data
- **`settleAndCreateNext(epochPda, epochId, feedId)`** — settle current epoch, process withdrawals, create next epoch, return `ChainResult | null`
- **`runChainLoop(freezeTime, endTime, epochPda, epochId, feedId)`** — deterministic advance → sleep → settle → create loop
- **Chaining in all 3 `runCycle()` cases** — CREATE chains into `runChainLoop`, ADVANCE chains settle→create→loop, SETTLE chains into loop
- **`FROZEN_POLL_INTERVAL_MS = 2000`** — fast poll fallback for frozen state on bot restart
- **Note:** These functions currently use module-level globals (`connection`, `wallet`, `globalConfigPda`, `poolPda`, `config`, `log`) that must be moved into PoolRunner instance state

### Remaining Work (this story)

- Multi-pool concurrent execution (PoolRunner class)
- Persistent PythPriceManager (shared WebSocket)
- FOGO feed ID fix (0 → 2923)
- Config changes (POOL_ASSETS env var, --pools CLI flag)
- Pool-prefixed logging for ALL functions (not just withdrawal)
- Deployment config updates

## Story

As a platform operator,
I want the crank bot to manage epoch lifecycles for all pools (BTC, ETH, SOL, FOGO) concurrently in a single process,
so that all markets stay active without running separate bot instances per pool.

## Acceptance Criteria

1. **Given** the bot starts with `POOL_ASSETS=BTC,ETH,SOL,FOGO` (default), **When** it connects, **Then** it launches independent runners for all 4 pools with pool-prefixed logging (e.g., `[BTC] Cycle 1: ...`)
2. **Given** the bot starts with `POOL_ASSET=BTC` (singular, legacy), **When** `POOL_ASSETS` is not set, **Then** it runs only the BTC pool (backward compatible)
3. **Given** the bot is running multiple pools, **When** one pool's RPC call fails transiently, **Then** other pools continue operating unaffected
4. **Given** the bot is running, **When** a critical error occurs (e.g., insufficient funds), **Then** all pool runners shut down gracefully
5. **Given** the bot needs oracle data for create/settle, **When** it fetches a Pyth price, **Then** it uses a single persistent WebSocket connection shared across all pools (not one WS per fetch)
6. **Given** the bot starts with `--pools BTC,SOL`, **When** it launches, **Then** only BTC and SOL runners are started (CLI overrides env vars)
7. **Given** FOGO is included in the pool list, **When** an epoch is created/settled, **Then** it uses Pyth Lazer feed ID `2923` (not the placeholder `1`)
8. **Given** the persistent Pyth WebSocket disconnects, **When** a pool runner needs oracle data, **Then** it falls back to a one-shot WebSocket connection (current behavior) and the persistent connection auto-reconnects
9. **Given** the bot settles an epoch on any pool, **When** pending LP withdrawals exist for that pool, **Then** it processes them before creating the next epoch (already implemented, must be preserved in PoolRunner)

## Tasks / Subtasks

- [x] Task 1: Fix FOGO Pyth Lazer feed ID (AC: #7)
  - [x] 1.1: In `crank-bot/crank-bot.ts` ~line 72, change `FOGO: 0` to `FOGO: 2923`
  - [x] 1.2: In `web/src/lib/constants.ts` ~line 223, change `FOGO: 1` to `FOGO: 2923`
  - [x] 1.3: Remove the FOGO block in `loadConfig()` (~lines 241-243 of crank-bot.ts)

- [x] Task 2: Implement `PythPriceManager` class (AC: #5, #8)
  - [x] 2.1: Create class with persistent WebSocket to `wss://pyth-lazer-0.dourolabs.app/v1/stream`
  - [x] 2.2: Subscribe to feeds — **one subscription per feed** (not all feeds in one request — see Critical Bug Fix below)
  - [x] 2.3: Cache latest `streamUpdated` message per feed ID in `Map<number, { message: Buffer, timestamp: number }>`
  - [x] 2.4: Implement `waitForFreshMessage(feedId, maxAgeSeconds, timeoutMs)` — returns cached if fresh, else waits for next update
  - [x] 2.5: Auto-reconnect with exponential backoff on close/error
  - [x] 2.6: Fallback: if persistent WS is down, open a one-shot connection (preserve current `fetchPythMessage` as fallback)
  - [x] 2.7: Update `settleAndCreateNext()` and `runCycle()` CREATE_EPOCH case to use `pythManager.waitForFreshMessage(feedId)` instead of `fetchPythMessage(feedId, token)`

- [x] Task 3: Update configuration for multi-pool support (AC: #1, #2, #6)
  - [x] 3.1: Add `POOL_ASSETS` env var (comma-separated, e.g., `BTC,ETH,SOL,FOGO`)
  - [x] 3.2: Backward compat: if `POOL_ASSETS` not set, fall back to `POOL_ASSET` (singular)
  - [x] 3.3: Default to `BTC,ETH,SOL,FOGO` if neither env var is set
  - [x] 3.4: Add `--pools` CLI flag that overrides env vars
  - [x] 3.5: Change `Config.poolAsset: Asset` to `Config.poolAssets: Asset[]`
  - [x] 3.6: Validate each asset in the list

- [x] Task 4: Create pool-prefixed logger (AC: #1)
  - [x] 4.1: Implement `createPoolLogger(asset: Asset)` that returns a logger prepending `[BTC]`/`[ETH]`/`[SOL]`/`[FOGO]`
  - [x] 4.2: Format: `[2026-03-18T10:00:01Z] [INFO] [BTC] Cycle 42: Action: ADVANCE_EPOCH`
  - [x] 4.3: Migrated all log calls in PoolRunner methods to use pool-prefixed logger
  - [x] 4.4: `createPoolLogger(asset)` returns object with `debug`, `info`, `warn`, `error`

- [x] Task 5: Extract `PoolRunner` class (AC: #1, #3, #4, #9)
  - [x] 5.1: Create `SharedContext` interface: `{ connection, wallet, globalConfigPda, pythManager, config }`
  - [x] 5.2: Create `PoolRunner` class with constructor `(shared: SharedContext, poolAsset: Asset)`
  - [x] 5.3: `settleAndCreateNext()` as private method using `this.feedId` and `this.shared`
  - [x] 5.4: `runChainLoop()` as private method
  - [x] 5.5: `runCycle()` as private method using `this.shared.pythManager.waitForFreshMessage`
  - [x] 5.6: `start()` public method with while-loop and dynamic poll intervals
  - [x] 5.7: Each runner derives `poolPda` in constructor from `ASSET_MINTS[poolAsset]`
  - [x] 5.8: Independent polling intervals per runner state
  - [x] 5.9: Non-critical errors logged and continued (per-runner try/catch)
  - [x] 5.10: Critical errors set module-level `isShuttingDown = true`
  - [x] 5.11: `processPendingWithdrawals()` called per-pool via `this.poolPda` and `this.poolAsset`

- [x] Task 6: Refactor `main()` for multi-pool orchestration (AC: #1, #4)
  - [x] 6.1: Create `SharedContext` with shared connection, wallet, PythPriceManager
  - [x] 6.2: Launch one `PoolRunner` per configured asset
  - [x] 6.3: Use `Promise.allSettled(runners.map(r => r.start()))` for crash isolation
  - [x] 6.4: Critical errors propagate via shared `isShuttingDown`
  - [x] 6.5: Balance check with pool count awareness
  - [x] 6.6: Removed module-level globals; kept `isShuttingDown` module-level

- [x] Task 7: Update deployment configs and docs (AC: #1)
  - [x] 7.1: Update `ecosystem.config.cjs` env to use `POOL_ASSETS: 'BTC,ETH,SOL,FOGO'`
  - [x] 7.2: Update `.env.example` with `POOL_ASSETS` variable and backward compat note
  - [x] 7.3: Update `README.md` multi-pool configuration section

- [x] Task 8: Verification and smoke testing
  - [x] 8.1: Run with all 4 pools — all pools log independently
  - [x] 8.2: Pyth WS connects once, receives updates for all 4 feeds via separate subscriptions
  - [x] 8.3: FOGO epochs use feed 2923
  - [x] 8.4: One pool failure doesn't crash others
  - [x] 8.5: Withdrawal processing works per-pool after settlement
  - [x] 8.6: Per-pool independent deterministic chaining verified
  - [x] 8.7: Long sleeps in one runner don't block others

## Dev Notes

### Architecture Decision: Single Process, Independent Runners

**Why not multi-instance (separate bot per pool)?**
- Each instance opens/closes a new WebSocket per price fetch. With 4 pools, that's 8+ WS connections per cycle
- 4x wallet balance checks, 4x RPC connections, no coordination
- More complex deployment (4 PM2 apps instead of 1)

**Why not a single shared loop?**
- Sequential iteration adds latency — if BTC needs to settle NOW but we're checking ETH first, there's unnecessary delay
- Pools are independent state machines that shouldn't block each other

**Chosen approach: Hybrid**
- Each pool gets its own async while-loop (`PoolRunner`) with independent polling
- All runners share: wallet, RPC connection, `PythPriceManager` (1 persistent WS)
- `Promise.allSettled` ensures one runner crash doesn't kill others
- Critical errors (insufficient funds) propagate to all runners since they share a wallet

### Key Constants

```typescript
const PYTH_FEED_IDS: Record<Asset, number> = {
  BTC: 1,     // BTC/USD
  ETH: 2,     // ETH/USD
  SOL: 5,     // SOL/USD
  FOGO: 2923, // FOGO/USD (confirmed stable on Pyth Lazer)
}
```

### PythPriceManager Design

```typescript
class PythPriceManager {
  private ws: WebSocket | null
  private latestMessages: Map<number, { message: Buffer, timestamp: number }>
  private feedIds: number[]
  private subIdToFeedId: Map<number, number>  // subscriptionId → feedId routing

  async connect(): Promise<void>        // Opens persistent WS, subscribes per-feed
  async disconnect(): Promise<void>     // Clean shutdown
  async waitForFreshMessage(feedId: number, maxAgeSeconds?: number, timeoutMs?: number): Promise<Buffer>
  private reconnect(): void             // Auto-reconnect with exponential backoff
  private async fetchFallback(feedId: number): Promise<Buffer>  // One-shot WS (current behavior)
}
```

### Critical Bug Fix: Per-Feed Subscriptions (2026-03-19)

**Problem:** The initial implementation subscribed to all feeds in a single Pyth Lazer subscription:
```typescript
// BROKEN: Combined subscription
priceFeedIds: [1, 2, 5, 2923]
```

Pyth Lazer returns a **single combined Solana message** containing all feed prices when multiple feeds are in one subscription. This combined message cannot be used by on-chain instructions (`create_epoch`, `settle_epoch`) which expect a Solana message for a **single specific feed**.

The initial attempt to demultiplex by parsing a binary feed ID from the Solana message at a hardcoded offset (`readUInt32LE(104)`) read garbage bytes — the offset calculation was wrong. This caused:
1. Messages stored under wrong feed ID keys in the cache
2. `waitForFreshMessage()` waiters never notified
3. 30-second timeout on every price fetch, falling back to one-shot
4. Stale price by the time settlement TX was submitted → `OracleDataStale` (0x1780) simulation failures

**Fix:** Subscribe to each feed separately with its own `subscriptionId`, and route incoming `streamUpdated` messages using the `subscriptionId` → `feedId` mapping:
```typescript
// CORRECT: One subscription per feed
this.feedIds.forEach((feedId, index) => {
  const subId = index + 1
  this.subIdToFeedId.set(subId, feedId)
  ws.send(JSON.stringify({
    type: 'subscribe',
    subscriptionId: subId,
    priceFeedIds: [feedId],  // Single feed per subscription
    ...
  }))
})

// Route messages by subscriptionId
const msgFeedId = this.subIdToFeedId.get(msg.subscriptionId)
```

This produces individual Solana messages per feed (identical to the old one-shot approach) while sharing a single persistent WebSocket connection.

**Pyth Lazer `streamUpdated` JSON structure (for reference):**
```json
{
  "type": "streamUpdated",
  "subscriptionId": 1,
  "parsed": {
    "timestampUs": "1773931292800000",
    "priceFeeds": [{ "priceFeedId": 1, "price": "6928275027380", "confidence": 748602768 }]
  },
  "solana": { "encoding": "hex", "data": "b9011a82f407..." }
}
```

### PoolRunner Design

```typescript
interface SharedContext {
  connection: Connection
  wallet: Keypair
  globalConfigPda: PublicKey
  pythManager: PythPriceManager
  config: Config
}

class PoolRunner {
  private shared: SharedContext
  private poolAsset: Asset
  private poolPda: PublicKey
  private feedId: number
  private log: PoolLogger
  private cycleCount: number

  constructor(shared: SharedContext, poolAsset: Asset)
  async start(): Promise<void>                          // Main while-loop
  private async runCycle(): Promise<{ state: number, nextActionMs?: number }>  // State machine
  private async settleAndCreateNext(epochPda, epochId): Promise<ChainResult | null>
  private async runChainLoop(freezeTime, endTime, epochPda, epochId): Promise<void>
}
```

### Existing Withdrawal Processing (preserve as-is)

The following functions already exist and must be preserved in the `PoolRunner` refactor:
- `findPendingWithdrawals(conn, poolPubkey)` — scans LpShare accounts via `getProgramAccounts` with memcmp filters
- `buildAndSendProcessWithdrawalTx(conn, crankWallet, globalConfigPda, poolPubkey, withdrawal)` — sends `crank_process_withdrawal` IX
- `processPendingWithdrawals(conn, crankWallet, globalConfigPda, poolPubkey, poolAsset)` — orchestrates the above, called between settle and create

These already use the `[${poolAsset}]` log prefix pattern. When moving into `PoolRunner`, pass the runner's asset and pool PDA.

### Config Priority

`--pools CLI flag` > `POOL_ASSETS env var` > `POOL_ASSET env var` > default (`BTC,ETH,SOL,FOGO`)

### Precise Poll Timing Fix (2026-03-19)

**Problem:** When the bot starts and finds an existing Open epoch (not in the chain loop), `runCycle()` returned only a pool state number. `start()` used a generic 10s poll interval, so if `freezeTime` fell between polls, advance_epoch fired up to 10s late.

**Fix:** `runCycle()` now returns `{ state: number, nextActionMs?: number }`. When waiting for `freezeTime` or `endTime`, it calculates the exact milliseconds remaining and returns it as `nextActionMs`. `start()` sleeps precisely until that time (+500ms buffer) instead of using the generic poll interval. This ensures advance_epoch fires within ~1s of `freezeTime` even on the poll-based startup path.

The chain loop (`runChainLoop`) was already sleeping until exact timestamps — this fix covers only the poll-based path.

### POOL_ASSET Backward Compat Fix (2026-03-19)

**Problem:** On server deployment, the `.env` file had `POOL_ASSET=BTC,ETH,SOL,FOGO` (singular) instead of `POOL_ASSETS` (plural). The singular `POOL_ASSET` code path wrapped the entire comma-separated string as a single asset name, causing `Invalid pool asset: BTC,ETH,SOL,FOGO`.

**Fix:** The `POOL_ASSET` (singular) path now detects commas and splits accordingly, making it fully backward compatible with either env var name:
```typescript
poolAssets = raw.includes(',')
  ? raw.split(',').map(a => a.trim().toUpperCase() as Asset)
  : [raw.toUpperCase() as Asset]
```

### Lessons Learned

1. **Pyth Lazer multi-feed subscriptions produce combined Solana messages** — always subscribe to one feed per subscription when you need per-feed Solana messages for on-chain use
2. **Don't parse binary offsets from third-party protocols without validating** — the binary layout assumption was wrong and silently broke routing. Use JSON fields when available.
3. **Generic poll intervals miss precise timing targets** — when you know the exact time of the next action, sleep until that time instead of polling at fixed intervals.
4. **The old one-shot approach was correct by design** — it opened a separate WS per feed, guaranteeing single-feed messages. The persistent WS optimization needed the same per-feed isolation.
5. **Always handle both singular and plural env var names gracefully** — deployment configs may use either; defensive parsing avoids confusing errors.

### Scope Boundaries — DO NOT Implement

- Do NOT split the bot into multiple files (keep single-file design)
- Do NOT change instruction discriminators or on-chain logic
- Do NOT add new Solana instructions
- Do NOT change the Pyth Lazer verification flow (Ed25519)
- Do NOT modify the withdrawal processing logic (already tested and working)

### File List

**Files to modify:**
- `crank-bot/crank-bot.ts` — Core changes: FOGO feed fix, PythPriceManager, PoolRunner, config, main refactor
- `crank-bot/ecosystem.config.cjs` — PM2 env update
- `crank-bot/.env.example` — Add POOL_ASSETS variable
- `crank-bot/README.md` — Multi-pool documentation
- `web/src/lib/constants.ts` — Fix FOGO Lazer feed ID (line 223: `1` → `2923`)
- `web/src/components/trading/epoch-status-display.tsx` — Remove BTC-only guard on Create Epoch button (enables all-pool epoch creation from UI)
