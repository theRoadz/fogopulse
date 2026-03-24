# Story 7.28: Permissionless Timeout Force-Close for Stuck Frozen Epochs

Status: in-progress
Created: 2026-03-24
Completed: 2026-03-24
Epic: 7 - Platform Polish & UX
Sprint: Current
Priority: HIGH — Operational Resilience

## Story

As a crankbot operator,
I want stuck Frozen epochs to be automatically force-closed after a configurable timeout,
so that the protocol self-heals without requiring admin wallet access on the server.

## Problem

**Severity: HIGH — Operational Blockage**

The `settle_epoch` instruction requires a Pyth Lazer oracle message with a timestamp within **±10 seconds** of `epoch.end_time` (`oracle_staleness_threshold_settle`). Once this 10-second window passes without a successful settlement transaction, **no future Pyth message will ever satisfy the staleness check** — settlement becomes permanently impossible for that epoch.

### Incident

The crankbot running on a Contabo VPS got stuck on a Frozen epoch past its `end_time`. The Pyth WebSocket connection likely dropped or the bot was slow to submit, causing the 10-second oracle window to be missed. The crankbot retries every 180 seconds (idle poll interval), but all retries fail with `OracleDataStale` since no fresh Pyth message can be timestamped close enough to a past `end_time`.

The only recovery path is `admin_force_close_epoch`, which requires the admin wallet — **not available on the Contabo server** (intentionally, for security). This means manual SSH + admin wallet intervention every time this happens.

### Root Cause

1. **Fragile 10-second oracle window** — If the Pyth WebSocket drops, the bot lags, or the transaction takes too long to land, the window is missed permanently
2. **No permissionless recovery path** — `admin_force_close_epoch` is admin-only, leaving no way for the crankbot to self-recover
3. **Slow retry on failure** — Crankbot falls to 180-second idle polling after settlement failure instead of faster retry

### Code References

- `settle_epoch.rs` lines 186-192: Staleness check `|publish_time - end_time| <= threshold`
- `admin_force_close_epoch.rs` lines 36: `has_one = admin` constraint
- `crank-bot.ts` lines 1681-1696: Error catch returns `POOL_STATE.None` → 180s idle poll
- `crank-bot.ts` lines 1306-1310: Frozen state → `SETTLE_EPOCH` action (no timeout alternative)

## Solution

Add a new **permissionless** `timeout_force_close_epoch` on-chain instruction that anyone can call when a Frozen epoch has been stuck past `end_time + settlement_timeout_seconds`. The crankbot auto-detects stuck epochs and calls this instruction to self-recover.

### Design

**New GlobalConfig field:** `settlement_timeout_seconds: i64` (default: 60 seconds, admin-updatable)

**New instruction:** `timeout_force_close_epoch` — permissionless, no oracle data needed
- **State guard:** Epoch must be in `Frozen` state (Open epochs still require admin force-close)
- **Time guard:** `clock.unix_timestamp >= epoch.end_time + config.settlement_timeout_seconds`
- **Effect:** Sets epoch to `Refunded`, clears `pool.active_epoch`, emits event
- **Safety:** Users get refunds (original stake back). No winner/loser determined.

**Crankbot integration:** New `Action.TIMEOUT_FORCE_CLOSE` when frozen epoch exceeds timeout. Bot calls the new instruction, then resumes creating the next epoch.

### Why Permissionless Is Safe

1. **Only activates on genuinely stuck epochs** — Normal settlement happens within seconds of `end_time`. A 60-second timeout means settlement has had 50+ retry opportunities.
2. **Only Frozen epochs** — Cannot force-close Open epochs (those still allow trading). Cannot force-close already Settled/Refunded epochs.
3. **No financial loss** — Sets epoch to `Refunded`, meaning every user gets their original stake back via `claim_refund`.
4. **Admin-configurable timeout** — Admin can increase timeout for mainnet (e.g., 1 hour) or decrease for testnet.
5. **On-chain enforced** — All guards are in the Solana program, not the bot. No client can bypass them.

