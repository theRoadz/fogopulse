# Story 7.29: Fix settle_epoch Rebalancing Reserve Disappearance Bug

Status: done
Created: 2026-03-24
Epic: 7 - Platform Polish & UX
Sprint: Current
Priority: CRITICAL — Financial Security (Fund Loss)

## Story

As a liquidity provider,
I want epoch settlement to preserve the full pool value,
so that pending withdrawals do not cause funds to vanish from the pool.

## Problem

**Severity: CRITICAL — Direct fund loss for ALL LPs**

The `settle_epoch` instruction's rebalancing logic subtracts the USDC value of pending withdrawal shares from total reserves before rebalancing, but **never writes the reserved amount back** — the funds simply vanish from pool accounting.

### Reproduction Scenario (Confirmed)

1. **Wallet A deposits 10,000 USDC** → gets 10,000,000,000 shares
2. **Wallet B deposits 10,000 USDC** → gets 10,000,000,000 shares
3. **Pool state:** TVL=$20,000, total_lp_shares=20B, yes_reserves=10,000, no_reserves=10,000
4. **Epoch starts**
5. **Wallet B requests withdrawal** → pending_withdrawal_shares=10B
6. **No trades occur during epoch**
7. **Epoch settles** — rebalancing runs:

```
total_reserves = 10,000 + 10,000 = 20,000
reserved_usdc  = (10B pending * 20,000) / 20B total = 10,000
available_for_epoch = 20,000 - 10,000 = 10,000
balanced_amount = 10,000 / 2 = 5,000

pool.yes_reserves = 5,000   ← WAS 10,000
pool.no_reserves  = 5,000   ← WAS 10,000
Total in reserves = 10,000  ← WAS 20,000
                              $10,000 VANISHED
```

8. **After settlement:**
   - Wallet A: share_value = (10B * 10,000) / 20B = **$5,000** (lost $5,000)
   - Wallet B withdrawal: usdc_out = (10B * 10,000) / 20B = **$5,000** (lost $5,000)
   - Earnings shown: **-$5,000** for remaining LP

### Root Cause

**File:** `anchor/programs/fogopulse/src/instructions/settle_epoch.rs` (lines 280-301)

```rust
// Line 282-290: Calculate USDC value reserved for pending withdrawals
let reserved_usdc = if pool.total_lp_shares > 0 && pool.pending_withdrawal_shares > 0 {
    (pool.pending_withdrawal_shares as u128)
        .checked_mul(total_reserves as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(pool.total_lp_shares as u128)
        .ok_or(FogoPulseError::Overflow)? as u64
} else {
    0u64
};

// Line 292-293: Subtract reserved from total
let available_for_epoch = total_reserves.saturating_sub(reserved_usdc);

// Line 295-301: Rebalance ONLY the remainder — reserved_usdc is LOST
let balanced_amount = available_for_epoch / 2;
let remainder = available_for_epoch % 2;
pool.yes_reserves = balanced_amount.checked_add(remainder)?;
pool.no_reserves = balanced_amount;
```

The code:
1. Computes `reserved_usdc` (the proportional USDC value of pending withdrawal shares)
2. Subtracts it from `total_reserves` to get `available_for_epoch`
3. Rebalances only `available_for_epoch` into `yes_reserves` and `no_reserves`
4. **`reserved_usdc` is never written to any field** — it simply disappears

### Impact

- **All remaining LPs** lose proportional value equal to the withdrawn share percentage
- **Withdrawing LPs** also receive less than their shares are worth
- **Total loss** = `reserved_usdc` amount (100% of the reserved value vanishes)
- Loss scales with pending withdrawal size — 50% pending = 50% of TVL lost
- Only triggers when withdrawals are pending during an active epoch
- Without an active epoch, withdrawals process correctly (no settlement rebalancing)

### Impact Table

| Pending Shares % | TVL=$20,000 | Amount Lost |
|-------------------|-------------|-------------|
| 25%               | $20,000     | $5,000      |
| 50%               | $20,000     | $10,000     |
| 75%               | $20,000     | $15,000     |
| 100%              | $20,000     | $20,000     |

### Why This Only Happens During Epochs

- Without an active epoch: `process_withdrawal` runs directly, calculates `usdc_out` from full reserves. Correct.
- With an active epoch: `process_withdrawal` is blocked (`pool.active_epoch.is_none()` check). Withdrawal is queued as pending. When epoch settles, the buggy rebalancing destroys the reserved value. When withdrawal finally processes post-settlement, reserves are already wrong.

### Relationship to Story 7.27 (Deposit Dilution)

This is a **separate, independent bug**. Story 7.27 addresses deposit dilution (deposits during active epochs entering reserves). This story addresses the settlement rebalancing destroying reserved withdrawal value. The two bugs can be fixed independently. Story 7.27's note that `settle_epoch.rs` needs no changes is incorrect given this bug.

