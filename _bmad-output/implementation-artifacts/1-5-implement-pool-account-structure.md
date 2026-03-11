# Story 1.5: Implement Pool Account Structure

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the Pool account structure implemented,
So that per-asset liquidity pools can be created and managed.

## Acceptance Criteria

1. **Pool Account Structure**: The Pool struct includes all required fields:
   - `yes_reserves: u64` - YES token reserves
   - `no_reserves: u64` - NO token reserves
   - `total_lp_shares: u64` - Total LP shares issued
   - `asset_mint: Pubkey` - Asset this pool tracks (e.g., BTC mint)
   - `wallet_cap_bps: u16` - Max position per wallet (copied from GlobalConfig)
   - `side_cap_bps: u16` - Max exposure per side (copied from GlobalConfig)
   - `next_epoch_id: u64` - Counter for next epoch creation (starts at 0)
   - `active_epoch: Option<Pubkey>` - Current active epoch PDA, or None
   - `active_epoch_state: u8` - Cached state: 0=None, 1=Open, 2=Frozen
   - `is_paused: bool` - Pool-level pause flag
   - `is_frozen: bool` - Pool-level freeze flag
   - `bump: u8` - PDA bump seed

2. **PDA Derivation**: PDA derivation uses seeds `[b"pool", asset_mint.as_ref()]`

3. **create_pool Instruction**:
   - Requires admin signature (verified against GlobalConfig.admin)
   - Accepts asset_mint as parameter
   - Copies wallet_cap_bps and side_cap_bps from GlobalConfig at creation time
   - Initializes reserves to 0, total_lp_shares to 0
   - Sets next_epoch_id to 0
   - Sets active_epoch to None and active_epoch_state to 0
   - Sets is_paused and is_frozen to false

4. **Event Emission**: Emits a `PoolCreated` event with pool pubkey, asset_mint, and copied cap values

5. **Stack Overflow Prevention**: Use `Box<>` for GlobalConfig account to prevent stack overflow (per project-context.md guidance)

## Tasks / Subtasks

