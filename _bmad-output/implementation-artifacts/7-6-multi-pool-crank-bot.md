# Story 7.6: Multi-Pool Crank Bot

Status: todo
Created: 2026-03-18
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

- [ ] Task 1: Fix FOGO Pyth Lazer feed ID (AC: #7)
  - [ ] 1.1: In `crank-bot/crank-bot.ts` ~line 72, change `FOGO: 0` to `FOGO: 2923`
  - [ ] 1.2: In `web/src/lib/constants.ts` ~line 215, change `FOGO: 1` to `FOGO: 2923`
  - [ ] 1.3: Remove the FOGO block in `loadConfig()` (~lines 247-249 of crank-bot.ts)

- [ ] Task 2: Implement `PythPriceManager` class (AC: #5, #8)
  - [ ] 2.1: Create class with persistent WebSocket to `wss://pyth-lazer-0.dourolabs.app/v1/stream`
  - [ ] 2.2: Subscribe to all needed feeds in one request (`priceFeedIds: [1, 2, 5, 2923]`)
  - [ ] 2.3: Cache latest `streamUpdated` message per feed ID in `Map<number, { message: Buffer, timestamp: number }>`
  - [ ] 2.4: Implement `waitForFreshMessage(feedId, maxAgeSeconds, timeoutMs)` — returns cached if fresh, else waits for next update
  - [ ] 2.5: Auto-reconnect with exponential backoff on close/error
  - [ ] 2.6: Fallback: if persistent WS is down, open a one-shot connection (preserve current `fetchPythMessage` as fallback)

- [ ] Task 3: Update configuration for multi-pool support (AC: #1, #2, #6)
  - [ ] 3.1: Add `POOL_ASSETS` env var (comma-separated, e.g., `BTC,ETH,SOL,FOGO`)
  - [ ] 3.2: Backward compat: if `POOL_ASSETS` not set, fall back to `POOL_ASSET` (singular)
  - [ ] 3.3: Default to `BTC,ETH,SOL,FOGO` if neither env var is set
  - [ ] 3.4: Add `--pools` CLI flag that overrides env vars
  - [ ] 3.5: Change `Config.poolAsset: Asset` to `Config.poolAssets: Asset[]`
  - [ ] 3.6: Validate each asset in the list

- [ ] Task 4: Create pool-prefixed logger (AC: #1)
  - [ ] 4.1: Implement `createPoolLogger(asset: Asset)` that returns a logger prepending `[BTC]`/`[ETH]`/`[SOL]`/`[FOGO]`
  - [ ] 4.2: Format: `[2026-03-18T10:00:01Z] [INFO] [BTC] Cycle 42: Action: ADVANCE_EPOCH`
  - [ ] 4.3: Migrate ALL log calls in `runCycle()`, `buildAndSendCreateEpochTx()`, `buildAndSendAdvanceEpochTx()`, `buildAndSendSettleEpochTx()` to use pool-prefixed logger (withdrawal functions already use it)

- [ ] Task 5: Extract `PoolRunner` class (AC: #1, #3, #4, #9)
  - [ ] 5.1: Create `SharedContext` interface (connection, wallet, globalConfigPda, pythManager, config)
  - [ ] 5.2: Create `PoolRunner` class wrapping current `runCycle()` + while-loop
  - [ ] 5.3: Each runner derives its own `poolPda` from asset mint
  - [ ] 5.4: Each runner maintains independent poll intervals per pool state (None/Open/Frozen)
  - [ ] 5.5: Each runner has its own try/catch — non-critical errors logged and continued
  - [ ] 5.6: Add `onCriticalError` callback to signal `main()` to stop all runners
  - [ ] 5.7: Ensure `processPendingWithdrawals()` is called per-pool in the settle→create chain (preserve existing behavior)

- [ ] Task 6: Refactor `main()` for multi-pool orchestration (AC: #1, #4)
  - [ ] 6.1: Create `SharedContext` with shared connection, wallet, PythPriceManager
  - [ ] 6.2: Launch one `PoolRunner` per configured asset
  - [ ] 6.3: Use `Promise.allSettled(runners.map(r => r.start()))` for crash isolation
  - [ ] 6.4: Critical errors (insufficient funds) set `isShuttingDown` for all runners
  - [ ] 6.5: Balance check: warn if < 0.01 SOL per configured pool
  - [ ] 6.6: Remove module-level global state (`poolPda`, `config.poolAsset`, etc.) — moved into PoolRunner

- [ ] Task 7: Update deployment configs and docs (AC: #1)
  - [ ] 7.1: Update `ecosystem.config.cjs` env to use `POOL_ASSETS: 'BTC,ETH,SOL,FOGO'`
  - [ ] 7.2: Update `.env.example` with `POOL_ASSETS` variable
  - [ ] 7.3: Update `README.md` multi-pool configuration section

- [ ] Task 8: Verification and smoke testing
  - [ ] 8.1: Run with `POOL_ASSETS=BTC` — verify identical behavior to current bot (including withdrawal processing)
  - [ ] 8.2: Run with `POOL_ASSETS=BTC,ETH,SOL,FOGO` — verify all 4 pools log independently
  - [ ] 8.3: Verify Pyth WS connects once and receives updates for all 4 feeds
  - [ ] 8.4: Verify FOGO epochs create/settle using feed 2923
  - [ ] 8.5: Verify one pool failure doesn't crash others
  - [ ] 8.6: Verify withdrawal processing works per-pool after settlement

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

  async connect(): Promise<void>        // Opens persistent WS, subscribes to all feeds
  async disconnect(): Promise<void>     // Clean shutdown
  async waitForFreshMessage(feedId: number, maxAgeSeconds?: number, timeoutMs?: number): Promise<Buffer>
  private reconnect(): void             // Auto-reconnect with exponential backoff
  private async fetchFallback(feedId: number): Promise<Buffer>  // One-shot WS (current behavior)
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
- `web/src/lib/constants.ts` — Fix FOGO Lazer feed ID (line 215: `1` → `2923`)