## Solution

**Remove the reservation logic entirely.** Rebalance the full `total_reserves` to 50/50.

### Why Reservation Is Unnecessary

`process_withdrawal` and `crank_process_withdrawal` both:
1. Require `pool.active_epoch.is_none()` — only execute between epochs, after rebalancing
2. Calculate `usdc_out = pending_shares * (yes_reserves + no_reserves) / total_lp_shares`
3. Reduce reserves 50/50 proportionally

The withdrawal payout calculation already handles the math correctly from total reserves. There is no need to "reserve" funds during rebalancing — the shares-to-value ratio is maintained as long as total reserves are preserved.

### Safety Proof (All Scenarios)

**Scenario A: 50% pending, no trades (exact repro)**
- Before: yes=10,000, no=10,000, total_shares=20B, pending=10B
- Fixed rebalance: yes=10,000, no=10,000 (already balanced)
- Withdrawal: (10B * 20,000) / 20B = 10,000 USDC. Correct.
- Remaining LP: (10B * 10,000) / 10B = 10,000. Correct.

**Scenario B: 25% pending, trades happened**
- Before: yes=15,000, no=5,000, total_shares=20B, pending=5B
- Fixed rebalance: yes=10,000, no=10,000
- Withdrawal: (5B * 20,000) / 20B = 5,000. Correct.
- Remaining LP: (15B * 15,000) / 15B = 15,000. Correct.

**Scenario C: 100% pending**
- Before: yes=12,000, no=8,000, total_shares=20B, pending=20B
- Fixed rebalance: yes=10,000, no=10,000
- Withdrawals process: total of 20,000 distributed. Correct.

**Scenario D: Trades + partial withdrawal**
- Before: yes=4,000, no=1,000 (trades shifted reserves), total_shares=5B, pending=2B
- Fixed rebalance: yes=2,500, no=2,500
- Withdrawal: (2B * 5,000) / 5B = 2,000. Correct.
- Remaining: (3B * 3,000) / 3B = 3,000. Correct.

## Acceptance Criteria

1. **AC1:** Given pending withdrawals exist during an active epoch, when the epoch settles, then `yes_reserves + no_reserves` after settlement equals `yes_reserves + no_reserves` before settlement (total liquidity conserved)
2. **AC2:** Given the exact reproduction scenario (2 wallets, 10K each, one withdraws during epoch, no trades), when settlement completes and withdrawal processes, then the withdrawing wallet receives 10,000 USDC and the remaining wallet shows share_value = $10,000
3. **AC3:** Given an epoch with trades AND pending withdrawals, when settlement rebalances to 50/50, then total reserves are preserved and withdrawal payouts are correct
4. **AC4:** Given 100% of shares are pending withdrawal, when epoch settles, then full TVL is preserved in reserves for withdrawal processing
5. **AC5:** All existing settle-epoch tests continue to pass (no regression)

## Tasks / Subtasks