### Why Not Admin-Only?

The entire problem is that the admin wallet isn't on the crankbot server. Adding admin key to VPS is a security risk. A permissionless timeout with strict on-chain guards provides the same safety without exposing admin keys.

## Acceptance Criteria

1. **AC1:** Given a Frozen epoch where `clock >= end_time + settlement_timeout_seconds`, when any wallet calls `timeout_force_close_epoch`, then the epoch state transitions to `Refunded` and `pool.active_epoch` is cleared
2. **AC2:** Given a Frozen epoch where `clock < end_time + settlement_timeout_seconds`, when `timeout_force_close_epoch` is called, then the transaction fails with `SettlementTimeoutNotReached`
3. **AC3:** Given an Open or Settled epoch, when `timeout_force_close_epoch` is called, then the transaction fails with `InvalidEpochState`
4. **AC4:** Given a frozen protocol (`config.frozen = true`), when `timeout_force_close_epoch` is called, then the transaction fails with `ProtocolFrozen`
5. **AC5:** Given the admin, when they call `update_config` with `settlement_timeout_seconds`, then the timeout value is updated on-chain
6. **AC6:** Given the crankbot encountering a stuck Frozen epoch past the timeout, when its poll cycle runs, then it automatically calls `timeout_force_close_epoch` and resumes with the next epoch
7. **AC7:** Given the crankbot encountering a settlement failure, when the error is caught, then it returns `POOL_STATE.Frozen` (not `POOL_STATE.None`) to use faster 2-second polling instead of 180-second idle polling

## Tasks / Subtasks

### On-Chain Changes

