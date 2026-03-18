# Story 5.4: Implement process_withdrawal Instruction

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a liquidity provider,
I want to complete my withdrawal after cooldown,
so that I receive my USDC.

## Acceptance Criteria

1. **Given** a pending withdrawal that has passed the cooldown period, **When** I call process_withdrawal, **Then** the cooldown period is verified (at least 1 epoch must have settled since request, enforced via time-based 60-second cooldown)
2. **And** USDC value is calculated from shares at current pool value: `usdc_out = (pending_shares * (yes_reserves + no_reserves)) / total_lp_shares`
3. **And** USDC is transferred from pool USDC ATA to user USDC ATA using pool PDA signer seeds
4. **And** LP shares are burned: `pool.total_lp_shares -= pending_shares` and `lp_share.shares -= pending_shares`
5. **And** `lp_share.pending_withdrawal` is reset to 0 and `lp_share.withdrawal_requested_at` is reset to `None`
6. **And** FOGO Sessions signature extraction is used (extract_user pattern)
7. **And** a `WithdrawalProcessed` event is emitted with pool, user, shares_burned, usdc_amount, total_lp_shares_after, yes_reserves_after, no_reserves_after
8. **And** FR36 (receive withdrawal payout after cooldown) is satisfied
9. **And** FR61 (system processes pending LP withdrawals) is satisfied
10. **And** protocol/pool pause and freeze checks are applied (paused: BLOCKED, frozen: BLOCKED)
11. **And** the instruction fails with `NoPendingWithdrawal` if `lp_share.pending_withdrawal == 0`
12. **And** the instruction fails with `CooldownNotElapsed` if cooldown period has not passed
13. **And** reserves are reduced proportionally 50/50 from yes_reserves and no_reserves (inverse of deposit split)
14. **And** u128 intermediate math is used for share-to-USDC calculation to prevent overflow
15. **And** the instruction fails with `WithdrawalTooSmall` if `usdc_out` rounds to 0 (prevents zero-amount transfers clearing pending state)
16. **And** `lp_share.deposited_amount` is proportionally reduced: `deposited_amount -= (pending_shares * deposited_amount) / shares_before_burn`

## Tasks / Subtasks

