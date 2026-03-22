# Story 7.17: Fix Cross-Market Data Bleed on Asset Switch

Status: done
Created: 2026-03-22
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a trader,
I want each market page to show only that market's data,
so that I don't see stale BTC settlement data when viewing ETH or SOL.

## Problem

When switching from BTC/USD (which has settled epochs and history) to ETH/USD or SOL/USD (which don't have any yet), BTC's data bleeds through and appears under the wrong market. Specifically:

1. **Last Settled Epoch** section shows BTC's settlement details under ETH
2. **Settlement History** list shows BTC's history entries under ETH
3. **Trading History** may show BTC trades under ETH (same pattern)

The bug is intermittent — it appears on the first market that doesn't have data (ETH) but not always on the second (SOL), because by then the query has resolved to null.

### Root Cause

Three React Query hooks use `placeholderData: (previousData) => previousData`:

- `use-last-settled-epoch.ts:78`
- `use-settlement-history.ts:91`
- `use-trading-history.ts:285`

When switching assets, the query key changes (e.g., `['lastSettledEpoch', 'BTC', ...]` → `['lastSettledEpoch', 'ETH', ...]`). React Query treats this as a new query and uses the `placeholderData` callback to fill in data while fetching. The callback blindly returns the **previous query's data** (BTC's settlement) as placeholder for the new query (ETH), causing cross-market data bleed.

Additionally, the `isLastSettlementOpen` state in `epoch-status-display.tsx` is not reset when the `asset` prop changes, so if the user expanded the "Last Settlement" section on BTC, it stays expanded and visible when switching to ETH — displaying stale BTC data during the placeholder window.

## Acceptance Criteria

1. **Given** BTC/USD has a settled epoch, **When** the user switches to ETH/USD (no settled epochs), **Then** the "Last Settled Epoch" section does not appear (or shows loading then nothing)
2. **Given** BTC/USD has settlement history, **When** the user switches to ETH/USD, **Then** the Settlement History list shows empty/loading, not BTC's history
3. **Given** the user expanded "Last Settlement" on BTC/USD, **When** they switch to ETH/USD, **Then** the collapsible section is closed
4. **Given** any market switch, **When** the new market has its own data, **Then** that market's data loads and displays correctly (no regression)

## Tasks / Subtasks

### Task 1: Remove `placeholderData` from React Query hooks (AC: #1, #2, #4)

- [x] 1.1: **`web/src/hooks/use-last-settled-epoch.ts`** — Remove `placeholderData: (previousData) => previousData` from the `useQuery` config. Loading skeletons already handle the transition.
- [x] 1.2: **`web/src/hooks/use-settlement-history.ts`** — Remove `placeholderData: (previousData) => previousData` from the `useQuery` config.
- [x] 1.3: **`web/src/hooks/use-trading-history.ts`** — Remove `placeholderData: (previousData) => previousData` from the `useQuery` config.

### Task 2: Reset local state on asset change (AC: #3)

- [x] 2.1: **`web/src/components/trading/epoch-status-display.tsx`** — Add `useEffect` that resets `isLastSettlementOpen` to `false` and clears `frozenPriceRef.current` to `null` when `asset` changes.

### Task 3: Reset pagination state on asset change (AC: #2, #4) — Code Review

- [x] 3.1: **`web/src/hooks/use-settlement-history.ts`** — Add `useEffect` to reset `batchCount` to 1 when `asset` changes. Without this, pagination state from BTC carries into ETH.
- [x] 3.2: **`web/src/hooks/use-trading-history.ts`** — Same fix: reset `batchCount` to 1 on asset change.

## Dev Notes

### Why `placeholderData` causes cross-market bleed

React Query's `placeholderData` callback receives the previous query's data regardless of whether the query key changed. When keys differ (different asset), it still returns old data as "placeholder" during the fetch window. If the new query returns `null` (no data for that market), the placeholder is briefly visible before being replaced — but the user already saw it.

The fix is simply removing `placeholderData`. The existing loading skeletons (`<Skeleton>` components) provide adequate UX during the brief fetch window. Within the same market, React Query's normal cache handles instant re-renders when data is already cached.

### Related Stories

- **Story 7.14** (`7-14-fix-epoch-zero-trading-block.md`) — Previous epoch-related fix
- **Story 7.16** (`7-16-batch-rpc-trade-loading.md`) — Added batch RPC loading to trading history

## Dev Agent Record

### Implementation Notes

- Removed `placeholderData` from 3 hooks — single-line deletions
- Added asset-change `useEffect` in `epoch-status-display.tsx` to reset collapsible state and frozen price ref
- Build passes, no type errors
- Pre-existing test failures (47 tests in 11 suites) are unrelated to this change — same count before and after
- [Code Review] Added `batchCount` reset on asset change in `use-settlement-history.ts` and `use-trading-history.ts` — pagination state was carrying over across market switches

## File List

- `web/src/hooks/use-last-settled-epoch.ts` — Modified: removed `placeholderData`
- `web/src/hooks/use-settlement-history.ts` — Modified: removed `placeholderData`, added `batchCount` reset on asset change
- `web/src/hooks/use-trading-history.ts` — Modified: removed `placeholderData`, added `batchCount` reset on asset change
- `web/src/components/trading/epoch-status-display.tsx` — Modified: added asset-change useEffect to reset state
- `_bmad-output/implementation-artifacts/7-17-fix-cross-market-data-bleed.md` — Story file (this file)

## Change Log

- 2026-03-22: Fixed cross-market data bleed caused by `placeholderData` returning previous asset's cached data during market switches. Removed from 3 hooks and added state reset on asset change.
- 2026-03-22: [Code Review] Fixed `batchCount` pagination state carrying over across asset switches in `use-settlement-history.ts` and `use-trading-history.ts`. Added `useEffect` reset on asset change.
