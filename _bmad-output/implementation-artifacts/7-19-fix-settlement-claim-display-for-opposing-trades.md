# Story 7.19: Fix Settlement Claim Display for Opposing Trades

Status: done
Created: 2026-03-22
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a trader,
When I have opposing trades (UP and DOWN) on the same epoch,
I want the won trade to show only "Claim Payout" and the lost trade to show only "Position Lost",
so that each trade row clearly reflects its individual outcome.

## Problem

When a user places both UP and DOWN trades on the same epoch (hedging), the settlement history correctly shows two separate rows. However, expanding either row shows **both** "Claim Payout" and "Position Lost" stacked together. This is because `SettlementStatusPanel` unconditionally renders two `ClaimButton` components (one for each direction) regardless of which trade row it belongs to.

**Current behavior**: Both expanded rows display identical content — "Claim Payout: X USDC" and "Position Lost" — making it impossible to tell which trade won and which lost.

**Expected behavior**: The UP trade row (if it won) should show only "Claim Payout". The DOWN trade row (if it lost) should show only "Position Lost".

### Root Cause

`SettlementStatusPanel` (lines 275-293 of `settlement-status-panel.tsx`) always renders two `ClaimButton` components:

```tsx
<ClaimButton direction="up" ... />
<ClaimButton direction="down" ... />
```

Each `ClaimButton` independently fetches the user's position for its direction and correctly evaluates win/loss. But since both are always rendered, expanding any trade row shows results for **both** directions.

`SettlementHistoryRow` receives a specific `position` prop (with a known direction) from the list, but does not pass this direction to `SettlementStatusPanel`.

## Solution

Pass the trade's direction from `SettlementHistoryRow` into `SettlementStatusPanel`, and conditionally render only the matching `ClaimButton`.

## Acceptance Criteria

1. **Given** a user has opposing trades (UP and DOWN) on the same epoch and the epoch outcome is UP, **When** they expand the UP trade row, **Then** they see only "Claim Payout" (not "Position Lost")
2. **Given** a user has opposing trades (UP and DOWN) on the same epoch and the epoch outcome is UP, **When** they expand the DOWN trade row, **Then** they see only "Position Lost" (not "Claim Payout")
3. **Given** a user has only one trade on an epoch, **When** they expand the row, **Then** behavior is unchanged (shows the correct single result)
4. **Given** the live settlement panel (not from history), **When** it displays, **Then** it still renders both direction buttons as before (no regression)

## Tasks / Subtasks

### Task 1: Add `direction` prop to `SettlementStatusPanel` (AC: #1, #2, #3, #4)

- [x] 1.1: Add optional `direction?: 'up' | 'down'` to `SettlementStatusPanelProps` in `web/src/components/trading/settlement-status-panel.tsx`
- [x] 1.2: When `direction` is provided, render only the `ClaimButton` matching that direction. When omitted, render both (preserving existing behavior for the live settlement panel).

### Task 2: Pass direction from `SettlementHistoryRow` (AC: #1, #2, #3)

- [x] 2.1: In `web/src/components/trading/settlement-history-row.tsx`, pass `direction={position?.direction}` to `SettlementStatusPanel`

### Task 3: Update tests (AC: #1, #2, #3, #4)

- [x] 3.1: Add/update tests in settlement-status-panel tests to verify single ClaimButton renders when direction is provided
- [x] 3.2: Add/update tests in settlement-history-row tests to verify direction is passed through

### Task 4: Fix same bug in Trade History view (AC: #1, #2)

- [x] 4.1: In `web/src/components/trading/trading-history-row.tsx`, pass `direction={entry.direction}` to `SettlementStatusPanel`
- [x] 4.2: Add test in trading-history-row tests to verify direction is passed through

## Dev Notes

### Key files
- `web/src/components/trading/settlement-status-panel.tsx` — lines 76-89 (props), lines 278-299 (ClaimButton rendering)
- `web/src/components/trading/settlement-history-row.tsx` — lines 207-213 (SettlementStatusPanel usage)
- `web/src/components/trading/trading-history-row.tsx` — lines 197-203 (SettlementStatusPanel usage)
- `web/src/components/trading/claim-button.tsx` — already correct per-direction logic
- `web/src/hooks/use-claimable-amount.ts` — `getClaimState()` correctly evaluates direction vs outcome

### Reused components (no changes needed)
- `ClaimButton` — already handles per-direction evaluation correctly
- `SettlementHistoryList` — already splits hedged positions into separate rows correctly

## Dev Agent Record

### Implementation Notes

- Added optional `direction` prop to `SettlementStatusPanel` — when provided, only the matching `ClaimButton` renders; when omitted, both render (preserving live panel behavior)
- Passed `position?.direction` from `SettlementHistoryRow` to `SettlementStatusPanel`
- Passed `entry.direction` from `TradingHistoryRow` to `SettlementStatusPanel`
- Updated `ClaimButton` mock in settlement-status-panel tests to be visible (was returning null) so direction filtering could be tested
- Updated `SettlementStatusPanel` mock in settlement-history-row tests to capture and expose the `direction` prop via `data-direction` attribute
- Added mocks for wallet adapter, claim hook, collapsible, and SettlementStatusPanel in trading-history-row tests
- Added 6 new tests total: 3 for direction filtering in settlement-status-panel, 2 for direction pass-through in settlement-history-row, 1 for direction pass-through in trading-history-row
- All 40 tests pass across 3 test files

### Decisions

- Made `direction` prop optional to avoid breaking the live settlement panel on the trade page, which should continue showing both directions
- When `position` is null (no wallet connected), `direction` is undefined, so both ClaimButtons render — this is correct since unauthenticated users see the full epoch info

## File List

- `web/src/components/trading/settlement-status-panel.tsx`
- `web/src/components/trading/settlement-history-row.tsx`
- `web/src/components/trading/trading-history-row.tsx`
- `web/src/components/trading/settlement-status-panel.test.tsx`
- `web/src/components/trading/settlement-history-row.test.tsx`
- `web/src/components/trading/trading-history-row.test.tsx`
