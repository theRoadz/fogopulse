# Story 5.2: Implement deposit_liquidity Instruction

Status: done
Created: 2026-03-18
Epic: 5 - Liquidity Provision
Sprint: Current

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Overview

This story implements the `deposit_liquidity` on-chain instruction, enabling liquidity providers to deposit USDC into a pool and receive proportional LP shares. This is the first LP instruction using the LpShare account structure created in Story 5.1.

**FRs Covered:** FR31 (deposit USDC into pool), partial FR60 (fee distribution — LP auto-compounding foundation)
**Dependencies:** Story 5.1 complete (LpShare account exists), Pool accounts with `total_lp_shares` field, GlobalConfig with fee params

## Story

As a liquidity provider,
I want to deposit USDC into a pool,
so that I can earn trading fees.

## Acceptance Criteria

1. **Given** a pool and a user with USDC, **When** I call `deposit_liquidity` with an amount, **Then** USDC is transferred from the user's token account to the pool's USDC ATA
2. **Given** a deposit into a pool, **When** the deposit is processed, **Then** the amount is automatically split 50/50 between `yes_reserves` and `no_reserves` (YES gets remainder for odd amounts, matching `admin_seed_liquidity` pattern)
3. **Given** a first-ever deposit to an empty pool (total_lp_shares == 0), **When** LP shares are calculated, **Then** `shares_minted = deposit_amount` (1:1 initial ratio)
4. **Given** a subsequent deposit to a pool with existing LP shares, **When** LP shares are calculated, **Then** `shares_minted = (deposit_amount * total_lp_shares) / (yes_reserves + no_reserves)` (proportional to pool value)
5. **Given** a deposit, **When** the LpShare account does not exist for this user+pool, **Then** a new LpShare PDA is initialized with seeds `["lp_share", user, pool]`
6. **Given** a deposit, **When** the LpShare account already exists, **Then** shares and deposited_amount are incremented (not overwritten)
7. **Given** a deposit, **When** pool state is updated, **Then** `pool.total_lp_shares` is incremented by `shares_minted`
8. **Given** any deposit, **When** FOGO Sessions are used, **Then** the user pubkey is extracted via `extract_user()` and validated against the `user` instruction argument
9. **Given** a successful deposit, **When** the transaction completes, **Then** a `LiquidityDeposited` event is emitted with pool, user, amount, shares_minted, and total_lp_shares_after
10. **Given** protocol or pool is paused/frozen, **When** deposit is attempted, **Then** the instruction fails with appropriate error
11. **Given** a deposit amount of zero or below minimum, **When** deposit is attempted, **Then** the instruction fails with `ZeroAmount` or `BelowMinimumTrade`
12. **Given** a successful build, **When** `anchor build` runs, **Then** it completes without errors or stack overflow warnings
13. **Given** the new instruction, **When** the IDL is generated, **Then** the updated IDL is copied to `web/src/lib/fogopulse.json`

## Tasks / Subtasks

