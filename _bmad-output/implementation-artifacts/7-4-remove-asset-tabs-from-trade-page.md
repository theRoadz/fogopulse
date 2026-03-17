# Story 7.4: Remove Asset Tabs from Trade Page

Status: complete
Created: 2026-03-17
Epic: 7 - Platform Polish & UX
Sprint: Backlog

## Overview

Remove the redundant `AssetTabs` component from the trade page. The header Markets dropdown (Story 7.3) now provides the same asset-switching navigation, making the in-page tabs unnecessary. The `AssetTabs` component itself is NOT deleted — it is still used by the History page for settlement filtering.

**FRs Covered:** N/A (UX cleanup — removing redundant navigation)
**Dependencies:** Story 7.3 (header Markets dropdown provides replacement navigation)

## Story

As a trader,
I want the trade page to show only the chart and trade ticket without redundant asset tabs,
so that the interface is cleaner now that I can switch markets from the header dropdown.

## Acceptance Criteria

1. **Given** I am on `/trade/btc` (or any asset), **When** I look at the trade page, **Then** there are no asset tabs (BTC / ETH / SOL / FOGO) above the chart
2. **Given** I use the header Markets dropdown, **When** I click a different asset, **Then** I navigate to that asset's trade page correctly (existing behavior preserved)
3. **Given** I visit `/history`, **When** I look at the page, **Then** the asset tabs still appear and function for settlement filtering (unchanged)
4. **Given** the codebase, **When** I inspect the `AssetTabs` component file, **Then** it still exists and is exported — it was not deleted
5. **Given** I am on `/trade/btc`, **When** I expand the "Last Settlement" collapsible, **Then** the full `SettlementStatusPanel` is visible without being clipped, and the Positions/My Trades panel is pushed down; **When** I collapse it, **Then** the layout returns to normal

## Tasks / Subtasks

- [x] Task 1: Remove AssetTabs from TradingLayout (AC: #1)
  - [x] 1.1: Removed `AssetTabs` import from `trading-layout.tsx`
  - [x] 1.2: Removed `Asset` type import (no longer needed)
  - [x] 1.3: Removed `TradingLayoutProps` interface and `onAssetChange` prop
  - [x] 1.4: Changed function signature from `TradingLayout({ onAssetChange })` to `TradingLayout()`
  - [x] 1.5: Removed the `<div className="flex justify-center">` + `<AssetTabs>` JSX block

- [x] Task 2: Update trade page to stop passing removed prop (AC: #2)
  - [x] 2.1: Removed `handleAssetChange` function from `page.tsx`
  - [x] 2.2: Changed `<TradingLayout onAssetChange={handleAssetChange} />` to `<TradingLayout />`
  - [x] 2.3: Kept `useRouter` — still needed for redirect in `useEffect` (`router.replace('/trade/btc')`)
  - [x] 2.4: Kept `Asset` type import — still needed by `isValidAsset` type guard

- [x] Task 3: Fix Last Settlement collapsible clipped by overflow (AC: #5)
  - [x] 3.1: Changed `h-[400px] md:h-[450px] lg:h-[500px]` to `min-h-[400px] md:min-h-[450px] lg:min-h-[500px]` on ChartArea in `trading-layout.tsx`
  - [x] 3.2: Removed `overflow-hidden` and `h-full` from Card in `chart-area.tsx` — now `flex flex-col`
  - [x] 3.3: Added `overflow-hidden` to `CardContent` in `chart-area.tsx` to keep chart contained

- [x] Task 4: Verification (AC: #3, #4, #5)
  - [x] 3.1: TypeScript compilation passes with zero new errors
  - [x] 3.2: `AssetTabs` component file and barrel export untouched
  - [x] 3.3: Pre-existing test/build errors unchanged

## Dev Notes

### Important: AssetTabs is shared

The `AssetTabs` component is used in two places:
- **Trade page** (`trading-layout.tsx`) — **removed here**
- **History page** (`history-feature.tsx`) — **still used here** for settlement filtering by asset

Do NOT delete the component file or its export from `index.ts`.

### Key Files Reference

| File | Path | Role |
|------|------|------|
| AssetTabs component | `web/src/components/trading/asset-tabs.tsx` | Shared component — kept |
| AssetTabs barrel export | `web/src/components/trading/index.ts` | Export — kept |
| TradingLayout | `web/src/components/trading/trading-layout.tsx` | **Modified** — removed tabs |
| Trade page | `web/src/app/trade/[asset]/page.tsx` | **Modified** — removed handler |
| History page | `web/src/components/history/history-feature.tsx` | Uses AssetTabs — unchanged |

### Trade Page Architecture (Post-Change)

```
URL: /trade/[asset]
  └── page.tsx (route param → store sync, redirect for invalid asset)
        └── TradingLayout (no props)
              ├── ChartArea (reads activeAsset from store)
              ├── PositionsAndTradesPanel
              └── TradeTicketArea (reads activeAsset from store)
```

Asset switching now flows through:
1. Header Markets dropdown → `router.push('/trade/[asset]')` (via Next.js Link)
2. `page.tsx` useEffect syncs URL param → `useUIStore.activeAsset`
3. Child components read from store

### Future Trade Page Modifications

If adding new elements to the trade page later:
- **Layout changes** go in `web/src/components/trading/trading-layout.tsx`
- **Route-level logic** goes in `web/src/app/trade/[asset]/page.tsx`
- **Store** is `useUIStore` at `web/src/stores/ui-store.ts` — holds `activeAsset`
- **Asset constants**: `ASSETS` and `Asset` type in `web/src/types/assets.ts`, `ASSET_METADATA` in `web/src/lib/constants.ts`

### Testing Standards
- Framework: Vitest + React Testing Library
- Pre-existing type errors in `trade-ticket.test.tsx` and hooks tests are unrelated
- Pre-existing build error on `/history` page (useSearchParams without Suspense) is unrelated

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Completion Notes List
- Removed `AssetTabs` import and JSX block from `trading-layout.tsx`
- Removed `TradingLayoutProps` interface — component now takes no props
- Removed `handleAssetChange` callback from `page.tsx`
- Simplified `<TradingLayout />` call (no props)
- `AssetTabs` component file and barrel export preserved for History page usage
- TypeScript compiles cleanly — zero new errors
- Fixed Last Settlement collapsible clipping: ChartArea Card had `overflow-hidden` and a fixed height (`h-[400px]`), causing the expanded `SettlementStatusPanel` to be cut off. Changed fixed height to `min-h-[400px]` in `trading-layout.tsx` so the Card can grow. Moved `overflow-hidden` from the outer Card to `CardContent` in `chart-area.tsx` so the chart stays contained but the settlement panel is not clipped.

### Change Log
- 2026-03-17: Story created and implemented — removed redundant asset tabs from trade page
- 2026-03-17: Fix — Last Settlement collapsible was clipped by ChartArea Card overflow/fixed height

### File List
**Modified files:**
- `web/src/components/trading/trading-layout.tsx` — Removed AssetTabs import, interface, prop, and JSX block; changed ChartArea fixed height to min-height
- `web/src/components/trading/chart-area.tsx` — Moved `overflow-hidden` from Card to CardContent; removed `h-full` from Card
- `web/src/app/trade/[asset]/page.tsx` — Removed handleAssetChange function and onAssetChange prop passing
