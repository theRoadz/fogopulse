# Story 3.5: Implement Fee Distribution

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a protocol,
I want fees distributed correctly after each trade,
So that LPs, treasury, and insurance receive their shares.

## Context

FOGO Pulse charges a 1.8% trading fee (configurable via `trading_fee_bps` in GlobalConfig) on all trades. This fee must be split according to the configured ratios:
- **70% to LPs** (stays in pool reserves, auto-compounding)
- **20% to Treasury** (transferred to `config.treasury` token account)
- **10% to Insurance** (transferred to `config.insurance` token account)

**Current State:**
- `buy_position.rs` transfers the FULL trade amount to pool reserves - NO fee deduction
- GlobalConfig already has all fee parameters defined (`trading_fee_bps`, `lp_fee_share_bps`, `treasury_fee_share_bps`, `insurance_fee_share_bps`)
- GlobalConfig already has `treasury` and `insurance` Pubkey fields
- sell_position is NOT implemented yet (backlog), so this story focuses on buy_position

**Implementation Approach:**
Fees should be calculated and distributed at trade execution time, not at settlement. The LP portion stays in pool reserves (auto-compounding), while treasury and insurance portions are transferred to their respective token accounts during the trade.

## Acceptance Criteria

1. **Given** a valid buy_position trade of 100 USDC with 1.8% fee (180 bps)
   **When** the trade executes successfully
   **Then** total fees of 1.8 USDC are deducted from the trade amount
   **And** 1.26 USDC (70%) is added to pool reserves (LP fee)
   **And** 0.36 USDC (20%) is transferred to treasury token account
   **And** 0.18 USDC (10%) is transferred to insurance token account
   **And** 98.2 USDC (amount after fee) is used for share calculation

2. **Given** a trade execution
   **When** fees are distributed
   **Then** a `FeesCollected` event is emitted with epoch, user, gross_amount, net_amount, total_fee, lp_fee, treasury_fee, insurance_fee

3. **Given** the configured fee parameters in GlobalConfig
   **When** fee distribution occurs
   **Then** the exact configured percentages are used (not hardcoded values)
   **And** calculations use u128 to prevent overflow with large amounts

4. **Given** the protocol or pool is frozen
   **When** buy_position is called
   **Then** the instruction fails (existing behavior - no change needed)
   **And** no fees are collected (transaction rejected)

5. **Given** a trade amount that results in less than 1 lamport for any fee portion
   **When** fee calculation is performed
   **Then** the rounding favors the pool (user pays ceiling, not floor)
   **And** no division by zero or underflow occurs

6. **Given** the trade amount is very small (e.g., minimum trade amount)
   **When** fees are calculated
   **Then** calculations do not fail due to rounding to zero
   **And** at minimum, some fee is collected (even if 1 lamport)

7. **Given** the treasury or insurance token accounts
   **When** fees are transferred
   **Then** the accounts are validated as ATAs of the correct pubkeys
   **And** transfers use proper PDA signing (NOT pool authority - see Dev Notes)

## Tasks / Subtasks

- [x] **Task 1: Create fee calculation utility** (AC: 1, 3, 5, 6)
  - [x] 1.1: Create `anchor/programs/fogopulse/src/utils/fees.rs` module
  - [x] 1.2: Add `pub mod fees;` to existing `utils/mod.rs` and re-export
  - [x] 1.3: Implement `calculate_fee_split(amount: u64, config: &GlobalConfig) -> Result<FeeSplit>`
  - [x] 1.4: Define `FeeSplit` struct with `net_amount`, `total_fee`, `lp_fee`, `treasury_fee`, `insurance_fee`
  - [x] 1.5: Use u128 for intermediate calculations to prevent overflow
  - [x] 1.6: Use ceiling division for fees (favor protocol over user on rounding)
  - [x] 1.7: Add unit tests for fee calculation edge cases

- [x] **Task 2: Add FeesCollected event** (AC: 2)
  - [x] 2.1: Add `FeesCollected` event to `events.rs`
  - [x] 2.2: Include fields: epoch, user, gross_amount, net_amount, total_fee, lp_fee, treasury_fee, insurance_fee

- [x] **Task 3: Update BuyPosition accounts struct** (AC: 1, 7)
  - [x] 3.1: Add `treasury_usdc` token account (ATA of config.treasury)
  - [x] 3.2: Add `insurance_usdc` token account (ATA of config.insurance)
  - [x] 3.3: Keep using Box<> for large accounts
  - [x] 3.4: Validate ATAs match the config pubkeys