- [x] Task 1: Fix settle_epoch rebalancing — remove reservation logic (AC: #1, #2, #3, #4)
  - [x] 1.1: In `anchor/programs/fogopulse/src/instructions/settle_epoch.rs`, **deleted lines 280-293** (the `reserved_usdc` calculation and `available_for_epoch` subtraction)
  - [x] 1.2: Replaced lines 295-296 to rebalance full `total_reserves` instead of `available_for_epoch`:
    ```rust
    let balanced_amount = total_reserves / 2;
    let remainder = total_reserves % 2;
    ```
  - [x] 1.3: Lines 298-301 remain unchanged (they write `pool.yes_reserves` and `pool.no_reserves`)

- [x] Task 2: Build and verify compilation (AC: #5)
  - [x] 2.1: Build program in WSL: `cd /mnt/d/dev/fogopulse/anchor && anchor build`
  - [x] 2.2: Verify no compilation errors

- [x] Task 3: Update Story 7.27 reference (AC: documentation)
  - [x] 3.1: In `_bmad-output/implementation-artifacts/7-27-fix-deposit-dilution-vulnerability.md`, updated "Files that need NO changes" section to note that `settle_epoch.rs` was fixed by Story 7.29

- [ ] Task 4: Regression test — offline math verification (AC: #1, #2, #3, #4)
  - [x] 4.1: Create `anchor/tests/settle-epoch-rebalance-regression.test.ts` with 7 test scenarios
  - [x] 4.2: Verify buggy code loses funds in all pending withdrawal scenarios
  - [x] 4.3: Verify fixed code preserves total reserves in all scenarios
  - [x] 4.4: Verify withdrawal payouts are correct post-fix
  - [x] 4.5: All 7 tests pass: `npx tsx tests/settle-epoch-rebalance-regression.test.ts`

## Dev Notes

### The complete fix (settle_epoch.rs lines 275-301)

**Before (buggy):**
```rust
let total_reserves = pool
    .yes_reserves
    .checked_add(pool.no_reserves)
    .ok_or(FogoPulseError::Overflow)?;

// Reserve pending withdrawal amount before rebalancing
// Compute USDC value dynamically from shares to avoid drift
let reserved_usdc = if pool.total_lp_shares > 0 && pool.pending_withdrawal_shares > 0 {
    (pool.pending_withdrawal_shares as u128)
        .checked_mul(total_reserves as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(pool.total_lp_shares as u128)
        .ok_or(FogoPulseError::Overflow)? as u64
} else {
    0u64
};

let available_for_epoch = total_reserves
    .saturating_sub(reserved_usdc);

let balanced_amount = available_for_epoch / 2;
let remainder = available_for_epoch % 2;

pool.yes_reserves = balanced_amount
    .checked_add(remainder)
    .ok_or(FogoPulseError::Overflow)?;
pool.no_reserves = balanced_amount;
```

**After (fixed):**
```rust
let total_reserves = pool
    .yes_reserves
    .checked_add(pool.no_reserves)
    .ok_or(FogoPulseError::Overflow)?;

let balanced_amount = total_reserves / 2;
let remainder = total_reserves % 2;

pool.yes_reserves = balanced_amount
    .checked_add(remainder)
    .ok_or(FogoPulseError::Overflow)?;
pool.no_reserves = balanced_amount;
```

### Key files

| File | Action | Description |
|------|--------|-------------|
| `anchor/programs/fogopulse/src/instructions/settle_epoch.rs` | **MODIFY** | Remove reservation logic (lines 280-293), simplify rebalancing |

### Files verified safe (no changes needed)

- `process_withdrawal.rs` — uses `yes_reserves + no_reserves` for `pool_value`, correct
- `crank_process_withdrawal.rs` — identical withdrawal logic, correct
- `request_withdrawal.rs` — only marks shares as pending, no reserve math
- `deposit_liquidity.rs` — separate concern (Story 7.27)
- `buy_position.rs` / `sell_position.rs` — trade against reserves during epoch, unaffected
- `claim_payout.rs` — uses settlement snapshots (`yes_total_at_settlement`), not reserves
- `claim_refund.rs` — returns original stake, unaffected
- Events (`PoolRebalanced`) — uses `yes_reserves_before/no_reserves_before` captured before fix area, and current reserves after. No references to removed variables.

### Code references

- `settle_epoch.rs` lines 261-262: Settlement snapshots captured BEFORE rebalancing (unaffected)
- `settle_epoch.rs` lines 272-273: `yes_reserves_before`/`no_reserves_before` for event (unaffected)
- `settle_epoch.rs` lines 275-279: `total_reserves` calculation (kept as-is)
- `settle_epoch.rs` lines 280-293: **BUG — DELETE THESE LINES**
- `settle_epoch.rs` lines 295-301: Rebalancing — change to use `total_reserves` directly
- `settle_epoch.rs` lines 345-352: `PoolRebalanced` event emission (unaffected)
- `process_withdrawal.rs` lines 131-135: `active_epoch.is_none()` guard (ensures withdrawal only post-settlement)
- `process_withdrawal.rs` lines 150-162: Withdrawal payout calculation (uses total reserves, correct)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context) — code review + auto-fix

### Implementation Notes
- Task 1 implemented: Removed `reserved_usdc` calculation and `available_for_epoch` subtraction (12 lines deleted), replaced with direct `total_reserves` rebalancing
- Task 3 implemented: Updated Story 7.27 cross-reference
- Task 2 pending: WSL anchor build required for compilation verification
- Code review improved comment to reference Story 7.29 for future maintainability

## File List

| File | Action | Description |
|------|--------|-------------|
| `anchor/programs/fogopulse/src/instructions/settle_epoch.rs` | **MODIFIED** | Removed reservation logic (lines 280-293), simplified rebalancing to use full `total_reserves` |
| `_bmad-output/implementation-artifacts/7-27-fix-deposit-dilution-vulnerability.md` | **MODIFIED** | Added Story 7.29 cross-reference to "Files that need NO changes" section |
| `anchor/tests/settle-epoch-rebalance-regression.test.ts` | **CREATED** | Offline math regression test — 7 scenarios verifying buggy vs fixed rebalancing |

## Change Log

- **2026-03-24**: Story created — documenting settle_epoch reserve disappearance bug and fix
- **2026-03-24**: Code review (Claude Opus 4.6) — Task 1 verified implemented, Task 3 completed, comment improved with Story 7.29 reference. 6 findings: 2 HIGH (fixed), 3 MEDIUM (2 fixed, 1 noted), 1 LOW (noted)
- **2026-03-24**: Build verified successful (anchor build). All tasks complete. Status → done
- **2026-03-24**: Added offline math regression test (7 scenarios, all pass). Proves buggy code lost funds and fixed code preserves them