- [x] Task 1: Add new constants and error variants (AC: #11, #12, #15)
  - [x] 1.1: Add `WITHDRAWAL_COOLDOWN_SECONDS: i64 = 60` constant to `constants.rs`
  - [x] 1.2: Add `NoPendingWithdrawal` error variant to `errors.rs`
  - [x] 1.3: Add `CooldownNotElapsed` error variant to `errors.rs`
  - [x] 1.4: Add `WithdrawalTooSmall` error variant to `errors.rs` (mirrors DepositTooSmall)
- [x] Task 2: Add `WithdrawalProcessed` event to `events.rs` (AC: #7)
  - [x] 2.1: Define event with fields: pool, user, shares_burned, usdc_amount, total_lp_shares_after, yes_reserves_after, no_reserves_after
- [x] Task 3: Create `process_withdrawal.rs` instruction file (AC: #1-#14)
  - [x] 3.1: Define `ProcessWithdrawal` accounts struct following claim_payout pattern (pool is `mut`, needs token accounts)
  - [x] 3.2: Include: signer_or_session, config (Box), pool (Box, mut), lp_share (mut), pool_usdc (Box, mut), user_usdc (Box, mut), usdc_mint, token_program, associated_token_program, system_program
  - [x] 3.3: Implement handler with extract_user validation
  - [x] 3.4: Implement pause/freeze checks (both protocol AND pool)
  - [x] 3.5: Validate pending_withdrawal > 0
  - [x] 3.6: Validate cooldown elapsed via `Clock::get()` timestamp check
  - [x] 3.7: Calculate USDC value using u128 math: `(pending_shares as u128 * pool_value as u128) / total_lp_shares as u128`
  - [x] 3.8: Validate `usdc_out > 0` — reject with `WithdrawalTooSmall` if zero (AC: #15)
  - [x] 3.9: Transfer USDC from pool to user using PDA signer seeds (same pattern as claim_payout)
  - [x] 3.10: Reduce reserves 50/50 (yes_reserves and no_reserves)
  - [x] 3.11: Proportionally reduce `lp_share.deposited_amount` before burning shares (AC: #16)
  - [x] 3.12: Burn shares from pool.total_lp_shares and lp_share.shares
  - [x] 3.13: Reset pending_withdrawal to 0 and withdrawal_requested_at to None
  - [x] 3.14: Emit WithdrawalProcessed event
- [x] Task 4: Register instruction in module system (AC: all)
  - [x] 4.1: Add `pub mod process_withdrawal;` to `instructions/mod.rs`
  - [x] 4.2: Add `pub use process_withdrawal::*;` to `instructions/mod.rs`
  - [x] 4.3: Add `pub mod process_withdrawal;` BEFORE `pub mod request_withdrawal;` (alphabetical: p before r)
  - [x] 4.4: Add `pub use process_withdrawal::*;` BEFORE `pub use request_withdrawal::*;`
  - [x] 4.5: Add `process_withdrawal` function to `lib.rs` in LP INSTRUCTIONS section (after `request_withdrawal`)
- [x] Task 5: Build and verify (AC: all)
  - [x] 5.1: Run `anchor build` — must succeed with no errors
  - [x] 5.2: Verify IDL includes process_withdrawal instruction
  - [x] 5.3: Copy updated IDL to `web/src/lib/fogopulse.json`

## Dev Notes

### Critical Implementation Patterns (from previous stories)

**PDA-Signed Token Transfer Pattern** (from `claim_payout.rs:198-212`):
```rust
let pool = &ctx.accounts.pool;
let pool_seeds = &[b"pool".as_ref(), pool.asset_mint.as_ref(), &[pool.bump]];

token::transfer(
    CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.pool_usdc.to_account_info(),
            to: ctx.accounts.user_usdc.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        },
        &[pool_seeds],
    ),
    usdc_amount,
)?;
```

**Share-to-USDC Calculation** (inverse of deposit_liquidity share calculation):
```rust
// deposit: shares = (amount * total_lp_shares) / pool_value
// withdrawal (inverse): usdc_out = (shares * pool_value) / total_lp_shares
let pool_value = pool.yes_reserves
    .checked_add(pool.no_reserves)
    .ok_or(FogoPulseError::Overflow)?;

let usdc_out = (pending_shares as u128)
    .checked_mul(pool_value as u128)
    .ok_or(FogoPulseError::Overflow)?
    .checked_div(pool.total_lp_shares as u128)
    .ok_or(FogoPulseError::Overflow)? as u64;
```

**Reserve Reduction** (inverse of deposit 50/50 split):
```rust
let half_out = usdc_out / 2;
let yes_reduction = half_out + (usdc_out % 2); // YES loses remainder (matches deposit pattern)
let no_reduction = half_out;

pool.yes_reserves = pool.yes_reserves
    .checked_sub(yes_reduction)
    .ok_or(FogoPulseError::InsufficientPoolReserves)?;
pool.no_reserves = pool.no_reserves
    .checked_sub(no_reduction)
    .ok_or(FogoPulseError::InsufficientPoolReserves)?;
```

**Zero-Amount Withdrawal Guard** (mirrors DepositTooSmall pattern from deposit_liquidity):
```rust
// After calculating usdc_out, before transfer:
require!(usdc_out > 0, FogoPulseError::WithdrawalTooSmall);
```

**Deposited Amount Tracking** (proportional reduction for UI accuracy):
```rust
// Calculate BEFORE burning shares (need shares_before for ratio)
let deposited_reduction = (pending_shares as u128)
    .checked_mul(lp_share.deposited_amount as u128)
    .ok_or(FogoPulseError::Overflow)?
    .checked_div(lp_share.shares as u128)
    .ok_or(FogoPulseError::Overflow)? as u64;

lp_share.deposited_amount = lp_share.deposited_amount
    .checked_sub(deposited_reduction)
    .ok_or(FogoPulseError::Overflow)?;
```

**Cooldown Check**:
```rust
let clock = Clock::get()?;
let requested_at = lp_share.withdrawal_requested_at
    .ok_or(FogoPulseError::NoPendingWithdrawal)?;
require!(
    clock.unix_timestamp >= requested_at + WITHDRAWAL_COOLDOWN_SECONDS,
    FogoPulseError::CooldownNotElapsed
);
```

**FOGO Sessions Pattern** (consistent across all user-facing instructions):
```rust
let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;
require!(user == extracted_user, FogoPulseError::Unauthorized);
```

### Handler Signature

The `process_withdrawal` handler takes only `user: Pubkey` — no shares_amount parameter needed since shares are already stored in `lp_share.pending_withdrawal` from the request step:
```rust
pub fn handler(ctx: Context<ProcessWithdrawal>, user: Pubkey) -> Result<()>
```

The `lib.rs` registration follows the same pattern as `claim_payout`:
```rust
/// Process a pending LP withdrawal after cooldown
///
/// Supports FOGO Sessions for gasless withdrawal processing.
/// Calculates USDC value from shares at current pool value,
/// transfers USDC to user, and burns the LP shares.
pub fn process_withdrawal(ctx: Context<ProcessWithdrawal>, user: Pubkey) -> Result<()> {
    instructions::process_withdrawal::handler(ctx, user)
}
```

### Architecture Compliance

- **Box<> for large accounts**: GlobalConfig and Pool MUST use `Box<Account<>>` to prevent stack overflow (established pattern in all instructions)
- **Clock::get()**: Use modern `Clock::get()?` instead of Clock sysvar account (established in story 5.3)
- **checked_* arithmetic**: ALL math operations MUST use checked_add/checked_sub/checked_mul/checked_div with Overflow error
- **u128 intermediate**: Share-to-USDC calculation MUST use u128 to prevent overflow (established in deposit_liquidity)
- **Pool PDA seeds**: `[b"pool", pool.asset_mint.as_ref(), &[pool.bump]]` (from claim_payout.rs)
- **LpShare PDA seeds**: `[b"lp_share", user.as_ref(), pool.key().as_ref()]` (from request_withdrawal.rs)
- **No init_if_needed**: LpShare must already exist (user must have deposited first) — use bump constraint like request_withdrawal
- **Pause vs Freeze behavior**: Both pause AND freeze BLOCK process_withdrawal (unlike claim_payout which allows paused claims — withdrawals are different because they modify pool reserves)
- **Event naming**: Use `WithdrawalProcessed` (pairs with existing `WithdrawalRequested`). Architecture.md listed `LPWithdrawn` but actual codebase uses descriptive names (`LiquidityDeposited`, `WithdrawalRequested`) — follow codebase convention

### Library/Framework Requirements

- **anchor-lang**: `use anchor_lang::prelude::*;`
- **anchor-spl**: `use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};` and `use anchor_spl::associated_token::AssociatedToken;`
- **Constants**: `use crate::constants::{USDC_MINT, WITHDRAWAL_COOLDOWN_SECONDS};`
- **State imports**: `use crate::state::{GlobalConfig, LpShare, Pool};`
- **Error imports**: `use crate::errors::FogoPulseError;`
- **Event imports**: `use crate::events::WithdrawalProcessed;`
- **Session imports**: `use crate::session::extract_user;`

### File Structure Requirements

Files to CREATE:
- `anchor/programs/fogopulse/src/instructions/process_withdrawal.rs`

Files to MODIFY:
- `anchor/programs/fogopulse/src/constants.rs` — add WITHDRAWAL_COOLDOWN_SECONDS
- `anchor/programs/fogopulse/src/errors.rs` — add NoPendingWithdrawal, CooldownNotElapsed
- `anchor/programs/fogopulse/src/events.rs` — add WithdrawalProcessed event
- `anchor/programs/fogopulse/src/instructions/mod.rs` — add module + re-export
- `anchor/programs/fogopulse/src/lib.rs` — add process_withdrawal instruction function
- `web/src/lib/fogopulse.json` — updated IDL after build

### Testing Requirements

- `anchor build` must succeed with no errors or warnings
- IDL must include `process_withdrawal` instruction with correct accounts and args
- No stack overflow warnings during build

### Project Structure Notes

- All instruction files live in `anchor/programs/fogopulse/src/instructions/`
- Module registration follows alphabetical order in `mod.rs`: `process_withdrawal` inserts BEFORE `request_withdrawal` (p < r)
- The `lib.rs` instruction function goes in the LP INSTRUCTIONS section (after `request_withdrawal`)
- IDL output at `anchor/target/idl/fogopulse.json` must be copied to `web/src/lib/fogopulse.json`

### Previous Story Intelligence

**Story 5.3 (request_withdrawal) learnings:**
- Build succeeded on first attempt — follow same patterns
- `Clock::get()` pattern works (no Clock sysvar account needed)
- Reusing existing error variants (InsufficientShares, ZeroShares) from sell_position works well
- WithdrawalAlreadyPending error was added — now we need NoPendingWithdrawal (inverse)
- No epoch state constraint needed for LP operations

**Story 5.2 (deposit_liquidity) learnings:**
- u128 intermediate math pattern works correctly for share calculations
- `init_if_needed` used for deposit (first deposit creates account)
- 50/50 reserve split with YES getting remainder for odd amounts
- `DepositTooSmall` error catches dust deposits rounding to zero shares

**Story 5.1 (LpShare) learnings:**
- LpShare is 106 bytes (98 data + 8 discriminator)
- PDA seeds: `["lp_share", user.key(), pool.key()]`
- All fields have doc comments

### Git Intelligence

Recent commits show consistent patterns:
- Commit message format: `feat: Implement <instruction_name> instruction (Story X.Y)`
- IDL rebuild is sometimes a separate commit if needed
- All stories 5.1-5.3 built successfully on first attempt

### Cooldown Design Decision

The PRD specifies "after epoch settlement + 60s cooldown" (PRD line ~126, ~212). The epics say "1 epoch must have settled". For MVP simplicity, implement a **time-based 60-second cooldown** using `withdrawal_requested_at` timestamp comparison. This is simpler than tracking settled epoch counts and achieves the same user protection goal. The constant `WITHDRAWAL_COOLDOWN_SECONDS = 60` can be easily adjusted later or made configurable via GlobalConfig in Epic 6.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4] — Acceptance criteria and BDD
- [Source: _bmad-output/planning-artifacts/prd.md#FR36] — Receive withdrawal payout after settlement + cooldown
- [Source: _bmad-output/planning-artifacts/prd.md#FR61] — System processes pending LP withdrawals
- [Source: _bmad-output/planning-artifacts/prd.md#Derek Journey] — "Withdrawal pending - will process after current epoch settles + 60s cooldown"
- [Source: anchor/programs/fogopulse/src/instructions/claim_payout.rs] — PDA-signed token transfer pattern
- [Source: anchor/programs/fogopulse/src/instructions/deposit_liquidity.rs] — Share calculation, reserve split, u128 math
- [Source: anchor/programs/fogopulse/src/instructions/request_withdrawal.rs] — Two-step withdrawal flow, LpShare constraints
- [Source: anchor/programs/fogopulse/src/state/lp.rs] — LpShare account structure
- [Source: anchor/programs/fogopulse/src/state/pool.rs] — Pool reserves and total_lp_shares

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- First `anchor build` failed with E0502 borrow checker error: cannot borrow `*ctx.accounts.pool` as immutable (for `to_account_info()` in token transfer) while also borrowed as mutable. Fixed by reading immutable values first, performing token transfer with immutable borrow, then taking mutable borrow for state updates.

### Completion Notes List

- Implemented `process_withdrawal` instruction completing the two-step LP withdrawal flow (request_withdrawal -> process_withdrawal)
- Added WITHDRAWAL_COOLDOWN_SECONDS (60s) constant, 3 new error variants (NoPendingWithdrawal, CooldownNotElapsed, WithdrawalTooSmall), and WithdrawalProcessed event
- Handler validates: extract_user session auth, protocol+pool pause/freeze checks, pending withdrawal exists, cooldown elapsed, usdc_out > 0
- USDC calculation uses u128 intermediate math to prevent overflow
- PDA-signed token transfer follows claim_payout pattern
- Reserves reduced 50/50 (YES gets remainder on odd amounts, matching deposit pattern)
- deposited_amount proportionally reduced before share burn for UI tracking accuracy
- All acceptance criteria satisfied; `anchor build` succeeded; IDL verified and copied to web

### File List

- `anchor/programs/fogopulse/src/constants.rs` (modified) — added WITHDRAWAL_COOLDOWN_SECONDS constant
- `anchor/programs/fogopulse/src/errors.rs` (modified) — added NoPendingWithdrawal, CooldownNotElapsed, WithdrawalTooSmall error variants
- `anchor/programs/fogopulse/src/events.rs` (modified) — added WithdrawalProcessed event
- `anchor/programs/fogopulse/src/instructions/process_withdrawal.rs` (created) — process_withdrawal instruction with ProcessWithdrawal accounts struct and handler
- `anchor/programs/fogopulse/src/instructions/mod.rs` (modified) — added process_withdrawal module and re-export
- `anchor/programs/fogopulse/src/lib.rs` (modified) — added process_withdrawal function in LP INSTRUCTIONS section
- `anchor/target/idl/fogopulse.json` (modified) — rebuilt IDL with process_withdrawal instruction
- `web/src/lib/fogopulse.json` (modified) — copied updated IDL
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — story status updated

### Change Log

- 2026-03-18: Implemented process_withdrawal instruction (Story 5.4) — completes two-step LP withdrawal flow with cooldown verification, u128 share-to-USDC math, PDA-signed token transfer, 50/50 reserve reduction, and deposited_amount tracking
- 2026-03-18: Code review fixes applied — (H1) added `total_lp_shares > 0` guard before USDC division to prevent div-by-zero, (H2) moved frozen checks to Anchor account constraints for fail-fast pattern matching claim_payout, (M1) added `shares_before > 0` guard before deposited_amount reduction division. Rebuilt IDL and copied to web.
