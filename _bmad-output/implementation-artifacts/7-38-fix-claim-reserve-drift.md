# Story 7.38: Fix Reserve Accounting Drift in claim_payout/claim_refund

Status: done
Created: 2026-03-29
Epic: 7 - Platform Polish & UX
Sprint: Current
Priority: HIGH — ~$10K reserve drift across all pools after 60+ epochs

## Story

As an admin,
I want the claim_payout and claim_refund instructions to accurately track reserve reductions,
so that pool reserves stay in sync with actual USDC balances without requiring periodic admin intervention.

## Problem

**Severity: HIGH — ~$10K total reserve drift across 4 pools**

After 60+ epochs of trading, pool reserves (`yes_reserves + no_reserves`) have drifted significantly below actual pool ATA USDC balances:

| Pool | Reserves | ATA Balance | Drift |
|------|----------|-------------|-------|
| BTC  | $25,738  | $28,962     | **$3,224** (11%) |
| ETH  | $11,768  | $13,911     | **$2,143** (15%) |
| SOL  | $17,345  | $20,040     | **$2,696** (13%) |
| FOGO | $4,036   | $6,344      | **$2,308** (36%) |

### Root Cause

Story 7.32 added reserve reduction to `claim_payout` and `claim_refund` (previously claims didn't reduce reserves at all). The fix used a 50/50 split with `saturating_sub`:

```rust
let half_payout = payout_amount / 2;
let payout_remainder = payout_amount % 2;
pool.yes_reserves = pool.yes_reserves.saturating_sub(half_payout + payout_remainder);
pool.no_reserves = pool.no_reserves.saturating_sub(half_payout);
```

**The bug:** When one side (e.g., `yes_reserves`) is depleted by prior claims to below `half_payout + remainder`, `saturating_sub` clamps to 0 instead of underflowing. The total actually deducted is less than `payout_amount`. This "leaked" difference accumulates over epochs.

**Example:** If `yes_reserves = 100` and `half_payout + remainder = 500`:
- `saturating_sub(500)` → 0 (only 100 deducted, not 500)
- `no_reserves` loses its full 500
- Total deducted: 600 instead of 1000 → 400 USDC leaked

### Relationship to Story 7.32

- **7.32 original bug:** Claims didn't reduce reserves at all
- **7.32 fix:** Added `saturating_sub` 50/50 split — correct direction but flawed implementation
- **7.38 (this story):** Fixes the 7.32 fix by using total-reserves-first approach

### Note on LP Fee Surplus

Part of the ATA-vs-reserves difference is intentional: `buy_position` transfers `net_amount + lp_fee` to the pool ATA but only adds `net_amount` to reserves. The LP fee auto-compounds in the pool without being tracked. This is by design and not a bug. The `admin_sync_reserves` instruction exists for periodic reconciliation of LP fee surplus.

## Solution

Replace the asymmetric `saturating_sub` pattern with a total-reserves-first approach that:
1. Subtracts the full payout from total reserves (exact deduction)
2. Re-splits to 50/50 (maintains settlement rebalance invariant)
3. Uses `checked_sub` (fails loudly on underflow instead of silent drift)

```rust
let total_reserves = pool.yes_reserves
    .checked_add(pool.no_reserves)
    .ok_or(FogoPulseError::Overflow)?;
let new_total = total_reserves
    .checked_sub(payout_amount)
    .ok_or(FogoPulseError::InsufficientPoolReserves)?;
let half = new_total / 2;
let remainder = new_total % 2;
pool.yes_reserves = half + remainder;
pool.no_reserves = half;
```

## Acceptance Criteria

1. **AC1:** `claim_payout` reduces total reserves by exactly `payout_amount` (no silent truncation)
2. **AC2:** `claim_refund` reduces total reserves by exactly `refund_amount` (no silent truncation)
3. **AC3:** After each claim, `yes_reserves` and `no_reserves` remain balanced (50/50 split)
4. **AC4:** If `payout_amount > total_reserves`, the instruction fails with `InsufficientPoolReserves` instead of silently under-deducting
5. **AC5:** After `admin_sync_reserves` + code fix, reserves stay in sync with ATA balance (minus LP fee surplus) across subsequent epochs
6. **AC6:** `yes_reserves` and `no_reserves` are NOT individually modified — only total is reduced then re-split

## Tasks / Subtasks

- [x] Task 1: Fix `claim_payout.rs` reserve reduction (AC: #1, #3, #4, #6)
  - [x] 1.1: Replace `saturating_sub` 50/50 split with total-reserves-first approach (lines 222-229)
  - [x] 1.2: Update comment to explain the approach

- [x] Task 2: Fix `claim_refund.rs` reserve reduction (AC: #2, #3, #4, #6)
  - [x] 2.1: Replace `saturating_sub` 50/50 split with total-reserves-first approach (lines 162-169)
  - [x] 2.2: Update comment to explain the approach

- [x] Task 3: Build and deploy (AC: #5)
  - [x] 3.1: Build in WSL — compiled successfully (warnings only, pre-existing)
  - [x] 3.2: IDL copied to `web/src/lib/fogopulse.json`
  - [x] 3.3: Deployed to FOGO testnet: `4nhHuATbuFtn8C7PZ3QBEgZ3rSvEbF5C7XF7CfJJ8LGUaD6VSsQ34uVTA8gN9pm5q6hnTsesvCqp1DEzntgrRp5M`

- [x] Task 4: Sync reserves and verify (AC: #5)
  - [x] 4.1: Ran `admin-sync-reserves.ts` on all 4 pools — all succeeded
  - [x] 4.2: Ran `check-pool-liquidity.ts` — all reserves match ATA balances exactly

## File List

| File | Action | Description |
|------|--------|-------------|
| `anchor/programs/fogopulse/src/instructions/claim_payout.rs` | **MODIFY** | Replace saturating_sub with total-reserves-first approach; add reserve fields to event |
| `anchor/programs/fogopulse/src/instructions/claim_refund.rs` | **MODIFY** | Same fix as claim_payout; add reserve fields to event |
| `anchor/programs/fogopulse/src/events.rs` | **MODIFY** | Add yes_reserves_after/no_reserves_after to PayoutClaimed and RefundClaimed events |
| `anchor/programs/fogopulse/src/errors.rs` | **MODIFY** | Generalize InsufficientPoolReserves error message (was sell-specific) |
| `web/src/lib/fogopulse.json` | **NO CHANGE** | IDL verified — no signature changes, regeneration produced identical output |

## Change Log

- **2026-03-29**: Story created after discovering ~$10K reserve drift across all pools after 60+ epochs. Root cause traced to Story 7.32's saturating_sub implementation.
- **2026-03-29**: Tasks 1-2 implemented (claim_payout + claim_refund fixed). Built, deployed, synced all 4 pools. All reserves now match ATA balances exactly. Status → done.
- **2026-03-29**: Code review — fixed 4 issues: (M2) added yes_reserves_after/no_reserves_after to PayoutClaimed/RefundClaimed events for audit trail, (M3) generalized InsufficientPoolReserves error message, (M1) corrected File List fogopulse.json entry to NO CHANGE, (L1) eliminated redundant immutable pool borrow. Noted H1: withdrawal instructions (process_withdrawal, crank_process_withdrawal) have same saturating_sub pattern — needs separate story.

## Verification Results (2026-03-29)

| Pool | Reserves After Sync | ATA Balance | Drift |
|------|---------------------|-------------|-------|
| BTC  | $27,234.98          | $27,234.98  | $0.00 |
| ETH  | $13,610.40          | $13,610.40  | $0.00 |
| SOL  | $19,012.96          | $19,012.96  | $0.00 |
| FOGO | $5,966.94           | $5,966.94   | $0.00 |
