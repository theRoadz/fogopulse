# Story 7.18: Split History Page into Separate Settlement & Trades Pages

Status: done
Created: 2026-03-22
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a trader,
I want Settlement History and Trade History on separate pages instead of tabs,
so that navigation is cleaner and each page has a single clear purpose.

## Problem

The `/history` page combines "Settlement History" and "Trade History" into a single tabbed view. This is redundant because:

1. **Trade History already exists** on each trade page (`/trade/[asset]`) via the `PositionsAndTradesPanel` component
2. **Settlement History and Trade History serve different purposes** — settlement history shows all epoch outcomes for a market, while Trade History shows a user's personal trade history
3. **The tabbed layout hides content** — users must click between tabs rather than having direct navigation to each view

## Solution

Split the single `/history` page into two standalone pages:
- `/settlements` — Settlement History with asset tabs
- `/trades` — Trade History with asset tabs

Update navigation links in the overflow menu. Add a redirect from the old `/history` route for backward compatibility.

## Acceptance Criteria

1. **Given** the user clicks "Settlement History" in the overflow menu, **When** the page loads, **Then** they see `/settlements` with the settlement history list and asset tabs
2. **Given** the user clicks "Trade History" in the overflow menu, **When** the page loads, **Then** they see `/trades` with their trade history list and asset tabs
3. **Given** a user has bookmarked `/history?tab=settlement`, **When** they visit that URL, **Then** they are redirected to `/settlements`
4. **Given** a user has bookmarked `/history?tab=trades`, **When** they visit that URL, **Then** they are redirected to `/trades`
5. **Given** the user is on `/trade/btc`, **When** they click the "Trade History" tab, **Then** it still works as before (no regression)

## Tasks / Subtasks

### Task 1: Create separate feature components (AC: #1, #2)

- [x] 1.1: Create `web/src/components/history/settlements-feature.tsx` — client component with AssetTabs + SettlementHistoryList, heading "Settlement History"
- [x] 1.2: Create `web/src/components/history/trades-feature.tsx` — client component with AssetTabs + TradingHistoryList, heading "Trade History"

### Task 2: Create new route pages (AC: #1, #2)

- [x] 2.1: Create `web/src/app/settlements/page.tsx` — renders SettlementsFeature
- [x] 2.2: Create `web/src/app/trades/page.tsx` — renders TradesFeature

### Task 3: Update navigation (AC: #1, #2)

- [x] 3.1: Update `web/src/components/app-header.tsx` — change overflow menu links from `/history?tab=...` to `/settlements` and `/trades`

### Task 4: Redirect old route (AC: #3, #4)

- [x] 4.1: Replace `web/src/app/history/page.tsx` with server-side redirect to new routes

### Task 5: Update tests (AC: #1, #2)

- [x] 5.1: Create `web/src/components/history/settlements-feature.test.tsx`
- [x] 5.2: Create `web/src/components/history/trades-feature.test.tsx`
- [x] 5.3: Delete old `history-feature.tsx` and `history-feature.test.tsx`

## Dev Notes

### Reused components
- `AssetTabs` (`web/src/components/trading/asset-tabs.tsx`) — no changes
- `SettlementHistoryList` (`web/src/components/trading/settlement-history-list.tsx`) — removed column header row, increased scroll area and spacing to match trades
- `SettlementHistoryRow` (`web/src/components/trading/settlement-history-row.tsx`) — increased padding/gaps/icons/badge sizing to match trading history row
- `TradingHistoryList` (`web/src/components/trading/trading-history-list.tsx`) — no changes

### Route naming
Using top-level `/settlements` and `/trades` to match existing flat route structure (`/account`, `/faucet`, `/feedback`, `/lp`, `/admin`).

## Dev Agent Record

### Implementation Notes

- Created `SettlementsFeature` and `TradesFeature` as simple client components — each renders AssetTabs + its respective list component
- Created Next.js route pages at `/settlements` and `/trades` with `force-dynamic` and metadata
- Updated `overflowLinks` in `app-header.tsx` to point to new routes (both desktop and mobile menus use the same array)
- Replaced old `/history/page.tsx` with async server redirect using Next.js 16 `Promise<searchParams>` pattern
- Deleted old `history-feature.tsx` and `history-feature.test.tsx`
- All 6 new tests pass (3 per feature component)
- Visual polish: matched settlement history row sizing (padding, gaps, chevrons, badges) to trading history row for consistent look
- Removed column header row from settlement history list (Epoch/Outcome/Price Range/Change/Time/Position) — not needed
- Increased page container width from `max-w-3xl` to `max-w-4xl` on both pages

## File List

- `web/src/components/history/settlements-feature.tsx` — Created: Settlement History page component
- `web/src/components/history/trades-feature.tsx` — Created: Trade History page component
- `web/src/app/settlements/page.tsx` — Created: route page for /settlements
- `web/src/app/trades/page.tsx` — Created: route page for /trades
- `web/src/components/app-header.tsx` — Modified: updated overflow menu links
- `web/src/app/history/page.tsx` — Modified: replaced with redirect to new routes
- `web/src/components/history/settlements-feature.test.tsx` — Created: tests
- `web/src/components/history/trades-feature.test.tsx` — Created: tests
- `web/src/components/history/history-feature.tsx` — Deleted
- `web/src/components/history/history-feature.test.tsx` — Deleted
- `web/src/components/trading/settlement-history-list.tsx` — Modified: removed column headers, increased scroll area and row spacing
- `web/src/components/trading/settlement-history-row.tsx` — Modified: increased padding, gaps, icon sizes, badge sizing to match trading row
- `web/src/components/trading/settlement-history-list.test.tsx` — Modified: fixed positionKey mock, removed stale column header tests
- `_bmad-output/implementation-artifacts/7-18-split-history-into-separate-pages.md` — Story file (this file)

## Change Log

- 2026-03-22: Story created
- 2026-03-22: Implementation complete — split history page into /settlements and /trades with backward-compatible redirect
- 2026-03-22: Visual polish — matched settlement row sizing to trading row, removed column headers, widened page containers to max-w-4xl
- 2026-03-22: Code review fixes — fixed positionKey mock in settlement-history-list tests (8 tests were failing), removed 3 stale column header tests, added active state highlighting to mobile overflow menu links
