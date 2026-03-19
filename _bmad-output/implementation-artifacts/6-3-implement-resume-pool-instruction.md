# Story 6.3: Implement resume_pool Instruction

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to resume a paused pool,
so that trading can continue after an issue is resolved.

## Acceptance Criteria

1. **Given** a paused pool and admin wallet, **When** I call resume_pool for the paused asset, **Then** admin signature is verified against GlobalConfig.admin
2. **Given** a valid admin signature, **When** resume_pool is called, **Then** pool.is_paused is set to false
3. **Given** a resumed pool, **When** new epochs are created via create_epoch, **Then** they succeed (is_paused check passes)
4. **Given** a resumed pool, **When** trading is attempted, **Then** buy/sell succeed (is_paused no longer blocks)
5. **Given** a successful resume_pool call, **Then** a `PoolResumed` event is emitted with pool pubkey, asset_mint, and admin
6. **Given** a non-admin wallet, **When** resume_pool is called, **Then** it fails with `Unauthorized`
7. **Given** a pool that is NOT paused, **When** resume_pool is called, **Then** it succeeds idempotently (no error, no-op, no event)
8. **And** FR46 (resume epoch creation) is satisfied

## Tasks / Subtasks

- [x] Task 1: Create resume_pool Anchor instruction (AC: #1, #2, #5, #6, #7)
  - [x] 1.1: Create `anchor/programs/fogopulse/src/instructions/resume_pool.rs`
  - [x] 1.2: Define `ResumePool` accounts struct: `admin` (Signer, mut), `global_config` (with `has_one = admin`, seeds+bump), `pool` (mut, seeds+bump)
  - [x] 1.3: Implement handler: verify admin, set `pool.is_paused = false` (only if currently true), emit `PoolResumed` event (only if state changed)
  - [x] 1.4: Handle idempotency — if already unpaused, succeed silently (no error, no event)
  - [x] 1.5: Register module in `instructions/mod.rs` — add `pub mod resume_pool;` and `pub use resume_pool::*;`
  - [x] 1.6: Register instruction in `lib.rs` under ADMIN INSTRUCTIONS section (next to `pause_pool`)
  - [x] 1.7: Build via WSL: `wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && anchor build 2>&1"`

- [x] Task 2: Deploy and sync IDL (AC: all)
  - [x] 2.1: Deploy to FOGO testnet via WSL: `wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && solana program deploy target/deploy/fogopulse.so --program-id D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5"`
  - [x] 2.2: Copy IDL: `wsl -e bash -l -c "cp /mnt/d/dev/fogopulse/anchor/target/idl/fogopulse.json /mnt/d/dev/fogopulse/web/src/lib/fogopulse.json && echo 'IDL copied successfully'"`

- [x] Task 3: Create integration tests for resume_pool (AC: #1-#7)
  - [x] 3.1: Create `anchor/tests/resume-pool.test.ts` — plain tsx script with `main()` entrypoint (NOT Jest/Vitest/Mocha)
  - [x] 3.2: Use raw `@solana/web3.js` — build `TransactionInstruction` manually with IDL discriminator, send as `VersionedTransaction`
  - [x] 3.3: Load admin wallet from `WALLET_PATH` env or `~/.config/solana/fogo-testnet.json`
  - [x] 3.4: Test happy path — ensure pool is paused first (call pause_pool), then call resume_pool, read Pool account, verify `is_paused == false`
  - [x] 3.5: Test idempotency — call resume_pool on already-unpaused pool, verify no error
  - [x] 3.6: Test authorization — non-admin signer should fail with `Unauthorized` or Anchor `has_one` constraint error
  - [x] 3.7: **IMPORTANT: Restore pool to unpaused state** after tests to avoid corrupting testnet state (pool should end unpaused since resume_pool is the last operation)
  - [x] 3.8: Run via WSL: `cd /mnt/d/dev/fogopulse/anchor && npx tsx tests/resume-pool.test.ts`

- [x] Task 4: Create frontend transaction builder (AC: related to FR46)
  - [x] 4.1: Create `web/src/lib/transactions/resume-pool.ts`
  - [x] 4.2: Export `buildResumePoolInstruction(program, admin, pool)` returning `Promise<TransactionInstruction>`
  - [x] 4.3: Use `GLOBAL_CONFIG_PDA` and appropriate `POOL_PDAS[asset]` constants
  - [x] 4.4: Use Anchor's `(program.methods as any).resumePool().accounts({...}).instruction()` pattern
  - [x] 4.5: Verify TypeScript compilation and ESLint pass

## DO NOT (Anti-patterns)

- **DO NOT** use `update_config` to set pool-level resume — `update_config` only sets global flags on GlobalConfig, NOT per-pool `is_paused`
- **DO NOT** modify the Pool account struct — `is_paused: bool` already exists at pool.rs, just set it to `false`
- **DO NOT** create a UI component — that's Story 6.7 (Create Pool Management UI)
- **DO NOT** use Jest, Vitest, or Mocha for tests — use plain tsx scripts with `main()` function (match existing test pattern from `pause-pool.test.ts` and `admin-force-close-epoch.test.ts`)
- **DO NOT** use Anchor `Program` in tests — use raw `@solana/web3.js` TransactionInstruction with manual discriminator
- **DO NOT** return `Transaction` from frontend builder — return `TransactionInstruction` via `.instruction()` (match `pause-pool.ts` pattern)
- **DO NOT** create a new program instance in frontend — use `useProgram()` from `web/src/hooks/use-program.ts` when integrating
- **DO NOT** add global pause/freeze guards to resume_pool itself — admin must always be able to set pool flags regardless of protocol state (same design as pause_pool: no pause/freeze guards)
- **DO NOT** create the `PoolResumed` event — it already exists in `events.rs` (added by Story 6.2)
- **DO NOT** deviate from the `pause_pool.rs` code structure — resume_pool is the exact mirror, just sets `is_paused = false` instead of `true`

## REUSE THESE (Existing Code)

| What | Import From | Purpose |
|------|-------------|---------|
| `GlobalConfig` state | `crate::state::GlobalConfig` | Admin authority verification via `has_one` |
| `Pool` state | `crate::state::pool::Pool` | Target account to set `is_paused = false` |
| `FogoPulseError` | `crate::errors::FogoPulseError` | Error enum — `Unauthorized` already exists |
| `PoolResumed` event | `crate::events::PoolResumed` | Already created by Story 6.2 — just import and emit |
| `pause_pool.rs` | `instructions/pause_pool.rs` | **EXACT mirror** — copy structure, change `true` to `false`, change event from `PoolPaused` to `PoolResumed` |
| `pause-pool.test.ts` | `anchor/tests/` | Test pattern: copy and adapt — change discriminator, test flow (pause first, then resume) |
| `pause-pool.ts` | `web/src/lib/transactions/` | Frontend tx builder — copy, change method name from `pausePool()` to `resumePool()` |
| `useProgram()` | `web/src/hooks/use-program.ts` | Anchor program instance |
| `useIsAdmin()` | `web/src/hooks/use-is-admin.ts` | Admin wallet detection |
| `GLOBAL_CONFIG_PDA` | `web/src/lib/constants.ts` | Pre-derived GlobalConfig PDA |
| `POOL_PDAS` | `web/src/lib/constants.ts` | Pre-derived Pool PDAs per asset |
| `PROGRAM_ID` | `web/src/lib/constants.ts` | `D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5` |
| IDL JSON | `web/src/lib/fogopulse.json` | IDL for Anchor Program instantiation |

## Dev Notes

### On-Chain Implementation Guide

This instruction is the exact mirror of `pause_pool.rs` — same 3 accounts, no params, set one bool field to `false` instead of `true`.

```rust
// resume_pool.rs — MIRROR of pause_pool.rs
use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;
use crate::events::PoolResumed;
use crate::state::{GlobalConfig, Pool};

#[derive(Accounts)]
pub struct ResumePool<'info> {
    /// Admin signer — verified via GlobalConfig.has_one
    #[account(mut)]
    pub admin: Signer<'info>,

    /// GlobalConfig for admin verification
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = admin @ FogoPulseError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// Pool to resume — PDA with seeds ["pool", asset_mint]
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,
}

pub fn handler(ctx: Context<ResumePool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    msg!("resume_pool: admin={}, pool={}, asset_mint={}",
        ctx.accounts.admin.key(), pool.key(), pool.asset_mint);

    // Idempotent — if already unpaused, succeed silently (no event)
    if pool.is_paused {
        pool.is_paused = false;

        emit!(PoolResumed {
            pool: pool.key(),
            asset_mint: pool.asset_mint,
            admin: ctx.accounts.admin.key(),
        });
    }

    Ok(())
}
```

### PoolResumed Event (ALREADY EXISTS — Do Not Create)

The `PoolResumed` event was already added to `events.rs` by Story 6.2. Just import it:

```rust
use crate::events::PoolResumed;
```

Event definition (already in `anchor/programs/fogopulse/src/events.rs`):
```rust
#[event]
pub struct PoolResumed {
    pub pool: Pubkey,
    pub asset_mint: Pubkey,
    pub admin: Pubkey,
}
```

### lib.rs Registration

Add directly below `pause_pool` in the `// ADMIN INSTRUCTIONS` section:

```rust
/// Resume a paused pool (admin only)
///
/// Sets pool.is_paused = false, allowing new epoch creation
/// and new trades to resume.
pub fn resume_pool(ctx: Context<ResumePool>) -> Result<()> {
    instructions::resume_pool::handler(ctx)
}
```

### mod.rs Registration

Add alongside `pause_pool`:
```rust
pub mod resume_pool;
// ... in the pub use section:
pub use resume_pool::*;
```

### Pool Account Buffer Layout (for test deserialization)

Pool account data (after 8-byte discriminator):
```
offset 0:   asset_mint (32 bytes, Pubkey)
offset 32:  yes_reserves (8 bytes, u64 LE)
offset 40:  no_reserves (8 bytes, u64 LE)
offset 48:  total_lp_shares (8 bytes, u64 LE)
offset 56:  pending_withdrawal_shares (8 bytes, u64 LE)
offset 64:  next_epoch_id (8 bytes, u64 LE)
offset 72:  active_epoch (1 + 32 bytes, Option<Pubkey>)
offset 105: active_epoch_state (1 byte, u8)
offset 106: wallet_cap_bps (2 bytes, u16 LE)
offset 108: side_cap_bps (2 bytes, u16 LE)
offset 110: is_paused (1 byte, bool)
offset 111: is_frozen (1 byte, bool)
offset 112: bump (1 byte, u8)
```

**IMPORTANT from Story 6.2 learnings:** `Option<Pubkey>` uses Borsh variable-length encoding (1 byte for None, 33 bytes for Some), making `is_paused` offset dynamic. Parse the Option tag at runtime instead of using a hardcoded offset. Copy the buffer parsing logic from `pause-pool.test.ts`.

### Test Strategy

The resume_pool tests must:
1. **Setup**: Ensure pool is paused before testing resume (call pause_pool first)
2. **Happy path**: Call resume_pool, verify `is_paused == false` in account data
3. **Idempotency**: Call resume_pool on unpaused pool, verify no error
4. **Authorization**: Non-admin signer should fail
5. **Cleanup**: Pool ends in unpaused state (natural outcome of resume tests)

**Key difference from pause_pool tests:** Tests need a "pause first" setup step before testing resume.

### Test Discriminator

The IDL discriminator for `resume_pool` must be computed from the built IDL after Task 1 is complete. It will be in the updated `fogopulse.json` IDL file under the instruction name `resumePool`.

To compute manually: `sha256("global:resume_pool").slice(0, 8)` — but prefer reading from the IDL directly.

### Frontend Transaction Builder Pattern

Mirror `pause-pool.ts` exactly:

```typescript
import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'
import { GLOBAL_CONFIG_PDA } from '@/lib/constants'

export async function buildResumePoolInstruction(
  program: Program<any>,
  admin: PublicKey,
  pool: PublicKey
): Promise<TransactionInstruction> {
  const instruction: TransactionInstruction = await (program.methods as any)
    .resumePool()
    .accounts({
      admin,
      globalConfig: GLOBAL_CONFIG_PDA,
      pool,
    })
    .instruction()

  return instruction
}
```

### Build & Deploy Commands (All via WSL)

```bash
# Build
wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && anchor build 2>&1"

# Deploy
wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && solana program deploy target/deploy/fogopulse.so --program-id D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5"

# Copy IDL
wsl -e bash -l -c "cp /mnt/d/dev/fogopulse/anchor/target/idl/fogopulse.json /mnt/d/dev/fogopulse/web/src/lib/fogopulse.json"

# Run tests
wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && npx tsx tests/resume-pool.test.ts"
```

### Previous Story Intelligence (Story 6.2 — pause_pool)

Critical learnings from Story 6.2 that MUST be applied:

1. **Pool PDA seed validation is REQUIRED** — Story 6.2 code review found a HIGH severity issue where pool accepted any writable account. MUST include `seeds = [b"pool", pool.asset_mint.as_ref()], bump = pool.bump` on the pool account constraint.
2. **Event emission must be guarded** — Only emit `PoolResumed` when state actually changes (i.e., when `pool.is_paused` was true). Do NOT emit on idempotent no-op calls.
3. **Admin account must be `#[account(mut)]`** — Consistent with other admin instructions.
4. **Non-admin test must validate specific auth errors** — Do NOT use blanket catch that passes on any error. Validate the error is specifically an auth/constraint error.
5. **FOGO testnet RPC has transient failures** — Tests may need retry logic for account reads. Copy retry approach from pause-pool.test.ts.
6. **Option<Pubkey> Borsh encoding** — Pool buffer offset for `is_paused` is dynamic due to `Option<Pubkey>` at offset 72. Parse the Option discriminator byte first.
7. **Restore testnet state** — Tests should leave pool in unpaused state (natural for resume tests).
8. **Pool on testnet is currently paused** — Story 6.2 noted pool remains paused since resume_pool didn't exist. This story's tests will naturally fix that.

### Error Codes Reference

| Error | Anchor Code | When |
|-------|-------------|------|
| `Unauthorized` | 6000 | Non-admin signer (from `has_one` constraint) |

### Design Context: is_paused vs is_frozen

- `is_paused` (this story): Stops new activity (trades, epochs, deposits, withdrawals). Settlement, claims, and epoch advancement continue.
- `is_frozen` (Story 6.4): Nuclear option — also blocks settlement, claims, and epoch advancement.
- `resume_pool` reverses `pause_pool` — sets `is_paused = false`. There is no corresponding "unfreeze_pool" in the current sprint.

### Project Structure Notes

- New instruction file: `anchor/programs/fogopulse/src/instructions/resume_pool.rs`
- Modified: `anchor/programs/fogopulse/src/instructions/mod.rs` (add module)
- Modified: `anchor/programs/fogopulse/src/lib.rs` (register instruction)
- New test: `anchor/tests/resume-pool.test.ts`
- New frontend builder: `web/src/lib/transactions/resume-pool.ts`
- Modified: `web/src/lib/fogopulse.json` (updated IDL after build)
- NOT modified: `anchor/programs/fogopulse/src/events.rs` (PoolResumed already exists)

### References

- [Source: anchor/programs/fogopulse/src/instructions/pause_pool.rs] — EXACT mirror template for resume_pool
- [Source: anchor/programs/fogopulse/src/events.rs#PoolResumed] — Event already exists (added by Story 6.2)
- [Source: anchor/programs/fogopulse/src/state/pool.rs#is_paused] — Pool account with is_paused field
- [Source: anchor/programs/fogopulse/src/errors.rs#Unauthorized] — Error enum for admin verification
- [Source: anchor/programs/fogopulse/src/lib.rs:270] — pause_pool registration location (add resume_pool next to it)
- [Source: anchor/programs/fogopulse/src/instructions/mod.rs:18] — pause_pool module registration (add resume_pool)
- [Source: anchor/tests/pause-pool.test.ts] — Test pattern reference (copy and adapt)
- [Source: web/src/lib/transactions/pause-pool.ts] — Frontend tx builder reference (copy and adapt)
- [Source: web/src/lib/constants.ts] — PDA constants (GLOBAL_CONFIG_PDA, POOL_PDAS)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3] — Epic requirements (FR46)
- [Source: _bmad-output/implementation-artifacts/6-2-implement-pause-pool-instruction.md] — Previous story learnings

## Change Log

- 2026-03-19: Implemented resume_pool instruction — exact mirror of pause_pool, sets is_paused=false with idempotent behavior and PoolResumed event emission. Deployed to FOGO testnet, all 3 integration tests pass (happy path, idempotency, authorization). Frontend transaction builder created. BTC pool restored to unpaused state on testnet.
- 2026-03-19: Code review fixes — (M1) Non-admin test now uses skipPreflight:true and separates auth errors from balance errors with clear warning. (M2) Happy path test now verifies PoolResumed event emission in TX logs (AC #5). (M3) Idempotent test now verifies PoolResumed event is NOT emitted on no-op (AC #7).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Initial deploy failed due to transient FOGO testnet RPC errors; succeeded on retry
- All Story 6.2 learnings applied: PDA seed validation, guarded event emission, dynamic Option<Pubkey> buffer parsing, specific auth error validation in tests

### Completion Notes List

- Task 1: Created `resume_pool.rs` as exact mirror of `pause_pool.rs` — same accounts struct with PDA seed validation, handler sets `is_paused = false` only when currently true, emits `PoolResumed` only on state change. Registered in mod.rs and lib.rs. Build successful (no new warnings).
- Task 2: Deployed to FOGO testnet (program ID D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5). IDL copied to web frontend. Deploy TX: 4RAxGotdyNUYWBQdmCM9dybM1bkuodF3a1xA9UY87wyuy5GziMB2zEWmfy1Vugb4XMUR4LGVh1px14N26A8v1EWz
- Task 3: Created `resume-pool.test.ts` with 3 tests: (1) non-admin auth rejection, (2) happy path (pause then resume, verify is_paused=false), (3) idempotent resume on already-unpaused pool. All 3 pass. Pool ends unpaused on testnet.
- Task 4: Created `resume-pool.ts` frontend transaction builder mirroring `pause-pool.ts`. TypeScript compiles cleanly.

### File List

- `anchor/programs/fogopulse/src/instructions/resume_pool.rs` (new) — resume_pool instruction handler
- `anchor/programs/fogopulse/src/instructions/mod.rs` (modified) — added resume_pool module registration
- `anchor/programs/fogopulse/src/lib.rs` (modified) — added resume_pool instruction entry point
- `anchor/tests/resume-pool.test.ts` (new) — integration tests for resume_pool
- `web/src/lib/transactions/resume-pool.ts` (new) — frontend transaction builder
- `web/src/lib/fogopulse.json` (modified) — updated IDL with resume_pool instruction
- `anchor/target/deploy/fogopulse.so` (modified) — compiled program binary
- `anchor/target/idl/fogopulse.json` (modified) — generated IDL
