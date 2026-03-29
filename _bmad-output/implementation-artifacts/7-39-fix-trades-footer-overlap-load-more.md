# Story 7.39: Fix Trade History Footer Overlap & Load More Refresh

Status: done
Created: 2026-03-29
Epic: 7 - Platform Polish & UX
Sprint: Current
Priority: MEDIUM — UI regression on /trades page

## Story

As a user,
I want the Trade History page to display all trades without the footer cutting through the list, and "Load more" to append rows seamlessly,
so that I can browse my full trading history without visual glitches.

## Problem

**Multiple related UI issues on the trading pages:**

### Issue 1: Footer Appears in Middle of Trade List

The `TradingHistoryList` component wrapped all trade rows in a Radix `ScrollArea` with `max-h-[600px]`. This caused the footer to render at the viewport boundary, visually splitting the trade list.

**Root cause (final):** The Radix `ScrollArea` component with `max-height` breaks the parent flex container's height calculation, causing the footer to render at the viewport boundary instead of after all content. Confirmed by removing all height constraints — footer positioned correctly without any ScrollArea or max-height.

### Issue 2: "Load More" Causes Visual Refresh

When clicking "Load more", the list briefly flashed because React Query treated each batch size as a new cache entry with no placeholder data.

### Issue 3: Duplicate React Keys

Two sources of duplicate keys causing DOM corruption:
- `trading-history-list.tsx`: key `BTC-1074` duplicated when user has both UP and DOWN positions in same epoch
- `multi-asset-positions-panel.tsx`: key `BTC` duplicated when user has both UP and DOWN positions for same asset

### Issue 4: Nested `<button>` HTML Violation

`TradingHistoryRow` used a `<button>` as the `CollapsibleTrigger` child, but the Claim/Refund button inside the row created an invalid nested `<button>` element, causing hydration warnings.

## Solution

### Fix 1: Remove ScrollArea entirely from TradingHistoryList

Removed `ScrollArea`, `maxHeight` prop, and all conditional wrapping. The component now always renders content directly with no scroll container. Both the dedicated `/trades` page and the embedded dashboard tab render the list naturally — no height constraints needed.

### Fix 2: Add `placeholderData: keepPreviousData` to useQuery

Keeps the existing trade list visible while the larger batch loads, preventing flash/jump.

### Fix 3: Fix duplicate React keys

- `trading-history-list.tsx`: key includes direction — `${asset}-${epochId}-${direction}`
- `multi-asset-positions-panel.tsx`: key includes direction — `${asset}-${direction}`

### Fix 4: Replace nested button with div role="button"

Changed the `CollapsibleTrigger` child in `TradingHistoryRow` from `<button>` to `<div role="button" tabIndex={0}>` to avoid invalid nested `<button>` HTML.

### Fix 5: Layout hardening

- `app-layout.tsx`: `flex-grow` → `flex-1` on `<main>` for proper height recalculation
- `app-footer.tsx`: Added `mt-auto` for robust bottom positioning

## Acceptance Criteria

1. **AC1:** On `/trades` page and main trading page, trade list renders without footer appearing between rows
2. **AC2:** Footer stays at the bottom of the page, below all content
3. **AC3:** "Load more" appends new rows without the list flashing or scroll position resetting
4. **AC4:** No duplicate React key console errors
5. **AC5:** No nested `<button>` HTML violations or hydration warnings
6. **AC6:** No regressions in loading states or empty states

## Tasks / Subtasks

- [x] Task 1: Remove ScrollArea from TradingHistoryList (AC: #1, #2)
  - [x] 1.1: Remove `ScrollArea` import and `maxHeight` prop from `TradingHistoryListProps`
  - [x] 1.2: Remove conditional ScrollArea wrapping — always render content directly

- [x] Task 2: Add `placeholderData` to prevent load-more flash (AC: #3)
  - [x] 2.1: Import `keepPreviousData` from `@tanstack/react-query` in `use-trading-history.ts`
  - [x] 2.2: Add `placeholderData: keepPreviousData` to the `useQuery` options

- [x] Task 3: Fix duplicate React keys (AC: #4)
  - [x] 3.1: In `trading-history-list.tsx`, key → `${asset}-${epochId}-${direction}`
  - [x] 3.2: In `multi-asset-positions-panel.tsx`, key → `${asset}-${direction}`

- [x] Task 4: Fix nested button HTML violation (AC: #5)
  - [x] 4.1: In `trading-history-row.tsx`, change `CollapsibleTrigger` child from `<button>` to `<div role="button" tabIndex={0}>` to avoid nesting buttons (Claim/Refund button inside the row trigger)

- [x] Task 5: Harden layout (AC: #2)
  - [x] 5.1: In `app-layout.tsx`, `flex-grow` → `flex-1` on `<main>`
  - [x] 5.2: In `app-footer.tsx`, add `mt-auto` to footer

- [x] Task 6: Verify (AC: #1-#6)
  - [x] 6.1: Main trading page — footer at bottom, no overlap after Load more ✓
  - [x] 6.2: Dedicated `/trades` page — footer at bottom ✓
  - [x] 6.3: No duplicate key console errors ✓
  - [x] 6.4: No nested button warnings ✓

## File List

| File | Action | Description |
|------|--------|-------------|
| `web/src/components/trading/trading-history-list.tsx` | **MODIFY** | Remove ScrollArea/maxHeight; fix duplicate key; always render content directly |
| `web/src/components/trading/trading-history-row.tsx` | **MODIFY** | Change CollapsibleTrigger child from `<button>` to `<div role="button">` |
| `web/src/components/trading/multi-asset-positions-panel.tsx` | **MODIFY** | Fix duplicate key (add direction) |
| `web/src/hooks/use-trading-history.ts` | **MODIFY** | Add `placeholderData: keepPreviousData` to useQuery |
| `web/src/components/app-layout.tsx` | **MODIFY** | Replace `flex-grow` with `flex-1` on `<main>` |
| `web/src/components/app-footer.tsx` | **MODIFY** | Add `mt-auto` for robust bottom positioning |

## Change Log

- **2026-03-29**: Story created. Two UI bugs identified — footer overlap from ScrollArea height constraint, and load-more visual refresh from missing placeholderData.
- **2026-03-29**: Initial fix — ScrollArea conditional via `maxHeight` prop; `keepPreviousData` added to useQuery.
- **2026-03-29**: `flex-grow` → `flex-1` on `<main>`. Dedicated `/trades` page confirmed working.
- **2026-03-29**: Fixed duplicate React keys in `trading-history-list.tsx` and `multi-asset-positions-panel.tsx` (added direction to keys).
- **2026-03-29**: **Root cause confirmed**: Radix `ScrollArea` with `max-height` breaks parent flex container height calculation. Fix: removed ScrollArea entirely from `TradingHistoryList`; removed all height constraints from embedded usage — list flows naturally, footer stays at bottom.
- **2026-03-29**: Fixed nested `<button>` HTML violation in `trading-history-row.tsx` — changed CollapsibleTrigger child to `<div role="button" tabIndex={0}>` to avoid invalid button-inside-button when Claim/Refund button is present. Status → done.
- **2026-03-29**: **Code review** — Removed false claim about `positions-and-trades-panel.tsx` modification (file was never changed). Removed stale `ScrollArea` mock from test file. Added test case for duplicate-key fix (same asset+epoch, different directions).
