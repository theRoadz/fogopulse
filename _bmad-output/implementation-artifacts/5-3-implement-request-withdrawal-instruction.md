# Story 5.3: Implement request_withdrawal Instruction

Status: done
Created: 2026-03-18

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

**Epic:** 5 — Liquidity Provision
**Depends on:** Story 5.1 (LpShare account structure), Story 5.2 (deposit_liquidity instruction)
**Blocks:** Story 5.4 (process_withdrawal instruction), Story 5.7 (withdrawal UI)

## Story

As a liquidity provider,
I want to request a withdrawal of my LP shares,
so that I can begin the process of removing my liquidity from the pool.

## Acceptance Criteria

1. **Given** an LpShare account with `shares > 0`, **When** I call `request_withdrawal` with a valid `shares_amount`, **Then** `lp_share.pending_withdrawal` is set to the requested amount.
2. **Given** a valid withdrawal request, **When** the instruction succeeds, **Then** `lp_share.withdrawal_requested_at` is set to the current Clock timestamp.
3. **Given** a pending withdrawal request, **When** the instruction executes, **Then** the shares remain in the pool (NOT immediately withdrawn — no reserve changes, no token transfers).
4. **Given** a user with a FOGO Session, **When** they call `request_withdrawal`, **Then** the user pubkey is extracted via `session::extract_user()` and validated against the `user` instruction argument.
5. **Given** a successful withdrawal request, **When** the instruction completes, **Then** a `WithdrawalRequested` event is emitted with pool, user, shares_amount, and total shares.
6. **Given** an LpShare with `pending_withdrawal > 0` (existing pending request), **When** I call `request_withdrawal`, **Then** the instruction fails with `WithdrawalAlreadyPending` error.
7. **Given** a `shares_amount` greater than `lp_share.shares`, **When** I call `request_withdrawal`, **Then** the instruction fails with `InsufficientShares` error.
8. **Given** a `shares_amount` of 0, **When** I call `request_withdrawal`, **Then** the instruction fails with `ZeroShares` error.
9. **Given** protocol `paused` or `frozen` is true, **When** I call `request_withdrawal`, **Then** the instruction fails with `ProtocolPaused` / `ProtocolFrozen` error.
10. **Given** pool `is_paused` or `is_frozen` is true, **When** I call `request_withdrawal`, **Then** the instruction fails with `PoolPaused` / `PoolFrozen` error.
11. **Given** the instruction compiles, **When** `anchor build` is run, **Then** the build completes without errors and the IDL is updated.
12. FR33 (request withdrawal at any time) is satisfied.

## Tasks / Subtasks

