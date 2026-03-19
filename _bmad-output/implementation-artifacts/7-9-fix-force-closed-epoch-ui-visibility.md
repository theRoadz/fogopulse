# Story 7.9: Fix Force-Closed Epoch Positions Not Showing in UI

Status: done
Created: 2026-03-19
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a trader who had an open position when an epoch was force-closed,
I want to see my position in the UI and claim my refund,
so that I can recover my staked USDC.

## Problem

When an admin force-closes an epoch via `admin_force_close_epoch`, the on-chain epoch state is correctly set to `Refunded`, but **no settlement data is written** — the fields `outcome`, `settlement_price`, `settlement_confidence`, and `settlement_publish_time` all remain `None`.

The UI's epoch discovery function `tryFetchSettledEpoch()` in `web/src/lib/epoch-utils.ts` has two null-guard early returns that silently discard force-closed epochs:

**Bug 1 — Line 80-81:** `parseOutcome(epochAccount.outcome)` returns `null` for force-closed epochs because `outcome` is `None` on-chain. The function then returns `null`, hiding the epoch entirely.

```typescript
const outcome = parseOutcome(epochAccount.outcome)
if (!outcome) return null  // <-- Force-closed epochs are discarded here
```

**Bug 2 — Lines 91-93:** Even if Bug 1 were fixed, the function requires `settlementPrice`, `settlementConfidence`, and `settlementPublishTime` to all be non-null. Force-close sets none of these, so the function returns `null` again.

```typescript
if (settlementPrice === null || settlementConfidence === null || settlementPublishTime === null) {
  return null  // <-- Force-closed epochs are discarded here too
}
```

**Impact:** Force-closed epoch positions are completely invisible in the UI. Users cannot see their trades in settlement history, trading history, or claim their refunds through the UI. The on-chain `claim_refund` instruction works, but there's no UI path to invoke it.

## Root Cause

`tryFetchSettledEpoch()` was written assuming all `Refunded` epochs go through the normal settlement flow (which sets outcome to `Outcome::Refunded` and populates settlement price data). The `admin_force_close_epoch` instruction bypasses settlement entirely — it only sets `epoch.state = Refunded` without populating any settlement fields.

## Design Decisions

1. **Fix in the UI layer, not on-chain.** The on-chain force-close instruction correctly marks the epoch as `Refunded` and leaves settlement fields as `None` (there genuinely was no settlement). The UI should handle this case gracefully rather than requiring fake settlement data on-chain.

2. **Early return branch for Refunded state.** Add a check immediately after the state filter: if `state === EpochState.Refunded`, construct the `LastSettledEpochData` using start prices as display fallback and `Outcome.Refunded` as the outcome. This bypasses the settlement data null checks entirely.

3. **Settlement display shows "REFUNDED" badge.** For force-closed epochs, settlement price fields will be zero/placeholder. The settlement history row and trading history already have Refunded outcome handling — they just never receive the data due to these bugs.

## Acceptance Criteria

1. **Given** a force-closed epoch with user positions, **When** the user views settlement history, **Then** the force-closed epoch appears with "REFUNDED" status
2. **Given** a force-closed epoch with user positions, **When** the user views trading history, **Then** their position appears with "refund" outcome and PnL of 0
3. **Given** a force-closed epoch with an unclaimed position, **When** the user views the epoch details, **Then** a "Claim Refund" button appears showing the full stake amount
4. **Given** a force-closed epoch, **When** the user clicks "Claim Refund", **Then** the `claim_refund` on-chain instruction executes and the user receives their USDC back
5. **Given** a normally-settled Refunded epoch (e.g., price tie), **When** the user views it, **Then** behavior is unchanged (settlement data is still displayed as before)

## Tasks / Subtasks

### Task 1: Fix `tryFetchSettledEpoch` for force-closed epochs (AC: #1-#4)

**File:** `web/src/lib/epoch-utils.ts`

- [x] 1.1: After the state check at line 76-78, added a `hasSettlementData` boolean check followed by an early-return branch for `state === EpochState.Refunded && !hasSettlementData` that constructs display data from start prices with `Outcome.Refunded`, `settlementPrice: 0`, and `rawEpochData.settlementPrice: null`. Normal refunds (with settlement data) fall through to the existing code path.

### Task 2: Verify downstream components handle force-closed data (AC: #2-#5)

- [x] 2.1: **Read** `web/src/hooks/use-claimable-amount.ts` — Verified: refund detection uses `epoch.state === EpochState.Refunded`, works as-is.

- [x] 2.2: **Read** `web/src/hooks/use-trading-history.ts` — **Fixed**: `classifyPosition()` `claimed` branch crashed on force-closed epochs because it assumed `yesTotalAtSettlement` was non-null. Added `else if (settlement.rawEpochData.outcome === Outcome.Refunded)` branch to handle claimed refunds. Also fixed `settlementTime` to use `endTime` as fallback when `settlementPublishTime` is 0.

- [x] 2.3: **Read** `web/src/components/trading/settlement-history-row.tsx` — **Fixed**: Price display showed "$X → $0.00" for force-closed epochs. Added conditional checking `rawEpochData.settlementPrice === null` to show "Force Closed" instead of sentinel `settlementPrice === 0`. Also fixed `formatTimeAgo` to use `endTime` as fallback.

- [x] 2.4: **Read** `web/src/components/trading/claim-button.tsx` — Verified: renders "Claim Refund" button when `claimState.type === 'refund'`, works as-is.

- [x] 2.5: Fixes applied in 2.2 and 2.3.

### Task 3: Build verification (AC: all)

- [x] 3.1: `npm run build` passes with no TypeScript errors
- [x] 3.2: All 35 tests pass (6 new tests added by code review for force-closed code paths)

## Technical Notes

- The `LastSettledEpochData` interface has `settlementPrice: number` (not nullable), so we use `0` as the sentinel value for force-closed epochs. Downstream components should check `rawEpochData.settlementPrice === null` to detect force-closed epochs (not `settlementPrice === 0`, which could false-positive on edge cases).
- The `rawEpochData.outcome` is set to `Outcome.Refunded` even though the on-chain value is `None`. This is correct — the semantic outcome of a force-close IS a refund. The `EpochData` type has `outcome: Outcome | null`, but `use-claimable-amount.ts` checks `epoch.state` not `epoch.outcome` for refund detection.
- Normal settlement-path refunds (price ties) DO have settlement data populated, so the early-return branch correctly falls through to the existing code path for those.
- For force-closed epochs, `endTime` is used as fallback for `settlementTime` in trading history sort order. Note: if an epoch is force-closed before its scheduled end, this may place it slightly out of chronological order since there's no force-close timestamp on-chain.

## Change Log

- **2026-03-19** — Code Review fixes:
  - **H2 fix**: Changed force-closed detection in `settlement-history-row.tsx` from `settlementPrice === 0` sentinel to `rawEpochData.settlementPrice === null` (authoritative signal)
  - **H1 fix**: Added 6 new tests covering force-closed code paths: force-closed epoch in `epoch-utils.test.ts`, claimed-refund + settlementTime fallback in `use-trading-history.test.ts`, Force Closed display + normal refund display + endTime fallback in `settlement-history-row.test.tsx`
  - Updated Task 1.1 description to match actual `hasSettlementData` implementation pattern
  - Updated Task 2.3 to reflect `rawEpochData.settlementPrice === null` check
  - Marked Task 3.2 as complete