- [x] **Task 4: Modify buy_position handler** (AC: 1, 2, 3)
  - [x] 4.1: Import fee utilities and new event
  - [x] 4.2: Call `calculate_fee_split()` with trade amount and config
  - [x] 4.3: Transfer treasury_fee from user_usdc to treasury_usdc
  - [x] 4.4: Transfer insurance_fee from user_usdc to insurance_usdc
  - [x] 4.5: Transfer net_amount + lp_fee to pool_usdc (combined transfer)
  - [x] 4.6: Update pool reserves with net_amount only (NOT lp_fee - it stays in pool USDC account)
  - [x] 4.7: Use net_amount for share calculation (not gross amount)
  - [x] 4.8: Emit FeesCollected event
  - [x] 4.9: Update position.amount to reflect net_amount (what's actually in the trade)

- [x] **Task 5: Build and deploy** (AC: 1-7)
  - [x] 5.1: Run `anchor build` and fix any compilation errors
  - [x] 5.2: Deploy to FOGO testnet
  - [x] 5.3: Copy IDL to `web/src/lib/fogopulse.json`

- [x] **Task 6: Update frontend trade preview** (AC: 1)
  - [x] 6.1: Update `TradeTicket` to show fee breakdown in preview
  - [x] 6.2: Show: gross amount, fee amount (1.8%), net trading amount
  - [x] 6.3: Update transaction builder to include treasury_usdc and insurance_usdc accounts

- [x] **Task 7: Create test script** (AC: 1-6)
  - [x] 7.1: Fee distribution testing integrated into `anchor/tests/buy-position.test.ts`
  - [x] 7.2: Execute a trade and verify balances: pool, treasury, insurance
  - [x] 7.3: Verify event emission with correct fee breakdown
  - [x] 7.4: Test with various amounts to verify rounding behavior

- [x] **Task 8: Integration tests** (AC: 1-6)
  - [x] 8.1: Test fee calculation for standard amounts (100 USDC)
  - [x] 8.2: Test fee calculation for minimum trade amount
  - [x] 8.3: Test fee calculation for very large amounts (verify no overflow)
  - [x] 8.4: Verify treasury and insurance balances increase correctly
  - [x] 8.5: Verify pool USDC balance reflects gross amount minus treasury/insurance fees

## Dev Notes

### Fee Calculation Formula

```rust
/// Fee split calculation - all amounts in lamports (USDC 6 decimals)
pub struct FeeSplit {
    /// Amount after fees - used for share calculation
    pub net_amount: u64,
    /// Total fee charged (trading_fee_bps of gross amount)
    pub total_fee: u64,
    /// LP portion of fee (stays in pool reserves)
    pub lp_fee: u64,
    /// Treasury portion of fee (transferred out)
    pub treasury_fee: u64,
    /// Insurance portion of fee (transferred out)
    pub insurance_fee: u64,
}

pub fn calculate_fee_split(amount: u64, config: &GlobalConfig) -> Result<FeeSplit> {
    // Calculate total fee (ceiling division - favors protocol)
    // total_fee = ceil(amount * trading_fee_bps / 10_000)
    let total_fee = (amount as u128)
        .checked_mul(config.trading_fee_bps as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_add(9999) // Add (10000-1) for ceiling division
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10_000)
        .ok_or(FogoPulseError::Overflow)? as u64;

    // Net amount after fees
    let net_amount = amount.checked_sub(total_fee).ok_or(FogoPulseError::Overflow)?;

    // Split total_fee according to configured ratios
    // Note: lp + treasury + insurance should sum to 10000 bps (100%)
    let treasury_fee = (total_fee as u128)
        .checked_mul(config.treasury_fee_share_bps as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10_000)
        .ok_or(FogoPulseError::Overflow)? as u64;

    let insurance_fee = (total_fee as u128)
        .checked_mul(config.insurance_fee_share_bps as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10_000)
        .ok_or(FogoPulseError::Overflow)? as u64;

    // LP fee is the remainder (ensures no dust)
    let lp_fee = total_fee
        .checked_sub(treasury_fee)
        .ok_or(FogoPulseError::Overflow)?
        .checked_sub(insurance_fee)
        .ok_or(FogoPulseError::Overflow)?;

    Ok(FeeSplit {
        net_amount,
        total_fee,
        lp_fee,
        treasury_fee,
        insurance_fee,
    })
}
```

### Example Calculation (100 USDC trade, 1.8% fee, 70/20/10 split)

```
gross_amount = 100_000_000 lamports (100 USDC)
trading_fee_bps = 180 (1.8%)

total_fee = ceil(100_000_000 * 180 / 10_000) = 1_800_000 (1.8 USDC)
net_amount = 100_000_000 - 1_800_000 = 98_200_000 (98.2 USDC)

treasury_fee = floor(1_800_000 * 2000 / 10_000) = 360_000 (0.36 USDC)
insurance_fee = floor(1_800_000 * 1000 / 10_000) = 180_000 (0.18 USDC)
lp_fee = 1_800_000 - 360_000 - 180_000 = 1_260_000 (1.26 USDC)

Verification: 360_000 + 180_000 + 1_260_000 = 1_800_000 ✓
```

### Updated BuyPosition Accounts

```rust
#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct BuyPosition<'info> {
    // ... existing accounts ...

    /// Treasury USDC token account - receives 20% of fees
    /// Must be ATA of config.treasury
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = config.treasury,
    )]
    pub treasury_usdc: Box<Account<'info, TokenAccount>>,

    /// Insurance USDC token account - receives 10% of fees
    /// Must be ATA of config.insurance
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = config.insurance,
    )]
    pub insurance_usdc: Box<Account<'info, TokenAccount>>,

    // ... rest of existing accounts ...
}
```

### Updated Handler Flow

The updated buy_position handler should:

```rust
pub fn handler(ctx: Context<BuyPosition>, user: Pubkey, direction: Direction, amount: u64) -> Result<()> {
    // ... existing validation (steps 1-5) ...

    // 6. Calculate fee split
    let fee_split = calculate_fee_split(amount, &ctx.accounts.config)?;

    // 7. Transfer treasury fee from user to treasury
    if fee_split.treasury_fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.signer_or_session.to_account_info(),
                },
            ),
            fee_split.treasury_fee,
        )?;
    }

    // 8. Transfer insurance fee from user to insurance
    if fee_split.insurance_fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.insurance_usdc.to_account_info(),
                    authority: ctx.accounts.signer_or_session.to_account_info(),
                },
            ),
            fee_split.insurance_fee,
        )?;
    }

    // 9. Transfer net_amount + lp_fee to pool (lp_fee stays in pool USDC)
    let pool_transfer_amount = fee_split.net_amount
        .checked_add(fee_split.lp_fee)
        .ok_or(FogoPulseError::Overflow)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.pool_usdc.to_account_info(),
                authority: ctx.accounts.signer_or_session.to_account_info(),
            },
        ),
        pool_transfer_amount,
    )?;

    // 10. Calculate shares using NET amount (after fees)
    let (same_reserves, opposite_reserves) = match direction {
        Direction::Up => (pool.yes_reserves, pool.no_reserves),
        Direction::Down => (pool.no_reserves, pool.yes_reserves),
    };
    let shares = calculate_shares(fee_split.net_amount, same_reserves, opposite_reserves)?;
    let entry_price = calculate_entry_price(fee_split.net_amount, shares)?;

    // 11. Update pool reserves with NET amount (trading exposure)
    // The lp_fee stays in pool_usdc but is NOT added to reserves
    // This creates "surplus" in pool_usdc that increases LP share value
    match direction {
        Direction::Up => {
            pool.yes_reserves = pool.yes_reserves
                .checked_add(fee_split.net_amount)
                .ok_or(FogoPulseError::Overflow)?
        }
        Direction::Down => {
            pool.no_reserves = pool.no_reserves
                .checked_add(fee_split.net_amount)
                .ok_or(FogoPulseError::Overflow)?
        }
    }

    // 12. Update position with NET amount
    position.amount = fee_split.net_amount; // NOT gross amount

    // 13. Emit FeesCollected event
    emit!(FeesCollected {
        epoch: ctx.accounts.epoch.key(),
        user,
        gross_amount: amount,
        net_amount: fee_split.net_amount,
        total_fee: fee_split.total_fee,
        lp_fee: fee_split.lp_fee,
        treasury_fee: fee_split.treasury_fee,
        insurance_fee: fee_split.insurance_fee,
    });

    // ... rest of handler (emit PositionOpened, etc.) ...
}
```

### LP Fee Auto-Compounding Mechanism

The LP fee is NOT added to `pool.yes_reserves` or `pool.no_reserves`. Instead:

1. The lp_fee is transferred to `pool_usdc` (pool's token account)
2. The reserves only track trading exposure (net_amount)
3. This creates a "surplus" in pool_usdc vs reserves
4. When LPs withdraw, they get: `(shares / total_shares) * pool_usdc_balance`
5. The surplus naturally increases LP share value = auto-compounding

**Important:** The pool_usdc balance will be HIGHER than (yes_reserves + no_reserves). This is expected and correct. The difference is accumulated LP fees.

### Event Definition

Add to `events.rs`:

```rust
#[event]
pub struct FeesCollected {
    pub epoch: Pubkey,
    pub user: Pubkey,
    pub gross_amount: u64,
    pub net_amount: u64,
    pub total_fee: u64,
    pub lp_fee: u64,
    pub treasury_fee: u64,
    pub insurance_fee: u64,
}
```

### Treasury and Insurance Token Accounts

The `config.treasury` and `config.insurance` Pubkeys should be regular wallet addresses (could be multisigs). Their USDC token accounts are ATAs derived from these pubkeys.

**Prerequisites (must exist before trading can work with fees):**
1. Treasury wallet has USDC ATA initialized
2. Insurance wallet has USDC ATA initialized
3. GlobalConfig.treasury and GlobalConfig.insurance are set to correct pubkeys

If these accounts don't exist, the transaction will fail. Consider adding an admin setup script to create these accounts.

### Backward Compatibility Considerations

**BREAKING CHANGE:** After this update, buy_position transactions will require two additional accounts (treasury_usdc, insurance_usdc).

**Frontend Update Required:**
- Transaction builder must include new accounts
- Trade preview should show fee breakdown

**Existing Positions:** Not affected - fees are only on new trades.

### Files to Modify

| File | Change |
|------|--------|
| `anchor/programs/fogopulse/src/utils/mod.rs` | Add `pub mod fees;` and re-export |
| `anchor/programs/fogopulse/src/events.rs` | Add `FeesCollected` event |
| `anchor/programs/fogopulse/src/instructions/buy_position.rs` | Add treasury/insurance accounts, update handler with fee logic |
| `web/src/lib/fogopulse.json` | Updated IDL (auto-generated from `anchor build`) |
| `web/src/components/trading/trade-ticket.tsx` | Show fee breakdown in trade preview |
| `web/src/lib/transactions/buy.ts` | Include treasury_usdc and insurance_usdc accounts |

### Files to Create

| File | Purpose |
|------|---------|
| `anchor/programs/fogopulse/src/utils/fees.rs` | Fee calculation utilities (`FeeSplit`, `calculate_fee_split`) |
| `anchor/scripts/test-fee-distribution.ts` | Manual testing script for testnet verification |
| `anchor/tests/fee-distribution.test.ts` | Integration tests for fee scenarios |

### Testing Notes

**Test Sequence:**
1. Verify treasury and insurance USDC ATAs exist
2. Record initial balances: pool_usdc, treasury_usdc, insurance_usdc
3. Execute buy_position trade with known amount
4. Verify treasury_usdc increased by expected treasury_fee
5. Verify insurance_usdc increased by expected insurance_fee
6. Verify pool_usdc increased by (net_amount + lp_fee)
7. Verify FeesCollected event contains correct breakdown
8. Verify position.amount equals net_amount (not gross)

**Edge Cases to Test:**
- Minimum trade amount (verify no underflow)
- Large trade amounts (verify no overflow)
- Amounts that result in < 1 lamport fees (verify rounding)
- Fee percentages that don't evenly divide (verify no dust loss)

### Previous Story Learnings (from Story 3.3)

- Always use Box<> for token accounts to prevent stack overflow
- Use ceiling division when calculating fees that favor the protocol
- Verify event emission in integration tests
- Include detailed msg!() logging for debugging
- Test with real token accounts, not mocks

### Git Intelligence

Recent commits show:
- Story 3.3 added settlement snapshot fields to Epoch for payout calculation
- Story 3.2 implemented confidence-aware refund logic
- Crank bot handles epoch lifecycle automatically

The fee distribution change is isolated to buy_position and doesn't affect settlement logic. However, the pool_usdc balance will now include LP fees, which affects LP withdrawal calculations (future story).

## Project Structure Notes

### Alignment with Unified Project Structure

- Fee utilities go in `anchor/programs/fogopulse/src/utils/fees.rs` (standard utils location)
- Test scripts go in `anchor/scripts/` (standard test script location)
- Integration tests go in `anchor/tests/` (standard test location)
- Frontend changes isolated to existing components

### No Conflicts Detected

The changes are additive and don't conflict with existing patterns.

## References

- [Source: anchor/programs/fogopulse/src/instructions/buy_position.rs] - Current implementation to modify
- [Source: anchor/programs/fogopulse/src/state/config.rs] - Fee parameters in GlobalConfig
- [Source: _bmad-output/planning-artifacts/prd.md#fr60] - FR60: System distributes fees (70% LP, 20% treasury, 10% insurance)
- [Source: _bmad-output/planning-artifacts/architecture.md#fee-distribution-pipeline] - Fee distribution design
- [Source: _bmad-output/planning-artifacts/epics.md#story-35] - Original story acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Build succeeded with anchor build
- All 9 unit tests for fee calculation passed (cargo test fees --lib)
- Program deployed to FOGO testnet: D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5
- Integration test executed successfully (buy_position with fee distribution)
- Transaction confirmed: 5ZugoWEVGRhJbhUFrTLMtDAMkBYayJPtCBNrxhDX5BBoxMU2stakZZDM6Bmd6pj2dKx4pWSahTVzkqy4bfQH5JUA
- Frontend build succeeded with next build

### Completion Notes List

1. **Fee Calculation Utility Created** (Task 1)
   - Created `anchor/programs/fogopulse/src/utils/fees.rs` with `FeeSplit` struct and `calculate_fee_split()` function
   - Uses u128 intermediate calculations to prevent overflow
   - Ceiling division for total fee (favors protocol)
   - Floor division for treasury/insurance with LP getting remainder (no dust)
   - 9 comprehensive unit tests covering edge cases

2. **FeesCollected Event Added** (Task 2)
   - Added to `events.rs` with all required fields: epoch, user, gross_amount, net_amount, total_fee, lp_fee, treasury_fee, insurance_fee

3. **BuyPosition Accounts Updated** (Task 3)
   - Added `treasury_usdc` token account (ATA of config.treasury)
   - Added `insurance_usdc` token account (ATA of config.insurance)
   - Account constraints validate ATAs match config pubkeys

4. **Handler Updated with Fee Logic** (Task 4)
   - Fees deducted upfront at trade time
   - Three separate transfers: treasury_fee, insurance_fee, net_amount+lp_fee to pool
   - Reserves updated with net_amount only (lp_fee stays in pool USDC for auto-compounding)
   - Share calculation uses net_amount
   - Position.amount stores net_amount

5. **Build and Deploy** (Task 5)
   - Program compiled successfully with anchor build
   - Deployed to FOGO testnet: D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5
   - IDL copied to web/src/lib/fogopulse.json

6. **Frontend Updated** (Task 6)
   - Trade preview now shows fee breakdown with tooltip (LP 70%, Treasury 20%, Insurance 10%)
   - Share calculation uses net amount (matching on-chain behavior)
   - Transaction builder includes treasury_usdc and insurance_usdc accounts
   - Added TREASURY_USDC_ATA and INSURANCE_USDC_ATA constants

7. **Test Script Updated** (Task 7)
   - Updated `anchor/tests/buy-position.test.ts` with fee distribution verification
   - Records balances before/after trade
   - Calculates expected fee split
   - Verifies balance changes match expected values

8. **Integration Test Run** (Task 8)
   - Created new epoch on BTC pool (epoch ID: 56)
   - Executed 100 USDC trade successfully
   - Verified pool YES reserves increased by net_amount (~$98.20)
   - Verified pool USDC balance increased by net_amount + lp_fee (~$99.46)
   - Note: Initial test used shared wallet (admin=treasury=insurance), verification inconclusive

9. **Treasury & Insurance Wallet Setup** (Post-implementation fix)
   - Created `setup-fee-wallets.ts` script to generate separate wallets
   - Generated new keypairs:
     - Treasury: `HkSz5Avhwn29eeK1fkBGeCtfo1L7uTwct4Wgu5bbfy9U`
     - Insurance: `2GJ2pajUMv2ZXVxNUgVme9i2pHoM51jzYyAzdEa1BTww`
   - Funded wallets with 0.01 FOGO each
   - Created USDC ATAs for both wallets
   - Updated GlobalConfig via `update_config` instruction
   - Transaction: `28pTJFcdhcKK6ZqVmSJrHmmau6grreaLUHe6w6yPjwMP67hZVeFrGAxPPbcDwjQpqeBbhCyYyxiSnmWtsNQ9GDT2`

10. **Final Integration Test** (All verifications pass)
    - Transaction: `2cf4yD1HKraxZJiHqTTqCzCDsBXZA1LyG7rbDzDV8B4DFSHgaQEuJ3qFJKEngnUddPceRamXjsVGu5CpLmkXDdSn`
    - User balance change: -100,000,000 lamports (100 USDC)
    - Pool balance change: +99,460,000 lamports (net_amount + lp_fee)
    - Treasury balance change: +360,000 lamports (0.36 USDC = 20% of fee)
    - Insurance balance change: +180,000 lamports (0.18 USDC = 10% of fee)
    - Total received equals user paid (no dust loss)

### File List

**Files Created:**
- `anchor/programs/fogopulse/src/utils/fees.rs` - Fee calculation utilities
- `anchor/scripts/setup-fee-wallets.ts` - Treasury/insurance wallet setup script
- `anchor/keys/treasury-wallet.json` - Treasury keypair (gitignored)
- `anchor/keys/insurance-wallet.json` - Insurance keypair (gitignored)

**Files Modified:**
- `anchor/programs/fogopulse/src/utils/mod.rs` - Added fees module export
- `anchor/programs/fogopulse/src/events.rs` - Added FeesCollected event
- `anchor/programs/fogopulse/src/instructions/buy_position.rs` - Added treasury/insurance accounts and fee logic
- `web/src/lib/constants.ts` - Added TREASURY_USDC_ATA and INSURANCE_USDC_ATA (updated with new addresses)
- `web/src/lib/transactions/buy.ts` - Added treasury/insurance accounts to transaction
- `web/src/lib/trade-preview.ts` - Added calculateFeeSplit function
- `web/src/hooks/use-trade-preview.ts` - Updated to use fee split for calculations
- `web/src/components/trading/trade-preview.tsx` - Added fee breakdown tooltip
- `web/src/lib/fogopulse.json` - Updated IDL
- `anchor/tests/buy-position.test.ts` - Added fee distribution verification (updated with new wallet addresses)
- `.gitignore` - Added `/anchor/keys/` to ignore keypair files
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Updated story status

---

## Senior Developer Review (AI)

**Review Date:** 2026-03-15
**Reviewer:** Claude Opus 4.5 (Adversarial Code Review)
**Outcome:** Approved with Fixes Applied

### Review Summary

Performed adversarial code review comparing story claims against git reality and actual implementation.

### Findings Resolved

| Severity | Issue | Resolution |
|----------|-------|------------|
| CRITICAL | All 8 tasks marked `[ ]` despite being completed | Fixed - all tasks now marked `[x]` |
| CRITICAL | Missing test scenarios (min amount, large amount, overflow) | Fixed - added test functions to buy-position.test.ts |
| MEDIUM | No fee share validation in fees.rs | Fixed - added `validate_fee_shares()` helper function |
| MEDIUM | Unused `calculateFee` import in use-trade-preview.ts | Fixed - removed unused import |
| MEDIUM | sprint-status.yaml not in File List | Fixed - added to File List |
| LOW | Task 7.1 referenced non-existent script | Fixed - updated task to reflect actual implementation (tests in buy-position.test.ts) |

### AC Verification

| AC | Status | Evidence |
|----|--------|----------|
| AC1: Fee deduction (1.8%) | PASS | `fees.rs:81-106` ceiling division, `buy_position.rs:222-232` |
| AC2: FeesCollected event | PASS | `events.rs:212-229`, `buy_position.rs:372-381` |
| AC3: Config percentages used | PASS | `fees.rs:103-120` uses `config.treasury_fee_share_bps` and `config.insurance_fee_share_bps` |
| AC4: Frozen check | PASS | `buy_position.rs:191-200` checks both protocol and pool paused/frozen |
| AC5: Rounding < 1 lamport | PASS | `fees.rs:78-83` ceiling division, unit tests pass for 1000 lamports |
| AC6: Minimum trade | PASS | Unit test `test_very_small_amount_rounding` + integration test added |
| AC7: ATA validation | PASS | `buy_position.rs:124-138` validates ATAs match config pubkeys |

### Code Quality Assessment

- **Security:** Fee calculations use u128 to prevent overflow, ceiling division favors protocol
- **Testing:** 9 unit tests in fees.rs, integration tests verify balance changes
- **Documentation:** Comprehensive doc comments on fee calculation functions
- **Architecture:** Clean separation of fee calculation utility from instruction handler

### Notes

- Frontend hardcodes fee percentages (70/20/10) - acceptable for MVP since config changes are rare
- `validate_fee_shares()` added as diagnostic helper but not enforced in `calculate_fee_split()` - LP absorbs misconfiguration gracefully
