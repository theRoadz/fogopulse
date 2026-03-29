# Story 7.37: Admin Normalize LP Shares — Fix u64 Overflow Risk

Status: done
Created: 2026-03-29
Epic: 7 - Platform Polish & UX
Sprint: Current
Priority: HIGH — LP shares approaching u64 overflow, ETH pool max deposit capped at ~$7K

## Story

As an admin,
I want to normalize inflated LP shares across all pools to sane values,
so that deposits don't fail with arithmetic overflow and the share-to-USDC ratio remains functional.

## Problem

**Severity: HIGH — ETH pool deposits over ~$7,116 will overflow u64 and fail**

LP shares across all testnet pools are massively inflated (quintillions of shares for tens of thousands of dollars in reserves). This makes each LP share worth ~$0.000000002 instead of a sane ratio.

### Root Cause

1. Large initial deposits created shares at 1:1 ratio (1 USDC lamport = 1 share)
2. **Pre-7.32 bug:** `claim_payout`/`claim_refund` drained USDC from pool vaults without reducing `yes_reserves`/`no_reserves`. Story 7.32 fixed this with `saturating_sub`, which correctly clamped reserves to near-zero — but LP shares were never reduced (claims don't touch LP shares)
3. **`admin_sync_reserves`** (Story 7.32) restored reserves to match actual USDC balances, but there was no mechanism to reduce the inflated `total_lp_shares` or individual `lp_share.shares`
4. Result: pools have ~$15K-$45K reserves but ~10-15 quintillion LP shares

### Current Pool State (2026-03-29)

| Pool | Reserves | total_lp_shares | 1 Share Value | Max Deposit Before u64 Overflow |
|------|----------|-----------------|---------------|-------------------------------|
| BTC  | $29,461  | 9.83e18         | $0.000000003  | **$25,817** |
| ETH  | $26,766  | 14.57e18        | $0.000000002  | **$7,116** |
| SOL  | $27,524  | 12.09e18        | $0.000000002  | **$14,475** |
| FOGO | $45,391  | 12.34e18        | $0.000000004  | **$22,489** |

u64 max: 18,446,744,073,709,551,615 (~1.84e19)

### Why Deposits Overflow

The deposit share calculation in `deposit_liquidity.rs:166-170`:
```rust
shares_minted = (amount as u128)
    .checked_mul(pool.total_lp_shares as u128)?
    .checked_div(pool_value as u128)? as u64;
```

The u128 intermediate handles the multiplication, but the result is cast back to u64. When `shares_minted` is added to `pool.total_lp_shares` via `checked_add` (line 214), it overflows u64 if the sum exceeds ~1.84e19.

For ETH pool: a $7,116 deposit produces ~5.44e15 new shares. Added to existing 14.57e18 → ~15.12e18, which is under u64 max. But a $7,117 deposit pushes past the limit → `Overflow` error.

### LP Share Account Inventory

Only **9 LP share accounts** exist across all 4 pools:

| Pool | LP Accounts | Largest Account Shares |
|------|-------------|----------------------|
| BTC  | 2           | 9.83e18 (100%) |
| ETH  | 2           | 14.57e18 (99.998%) |
| SOL  | 3           | 12.09e18 (99.997%) |
| FOGO | 2           | 8.15e18 (66.1%) |

### No Mainnet Impact

This is testnet-only. On mainnet, the 7.32 fix would prevent reserve drift from accumulating. However, having a normalization tool is good insurance.

## Solution

### New on-chain instruction: `admin_normalize_lp_shares`

Admin-only instruction that takes a pool + lp_share + divisor. Divides the individual LP share's shares by the divisor and reduces the pool's total by the corresponding amount.

**Design:** Call once per LP share account per pool. Each call correctly adjusts both the individual `lp_share.shares` and `pool.total_lp_shares`. After processing all LP shares for a pool, shares are normalized.

**Target ratio:** 1 share ≈ 1 USDC lamport (same as initial 1:1 bootstrap ratio). Divisor = `total_lp_shares / pool_reserve_value`.

### Admin script: `admin-normalize-lp-shares.ts`

Automates the process:
1. For each pool: calculate divisor, find all LP share PDAs
2. Call `admin_normalize_lp_shares(divisor)` for each LP share
3. Verify final `pool.total_lp_shares ≈ pool_reserve_value`

## Acceptance Criteria

1. **AC1:** After normalization, `pool.total_lp_shares` approximately equals `yes_reserves + no_reserves` (target: 1 share ≈ 1 USDC lamport)
2. **AC2:** Each LP's proportional ownership is preserved: `lp_share.shares / total_lp_shares` ratio is identical (within rounding) before and after
3. **AC3:** `pool.yes_reserves` and `pool.no_reserves` are NOT modified (only share counts change)
4. **AC4:** `pending_withdrawal` shares on LP accounts are also normalized by the same divisor
5. **AC5:** `pool.pending_withdrawal_shares` is reduced by the corresponding amount
6. **AC6:** Deposits that previously overflowed (e.g., $10K on ETH) now succeed
7. **AC7:** Instruction is admin-only, blocked during active epoch and when frozen
8. **AC8:** Instruction rejects divisor ≤ 1 (prevent no-op or multiply)

## Tasks / Subtasks

- [x] Task 1: Create `admin_normalize_lp_shares.rs` instruction (AC: #1-#5, #7, #8)
  - [x] 1.1: Create `anchor/programs/fogopulse/src/instructions/admin_normalize_lp_shares.rs`
  - [x] 1.2: Define `AdminNormalizeLpShares` accounts struct:
    - `admin` (signer, mut) — must match GlobalConfig.admin
    - `global_config` — has_one = admin, !frozen
    - `pool` (mut) — seeds validated, !frozen
    - `lp_share` (mut) — constraint: `lp_share.pool == pool.key()`
  - [x] 1.3: Implement handler with args `divisor: u64`:
    - Require `divisor > 1`
    - Require `pool.active_epoch.is_none()`
    - Calculate `old_shares = lp_share.shares`
    - Calculate `new_shares = old_shares / divisor`
    - Calculate `shares_reduction = old_shares - new_shares`
    - Set `lp_share.shares = new_shares`
    - Reduce `pool.total_lp_shares` by `shares_reduction` (saturating_sub)
    - If `lp_share.pending_withdrawal > 0`:
      - `old_pending = lp_share.pending_withdrawal`
      - `new_pending = old_pending / divisor`
      - `pending_reduction = old_pending - new_pending`
      - `lp_share.pending_withdrawal = new_pending`
      - `pool.pending_withdrawal_shares = pool.pending_withdrawal_shares.saturating_sub(pending_reduction)`
    - Log before/after values

- [x] Task 2: Register instruction (AC: #7)
  - [x] 2.1: Add `pub mod admin_normalize_lp_shares;` and `pub use admin_normalize_lp_shares::*;` to `mod.rs`
  - [x] 2.2: Add instruction entry in lib.rs admin section

- [x] Task 3: Build and deploy (AC: #6)
  - [x] 3.1: Build in WSL — compiled successfully (warnings only, pre-existing)
  - [x] 3.2: IDL copied to `web/src/lib/fogopulse.json`
  - [x] 3.3: Deployed to FOGO testnet: `47oCXF2ej22nmohmJibcNf5fXp5X6zye3EHGCbBk3Eu5Sspm5swFyqB2cM5zU7UH6MPebEwzq5sZyNE4xXttmeSt`

- [x] Task 4: Create admin script (AC: #1, #2, #6)
  - [x] 4.1: Created `anchor/scripts/admin-normalize-lp-shares.ts`
  - [x] 4.2: Script reads pool state, calculates divisor, finds LP shares, calls instruction per account
  - [x] 4.3: Prints before/after verification with reserves and ratio

- [x] Task 5: Run normalization and verify (AC: #1, #2, #3, #6)
  - [x] 5.1: No active epochs — ran without pause
  - [x] 5.2: Ran `npx tsx scripts/admin-normalize-lp-shares.ts` — all 9 LP shares across 4 pools normalized
  - [x] 5.3: `check-pool-liquidity.ts` confirms reserves unchanged, ATA balances match
  - [x] 5.4: Protocol not paused (no active epochs during normalization)
  - [x] 5.5: Max deposit headroom now ~$18.4 trillion (effectively unlimited)
  - [x] 5.6: LP share proportions preserved — each pool's total_lp_shares ≈ pool_value

## File List

| File | Action | Description |
|------|--------|-------------|
| `anchor/programs/fogopulse/src/instructions/admin_normalize_lp_shares.rs` | **CREATE** | New admin instruction to normalize LP shares |
| `anchor/programs/fogopulse/src/instructions/mod.rs` | **MODIFY** | Register module + re-export |
| `anchor/programs/fogopulse/src/lib.rs` | **MODIFY** | Add instruction entry point |
| `anchor/scripts/admin-normalize-lp-shares.ts` | **CREATE** | Script to run normalization on all pools |
| `web/src/lib/fogopulse.json` | **REGENERATE** | Updated IDL with new instruction |

## Design Notes

### Why per-LP-share calls instead of a single pool-wide reset?

A single instruction that resets `pool.total_lp_shares` and all LP shares at once would require passing all LP share accounts in a single transaction. Solana has account limits per transaction (~64). With only 9 LP share accounts this could work, but the per-account approach is more future-proof and follows the existing `admin_sync_reserves` pattern.

### Why divisor instead of target value?

A divisor is simpler and preserves proportional ownership exactly (integer division rounding aside). Each LP's share count is divided by the same number, so `lp_share.shares / total_lp_shares` remains constant.

### Rounding behavior

Integer division rounds down. After normalizing all LP shares, `pool.total_lp_shares` may be slightly less than the sum of all `lp_share.shares` due to rounding at each step. This is acceptable — the discrepancy is at most `n_accounts` lamports (9 lamports). The `saturating_sub` pattern handles this safely.

### deposited_amount field

`lp_share.deposited_amount` tracks cumulative USDC deposited for display purposes only (not used in share calculations). We do NOT normalize this field — it should continue to reflect actual USDC deposited. Shares are the unit of ownership; deposited_amount is historical tracking.

### Relationship to Story 7.32

This story is a cleanup consequence of the reserve drift fixed in Story 7.32. The 7.32 fix (`saturating_sub` on claims) prevented future drift, and `admin_sync_reserves` fixed reserves. This story completes the cleanup by normalizing the inflated share counts that `admin_sync_reserves` couldn't address.

## Normalization Results (2026-03-29)

| Pool | Divisor | Shares Before | Shares After | Reserves | 1 Share Value | Max Deposit |
|------|---------|---------------|--------------|----------|---------------|-------------|
| BTC  | 333,709,818 | 9.83e18 | 29,461,262,566 | $29,461 | $0.000001 | ~$18.4T |
| ETH  | 544,449,482 | 14.57e18 | 26,765,552,726 | $26,766 | $0.000001 | ~$18.4T |
| SOL  | 439,214,167 | 12.09e18 | 27,524,202,473 | $27,524 | $0.000001 | ~$18.4T |
| FOGO | 271,755,016 | 12.34e18 | 45,390,973,194 | $45,391 | $0.000001 | ~$18.4T |

All reserves unchanged. All ATA balances match. LP proportional ownership preserved.

## Senior Developer Review (AI)

**Reviewer:** theRoad (adversarial code review)
**Date:** 2026-03-29
**Outcome:** Changes Requested → Fixed

### Findings (7 total: 2 High, 3 Medium, 2 Low)

#### Fixed Issues

- **H1 [FIXED]:** `new_shares` could be zero if `divisor > old_shares`, silently destroying LP positions. Added `require!(new_shares > 0, FogoPulseError::DivisorTooLarge)` guard in handler.
- **H2 [FIXED]:** Used misleading `FogoPulseError::ZeroAmount` for divisor validation. Added dedicated `InvalidDivisor` and `DivisorTooLarge` error variants to `errors.rs`.
- **M1 [FIXED]:** Script LP share discovery used only `dataSize` filter with no struct reference comment. Added layout comment documenting the size derivation and struct field offsets.
- **M2 [FIXED]:** Script fetched all LpShare accounts across all pools then filtered client-side. Added server-side `memcmp` filter on pool field (offset 40) to `getProgramAccounts`.

#### Accepted Issues (Low severity)

- **L1:** `decodePool` offset arithmetic in script is fragile if Pool struct changes. Acceptable for one-time admin utility.
- **L2:** `saturating_sub` on `pool.total_lp_shares` silently handles rounding drift. Documented and acceptable per Design Notes.
- **L3:** Script idempotency skip message `"shares already normalized (divisor=1)"` could be clearer. Minor UX.

### Files Modified by Review

| File | Change |
|------|--------|
| `anchor/programs/fogopulse/src/errors.rs` | Added `InvalidDivisor`, `DivisorTooLarge` variants |
| `anchor/programs/fogopulse/src/instructions/admin_normalize_lp_shares.rs` | Added zero-shares guard, fixed error variant |
| `anchor/scripts/admin-normalize-lp-shares.ts` | Added server-side pool memcmp filter, layout comments |

## Change Log

- **2026-03-29**: Story created after discovering LP share inflation during deposit failure investigation. ETH pool max deposit capped at ~$7K before u64 overflow.
- **2026-03-29**: Tasks 1-4 implemented. Instruction created, registered, built, deployed. Script created.
- **2026-03-29**: Task 5 — Ran normalization on all 4 pools (9 LP share accounts). All shares normalized to 1:1 ratio. Max deposit headroom now ~$18.4T. Status → done.
- **2026-03-29**: Code review — Fixed 4 issues (2 High, 2 Medium). Added divisor guard, proper error variants, server-side LP share filtering.
- **2026-03-29**: Rebuilt and redeployed to FOGO testnet. IDL updated. TX: `5wjfyCJVFV2b1AjH5wx9pRktgSeaHAc67ArdhGhWFwivXsYY1KjGJrceS5Hm5AUe7QCDTc2oHLJWEsJBXT4zunRz`. Status → done.
