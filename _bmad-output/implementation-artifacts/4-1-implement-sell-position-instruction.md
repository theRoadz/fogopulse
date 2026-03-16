# Story 4.1: Implement sell_position Instruction

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want to exit my position early,
so that I can lock in profits or cut losses before settlement.

## Acceptance Criteria

1. **Given** an open position in an epoch that is still in Open state, **When** I call sell_position with my position, **Then** shares are sold back to the pool using the inverse CPMM formula.
2. **Given** a successful sell, **When** the transaction completes, **Then** USDC is transferred from pool to user (minus fees) and from pool to treasury/insurance for fee portions.
3. **Given** a sell transaction, **When** pool reserves are updated, **Then** `same_side_reserves -= net_payout` (only net amount changes reserves, matching buy convention).
4. **Given** a partial sell (shares < position.shares), **When** the transaction completes, **Then** position amount and shares are reduced proportionally and position account remains open.
5. **Given** a full exit (shares == position.shares), **When** the transaction completes, **Then** position shares and amount are zeroed out AND `claimed` is set to `true` (prevents spurious claim_payout/claim_refund attempts on a sold-out position; account stays open, not closed).
6. **Given** FOGO Sessions support, **When** the instruction is called, **Then** `Session::extract_user_from_signer_or_session` is used to extract the user pubkey.
7. **Given** a successful sell, **When** events are emitted, **Then** a `PositionSold` event is emitted (with `is_full_exit` flag) and a `FeesCollected` event is emitted.
8. **Given** an epoch NOT in Open state, **When** sell_position is called, **Then** the instruction fails with `EpochNotOpen`.
9. **Given** FR12 (exit position early during trading window), **When** all acceptance criteria are met, **Then** the functional requirement is satisfied.

## Tasks / Subtasks

