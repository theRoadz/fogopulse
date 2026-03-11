# Story 1.6: Implement Epoch Account Structure

Status: done

## Story

As a developer,
I want the Epoch account structure implemented,
So that time-bounded trading periods can be created within pools.

## Acceptance Criteria

1. **Epoch Account Structure**: The Epoch struct includes all required fields:
   - `pool: Pubkey` - Parent pool reference
   - `epoch_id: u64` - Sequential identifier within pool
   - `state: EpochState` - Current epoch state (enum)
   - `start_time: i64` - Unix timestamp epoch begins
   - `end_time: i64` - Unix timestamp epoch ends
   - `freeze_time: i64` - When trading stops (`end_time - freeze_window_seconds`)
   - `start_price: u64` - Oracle price at epoch creation
   - `start_confidence: u64` - Oracle confidence at epoch creation
   - `start_publish_time: i64` - Oracle timestamp at epoch creation
   - `settlement_price: Option<u64>` - Oracle price at settlement (None until settled)
   - `settlement_confidence: Option<u64>` - Oracle confidence at settlement
   - `settlement_publish_time: Option<i64>` - Oracle timestamp at settlement
   - `outcome: Option<Outcome>` - Final outcome (Up, Down, or Refunded)
   - `bump: u8` - PDA bump seed

2. **PDA Derivation**: Seeds are `[b"epoch", pool.key().as_ref(), &epoch_id.to_le_bytes()]`

3. **EpochState Enum**: Includes states: `Open`, `Frozen`, `Settling`, `Settled`, `Refunded`

4. **Outcome Enum**: Includes: `Up`, `Down`, `Refunded`

5. **create_epoch Instruction**:
   - Is permissionless (anyone can call) to enable crank bots/keepers
   - **ONLY succeeds when `pool.active_epoch` is `None`** (first epoch for pool, or after settlement)
   - Fails with `EpochAlreadyActive` if `pool.active_epoch` is `Some(_)`
   - Creates epoch with `pool.next_epoch_id` as epoch_id
   - Calculates timing: `end_time = start_time + epoch_duration_seconds`, `freeze_time = end_time - freeze_window_seconds`
   - Sets state to `Open`
   - For MVP: Accepts mock oracle values via instruction arguments (actual Pyth integration is Story 1.8)
   - Validates pool is not paused/frozen
   - Validates protocol (GlobalConfig) is not paused/frozen
   - Updates `pool.active_epoch`, `pool.active_epoch_state`, and increments `pool.next_epoch_id`

6. **Event Emission**: Emits an `EpochCreated` event with epoch pubkey, pool, epoch_id, start_price, start_confidence, start_time, end_time

## Tasks / Subtasks