- [x] Task 1: Create Pool account structure (AC: #1)
  - [x] Create `anchor/programs/fogopulse/src/state/pool.rs`
  - [x] Define Pool struct with all required fields
  - [x] Use `#[account]` and `#[derive(InitSpace)]` attributes
  - [x] Export from `state/mod.rs`

- [x] Task 2: Add PoolCreated event (AC: #4)
  - [x] Add `PoolCreated` event struct to `events.rs`
  - [x] Include pool, asset_mint, wallet_cap_bps, side_cap_bps fields

- [x] Task 3: Add pool-related errors (AC: #3)
  - [x] Add `PoolAlreadyExists` error to `errors.rs`
  - [x] Add any other pool-specific errors needed

- [x] Task 4: Implement create_pool instruction (AC: #2, #3, #5)
  - [x] Create `anchor/programs/fogopulse/src/instructions/create_pool.rs`
  - [x] Define CreatePool accounts struct with PDA seeds
  - [x] Use `Box<Account<'info, GlobalConfig>>` to prevent stack overflow
  - [x] Implement handler function with admin verification
  - [x] Copy caps from GlobalConfig to Pool
  - [x] Emit PoolCreated event

- [x] Task 5: Wire up instruction in lib.rs (AC: #3)
  - [x] Add create_pool function to program module
  - [x] Export from instructions/mod.rs

- [x] Task 6: Build and verify (AC: #1-5)
  - [x] Run `anchor build` in WSL
  - [x] Verify no stack overflow warnings
  - [x] Check account size is calculated correctly

## Dev Notes

### Architecture Patterns & Constraints

**From Architecture Document:**
- Pool is a per-asset account storing reserves, LP tracking, and active epoch state
- One pool per tradable asset (BTC, ETH, SOL, FOGO)
- The `active_epoch` and `active_epoch_state` fields allow single-fetch status checks
- `next_epoch_id` provides atomic epoch ID generation

**Pause/Freeze Hierarchy:**
Before any trade, check:
```rust
if global_config.paused || global_config.frozen || pool.is_paused || pool.is_frozen {
    return Err(TradingPaused);
}
```

**Pool Token Account (USDC):**
- Use Associated Token Account (ATA) with Pool PDA as owner
- NOT a custom PDA - use `associated_token::authority = pool`
- `allowOwnerOffCurve = true` required in TypeScript for PDA owners
- Note: USDC token account creation is NOT part of this story - it will be done in Story 1.11 when initializing test pools

### Code Patterns from Previous Stories

**From Story 1.4 (GlobalConfig):**
- Use `#[derive(InitSpace)]` for automatic space calculation
- PDA pattern with `seeds` and `bump` in account constraint
- Admin verification: signer must match config.admin
- Emit events after successful state changes
- Input validation with `require!` macro

**Event Naming Convention:**
- PascalCase, past tense: `PoolCreated`, not `CreatePool`

**Error Naming Convention:**
- PascalCase descriptive: `PoolAlreadyExists`, `Unauthorized`

### Pool Account Size Calculation

Estimated size (with 8-byte discriminator):
- asset_mint: 32 bytes
- yes_reserves: 8 bytes
- no_reserves: 8 bytes
- total_lp_shares: 8 bytes
- next_epoch_id: 8 bytes
- active_epoch: 33 bytes (Option<Pubkey> = 1 + 32)
- active_epoch_state: 1 byte
- wallet_cap_bps: 2 bytes
- side_cap_bps: 2 bytes
- is_paused: 1 byte
- is_frozen: 1 byte
- bump: 1 byte
- **Total: ~105 bytes + 8 discriminator = ~113 bytes**

Use `#[derive(InitSpace)]` to auto-calculate - don't hardcode.

### Stack Overflow Prevention

Instructions with many accounts can exceed Solana's 4096 byte stack frame limit. The create_pool instruction has GlobalConfig as a large account.

**Solution:** Wrap with `Box<>`:
```rust
pub global_config: Box<Account<'info, GlobalConfig>>,
```

### Project Structure Notes

Files to create/modify:
- `anchor/programs/fogopulse/src/state/pool.rs` (new)
- `anchor/programs/fogopulse/src/state/mod.rs` (add export)
- `anchor/programs/fogopulse/src/instructions/create_pool.rs` (new)
- `anchor/programs/fogopulse/src/instructions/mod.rs` (add export)
- `anchor/programs/fogopulse/src/events.rs` (add PoolCreated)
- `anchor/programs/fogopulse/src/errors.rs` (add pool errors)
- `anchor/programs/fogopulse/src/lib.rs` (add instruction)

### Testing Notes

Basic test scenarios for this story:
1. Admin can create a pool for a new asset mint
2. Non-admin cannot create a pool (Unauthorized error)
3. Cannot create duplicate pool for same asset (PoolAlreadyExists error)
4. Pool inherits cap values from GlobalConfig correctly
5. Pool initializes with correct default values (reserves=0, active_epoch=None, etc.)

Testing happens against FOGO testnet - no local devnet available.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md - Pool Account (Per Asset) section]
- [Source: _bmad-output/planning-artifacts/prd.md - Pool struct definition]
- [Source: _bmad-output/planning-artifacts/epics.md - Story 1.5 requirements]
- [Source: _bmad-output/project-context.md - Stack Overflow Prevention, Box<> usage]
- [Source: anchor/programs/fogopulse/src/state/config.rs - GlobalConfig patterns]
- [Source: anchor/programs/fogopulse/src/instructions/initialize.rs - Instruction patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

No debug issues encountered.

### Completion Notes List

- Created Pool account structure with all 12 required fields as specified in AC #1
- PDA derivation implemented with seeds `[b"pool", asset_mint.as_ref()]` (AC #2)
- create_pool instruction verifies admin signature against GlobalConfig.admin via Anchor constraint
- Caps (wallet_cap_bps, side_cap_bps) copied from GlobalConfig at pool creation time
- All default values set correctly: reserves=0, total_lp_shares=0, next_epoch_id=0, active_epoch=None, active_epoch_state=0, is_paused=false, is_frozen=false
- PoolCreated event emits pool, asset_mint, wallet_cap_bps, side_cap_bps (AC #4)
- Box<Account<'info, GlobalConfig>> used to prevent stack overflow (AC #5)
- Build completed successfully with no stack overflow warnings
- IDL generated correctly with create_pool instruction, Pool type, PoolCreated event, and PoolAlreadyExists error

### File List

- `anchor/programs/fogopulse/src/state/pool.rs` (new)
- `anchor/programs/fogopulse/src/state/mod.rs` (modified)
- `anchor/programs/fogopulse/src/instructions/create_pool.rs` (new)
- `anchor/programs/fogopulse/src/instructions/mod.rs` (modified)
- `anchor/programs/fogopulse/src/events.rs` (modified)
- `anchor/programs/fogopulse/src/errors.rs` (modified)
- `anchor/programs/fogopulse/src/lib.rs` (modified)
- `anchor/target/idl/fogopulse.json` (regenerated)

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5 (Code Review Agent)
**Date:** 2026-03-11
**Outcome:** APPROVED with fixes applied

### Review Summary

All 5 Acceptance Criteria verified as implemented. Code review identified 4 MEDIUM and 2 LOW issues.

### Issues Found & Fixed

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| M1 | MEDIUM | `PoolAlreadyExists` error defined but unused | Replaced with `ProtocolPaused` and `ProtocolFrozen` errors |
| M2 | MEDIUM | UncheckedAccount comment insufficient | Enhanced with explicit security rationale |
| M3 | MEDIUM | No pause/freeze check in create_pool | Added `require!` checks for frozen and paused states |
| M4 | MEDIUM | Missing ProtocolPaused/ProtocolFrozen errors | Added to errors.rs |
| L1 | LOW | Field ordering in Pool struct | Verified OK - large fields already first |
| L2 | LOW | No test file | Acceptable per story notes (tests on FOGO testnet) |

### Files Modified During Review

- `anchor/programs/fogopulse/src/errors.rs` - Replaced PoolAlreadyExists with ProtocolPaused/ProtocolFrozen
- `anchor/programs/fogopulse/src/instructions/create_pool.rs` - Enhanced CHECK comment, added pause/freeze validation

### Verification

- `anchor build` completed successfully
- No stack overflow warnings
- IDL regenerated with updated errors

## Change Log

- 2026-03-11: Code review fixes - added pause/freeze validation, replaced unused error, enhanced comments
- 2026-03-11: Implemented Pool account structure and create_pool instruction (Story 1.5)