- [x] Task 1: Add `settlement_timeout_seconds` to GlobalConfig (AC: #5)
  - [x] 1.1 Add `pub settlement_timeout_seconds: i64` field to `GlobalConfig` in `state/config.rs` (after `max_trade_amount`, before `bump`)
  - [x] 1.2 Add `settlement_timeout_seconds: i64` parameter to `initialize` instruction in `instructions/initialize.rs`
  - [x] 1.3 Add validation `require!(settlement_timeout_seconds > 0)` in initialize handler
  - [x] 1.4 Store field in GlobalConfig during initialization
  - [x] 1.5 Add field to `GlobalConfigInitialized` event in `events.rs`
  - [x] 1.6 Add `settlement_timeout_seconds: Option<i64>` to `UpdateConfigParams` in `update_config.rs`
  - [x] 1.7 Add validation and apply logic in update_config handler (bit 18 in `fields_updated` bitmask)
  - [x] 1.8 Update `mock_config()` in test helper `utils/fees.rs` — **CRITICAL: forgetting this causes ICE crash on `anchor build`**

- [x] Task 2: Add error variant and event (AC: #2, #1)
  - [x] 2.1 Add `SettlementTimeoutNotReached` to `errors.rs`
  - [x] 2.2 Add `EpochTimeoutForceClosed` event to `events.rs`

- [x] Task 3: Implement `timeout_force_close_epoch` instruction (AC: #1, #2, #3, #4)
  - [x] 3.1 Create new file `instructions/timeout_force_close_epoch.rs`
  - [x] 3.2 Define `TimeoutForceCloseEpoch` accounts struct (permissionless — no `has_one = admin`)
  - [x] 3.3 Implement handler with all guards (ProtocolFrozen, PoolFrozen, InvalidEpochState, SettlementTimeoutNotReached)
  - [x] 3.4 Register module in `instructions/mod.rs`
  - [x] 3.5 Register entry point in `lib.rs`

- [x] Task 4: Build and verify (AC: #1-#5)
  - [x] 4.1 Run `anchor build` in WSL — compiled successfully (warnings only, no errors)
  - [ ] 4.2 Write Anchor tests (deferred — testnet-first approach)
  - [ ] 4.3 Run `anchor test`

### Crankbot Changes

- [x] Task 5: Add timeout force-close transaction builder (AC: #6)
  - [x] 5.1 Add `TIMEOUT_FORCE_CLOSE` to `Action` enum
  - [x] 5.2 Add instruction discriminator `[0x55, 0xc8, 0x8d, 0xa7, 0x5e, 0xbe, 0xf8, 0x3c]`
  - [x] 5.3 Implement `buildAndSendTimeoutForceCloseTx()` — accounts: payer, global_config, pool, epoch, clock
  - [x] 5.4 Add `SETTLEMENT_TIMEOUT_SECONDS` env var (default 60, configurable via `.env`)

- [x] Task 6: Update crankbot state machine (AC: #6, #7)
  - [x] 6.1 Update `determineAction()`: returns `TIMEOUT_FORCE_CLOSE` when past settlement timeout
  - [x] 6.2 Add `case Action.TIMEOUT_FORCE_CLOSE` in `runCycle()` — calls force-close, processes withdrawals, chains to next epoch
  - [x] 6.3 Settlement failure error handling returns `POOL_STATE.Frozen` (2s poll) instead of `POOL_STATE.None` (180s poll)
  - [x] 6.4 Updated `.env.example` with `SETTLEMENT_TIMEOUT_SECONDS` documentation

### Deploy (Testnet)

- [x] Task 7: Deploy to FOGO testnet
  - [x] 7.1 Build program: `anchor build` (WSL) — success
  - [x] 7.2 Deploy program: `solana program deploy` — TX: `56HKWeit...`
  - [x] 7.3 Close old GlobalConfig (164 bytes): `close-config.ts` — TX: `4L4FeWkz...`
  - [x] 7.4 Re-initialize GlobalConfig (172 bytes) with `settlement_timeout_seconds: 60` — TX: `om3sNuqW...`
  - [x] 7.5 Setup fee wallets (restore treasury/insurance): `setup-fee-wallets.ts` — TX: `4MEbw8EM...`
  - [x] 7.6 Restore oracle staleness override (10s start): `update-staleness.ts` — TX: `3Jo9DCCS...`
  - [x] 7.7 Copy IDL to frontend
  - [x] 7.8 Verify: `verify-protocol.ts` — all checks pass, `settlementTimeoutSeconds: 60` confirmed
  - **Key learning: Pools do NOT need recreation when only GlobalConfig changes**

### Frontend Changes

- [x] Task 8: Update frontend for new GlobalConfig field
  - [x] 8.1 IDL already copied during deploy step
  - [x] 8.2 Add `settlementTimeoutSeconds: BN` to `GlobalConfigData` in `use-global-config.ts`
  - [x] 8.3 Add `settlementTimeoutSeconds: number | null` to `UpdateConfigParams` in `update-config.ts`
  - [x] 8.4 Add `BN` wrapping in `toAnchorParams()` for the new field
  - [x] 8.5 Add input field + validation in `configuration-panel.tsx` (Epoch Timing section)
  - **Key learning: Missing field in UpdateConfigParams causes ALL admin config updates to fail (Borsh deserialization expects 19 fields, gets 18)**

### Scripts Updated

- [x] Task 9: Update deployment and utility scripts
  - [x] 9.1 `initialize-protocol.ts` — added `settlementTimeoutSeconds: 60` param + buffer encoding
  - [x] 9.2 `setup-fee-wallets.ts` — added `settlement_timeout_seconds: None` to update_config encoding
  - [x] 9.3 `update-staleness.ts` — added `settlement_timeout_seconds: None` to update_config encoding
  - [x] 9.4 `verify-protocol.ts` — added field to decoder, expected params, and checks
  - [x] 9.5 `globalconfig-operations-guide.md` — updated with new field, corrected deploy order, fixed pool recreation guidance

## Dev Notes

### GlobalConfig Field Addition Checklist

Reference: `_bmad-output/implementation-artifacts/globalconfig-operations-guide.md` Section 4

**Known pitfalls:**
1. **`mock_config()` in `utils/fees.rs`** — If you forget to add the new field here, `anchor build` crashes with an Internal Compiler Error (ICE) instead of a clean error. The release build passes (doesn't compile tests) but IDL build fails.
2. **Account size mismatch** — Adding `settlement_timeout_seconds: i64` (8 bytes) changes GlobalConfig size. On testnet: close + reinitialize. See guide Section 5.
3. **Pool recreation** — Closing GlobalConfig does NOT recreate pools. Run `create-pools.ts` after.
4. **Treasury/Insurance reset** — After re-initialization, update to dedicated wallets via admin dashboard.
5. **Fee wallet ATAs** — Ensure treasury/insurance USDC ATAs exist before trading resumes.

### Field placement in GlobalConfig struct

Add `settlement_timeout_seconds: i64` **before** `bump: u8` (the bump must remain last for Anchor PDA derivation). Suggested placement: after `max_trade_amount`.

### Binary layout change

Current GlobalConfig: 164 bytes (8 discriminator + 156 data)
New GlobalConfig: 172 bytes (+8 for i64)

### UpdateConfigParams field order

New field `settlement_timeout_seconds` becomes field #19 in the Option encoding order (after `max_trade_amount` at #18). Bitmask bit: 18.

### On-chain template

Use `admin_force_close_epoch.rs` as the template. Key differences:
- Replace `admin: Signer` with `payer: Signer`
- Remove `has_one = admin @ FogoPulseError::Unauthorized` from global_config
- Add clock access via `Clock::get()?` (no need to pass as account)
- Add time guard: `clock.unix_timestamp >= epoch.end_time + config.settlement_timeout_seconds`
- Only allow `Frozen` state (not `Open` — Open epochs need admin judgment)

### Crankbot discriminator

Compute from: `sha256("global:timeout_force_close_epoch")[0..8]`

### Existing scripts to update

- `anchor/scripts/initialize-protocol.ts` — Add `settlement_timeout_seconds` parameter
- `anchor/scripts/verify-protocol.ts` — Add field to verification output

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Completion Notes

1. **ICE crash confirmed:** Forgetting `settlement_timeout_seconds` in `mock_config()` (utils/fees.rs) caused rustc Internal Compiler Error on `anchor build`. Added to GlobalConfig operations guide as a pitfall.
2. **Pools survived re-init:** Closing and re-initializing GlobalConfig did NOT require pool recreation. Pools reference GlobalConfig at runtime via PDA, not at creation. This corrects the operations guide which previously said to recreate pools.
3. **Deploy order matters:** Deployed program binary BEFORE closing config. This ensures the close instruction still works if something goes wrong.
4. **Oracle staleness needed restore:** `initialize-protocol.ts` uses default staleness (3s start, 15s settle). Previous override (10s start) had to be re-applied via `update-staleness.ts`.
5. **Frontend was blocking:** Missing `settlementTimeoutSeconds` in `UpdateConfigParams` caused ALL admin config updates to fail with Borsh deserialization error (expected 19 Option fields, received 18). Fixed by adding field to hook, transaction builder, and configuration panel.
6. **Crankbot timeout is env-configurable:** `SETTLEMENT_TIMEOUT_SECONDS` read from `.env` (default 60). systemd service uses `EnvironmentFile` directive so `.env` values are loaded. Bot's value only controls when it *attempts* the call — on-chain program does the real validation.

### Files Modified

| File | Change |
|------|--------|
| `anchor/programs/fogopulse/src/state/config.rs` | Added `settlement_timeout_seconds: i64` field |
| `anchor/programs/fogopulse/src/instructions/timeout_force_close_epoch.rs` | **New** — permissionless instruction |
| `anchor/programs/fogopulse/src/instructions/initialize.rs` | Added new config param + validation |
| `anchor/programs/fogopulse/src/instructions/update_config.rs` | Added new config param (bit 18) |
| `anchor/programs/fogopulse/src/instructions/mod.rs` | Registered new module |
| `anchor/programs/fogopulse/src/lib.rs` | Registered entry point + init param |
| `anchor/programs/fogopulse/src/errors.rs` | Added `SettlementTimeoutNotReached` |
| `anchor/programs/fogopulse/src/events.rs` | Added `EpochTimeoutForceClosed` event + updated `GlobalConfigInitialized` |
| `anchor/programs/fogopulse/src/utils/fees.rs` | Added field to `mock_config()` |
| `crank-bot/crank-bot.ts` | Timeout force-close tx builder, action handling, error classification, env var |
| `crank-bot/.env.example` | Added `SETTLEMENT_TIMEOUT_SECONDS` |
| `anchor/scripts/initialize-protocol.ts` | Added `settlementTimeoutSeconds` param + encoding |
| `anchor/scripts/setup-fee-wallets.ts` | Added `settlement_timeout_seconds: None` |
| `anchor/scripts/update-staleness.ts` | Added `settlement_timeout_seconds: None` |
| `anchor/scripts/verify-protocol.ts` | Added field to decoder, expected params, checks |
| `web/src/hooks/use-global-config.ts` | Added `settlementTimeoutSeconds: BN` to interface + fetch |
| `web/src/lib/transactions/update-config.ts` | Added to `UpdateConfigParams` + `toAnchorParams()` |
| `web/src/components/admin/configuration-panel.tsx` | Added form field, validation, changes detection, UI input |
| `web/src/lib/fogopulse.json` | Updated IDL with new GlobalConfig field + timeout_force_close_epoch instruction |
| `_bmad-output/implementation-artifacts/globalconfig-operations-guide.md` | Updated with new field, corrected guidance |

## Senior Developer Review (AI)

**Reviewer:** theRoad (via Claude Opus 4.6)
**Date:** 2026-03-24
**Outcome:** Changes Requested (fixes applied inline)

### Issues Found & Fixed

| ID | Severity | Issue | Fix Applied |
|----|----------|-------|-------------|
| H1 | HIGH | Integer overflow in `timeout_force_close_epoch.rs` timeout check (`end_time + settlement_timeout_seconds` can wrap) | Changed to `checked_add` with `Overflow` error |
| M1 | MEDIUM | `web/src/lib/fogopulse.json` (IDL) missing from story File List | Added to table |
| M2 | MEDIUM | `verify-protocol.ts` staleness expected values changed without explanation | Added comments explaining overrides |
| M4 | MEDIUM | No upper bound on `settlement_timeout_seconds` — admin could set to i64::MAX or 1 | Added `<= 86400` (24h) cap in initialize + update_config |

### Issues Noted (Not Fixed — Recommendations)

| ID | Severity | Issue | Recommendation |
|----|----------|-------|---------------|
| H2→M | MEDIUM | Crankbot reads timeout from env var, not on-chain GlobalConfig | Added warning comment. On-chain enforces real timeout so bot env mismatch causes failed tx (safe) not incorrect behavior. Future: parse GlobalConfig at startup. |
| M3 | MEDIUM | Clock passed as account instead of `Clock::get()?` (wastes account slot) | Left as-is since program is deployed. Added comment. Switch to `Clock::get()?` on next program redeploy. |
| L1 | LOW | Crankbot TIMEOUT_FORCE_CLOSE handler duplicates epoch creation chain logic (~35 lines) | Extract into shared helper on next refactor |
| L2 | LOW | Story Dev Notes #3 contradicts #2 about pool recreation | Informational only |
| L3 | LOW | Discriminator hex vs decimal format inconsistency | Cosmetic only |

### Change Log

- 2026-03-24: Code review applied — H1 overflow fix, M4 bounds validation, M1/M2 doc fixes