- [x] Task 1: Create Epoch account structure (AC: #1)
  - [x] Create `anchor/programs/fogopulse/src/state/epoch.rs`
  - [x] Define Epoch struct with all 14 fields
  - [x] Use `#[account]` and `#[derive(InitSpace)]` attributes
  - [x] Export from `state/mod.rs`

- [x] Task 2: Define EpochState and Outcome enums (AC: #3, #4)
  - [x] Add EpochState enum to epoch.rs (Open, Frozen, Settling, Settled, Refunded)
  - [x] Add Outcome enum to epoch.rs (Up, Down, Refunded)
  - [x] Use `#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]`
  - [x] Export both enums from `state/mod.rs`
  - [x] Note: Direction enum (Up/Down for positions) belongs in Story 1.7, not here

- [x] Task 3: Add EpochCreated event (AC: #6)
  - [x] Add `EpochCreated` event struct to `events.rs`
  - [x] Include: epoch, pool, epoch_id, start_price, start_confidence, start_time, end_time

- [x] Task 4: Add epoch-related errors (AC: #5)
  - [x] Add `PoolPaused` - "Pool is paused - no new epochs allowed"
  - [x] Add `PoolFrozen` - "Pool is frozen - emergency halt active"
  - [x] Add `EpochAlreadyActive` - "Cannot create epoch - active epoch exists"
  - [x] Add `Overflow` - "Arithmetic overflow" (for checked_add on next_epoch_id)

- [x] Task 5: Implement create_epoch instruction (AC: #2, #5)
  - [x] Create `anchor/programs/fogopulse/src/instructions/create_epoch.rs`
  - [x] Define CreateEpoch accounts struct (see Complete Instruction Pattern below)
  - [x] Implement handler with all validations
  - [x] Export from instructions/mod.rs

- [x] Task 6: Wire up instruction in lib.rs (AC: #5)
  - [x] Add create_epoch function with parameters: start_price, start_confidence, start_publish_time
  - [x] Call instructions::create_epoch::handler

- [x] Task 7: Build and verify (AC: #1-6)
  - [x] Run `anchor build` in WSL
  - [x] Verify no stack overflow warnings
  - [x] Verify IDL contains: Epoch type, EpochState enum, Outcome enum, create_epoch instruction, EpochCreated event, new errors

## Dev Notes

### Complete Instruction Pattern

```rust
use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;
use crate::events::EpochCreated;
use crate::state::{GlobalConfig, Pool, Epoch, EpochState};

#[derive(Accounts)]
pub struct CreateEpoch<'info> {
    /// Anyone can call - permissionless for crank bots
    #[account(mut)]
    pub payer: Signer<'info>,

    /// GlobalConfig - boxed to prevent stack overflow
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    /// Pool - must have no active epoch
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// Epoch account to be created
    #[account(
        init,
        payer = payer,
        space = 8 + Epoch::INIT_SPACE,
        seeds = [b"epoch", pool.key().as_ref(), &pool.next_epoch_id.to_le_bytes()],
        bump
    )]
    pub epoch: Account<'info, Epoch>,

    /// Clock sysvar for timestamp
    pub clock: Sysvar<'info, Clock>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateEpoch>,
    start_price: u64,
    start_confidence: u64,
    start_publish_time: i64,
) -> Result<()> {
    let config = &ctx.accounts.global_config;
    let pool = &mut ctx.accounts.pool;
    let epoch = &mut ctx.accounts.epoch;
    let clock = &ctx.accounts.clock;

    // Protocol checks
    require!(!config.frozen, FogoPulseError::ProtocolFrozen);
    require!(!config.paused, FogoPulseError::ProtocolPaused);

    // Pool checks
    require!(!pool.is_frozen, FogoPulseError::PoolFrozen);
    require!(!pool.is_paused, FogoPulseError::PoolPaused);

    // Epoch existence check - CRITICAL
    require!(pool.active_epoch.is_none(), FogoPulseError::EpochAlreadyActive);

    // Calculate timing
    let start_time = clock.unix_timestamp;
    let end_time = start_time + config.epoch_duration_seconds;
    let freeze_time = end_time - config.freeze_window_seconds;

    // Initialize epoch
    epoch.pool = pool.key();
    epoch.epoch_id = pool.next_epoch_id;
    epoch.state = EpochState::Open;
    epoch.start_time = start_time;
    epoch.end_time = end_time;
    epoch.freeze_time = freeze_time;
    epoch.start_price = start_price;
    epoch.start_confidence = start_confidence;
    epoch.start_publish_time = start_publish_time;
    epoch.settlement_price = None;
    epoch.settlement_confidence = None;
    epoch.settlement_publish_time = None;
    epoch.outcome = None;
    epoch.bump = ctx.bumps.epoch;

    // Update pool state
    pool.active_epoch = Some(epoch.key());
    pool.active_epoch_state = 1; // 1 = Open
    pool.next_epoch_id = pool.next_epoch_id
        .checked_add(1)
        .ok_or(FogoPulseError::Overflow)?;

    emit!(EpochCreated {
        epoch: epoch.key(),
        pool: pool.key(),
        epoch_id: epoch.epoch_id,
        start_price: epoch.start_price,
        start_confidence: epoch.start_confidence,
        start_time: epoch.start_time,
        end_time: epoch.end_time,
    });

    Ok(())
}
```

### lib.rs Addition

```rust
pub fn create_epoch(
    ctx: Context<CreateEpoch>,
    start_price: u64,
    start_confidence: u64,
    start_publish_time: i64,
) -> Result<()> {
    instructions::create_epoch::handler(ctx, start_price, start_confidence, start_publish_time)
}
```

### Epoch Account Size

~127 bytes total (8 discriminator + 119 data). Use `#[derive(InitSpace)]` - don't hardcode.

### First Epoch vs Subsequent Epochs

This story implements `create_epoch` for the **FIRST epoch only** (when `pool.active_epoch` is `None`).

For subsequent epochs, a separate `advance_epoch` instruction (future story) will atomically:
1. Settle the previous epoch
2. Create the new epoch

This separation ensures epochs are never orphaned and settlement always occurs.

### Enum Definitions

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EpochState {
    Open,      // Trading allowed
    Frozen,    // In freeze window, no trades
    Settling,  // Settlement in progress
    Settled,   // Outcome determined
    Refunded,  // Oracle failed, all refunded
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Outcome {
    Up,        // Settlement > Start price
    Down,      // Settlement < Start price
    Refunded,  // Confidence overlap or tie
}
```

### Event Definition

```rust
#[event]
pub struct EpochCreated {
    pub epoch: Pubkey,
    pub pool: Pubkey,
    pub epoch_id: u64,
    pub start_price: u64,
    pub start_confidence: u64,
    pub start_time: i64,
    pub end_time: i64,
}
```

### Error Definitions to Add

```rust
#[msg("Pool is paused - no new epochs allowed")]
PoolPaused,

#[msg("Pool is frozen - emergency halt active")]
PoolFrozen,

#[msg("Cannot create epoch - active epoch exists")]
EpochAlreadyActive,

#[msg("Arithmetic overflow")]
Overflow,
```

### Previous Story Intelligence

**From Story 1.5 Code Review:**
- Pause/freeze checks were missing initially - added during review. This story includes them from the start.
- `Box<Account<>>` correctly applied for GlobalConfig and Pool
- UncheckedAccount comments need explicit security rationale
- Build completed without stack overflow warnings

**Patterns Established:**
- Protocol checks before pool checks
- Events emitted after all state changes
- `checked_add` with Overflow error for counters

### Testing Scenarios

1. Anyone can create first epoch (permissionless)
2. Cannot create epoch when `pool.active_epoch` is `Some(_)` (EpochAlreadyActive)
3. Cannot create epoch on paused pool (PoolPaused)
4. Cannot create epoch on frozen pool (PoolFrozen)
5. Cannot create epoch when protocol is paused/frozen
6. Pool.active_epoch updated to new epoch pubkey
7. Pool.active_epoch_state set to 1 (Open)
8. Pool.next_epoch_id incremented
9. Timing calculated correctly from GlobalConfig
10. EpochCreated event emitted with correct values

### Files to Create/Modify

| File | Action |
|------|--------|
| `state/epoch.rs` | Create - Epoch struct, EpochState, Outcome enums |
| `state/mod.rs` | Modify - add `pub mod epoch; pub use epoch::*;` |
| `instructions/create_epoch.rs` | Create - CreateEpoch accounts + handler |
| `instructions/mod.rs` | Modify - add `pub mod create_epoch; pub use create_epoch::*;` |
| `events.rs` | Modify - add EpochCreated event |
| `errors.rs` | Modify - add PoolPaused, PoolFrozen, EpochAlreadyActive, Overflow |
| `lib.rs` | Modify - add create_epoch function |

### References

- [Source: architecture.md - Epoch Lifecycle, `create_epoch` vs `advance_epoch`]
- [Source: docs/on-chain-structure.md - Epoch PDA seeds, states]
- [Source: state/pool.rs - active_epoch, active_epoch_state, next_epoch_id fields]
- [Source: instructions/create_pool.rs - Box<> pattern, pause/freeze checks]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Build completed successfully with no stack overflow warnings
- IDL verified to contain all expected types, events, errors, and instructions

### Completion Notes List

- Created Epoch account structure with all 14 fields: pool, epoch_id, state, start_time, end_time, freeze_time, start_price, start_confidence, start_publish_time, settlement_price, settlement_confidence, settlement_publish_time, outcome, bump
- Implemented EpochState enum with 5 states: Open, Frozen, Settling, Settled, Refunded
- Implemented Outcome enum with 3 variants: Up, Down, Refunded
- Added EpochCreated event with all required fields
- Added 4 new errors: PoolPaused, PoolFrozen, EpochAlreadyActive, Overflow
- Implemented create_epoch instruction as permissionless (anyone can call for crank bots)
- Instruction validates: protocol not frozen/paused, pool not frozen/paused, no active epoch exists
- Uses Box<Account<>> pattern for GlobalConfig and Pool to prevent stack overflow
- PDA seeds: ["epoch", pool.key(), &pool.next_epoch_id.to_le_bytes()]
- Protocol checks done before pool checks (established pattern)
- Uses checked_add with Overflow error for next_epoch_id increment

### File List

| File | Action |
|------|--------|
| `anchor/programs/fogopulse/src/state/epoch.rs` | Created - Epoch struct, EpochState enum, Outcome enum |
| `anchor/programs/fogopulse/src/state/mod.rs` | Modified - added epoch module export |
| `anchor/programs/fogopulse/src/instructions/create_epoch.rs` | Created - CreateEpoch accounts + handler |
| `anchor/programs/fogopulse/src/instructions/mod.rs` | Modified - added create_epoch module export |
| `anchor/programs/fogopulse/src/events.rs` | Modified - added EpochCreated event |
| `anchor/programs/fogopulse/src/errors.rs` | Modified - added PoolPaused, PoolFrozen, EpochAlreadyActive, Overflow errors |
| `anchor/programs/fogopulse/src/lib.rs` | Modified - added create_epoch function |
| `anchor/target/idl/fogopulse.json` | Generated - updated IDL with all new types |
| `anchor/target/types/fogopulse.ts` | Generated - TypeScript types for client SDK |

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5
**Date:** 2026-03-11
**Outcome:** Changes Requested → Fixed

### Issues Found & Fixed

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | HIGH | Missing checked arithmetic on `end_time` and `freeze_time` calculations in `create_epoch.rs:71-72` | Added `checked_add`/`checked_sub` with `Overflow` error |
| 2 | MEDIUM | TypeScript types file not documented in File List | Added `anchor/target/types/fogopulse.ts` to File List |
| 3 | MEDIUM | Sprint status file modified but not documented | File is auto-tracked, not part of story implementation |
| 4 | MEDIUM | Missing `Default` derive on `EpochState` and `Outcome` enums | Added `#[derive(Default)]` with `#[default]` on `Open` and `Up` |
| 5 | MEDIUM | Magic number `1` for `active_epoch_state` in `create_epoch.rs:92` | Added `EpochState::as_pool_cache_u8()` helper method |

### Verification

- Build completed successfully with no errors
- All HIGH and MEDIUM issues resolved
- Code follows established patterns from Story 1.5

## Change Log

| Date | Change |
|------|--------|
| 2026-03-11 | Implemented Epoch account structure, EpochState/Outcome enums, create_epoch instruction, EpochCreated event |
| 2026-03-11 | Code review: Fixed 5 issues (1 HIGH, 4 MEDIUM) - added checked arithmetic, Default derives, as_pool_cache_u8() helper |