- [x] Task 1: Add new error variants to `errors.rs` (AC: #6)
  - [x] 1.1: Add `WithdrawalAlreadyPending` error variant with message "A withdrawal request is already pending"
- [x] Task 2: Add `WithdrawalRequested` event to `events.rs` (AC: #5)
  - [x] 2.1: Define event struct with fields: pool, user, shares_amount, total_shares, timestamp
- [x] Task 3: Create `request_withdrawal.rs` instruction file (AC: #1-#10)
  - [x] 3.1: Define `RequestWithdrawal` accounts struct following `deposit_liquidity.rs` pattern
  - [x] 3.2: Implement handler with session extraction, pause/freeze checks, share validation, pending withdrawal check
  - [x] 3.3: Set `pending_withdrawal` and `withdrawal_requested_at` fields on LpShare
  - [x] 3.4: Emit `WithdrawalRequested` event
- [x] Task 4: Register instruction in `instructions/mod.rs` (AC: #11)
  - [x] 4.1: Add `pub mod request_withdrawal;` and `pub use request_withdrawal::*;`
- [x] Task 5: Register instruction in `lib.rs` (AC: #11)
  - [x] 5.1: Add `request_withdrawal` function under LP INSTRUCTIONS section
- [x] Task 6: Build and verify (AC: #11)
  - [x] 6.1: Run `anchor build` — must compile without errors or stack overflow warnings
  - [x] 6.2: Copy updated IDL to `web/src/lib/fogopulse.json`

## Dev Notes

### Instruction Design — This is a READ-ONLY state change (no token transfers)

Unlike `deposit_liquidity`, this instruction does NOT transfer tokens or modify pool reserves. It only updates the `LpShare` account to mark shares as pending withdrawal. The actual USDC transfer happens in Story 5.4 (`process_withdrawal`).

**What this instruction does:**
1. Validates user identity (FOGO Sessions)
2. Checks protocol/pool not paused/frozen
3. Validates share amount (> 0, <= available shares, no existing pending request)
4. Sets `lp_share.pending_withdrawal = shares_amount`
5. Sets `lp_share.withdrawal_requested_at = Some(clock.unix_timestamp)`
6. Emits `WithdrawalRequested` event

**What this instruction does NOT do:**
- No token transfers (no SPL token CPI)
- No reserve changes (yes_reserves, no_reserves unchanged)
- No pool.total_lp_shares changes
- No USDC mint/token program accounts needed

### Accounts Structure

Follow the `deposit_liquidity.rs` pattern but simplified — no token accounts needed:

```rust
#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct RequestWithdrawal<'info> {
    /// User OR session account
    #[account(mut)]
    pub signer_or_session: Signer<'info>,

    /// Global protocol config (pause/freeze checks)
    #[account(
        seeds = [b"global_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, GlobalConfig>>,

    /// The pool this LP position belongs to
    #[account(
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// LP share account — must exist (already deposited)
    /// NOT init_if_needed — user MUST have deposited first
    #[account(
        mut,
        seeds = [b"lp_share", user.as_ref(), pool.key().as_ref()],
        bump = lp_share.bump,
    )]
    pub lp_share: Account<'info, LpShare>,
}
```

**Key differences from deposit_liquidity:**
- `pool` is NOT `mut` — no pool state changes (reserves/shares unchanged)
- No `pool_usdc`, `user_usdc`, `usdc_mint`, `token_program`, `associated_token_program`, `system_program` accounts
- `lp_share` uses existing account validation (no `init_if_needed`) — user must have deposited first
- Needs `Clock` sysvar for `withdrawal_requested_at` timestamp — but can use `Clock::get()` instead of account

### Handler Logic

```rust
pub fn handler(ctx: Context<RequestWithdrawal>, user: Pubkey, shares_amount: u64) -> Result<()> {
    // 1. Extract and validate user (FOGO Sessions pattern)
    let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;
    require!(user == extracted_user, FogoPulseError::Unauthorized);

    let config = &ctx.accounts.config;
    let pool = &ctx.accounts.pool;
    let lp_share = &mut ctx.accounts.lp_share;

    // 2. Protocol pause/freeze checks
    require!(!config.paused, FogoPulseError::ProtocolPaused);
    require!(!config.frozen, FogoPulseError::ProtocolFrozen);
    require!(!pool.is_paused, FogoPulseError::PoolPaused);
    require!(!pool.is_frozen, FogoPulseError::PoolFrozen);

    // 3. Validate shares_amount
    require!(shares_amount > 0, FogoPulseError::ZeroShares);
    require!(shares_amount <= lp_share.shares, FogoPulseError::InsufficientShares);

    // 4. Check no existing pending withdrawal
    require!(lp_share.pending_withdrawal == 0, FogoPulseError::WithdrawalAlreadyPending);

    // 5. Set pending withdrawal state
    let clock = Clock::get()?;
    lp_share.pending_withdrawal = shares_amount;
    lp_share.withdrawal_requested_at = Some(clock.unix_timestamp);

    // 6. Emit event
    emit!(WithdrawalRequested { ... });

    Ok(())
}
```

### FOGO Sessions Pattern

Follows exact same pattern as `deposit_liquidity.rs` and `buy_position.rs`:
- `user` passed as instruction argument
- `extract_user(&ctx.accounts.signer_or_session)` validates session
- `require!(user == extracted_user)` ensures match
- No SPL token transfer in this instruction, so no signer authority concern

### Error Variants to Add

In `errors.rs`, add under the `// LP errors` section:
```rust
#[msg("A withdrawal request is already pending")]
WithdrawalAlreadyPending,
```

Note: `InsufficientShares` and `ZeroShares` already exist in errors.rs (from sell_position). Reuse them.

### Event Definition

In `events.rs`, add:
```rust
#[event]
pub struct WithdrawalRequested {
    /// Pool account pubkey
    pub pool: Pubkey,
    /// User who requested withdrawal
    pub user: Pubkey,
    /// Number of LP shares requested for withdrawal
    pub shares_amount: u64,
    /// Total LP shares user holds (including pending)
    pub total_shares: u64,
    /// Unix timestamp of the request
    pub timestamp: i64,
}
```

### Clock Access

Use `Clock::get()` (no additional account needed) instead of passing Clock as an account. This is the modern Anchor pattern and saves an account in the instruction.

### Withdrawal Lifecycle Context (for dev understanding)

This instruction is Step 1 of a 2-step withdrawal process:

1. **request_withdrawal** (THIS STORY): Marks shares as pending, records timestamp
2. **process_withdrawal** (Story 5.4): After cooldown (epoch settlement + 60s), actually transfers USDC and burns shares

The two-step design prevents:
- Sandwich attacks on withdrawal pricing
- LP exits during active trading that would destabilize pools
- Ensures pool state is finalized before calculating withdrawal USDC value

### Pause/Freeze Behavior

Same hierarchy as all other instructions:
- `config.paused` → block (protocol-level)
- `config.frozen` → block (emergency)
- `pool.is_paused` → block (pool-level)
- `pool.is_frozen` → block (pool-level emergency)

### Epoch State Constraint

Per PRD FR33: "LP can request withdrawal at any time." There is NO epoch state constraint on this instruction. Withdrawal can be requested regardless of whether an epoch is Open, Frozen, Settling, Settled, or even if no active epoch exists. The epoch constraint only applies to `process_withdrawal` (Story 5.4).

### Stack Overflow Prevention

This instruction has only 4 accounts (compared to deposit_liquidity's 10), so stack overflow is unlikely. However, still use `Box<>` for `GlobalConfig` and `Pool` to follow established patterns and prevent issues if account sizes grow.

### Project Structure Notes

- **New file:** `anchor/programs/fogopulse/src/instructions/request_withdrawal.rs`
- **Modified files:**
  - `anchor/programs/fogopulse/src/instructions/mod.rs` — add module
  - `anchor/programs/fogopulse/src/lib.rs` — add instruction entry point
  - `anchor/programs/fogopulse/src/errors.rs` — add `WithdrawalAlreadyPending`
  - `anchor/programs/fogopulse/src/events.rs` — add `WithdrawalRequested`
  - `web/src/lib/fogopulse.json` — updated IDL
- Follows alphabetical ordering convention in mod.rs (request_withdrawal after initialize, before sell_position)
- Follows LP INSTRUCTIONS section grouping in lib.rs

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5, Story 5.3] — Acceptance criteria and user story
- [Source: _bmad-output/planning-artifacts/architecture.md#LpShare Account] — Account structure, PDA seeds, withdrawal mechanics
- [Source: _bmad-output/planning-artifacts/architecture.md#Withdrawal Mechanics] — Two-step withdrawal flow design
- [Source: _bmad-output/planning-artifacts/prd.md#FR33] — "LP can request withdrawal at any time"
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey 5] — Withdrawal UX flow
- [Source: _bmad-output/implementation-artifacts/5-2-implement-deposit-liquidity-instruction.md] — Pattern reference for session extraction, pause/freeze checks, LpShare access
- [Source: _bmad-output/implementation-artifacts/5-1-implement-lpshare-account-structure.md] — LpShare field definitions and PDA seeds
- [Source: anchor/programs/fogopulse/src/instructions/deposit_liquidity.rs] — Primary code pattern reference
- [Source: anchor/programs/fogopulse/src/errors.rs] — Existing error variants (InsufficientShares, ZeroShares reusable)
- [Source: anchor/programs/fogopulse/src/events.rs] — Event naming convention (past tense)

### Previous Story Intelligence (from Story 5.2)

**Patterns to follow:**
- Session extraction: `extract_user()` + `require!(user == extracted_user)`
- Pause/freeze: Check all 4 flags (config.paused, config.frozen, pool.is_paused, pool.is_frozen)
- Use `Box<>` for GlobalConfig and Pool accounts
- LpShare PDA seeds: `[b"lp_share", user.as_ref(), pool.key().as_ref()]`
- Use `lp_share.bump` for existing account validation (not `init_if_needed`)

**Learnings from Story 5.2:**
- Deposit allows deposits even with `pending_withdrawal > 0` — important: withdrawal request should NOT block future deposits
- LpShare.shares tracks total shares, pending_withdrawal is a subset earmark (not subtracted from shares)
- The `user` field in instruction arguments must be the wallet pubkey, not session account
- No epoch state constraint on LP operations per FR33

### Git Intelligence

Recent commits show Stories 5.1 and 5.2 were just completed:
- `3dfb693` chore: Rebuild IDL with DepositTooSmall error variant
- `d510fbf` feat: Implement deposit_liquidity instruction (Story 5.2)
- `c246267` feat: Implement LpShare account structure (Story 5.1)

The codebase is in a clean state with all LP foundation work complete. No conflicts expected.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Build succeeded on first attempt — no errors, no stack overflow warnings
- Only pre-existing cfg/deprecated warnings from Anchor framework macros

### Completion Notes List

- Implemented `request_withdrawal` instruction as a read-only state change (no token transfers)
- Added `WithdrawalAlreadyPending` error variant to `errors.rs` under LP errors section
- Added `WithdrawalRequested` event to `events.rs` with pool, user, shares_amount, total_shares, timestamp fields
- Created `request_withdrawal.rs` with simplified accounts struct (4 accounts vs deposit_liquidity's 10 — no token accounts needed)
- Handler validates: session extraction, protocol/pool pause/freeze, shares_amount > 0, shares_amount <= lp_share.shares, no existing pending withdrawal
- Sets `pending_withdrawal` and `withdrawal_requested_at` on LpShare, emits `WithdrawalRequested` event
- Uses `Clock::get()` instead of Clock account (modern Anchor pattern)
- Uses `Box<>` for GlobalConfig and Pool following established patterns
- Pool is NOT mut (no pool state changes — reserves/shares unchanged)
- Registered in mod.rs (alphabetical order) and lib.rs (LP INSTRUCTIONS section)
- IDL rebuilt and copied to web/src/lib/fogopulse.json

### File List

- `anchor/programs/fogopulse/src/instructions/request_withdrawal.rs` — NEW: request_withdrawal instruction
- `anchor/programs/fogopulse/src/errors.rs` — MODIFIED: added WithdrawalAlreadyPending error variant
- `anchor/programs/fogopulse/src/events.rs` — MODIFIED: added WithdrawalRequested event struct
- `anchor/programs/fogopulse/src/instructions/mod.rs` — MODIFIED: added request_withdrawal module and re-export
- `anchor/programs/fogopulse/src/lib.rs` — MODIFIED: added request_withdrawal instruction entry point
- `web/src/lib/fogopulse.json` — MODIFIED: updated IDL copy (source of truth for frontend)

### Change Log

- 2026-03-18: Implemented request_withdrawal instruction (Story 5.3) — read-only LP share state change for two-step withdrawal flow
- 2026-03-18: Code review PASSED — removed phantom `anchor/target/idl/fogopulse.json` from File List (build artifact not tracked in git). All 12 ACs verified implemented. No security or correctness issues found.