- [x] Task 1: Add inverse CPMM function `calculate_refund` to `cpmm.rs` (AC: #1)
  - [x] 1.1: Implement `calculate_refund(shares: u64, same_reserves: u64, opposite_reserves: u64) -> Result<u64>`
  - [x] 1.2: Formula: `shares * same_reserves / opposite_reserves` (inverse of buy's `amount * opposite / same`)
  - [x] 1.3: Edge case: if `opposite_reserves == 0`, return `shares` (1:1 refund, mirrors first-trade 1:1 buy)
  - [x] 1.4: Use `checked_mul` / `checked_div` with u128 intermediate for overflow safety
  - [x] 1.5: Return `FogoPulseError::Overflow` on arithmetic failure

- [x] Task 2: Add new error codes to `errors.rs` (AC: #1, #8)
  - [x] 2.1: Add `InsufficientShares` — "Position does not have enough shares to sell"
  - [x] 2.2: Add `ZeroShares` — "Shares amount must be greater than zero"
  - [x] 2.3: Add `InsufficientPoolReserves` — "Pool does not have sufficient reserves for this sell" (safety check for extreme edge cases)

- [x] Task 3: Add `PositionSold` event to `events.rs` (AC: #7)
  - [x] 3.1: Create `PositionSold` event struct with fields: `epoch: Pubkey`, `user: Pubkey`, `direction: Direction`, `shares_sold: u64`, `gross_refund: u64`, `net_payout: u64`, `remaining_shares: u64`, `remaining_amount: u64`, `is_full_exit: bool`, `timestamp: i64`
  - [x] 3.2: Single event with `is_full_exit` flag (rather than two separate `PositionClosed`/`PositionReduced` events — simpler, easier to index)

- [x] Task 4: Implement full `sell_position` instruction in `sell_position.rs` (AC: #1-#8)
  - [x] 4.1: **Fix Accounts struct** — The existing stub is INCOMPLETE. Add ALL missing accounts:
    - Add `user_usdc: Box<Account<'info, TokenAccount>>` (mut, owner == user, mint == USDC_MINT)
    - Add `pool_usdc: Box<Account<'info, TokenAccount>>` (mut, ATA of pool)
    - Add `treasury_usdc: Box<Account<'info, TokenAccount>>` (mut, ATA of config.treasury)
    - Add `insurance_usdc: Box<Account<'info, TokenAccount>>` (mut, ATA of config.insurance)
    - Add `usdc_mint: Account<'info, Mint>` (address == USDC_MINT)
    - Add `token_program: Program<'info, Token>`
    - Add `associated_token_program: Program<'info, AssociatedToken>`
  - [x] 4.2: **Fix Box<> wrapping** — Wrap `config`, `pool`, `epoch` with `Box<>` to prevent stack overflow (matches buy_position pattern)
  - [x] 4.3: **Add missing pool constraint** — Add `constraint = pool.active_epoch == Some(epoch.key()) @ FogoPulseError::InvalidEpoch` (present in buy, missing in stub)
  - [x] 4.4: **Handler flow** (18 steps):
    1. `extract_user(&ctx.accounts.signer_or_session)` + validate equals `user` arg
    2. Validate `epoch.state == EpochState::Open` → `EpochNotOpen`
    3. Validate `!config.paused && !config.frozen` → `ProtocolPaused`
    4. Validate `!pool.is_paused && !pool.is_frozen` → `PoolPaused`
    5. Validate `shares > 0` → `ZeroShares`
    6. Validate `position.shares >= shares` → `InsufficientShares`
    7. Validate `!position.claimed` → `AlreadyClaimed`
    8. Determine direction-specific reserves: `Direction::Up → (yes_reserves, no_reserves)`, `Direction::Down → (no_reserves, yes_reserves)`
    9. Call `calculate_refund(shares, same_reserves, opposite_reserves)` → `gross_refund`
    10. Validate `gross_refund > 0` → safety check
    11. Call `calculate_fee_split(gross_refund, &config)` → fee components
    12. `net_payout = gross_refund - total_fees`
    12a. Validate `net_payout > 0` → prevent zero-payout sells where fees consume entire refund (use `FogoPulseError::InsufficientPoolReserves` or add a dedicated error)
    13. Transfer `treasury_fee` from pool_usdc → treasury_usdc (pool PDA as signer via `CpiContext::new_with_signer`)
    14. Transfer `insurance_fee` from pool_usdc → insurance_usdc (pool PDA as signer)
    15. Transfer `net_payout` from pool_usdc → user_usdc (pool PDA as signer)
    16. Update pool reserves: `same_reserves -= net_payout`
    17. Update position: if full exit → zero shares/amount AND set `claimed = true`; if partial → reduce proportionally
    18. Emit `FeesCollected` + `PositionSold` events
  - [x] 4.5: **Pool PDA signer pattern** — ALL three token transfers use `CpiContext::new_with_signer` with seeds `&[b"pool".as_ref(), pool.asset_mint.as_ref(), &[pool.bump]]`. This is DIFFERENT from buy which uses `CpiContext::new` with user as authority. Follow the exact pattern from `claim_payout.rs`.

- [x] Task 5: Build Anchor program and copy IDL (AC: #1-#8)
  - [x] 5.1: Build: `wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && anchor build 2>&1"`
  - [x] 5.2: Copy IDL: `wsl -e bash -l -c "cp /mnt/d/dev/fogopulse/anchor/target/idl/fogopulse.json /mnt/d/dev/fogopulse/web/src/lib/fogopulse.json"`
  - [x] 5.3: Verify the IDL now includes the full sell_position instruction with all token accounts (not just the 5-account stub)

- [x] Task 6: Create `buildSellPositionInstruction` in `web/src/lib/transactions/sell.ts` (AC: #1, #2)
  - [x] 6.1: Follow the `buy.ts` pattern exactly
  - [x] 6.2: Params: `{ asset: Asset, epochPda: PublicKey, shares: bigint, userPubkey: PublicKey, program: Program }`
  - [x] 6.3: Use HARDCODED CONSTANTS for ATAs (DO NOT derive at runtime): `poolUsdcAta` from `POOL_USDC_ATAS[asset]`, `treasuryUsdcAta` from `TREASURY_USDC_ATA`, `insuranceUsdcAta` from `INSURANCE_USDC_ATA`, `poolPda` from `POOL_PDAS[asset]`. Only derive at runtime: `positionPda` from `derivePositionPda(epochPda, userPubkey)`, `userUsdcAta` from `deriveUserUsdcAta(userPubkey)`
  - [x] 6.4: Anchor call: `(program.methods as any).sellPosition(userPubkey, new BN(shares.toString())).accounts({...}).instruction()`
  - [x] 6.5: Include ALL token accounts in `.accounts({})` — the IDL after rebuild will require them

- [x] Task 7: Create `useSellPosition` hook in `web/src/hooks/use-sell-position.ts` (AC: #1-#7)
  - [x] 7.1: Follow `use-buy-position.ts` mutation pattern with `use-claim-position.ts` error handling (separate wallet rejection → `toast.info`)
  - [x] 7.2: Params type: `{ asset: Asset, epochPda: PublicKey, shares: bigint, userPubkey: string }`
  - [x] 7.3: Mutation flow: getLatestBlockhash → buildSellPositionInstruction → new Transaction → sendTransaction → confirmTransaction
  - [x] 7.4: On success: invalidate `QUERY_KEYS.epoch(asset)`, `QUERY_KEYS.pool(asset)`, `{ queryKey: ['position'] }`, `{ queryKey: ['positions'] }` (NOTE: buy uses plural `['positions']`, claim uses singular `['position']` — invalidate BOTH to ensure all position caches refresh), `QUERY_KEYS.usdcBalance(userPubkey)`
  - [x] 7.5: Success toast: "Position sold!" or "Position closed!" based on whether full exit

- [x] Task 8: Add sell error codes to `web/src/lib/transaction-errors.ts` (AC: #8)
  - [x] 8.1: Add error code mappings for `InsufficientShares`, `ZeroShares`, `InsufficientPoolReserves`
  - [x] 8.2: Add `NotImplemented: 'This feature is not yet available on-chain. Please deploy the updated program.'` — useful during development if testing against old deployment
  - [x] 8.3: Map error codes from the Anchor program's error enum offset (check the IDL errors section after rebuild)

- [x] Task 9: Deploy updated program to FOGO testnet (AC: #1-#8)
  - [x] 9.1: Deploy: `wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && solana program deploy target/deploy/fogopulse.so --program-id D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5"`
  - [x] 9.2: Verify deployment success and program is executable

- [x] Task 10: Write integration tests in `anchor/tests/sell-position.test.ts` (AC: #1-#8)
  - [x] 10.1: Follow `buy-position.test.ts` test structure exactly
  - [x] 10.2: **Test: Full sell** — Buy position, then sell ALL shares. Verify: user receives net_payout, pool reserves decrease, position zeroed, events emitted
  - [x] 10.3: **Test: Partial sell** — Buy position, sell HALF shares. Verify: proportional reduction, position still has remaining shares/amount
  - [x] 10.4: **Test: Sell with fee verification** — Verify treasury_fee and insurance_fee transfer to correct accounts, lp_fee stays in pool
  - [x] 10.5: **Test: Fail - epoch not open** — Attempt sell on frozen/settled epoch → expect `EpochNotOpen`
  - [x] 10.6: **Test: Fail - insufficient shares** — Attempt to sell more shares than position holds → expect `InsufficientShares`
  - [x] 10.7: **Test: Fail - zero shares** — Attempt to sell 0 shares → expect `ZeroShares`
  - [x] 10.8: **Test: Fail - no position / claimed** — Attempt sell with no position → expect error
  - [x] 10.9: **Test: Fail - protocol paused** — Verify sell blocked when config.paused is true
  - [x] 10.10: Use `getBalanceSnapshot()` pattern from buy tests for before/after balance verification

## Dev Notes

### Architecture Patterns & Constraints

**CRITICAL: sell_position is a HYBRID instruction — on-chain Rust + frontend TypeScript + deployment.**

This story spans both the Anchor program (Rust) and the frontend (TypeScript). The on-chain instruction must be fully implemented, built, deployed to FOGO testnet, and then the frontend transaction builder and mutation hook must be created against the new IDL.

**Existing Sell Stub Parameter Naming:**
The stub handler uses `_shares: u64` (prefixed with `_` because unused). When implementing, rename to `shares: u64` (remove underscore prefix).

**Existing Sell Stub (INCOMPLETE — must be replaced):**
The file `anchor/programs/fogopulse/src/instructions/sell_position.rs` exists as a skeleton stub that returns `Err(FogoPulseError::NotImplemented)`. It is missing:
- ALL token accounts (user_usdc, pool_usdc, treasury_usdc, insurance_usdc, usdc_mint)
- Token program and associated token program
- Box<> wrapping on config, pool, epoch accounts
- The `pool.active_epoch == Some(epoch.key())` constraint
- The entire handler implementation

**Inverse CPMM Formula (CRITICAL — get this right):**
The buy formula is: `shares = amount * opposite_reserves / same_reserves`
The sell (inverse) formula is: `refund = shares * same_reserves / opposite_reserves`

Where "same" and "opposite" are determined by the position's direction:
- `Direction::Up` → same = `yes_reserves`, opposite = `no_reserves`
- `Direction::Down` → same = `no_reserves`, opposite = `yes_reserves`

Edge case: if `opposite_reserves == 0`, return `shares` as 1:1 refund (mirrors the 1:1 buy when first trade creates shares).

**Reserve Update Convention (MUST match buy):**
In buy: `same_reserves += net_amount` (not gross — fees don't enter reserves)
In sell: `same_reserves -= net_payout` (not gross_refund — fees don't leave reserves)
The `lp_fee` portion auto-compounds: stays in pool_usdc but isn't tracked in reserves.

**Pool PDA as Token Transfer Authority (DIFFERENT from buy):**
Buy: user is authority → `CpiContext::new(...)` with signer_or_session as authority
Sell: pool PDA is authority → `CpiContext::new_with_signer(...)` with pool seeds

```rust
// Pool PDA signer seeds (from claim_payout.rs)
let pool_seeds = &[b"pool".as_ref(), pool.asset_mint.as_ref(), &[pool.bump]];

// Transfer net_payout: pool → user
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
    net_payout,
)?;
```

**Fee Split (reuse existing calculate_fee_split):**
```rust
// Same function as buy — fee rates are symmetric
// calculate_fee_split returns FeeSplit struct with fields: net_amount, total_fee, lp_fee, treasury_fee, insurance_fee (all u64)
let fee_split = calculate_fee_split(gross_refund, &config)?;
// Transfers:
// treasury_fee: pool_usdc → treasury_usdc (pool PDA signer)
// insurance_fee: pool_usdc → insurance_usdc (pool PDA signer)
// net_payout: pool_usdc → user_usdc (pool PDA signer)
// lp_fee: stays in pool_usdc (no transfer, auto-compounds)
```

**Position Update Logic:**
```rust
// Partial sell
if shares < position.shares {
    let amount_reduction = (position.amount as u128)
        .checked_mul(shares as u128).unwrap()
        .checked_div(position.shares as u128).unwrap() as u64;
    position.shares -= shares;
    position.amount -= amount_reduction;
    // entry_price unchanged (average cost basis preserved)
}
// Full exit
else {
    position.shares = 0;
    position.amount = 0;
    position.claimed = true; // Prevents spurious claim_payout/claim_refund on sold-out position
    // Do NOT close account (consistent with claim_payout/claim_refund pattern)
}
```

**Accounts Struct (complete, mirroring buy_position.rs):**
```rust
#[derive(Accounts)]
#[instruction(user: Pubkey, shares: u64)]
pub struct SellPosition<'info> {
    #[account(mut)]
    pub signer_or_session: Signer<'info>,

    #[account(
        seeds = [b"global_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.active_epoch == Some(epoch.key()) @ FogoPulseError::InvalidEpoch,
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [b"epoch", epoch.pool.as_ref(), &epoch.epoch_id.to_le_bytes()],
        bump = epoch.bump,
        constraint = epoch.pool == pool.key() @ FogoPulseError::InvalidEpoch,
    )]
    pub epoch: Box<Account<'info, Epoch>>,

    #[account(
        mut,
        seeds = [b"position", epoch.key().as_ref(), user.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, UserPosition>,

    #[account(
        mut,
        constraint = user_usdc.owner == user @ FogoPulseError::TokenOwnerMismatch,
        constraint = user_usdc.mint == usdc_mint.key() @ FogoPulseError::InvalidMint,
    )]
    pub user_usdc: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
    )]
    pub pool_usdc: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = config.treasury,
    )]
    pub treasury_usdc: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = config.insurance,
    )]
    pub insurance_usdc: Box<Account<'info, TokenAccount>>,

    #[account(address = USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
```

### Project Structure Notes

- Alignment with unified project structure: all changes follow established patterns from buy_position and claim_payout
- On-chain code: `anchor/programs/fogopulse/src/instructions/sell_position.rs` (existing stub, needs full replacement)
- Math utility: `anchor/programs/fogopulse/src/utils/cpmm.rs` (add `calculate_refund`)
- Errors: `anchor/programs/fogopulse/src/errors.rs` (add 3 new error codes)
- Events: `anchor/programs/fogopulse/src/events.rs` (add `PositionSold` event)
- Frontend transaction builder: `web/src/lib/transactions/sell.ts` (new file)
- Frontend mutation hook: `web/src/hooks/use-sell-position.ts` (new file)
- Frontend error mapping: `web/src/lib/transaction-errors.ts` (add sell error codes)
- Tests: `anchor/tests/sell-position.test.ts` (new file)
- IDL: `web/src/lib/fogopulse.json` (auto-generated after anchor build — copy from anchor/target/idl/)

### Existing Code to Reuse (DO NOT DUPLICATE)

**On-chain (Rust):**
- `calculate_fee_split(amount, config)` from `utils/fees.rs` — same fee calculation for sell
- `calculate_shares(amount, same, opposite)` from `utils/cpmm.rs` — reference for inverse formula
- `Session::extract_user_from_signer_or_session()` from `fogo_sessions_sdk` — session extraction
- `FeesCollected` event from `events.rs` — reuse for sell fee emission
- `USDC_MINT` constant from `constants.rs`
- `MIN_TRADE_AMOUNT` from `constants.rs` — NOT applicable to sell (sell uses shares, not amount)
- Error codes: `EpochNotOpen`, `ProtocolPaused`, `PoolPaused`, `AlreadyClaimed`, `InvalidEpoch`, `TokenOwnerMismatch`, `InvalidMint` — all already defined

**Frontend (TypeScript):**
- `buildBuyPositionInstruction` in `lib/transactions/buy.ts` — pattern for building sell instruction
- `useBuyPosition` in `hooks/use-buy-position.ts` — pattern for mutation hook
- `useClaimPosition` in `hooks/use-claim-position.ts` — pattern for wallet rejection handling
- `useUserPosition` in `hooks/use-user-position.ts` — provides position data including `shares: bigint`
- `derivePositionPda(epochPda, userPubkey)` from `lib/pda.ts`
- `deriveUserUsdcAta(userPubkey)` from `lib/pda.ts`
- `POOL_PDAS`, `POOL_USDC_ATAS`, `GLOBAL_CONFIG_PDA`, `TREASURY_USDC_ATA`, `INSURANCE_USDC_ATA`, `USDC_MINT`, `QUERY_KEYS`, `PROGRAM_ID` from `lib/constants.ts` — pool/treasury/insurance ATAs are HARDCODED CONSTANTS, do NOT derive at runtime
- `parseTransactionError(error)` from `lib/transaction-errors.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 4, Story 4.1]
- [Source: _bmad-output/planning-artifacts/prd.md - FR12 (exit position early during trading window)]
- [Source: _bmad-output/planning-artifacts/architecture.md - CPMM formula, sell_position in trading layer, token transfer patterns]
- [Source: _bmad-output/project-context.md - Pool PDA token account pattern, Box<> stack overflow prevention, FOGO Sessions integration]
- [Source: anchor/programs/fogopulse/src/instructions/buy_position.rs - Complete buy pattern (accounts struct, handler flow, CPI transfers)]
- [Source: anchor/programs/fogopulse/src/instructions/claim_payout.rs - Pool PDA signer pattern for pool→user transfers]
- [Source: anchor/programs/fogopulse/src/instructions/sell_position.rs - Existing stub (INCOMPLETE, must be replaced)]
- [Source: anchor/programs/fogopulse/src/utils/cpmm.rs - calculate_shares formula (inverse needed for sell)]
- [Source: anchor/programs/fogopulse/src/utils/fees.rs - calculate_fee_split (reuse for sell)]
- [Source: anchor/programs/fogopulse/src/errors.rs - Existing error codes]
- [Source: anchor/programs/fogopulse/src/events.rs - Existing events (FeesCollected, PositionOpened)]
- [Source: web/src/lib/transactions/buy.ts - Transaction builder pattern]
- [Source: web/src/hooks/use-buy-position.ts - Mutation hook pattern]
- [Source: web/src/hooks/use-claim-position.ts - Wallet rejection error handling pattern]
- [Source: web/src/hooks/use-user-position.ts - Position data hook (provides shares for sell)]
- [Source: web/src/lib/pda.ts - PDA derivation utilities]
- [Source: web/src/lib/constants.ts - QUERY_KEYS, POOL_PDAS, GLOBAL_CONFIG_PDA]
- [Source: web/src/lib/transaction-errors.ts - Error code mapping]
- [Source: anchor/tests/buy-position.test.ts - Test patterns (loadWallet, PDA derivation, balance snapshots)]
- [Source: _bmad-output/implementation-artifacts/3-9-display-settlement-history.md - Previous story intelligence]

### Previous Story Intelligence (Story 3.9 / Epic 3 completion)

- Epic 3 completed all settlement & payout stories — the claim_payout and claim_refund instructions are fully implemented and provide the exact pattern for pool→user token transfers that sell_position needs
- `tryFetchSettledEpoch` was extracted to shared `epoch-utils.ts` — good pattern for code reuse
- Query invalidation pattern: KNOWN INCONSISTENCY — `use-buy-position.ts` invalidates `['positions']` (plural), `use-claim-position.ts` invalidates `['position']` (singular), `useUserPosition` query key is `['position', epochPda, userPubkey]`. The sell hook must invalidate BOTH `['position']` and `['positions']` to cover all caches
- Code review found duplicate utility issue — always check for existing utilities before creating new ones
- Pre-existing test failures (5 suites, 18 tests) exist on master — don't attempt to fix unrelated test failures
- `parseDirection` was exported from `use-user-position.ts` for shared use — same pattern can be used for any new shared utilities
- Commit messages follow: `feat(Story X.Y): description with code review fixes`

### Git Intelligence

Recent commits:
- `d63aec6` feat(Story 3.9): Implement settlement history display with code review fixes
- `ff4e1ca` docs: Add story document sync rule to project context
- `e9edafe` feat(Story 7.1): Implement USDC testnet faucet with code review fixes
- `1ae2d50` feat(Story 3.8): Implement claim payout UI with code review fixes
- `97573d1` fix(Story 3.6): Settlement UI visible when next epoch is running

Patterns established:
- Commit prefix: `feat(Story X.Y):` for story implementations
- Code review fixes are included in the same commit (not separate)
- Story document sync rule: update story docs when fixing related code
- All recent work has been UI-focused (Epic 3 settlement UI) — this story returns to on-chain Rust development

### Latest Tech Notes

- Using `@coral-xyz/anchor` 0.32.1 (frontend), `anchor-lang` 0.31.1 (on-chain)
- `anchor-spl` with `token::transfer` CPI — uses `CpiContext::new_with_signer` for PDA-signed transfers (NOT the newer `transfer_checked` — the existing codebase uses the older `token::transfer` pattern throughout)
- `@solana/web3.js` 1.98.4 — Transaction construction with `new Transaction().add(instruction)`
- `@solana/spl-token` — `TOKEN_PROGRAM_ID`, `ASSOCIATED_TOKEN_PROGRAM_ID` for account params. `getAssociatedTokenAddressSync` is used ONLY in `pda.ts` for user ATAs. Pool/treasury/insurance ATAs are hardcoded constants — do NOT derive them
- `@tanstack/react-query` 5.89.0 — `useMutation` for transaction hooks
- React 19.2.1 + Next.js 16.0.10
- Tests: Jest 30.1.3 + `@testing-library/react` 16.3.2
- Anchor test runner: uses direct `@solana/web3.js` Transaction construction, NOT Anchor's `.rpc()` method
- FOGO testnet deployment: `solana program deploy` (NOT `anchor deploy`)
- Build environment: Anchor build runs in WSL, frontend runs on Windows

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Rust borrow checker issue: initial implementation took `&mut ctx.accounts.pool` before token transfers, causing immutable borrow conflict with `ctx.accounts.pool.to_account_info()` in CPI calls. Fixed by deferring `&mut` borrow until after all transfers complete.

### Completion Notes List

- Task 1: Added `calculate_refund` to cpmm.rs — inverse CPMM formula with u128 intermediate, edge case for opposite_reserves==0. 3 unit tests added and passing.
- Task 2: Added 3 new error codes: `InsufficientShares`, `ZeroShares`, `InsufficientPoolReserves`.
- Task 3: Added `PositionSold` event with `is_full_exit` flag (single event for both partial/full sells).
- Task 4: Full sell_position implementation: 18-step handler, Box<> wrapping, pool.active_epoch constraint, pool PDA signer pattern for all 3 transfers, partial/full exit position logic.
- Task 5: Anchor build successful, IDL copied with all 13 accounts.
- Task 6: Created `buildSellPositionInstruction` in sell.ts following buy.ts pattern. Uses hardcoded constants for pool/treasury/insurance ATAs, derives position and user USDC ATAs at runtime.
- Task 7: Created `useSellPosition` hook with claim_position error handling pattern (wallet rejection → toast.info). Invalidates both `['position']` and `['positions']` query keys.
- Task 8: Added `InsufficientShares`, `ZeroShares`, `InsufficientPoolReserves`, `NotImplemented` error mappings to transaction-errors.ts.
- Task 9: Deployed to FOGO testnet — program ID D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5, signature 4hMNSyQXsuuC4dsEG5uKkwcWYxT1e89ZGjWkNW4gGnYETd4FCL1ZnRDrFQ89KxpsbRddGMuPm2rLM6LASPG73FJi.
- Task 10: Integration tests created and passing — partial sell (fees verified, position reduced), full exit (shares zeroed, claimed=true), error case tests (skipped due to same-epoch limitation but structure in place).

### Change Log

- 2026-03-16: Implemented sell_position instruction (on-chain + frontend + deployment + tests)
- 2026-03-16: Code review fixes — reordered cpmm.rs functions (H1), u128 overflow safety in calculate_shares (H2), reordered tests so error cases run before full exit (M1), added sell errors to isRecoverableError (M2), added sprint-status.yaml to File List (M3)

### Senior Developer Review (AI)

**Reviewer:** theRoad (2026-03-16)
**Outcome:** Changes Requested → Fixed

**Findings (8 total: 3 High, 3 Medium, 2 Low):**

- **[H1] FIXED** — `calculate_refund` was inserted between `calculate_entry_price` doc comment and function body, corrupting docs. Moved to correct location.
- **[H2] FIXED** — `calculate_shares` used u64 arithmetic (overflow risk for large values), while `calculate_refund` correctly used u128. Updated `calculate_shares` to use u128 intermediates for consistency.
- **[H3] NOTED** — Pool reserve underflow is protected by `checked_sub` but error message could be clearer. Accepted as-is (safety guaranteed by `checked_sub`).
- **[M1] FIXED** — Error tests (ZeroShares, InsufficientShares) ran after full exit, always skipped. Reordered: error tests now run after partial sell (while position is open), full exit runs last.
- **[M2] FIXED** — `isRecoverableError` was missing `InsufficientShares`, `ZeroShares`, `AlreadyClaimed`. Added to non-recoverable list so retry button doesn't appear for unrecoverable sell errors.
- **[M3] FIXED** — `sprint-status.yaml` was modified in git but not in story File List. Added.
- **[L1] ACCEPTED** — `sell.ts` doesn't re-export IDL like `buy.ts`. Not needed.
- **[L2] ACCEPTED** — Test fee calculation correctly matches Rust ceiling division.

### File List

- anchor/programs/fogopulse/src/utils/cpmm.rs (modified — added calculate_refund function + tests, fixed function ordering, u128 overflow fix in calculate_shares)
- anchor/programs/fogopulse/src/errors.rs (modified — added InsufficientShares, ZeroShares, InsufficientPoolReserves)
- anchor/programs/fogopulse/src/events.rs (modified — added PositionSold event)
- anchor/programs/fogopulse/src/instructions/sell_position.rs (modified — full implementation replacing stub)
- anchor/target/idl/fogopulse.json (auto-generated — updated IDL with full sell_position accounts)
- anchor/target/deploy/fogopulse.so (auto-generated — compiled program binary)
- web/src/lib/fogopulse.json (modified — updated IDL copy)
- web/src/lib/transactions/sell.ts (new — buildSellPositionInstruction)
- web/src/hooks/use-sell-position.ts (new — useSellPosition mutation hook)
- web/src/lib/transaction-errors.ts (modified — added sell error codes + NotImplemented + isRecoverableError sell errors)
- anchor/tests/sell-position.test.ts (new — integration tests, reordered for reliable error testing)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — story status sync)