- [x] Task 1: Add `LiquidityDeposited` event to events.rs (AC: #9)
  - [x] 1.1: Add `LiquidityDeposited` event struct with fields: `pool` (Pubkey), `user` (Pubkey), `amount` (u64), `shares_minted` (u64), `total_lp_shares_after` (u64), `yes_reserves_after` (u64), `no_reserves_after` (u64)
  - [x] 1.2: Follow existing event pattern (doc comments on each field)

- [x] Task 2: Add LP-specific error variants to errors.rs (AC: #10, #11)
  - [x] 2.1: Add `PoolEmpty` error — "Pool has no liquidity - use admin_seed_liquidity first" (for edge case where pool reserves are 0 but total_lp_shares > 0, which should never happen but guards against corruption)
  - [x] 2.2: Reuse existing errors: `ZeroAmount`, `BelowMinimumTrade`, `ProtocolPaused`, `ProtocolFrozen`, `PoolPaused`, `PoolFrozen`, `Overflow`, `TokenOwnerMismatch`, `InvalidMint`, `Unauthorized`, `SessionExtractionFailed`

- [x] Task 3: Create `deposit_liquidity.rs` instruction file (AC: #1-#9)
  - [x] 3.1: Create `anchor/programs/fogopulse/src/instructions/deposit_liquidity.rs`
  - [x] 3.2: Define `DepositLiquidity` accounts struct with `#[instruction(user: Pubkey)]`:
    - `signer_or_session: Signer<'info>` (mut, payer)
    - `config: Box<Account<'info, GlobalConfig>>` (seeds = `["global_config"]`)
    - `pool: Box<Account<'info, Pool>>` (mut, seeds = `["pool", pool.asset_mint]`)
    - `lp_share: Account<'info, LpShare>` (mut, init_if_needed, payer = signer_or_session, seeds = `["lp_share", user, pool]`, space = 8 + LpShare::INIT_SPACE)
    - `pool_usdc: Box<Account<'info, TokenAccount>>` (mut, associated_token::mint = usdc_mint, associated_token::authority = pool)
    - `user_usdc: Box<Account<'info, TokenAccount>>` (mut, constraint = user_usdc.owner == user, constraint = user_usdc.mint == USDC_MINT)
    - `usdc_mint: Account<'info, Mint>` (address = USDC_MINT)
    - `token_program: Program<'info, Token>`
    - `associated_token_program: Program<'info, AssociatedToken>`
    - `system_program: Program<'info, System>`
  - [x] 3.3: Implement `handler(ctx, user, amount)` function:
    1. Extract and validate user via `extract_user(&signer_or_session)`, require user == extracted_user
    2. Check protocol not paused/frozen: `!config.paused && !config.frozen`
    3. Check pool not paused/frozen: `!pool.is_paused && !pool.is_frozen`
    4. Validate amount > 0, amount >= MIN_TRADE_AMOUNT * 2 (same as admin_seed_liquidity)
    5. Calculate shares_minted BEFORE updating reserves (see share calculation logic below — order is critical)
    6. Validate shares_minted > 0 (reject dust deposits that round to zero shares — use `ZeroShares` error)
    7. Transfer USDC from user_usdc to pool_usdc
    8. Split deposit 50/50 into yes_reserves and no_reserves (AFTER share calculation)
    9. Update pool.total_lp_shares
    10. Update lp_share (initialize fields if new, increment if existing)
    11. Log key state with `msg!()` (amount, shares_minted, reserves before/after)
    12. Emit LiquidityDeposited event

- [x] Task 4: Register instruction in mod.rs and lib.rs (AC: #12)
  - [x] 4.1: Add `pub mod deposit_liquidity;` and `pub use deposit_liquidity::*;` to `instructions/mod.rs`
  - [x] 4.2: Add `deposit_liquidity` function to `#[program]` module in `lib.rs` under a new LP INSTRUCTIONS section

- [x] Task 5: Build and verify (AC: #12, #13)
  - [x] 5.1: Run `anchor build` in WSL: `wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && anchor build 2>&1"`
  - [x] 5.2: Verify no stack overflow warnings
  - [x] 5.3: Copy IDL to web: `wsl -e bash -l -c "cp /mnt/d/dev/fogopulse/anchor/target/idl/fogopulse.json /mnt/d/dev/fogopulse/web/src/lib/fogopulse.json && echo 'IDL copied successfully'"`
  - [x] 5.4: Verify LpShare type now appears in IDL (since it's used by an instruction)

## Dev Notes

### Share Calculation Logic (CRITICAL)

**ORDER MATTERS:** Calculate shares BEFORE updating reserves. If you update reserves first, the denominator changes and the user gets fewer shares than they should.

```rust
// First-ever deposit to pool (no existing LP shares)
if pool.total_lp_shares == 0 {
    shares_minted = amount;  // 1:1 ratio for bootstrap
} else {
    // Proportional shares based on current pool value
    let pool_value = pool.yes_reserves
        .checked_add(pool.no_reserves)
        .ok_or(FogoPulseError::Overflow)?;

    // Guard against division by zero (shouldn't happen if total_lp_shares > 0)
    require!(pool_value > 0, FogoPulseError::PoolEmpty);

    shares_minted = (amount as u128)
        .checked_mul(pool.total_lp_shares as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(pool_value as u128)
        .ok_or(FogoPulseError::Overflow)? as u64;
}
```

**Why u128 intermediate?** Prevents overflow when `amount * total_lp_shares` exceeds u64::MAX. This is the standard Uniswap V2 pattern for share minting.

**IMPORTANT:** After calculation, validate `shares_minted > 0`. A very small deposit into a very large pool could round to zero shares — reject with `ZeroShares` error to prevent value-less deposits.

### 50/50 Reserve Split Pattern

Copy the exact pattern from `admin_seed_liquidity.rs`:

```rust
let half_amount = amount / 2;
let yes_addition = half_amount + (amount % 2); // YES gets remainder for odd amounts
let no_addition = half_amount;

pool.yes_reserves = pool.yes_reserves
    .checked_add(yes_addition)
    .ok_or(FogoPulseError::Overflow)?;
pool.no_reserves = pool.no_reserves
    .checked_add(no_addition)
    .ok_or(FogoPulseError::Overflow)?;
```

### LpShare Init vs Update Pattern

```rust
let lp_share = &mut ctx.accounts.lp_share;

// Check if this is a freshly initialized account (shares == 0 and user is default)
let is_new = lp_share.user == Pubkey::default();

if is_new {
    lp_share.user = user;
    lp_share.pool = pool.key();
    lp_share.shares = shares_minted;
    lp_share.deposited_amount = amount;
    lp_share.pending_withdrawal = 0;
    lp_share.withdrawal_requested_at = None;
    lp_share.bump = ctx.bumps.lp_share;
} else {
    // Existing LP - increment shares and deposited amount
    lp_share.shares = lp_share.shares
        .checked_add(shares_minted)
        .ok_or(FogoPulseError::Overflow)?;
    lp_share.deposited_amount = lp_share.deposited_amount
        .checked_add(amount)
        .ok_or(FogoPulseError::Overflow)?;
}
```

### No Trading Fees on LP Deposits

LP deposits do NOT incur trading fees. The trading fee (1.8%) only applies to buy/sell position operations. LP deposits are a direct 1:1 USDC-to-reserves transfer.

### Pause vs Frozen Behavior

Following the `admin_seed_liquidity` precedent:
- **Frozen:** Block deposits (emergency halt)
- **Paused:** Also block deposits (unlike admin_seed_liquidity which allows during pause, LP deposits are user-facing and should be blocked when paused)

Check both protocol-level AND pool-level flags:
```rust
require!(!config.paused, FogoPulseError::ProtocolPaused);
require!(!config.frozen, FogoPulseError::ProtocolFrozen);
require!(!pool.is_paused, FogoPulseError::PoolPaused);
require!(!pool.is_frozen, FogoPulseError::PoolFrozen);
```

### Token Transfer — User Wallet Signature Required

Same limitation as `buy_position`: when using FOGO Sessions, the session account cannot authorize SPL token transfers from the user's token account. The user must sign the transaction directly for the transfer.

```rust
token::transfer(
    CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_usdc.to_account_info(),
            to: ctx.accounts.pool_usdc.to_account_info(),
            authority: ctx.accounts.signer_or_session.to_account_info(),
        },
    ),
    amount,
)?;
```

### Pool Reserves & LP Fee Surplus (CRITICAL — Understand Before Implementing)

The `pool_usdc` token account balance is NOT the same as `pool.yes_reserves + pool.no_reserves`:
- **Reserves** (`yes_reserves + no_reserves`): Tracked trading exposure, updated only by deposits, trades, and settlement rebalancing
- **LP fee surplus**: 70% of trading fees transferred to `pool_usdc` but NOT added to reserves (see `buy_position.rs` lines 308-343). This surplus accumulates and increases LP share value at withdrawal time.

**For share minting in THIS instruction**, use `yes_reserves + no_reserves` as the denominator. This is correct because:
1. New depositors buy into the reserve pool proportionally
2. The LP fee surplus benefits existing LPs via increased token-balance-per-share when they eventually withdraw
3. Using `pool_usdc` balance would over-value shares and dilute existing LP positions

### Epoch State — No Constraint on Deposits

Deposits are allowed regardless of epoch state (Open, Frozen, Settling, Settled, or no active epoch). Do NOT add an epoch state check. This differs from `buy_position` (requires Open epoch) and `sell_position` (requires Open epoch). The architecture specifies `deposit_lp REQUIRES: Pool` with no epoch constraint.

### Deposits with Pending Withdrawals

Deposits are allowed even if the LpShare already has `pending_withdrawal > 0`. The pending withdrawal tracks shares being withdrawn; new deposits add new shares independently.

### No Fee Distribution Accounts Needed

Unlike `buy_position` which includes `treasury_usdc` and `insurance_usdc` accounts for fee splitting, `deposit_liquidity` has NO trading fees. Do not include treasury or insurance token accounts in the `DepositLiquidity` accounts struct.

### `msg!()` Logging

Follow the existing instruction pattern (see `buy_position.rs` lines 224-232). Add `msg!()` calls for:
- Entry: pool, user, amount
- Share calculation result: shares_minted, pool_value (reserves sum)
- Completion: updated reserves, total_lp_shares

Use `Box<>` for `Pool` and `GlobalConfig` accounts as established in `buy_position`.

### Project Structure Notes

- New file: `anchor/programs/fogopulse/src/instructions/deposit_liquidity.rs`
- Modified: `anchor/programs/fogopulse/src/instructions/mod.rs` (add module)
- Modified: `anchor/programs/fogopulse/src/lib.rs` (add instruction to #[program])
- Modified: `anchor/programs/fogopulse/src/events.rs` (add LiquidityDeposited)
- Modified: `anchor/programs/fogopulse/src/errors.rs` (add PoolEmpty if needed)
- Modified: `web/src/lib/fogopulse.json` (updated IDL after build)
- Alignment with existing instruction structure: follows `buy_position` pattern for user-facing + sessions
- Alignment with `admin_seed_liquidity` for 50/50 reserve split logic

### What This Story Does NOT Include

- Withdrawal instructions (`request_withdrawal` Story 5.3, `process_withdrawal` Story 5.4)
- Withdrawal events (`WithdrawalRequested`, `WithdrawalProcessed`) — added in Stories 5.3/5.4
- Any frontend UI (Stories 5.5-5.7)
- LP share cap enforcement (no per-LP maximum defined in architecture)

### References

- [Source: architecture.md#LpShare Account] - Account fields, size (106 bytes), PDA seeds
- [Source: architecture.md#Pool Account] - yes_reserves, no_reserves, total_lp_shares fields
- [Source: architecture.md#Fee Distribution] - 70/20/10 LP/Treasury/Insurance split, auto-compounding model
- [Source: epics.md#Story 5.2] - User story, acceptance criteria, FR31
- [Source: prd.md#FR31] - LP can deposit USDC into pool (single-token, auto 50/50 split)
- [Source: prd.md#FR60] - System distributes fees (70% LP, 20% treasury, 10% insurance)
- [Source: project-context.md#On-Chain Account Model] - PDA seeds, account patterns
- [Source: project-context.md#FOGO Sessions Integration] - extract_user pattern
- [Source: project-context.md#Pool Token Account Pattern] - ATA with PDA owner
- [Source: project-context.md#Stack Overflow Prevention] - Box<> for large accounts
- [Source: Story 5.1] - LpShare account structure, PDA derivation, state/mod.rs export
- [Source: admin_seed_liquidity.rs] - 50/50 reserve split pattern, token transfer, event emission
- [Source: buy_position.rs] - Session extraction, user validation, init_if_needed pattern

### Previous Story Intelligence

**From Story 5.1 (LpShare Account Structure — direct predecessor):**
- LpShare struct created at `anchor/programs/fogopulse/src/state/lp.rs`
- 7 fields: user, pool, shares, deposited_amount, pending_withdrawal, withdrawal_requested_at, bump
- PDA seeds: `["lp_share", user.key(), pool.key()]`
- Already exported from `state/mod.rs`
- Compile-time size assertion included in lp.rs
- IDL not yet updated (LpShare won't appear until used by instruction — THIS story)
- `user` in PDA seeds must be actual wallet pubkey, NOT session account

**From Story 5.1 Dev Notes — Fee Auto-Compounding:**
- LP fee (70% of trading fee) stays in `pool_usdc` token account
- NOT added to `yes_reserves` or `no_reserves`
- Creates "surplus" in `pool_usdc` that increases LP share value at withdrawal time
- At withdrawal, share value = `pool_usdc_balance / total_lp_shares` (includes surplus)
- At deposit (THIS story), share minting uses `(yes_reserves + no_reserves) / total_lp_shares` (excludes surplus — this is correct, see "Pool Reserves & LP Fee Surplus" section above)

### Git Intelligence

Recent commits:
- `c246267` feat: Implement LpShare account structure (Story 5.1) — direct predecessor
- `19dfc13` feat: Disable epoch creation for non-BTC markets (Story 7.5 todo)
- `a457776` fix: Pin footer to viewport bottom when trades overflow page

Anchor program was last modified by Story 5.1 (adding lp.rs). The program is stable. This story adds a new instruction without modifying existing instruction logic, minimizing regression risk.

### Files to Create/Modify

| File | Action |
|------|--------|
| `anchor/programs/fogopulse/src/instructions/deposit_liquidity.rs` | Create - DepositLiquidity instruction |
| `anchor/programs/fogopulse/src/instructions/mod.rs` | Modify - add deposit_liquidity module |
| `anchor/programs/fogopulse/src/lib.rs` | Modify - add deposit_liquidity to #[program] |
| `anchor/programs/fogopulse/src/events.rs` | Modify - add LiquidityDeposited event |
| `anchor/programs/fogopulse/src/errors.rs` | Modify - add PoolEmpty error variant |
| `web/src/lib/fogopulse.json` | Modify - updated IDL after anchor build |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- `anchor build` completed successfully with no errors or stack overflow warnings (only pre-existing Anchor framework cfg warnings)
- IDL verified: LpShare type and deposit_liquidity instruction both present in generated IDL

### Completion Notes List

- Implemented `deposit_liquidity` instruction following `buy_position` pattern for FOGO Sessions support and `admin_seed_liquidity` pattern for 50/50 reserve split
- Share calculation uses u128 intermediate to prevent overflow (Uniswap V2 pattern)
- Shares calculated BEFORE reserve updates to prevent dilution
- Dust deposits rejected via `DepositTooSmall` error when shares round to zero (dedicated error, not reusing `ZeroShares` from sell_position)
- No epoch state constraint applied (deposits allowed in any epoch state per architecture)
- No trading fees on LP deposits (direct 1:1 USDC-to-reserves)
- Protocol and pool pause/freeze checks applied (user-facing instruction)
- LpShare uses `init_if_needed` with `Pubkey::default()` check to distinguish new vs existing accounts
- Added `PoolEmpty` error variant for division-by-zero guard (reserves == 0 but total_lp_shares > 0)
- `LiquidityDeposited` event emitted with pool, user, amount, shares_minted, and after-state fields

### Change Log

- 2026-03-18: Implemented deposit_liquidity instruction — all 5 tasks completed, anchor build passes, IDL updated
- 2026-03-18: Code review fixes — added `DepositTooSmall` error (replacing `ZeroShares` reuse), fixed misleading overflow logging in msg!, cleaned stale STUB comments in lib.rs

### File List

- `anchor/programs/fogopulse/src/instructions/deposit_liquidity.rs` (created)
- `anchor/programs/fogopulse/src/instructions/mod.rs` (modified — added deposit_liquidity module and re-export)
- `anchor/programs/fogopulse/src/lib.rs` (modified — added deposit_liquidity to #[program] under LP INSTRUCTIONS section)
- `anchor/programs/fogopulse/src/events.rs` (modified — added LiquidityDeposited event)
- `anchor/programs/fogopulse/src/errors.rs` (modified — added PoolEmpty error variant)
- `web/src/lib/fogopulse.json` (modified — updated IDL with deposit_liquidity instruction and LpShare type)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — story status updated)
- `_bmad-output/implementation-artifacts/5-2-implement-deposit-liquidity-instruction.md` (modified — task checkboxes, dev agent record)
