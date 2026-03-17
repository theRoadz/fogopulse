# Story 4.4: Create Multi-Asset Position View

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want to see positions across all assets at once,
so that I can manage my complete portfolio.

## Acceptance Criteria

1. **Given** I have positions in multiple asset pools, **When** I view the portfolio section below the chart (in the left column), **Then** positions across BTC, ETH, SOL, FOGO are displayed simultaneously.
2. **Given** I have positions in multiple assets, **When** I view the portfolio section, **Then** total portfolio value (sum of all position current values) is calculated and shown in USDC.
3. **Given** I have positions in multiple assets, **When** I view the portfolio section, **Then** aggregate unrealized PnL (sum of all position PnL amounts) is displayed as both absolute USDC and percentage.
4. **Given** I am viewing the portfolio section, **When** I click on an asset section header, **Then** that asset's position details collapse/expand (each asset section is collapsible).
5. **Given** I am viewing a position in the portfolio section, **When** I click the asset name or a "Trade" link, **Then** the active asset tab switches to that asset (quick navigation).
6. **Given** no wallet is connected, **When** the portfolio section renders, **Then** it shows a "Connect wallet to view positions" message (or does not render at all).
7. **Given** a connected wallet with no positions in any asset, **When** the portfolio section renders, **Then** it shows an empty state: "No active positions. Start trading to see your portfolio."
8. **Given** pool reserves change (via TanStack Query polling), **When** pool data updates, **Then** aggregate PnL and individual position values recalculate automatically.
9. **Given** FR16 (view positions across multiple assets simultaneously), **When** all acceptance criteria are met, **Then** the functional requirement is satisfied.

## Tasks / Subtasks

- [x] Task 1: Create `useMultiAssetPositions` hook (AC: #1, #2, #3, #8)
  - [x] 1.1: Create `web/src/hooks/use-multi-asset-positions.ts` with `'use client'` directive
  - [x] 1.2: Hook iterates over `ASSETS` array (`['BTC', 'ETH', 'SOL', 'FOGO']`) and for each asset:
    - Calls `useEpoch(asset)` to get the active epoch PDA
    - Calls `usePool(asset)` to get pool reserves (`yesReserves`, `noReserves`)
    - Calls `useUserPosition(epochPda)` to get position data (or null)
  - [x] 1.3: CRITICAL HOOK RULE: React hooks cannot be called conditionally or in loops. Since we need data for all 4 assets, create 4 separate calls for each hook (one per asset). This is the only correct pattern:
    ```typescript
    const btcEpoch = useEpoch('BTC')
    const ethEpoch = useEpoch('ETH')
    const solEpoch = useEpoch('SOL')
    const fogoEpoch = useEpoch('FOGO')
    // ... same pattern for usePool and useUserPosition
    ```
    ALTERNATIVE: Use `useUserPositionsBatch` (from `use-user-positions-batch.ts`) with all 4 epoch PDAs to batch-fetch positions in a single query. This is MORE EFFICIENT than 4 separate `useUserPosition` calls.
  - [x] 1.4: For `useUserPosition`, the epoch PDA may be null (no active epoch for that asset). Pass `null` when no epoch — the hook handles this gracefully (returns null position).
  - [x] 1.5: Return type:
    ```typescript
    interface AssetPositionInfo {
      asset: Asset
      position: UserPositionData | null
      pool: PoolData | null
      epochPda: PublicKey | null
      pnl: PositionPnL | null  // from calculatePositionPnL
      isLoading: boolean
    }
    interface MultiAssetPositionsResult {
      positions: AssetPositionInfo[]  // Always 4 items, one per asset
      activePositions: AssetPositionInfo[]  // Only items where position !== null && shares > 0n
      totalValue: bigint  // Sum of all currentValue
      totalPnl: bigint  // Sum of all pnlAmount
      totalEntryAmount: bigint  // Sum of all entryAmount
      totalPnlPercent: number  // totalPnl / totalEntryAmount * 100
      isLoading: boolean  // Any individual still loading
      positionCount: number  // activePositions.length
    }
    ```
  - [x] 1.6: Compute PnL for each position using `calculatePositionPnL()` from `lib/trade-preview.ts` (already implemented in Story 4.3). Only compute when position AND pool data are both available.
  - [x] 1.7: Aggregate totals use `useMemo` with dependencies on all position/pool data. BigInt arithmetic for sums. `totalPnlPercent` uses `Number()` conversion only at the final percentage step.
  - [x] 1.8: Handle edge case: `totalEntryAmount === 0n` → `totalPnlPercent = 0`

- [x] Task 2: Create `PortfolioSummary` component (AC: #2, #3, #8)
  - [x] 2.1: Create `web/src/components/trading/portfolio-summary.tsx` with `'use client'` directive
  - [x] 2.2: Props: `{ totalValue: bigint; totalPnl: bigint; totalPnlPercent: number; positionCount: number }`
  - [x] 2.3: Render summary row: "Portfolio: X active positions | Total Value: Y USDC | PnL: +Z USDC (+W%)"
  - [x] 2.4: PnL color: `text-green-500` positive, `text-red-500` negative, `text-muted-foreground` zero (same pattern as `PnLDisplay`)
  - [x] 2.5: Use `formatUsdcAmount()` from `hooks/use-claimable-amount.ts` for USDC formatting
  - [x] 2.6: BigInt absolute value: `pnl < 0n ? -pnl : pnl` (no `Math.abs` for BigInt)
  - [x] 2.7: Wrap in a `Card` from shadcn/ui with compact padding

- [x] Task 3: Create `AssetPositionRow` component (AC: #1, #4, #5)
  - [x] 3.1: Create `web/src/components/trading/asset-position-row.tsx` with `'use client'` directive
  - [x] 3.2: Props: `{ assetPosition: AssetPositionInfo; onNavigateToAsset: (asset: Asset) => void }`
  - [x] 3.3: Use shadcn `Collapsible` component for expand/collapse per asset
  - [x] 3.4: Collapsed header shows: asset icon/color from `ASSET_METADATA[asset]`, direction (UP/DOWN), entry amount, current value, PnL (compact one-line summary)
  - [x] 3.5: Expanded content shows: full position details (shares, entry price, avg price), PnL breakdown, epoch state (Open/Frozen/Settled)
  - [x] 3.6: "Trade {ASSET}" button/link that calls `onNavigateToAsset(asset)` — this switches the active asset tab via `useUIStore.setState({ activeAsset: asset })`
  - [x] 3.7: Direction colors: `text-green-500` for UP, `text-red-500` for DOWN (existing pattern from `your-position.tsx`)
  - [x] 3.8: Asset-specific accent color from `ASSET_METADATA[asset].color` on the header

- [x] Task 4: Create `MultiAssetPositionsPanel` container component (AC: #1, #4, #6, #7)
  - [x] 4.1: Create `web/src/components/trading/multi-asset-positions-panel.tsx` with `'use client'` directive
  - [x] 4.2: Uses `useMultiAssetPositions()` hook for all data
  - [x] 4.3: Uses `useWallet()` — if not connected, render nothing (consistent with `YourPosition` pattern which returns null when not connected)
  - [x] 4.4: If connected but no positions (`positionCount === 0`), show: "No active positions. Start trading to see your portfolio." in muted text
  - [x] 4.5: If loading, show `Skeleton` placeholders (from shadcn/ui, already used in codebase)
  - [x] 4.6: Layout:
    ```
    MultiAssetPositionsPanel
      ├── PortfolioSummary (aggregate totals)
      └── For each activePosition in activePositions:
          └── AssetPositionRow (collapsible, with navigate action)
    ```
  - [x] 4.7: Navigation handler: `const handleNavigateToAsset = (asset: Asset) => useUIStore.setState({ activeAsset: asset })` — scrolls back to top of trading area. NOTE: Access `useUIStore` via import, not a hook call inside the handler.

- [x] Task 5: Integrate panel into `TradingLayout` (AC: #1)
  - [x] 5.1: Import `MultiAssetPositionsPanel` in `web/src/components/trading/trading-layout.tsx`
  - [x] 5.2: Add inside the 70% left column (chart column), below `ChartArea`:
    ```tsx
    <div className="w-full lg:w-[70%] flex flex-col gap-4">
      <ChartArea ... />
      <MultiAssetPositionsPanel />
    </div>
    ```
  - [x] 5.3: Do NOT remove or modify the existing `YourPosition` component in `TradeTicketArea` — it shows the single-asset active position for the selected asset. The multi-asset panel is COMPLEMENTARY (portfolio overview vs. single-asset detail).

- [x] Task 6: Write unit tests for `useMultiAssetPositions` hook (AC: #2, #3, #8)
  - [x] 6.1: Create `web/src/hooks/use-multi-asset-positions.test.ts`
  - [x] 6.2: Test: no positions in any asset → `positionCount === 0`, `totalValue === 0n`
  - [x] 6.3: Test: positions in 2 of 4 assets → `activePositions.length === 2`, aggregates correct
  - [x] 6.4: Test: aggregate PnL calculation with mixed positive/negative positions
  - [x] 6.5: Test: `totalEntryAmount === 0n` edge case → `totalPnlPercent === 0`

- [x] Task 7: Write component tests for `MultiAssetPositionsPanel` (AC: #1, #6, #7)
  - [x] 7.1: Create `web/src/components/trading/multi-asset-positions-panel.test.tsx`
  - [x] 7.2: Test: renders nothing when wallet not connected
  - [x] 7.3: Test: renders empty state when no positions
  - [x] 7.4: Test: renders portfolio summary and position rows when positions exist
  - [x] 7.5: Test: clicking "Trade BTC" calls asset navigation

- [x] Task 8: Write component tests for `AssetPositionRow` (AC: #4, #5)
  - [x] 8.1: Create `web/src/components/trading/asset-position-row.test.tsx`
  - [x] 8.2: Test: renders collapsed header with asset, direction, PnL
  - [x] 8.3: Test: expands on click to show full details
  - [x] 8.4: Test: "Trade" button triggers navigation callback

## Dev Notes

### Architecture Patterns & Constraints

**This is a FRONTEND-ONLY story — no on-chain changes required.**

The multi-asset position view aggregates existing on-chain data (positions, pools, epochs) from all 4 assets into a single portfolio panel. No new instructions, accounts, or deployment needed.

**React Hooks in Loops — CRITICAL:**

React hooks CANNOT be called conditionally or in loops. For 4 assets, you MUST call hooks 4 times explicitly (one per asset). The cleanest approach:

```typescript
// Option A: Explicit calls (simple, readable)
const btcEpoch = useEpoch('BTC')
const ethEpoch = useEpoch('ETH')
// ...repeat for SOL, FOGO

// Option B: Use useUserPositionsBatch for positions (more efficient)
const epochPdas = [btcEpochPda, ethEpochPda, solEpochPda, fogoEpochPda].filter(Boolean)
const { positions } = useUserPositionsBatch(epochPdas as PublicKey[])
```

**Prefer Option B for positions** — `useUserPositionsBatch` already exists from Story 3.9 and batch-fetches positions in a single `Promise.allSettled`. However, `useEpoch` and `usePool` must still be called 4 times each since they include WebSocket subscriptions per asset.

**Existing Hooks to Reuse (DO NOT DUPLICATE):**

- `useEpoch(asset)` from `hooks/use-epoch.ts` — returns epoch PDA, state, countdown
- `usePool(asset)` from `hooks/use-pool.ts` — returns `yesReserves`, `noReserves` with WebSocket
- `useUserPosition(epochPda)` from `hooks/use-user-position.ts` — single position fetch
- `useUserPositionsBatch(epochPdas)` from `hooks/use-user-positions-batch.ts` — batch position fetch
- `calculatePositionPnL(shares, entryAmount, direction, yesReserves, noReserves)` from `lib/trade-preview.ts` — PnL calculation (Story 4.3)
- `formatUsdcAmount(lamports)` from `hooks/use-claimable-amount.ts` — USDC display formatting
- `useUIStore` from `stores/ui-store.ts` — `activeAsset` state for tab switching

**Asset Navigation — UIStore Pattern:**

To switch asset tabs, call `useUIStore.setState({ activeAsset: targetAsset })`. The `AssetTabs` component reads from this store and all dependent components (`ChartArea`, `TradeTicketArea`) re-render with the new asset. This is already the pattern used by `AssetTabs.handleChange`.

**Performance — Multiple Hook Calls:**

Calling `useEpoch` and `usePool` for all 4 assets means 8 WebSocket subscriptions (4 pool + 4 epoch accounts). These subscriptions are lightweight (Solana account change listeners) and are already established even if the user only views one asset tab. The hooks use `useQuery` with `refetchInterval: 5000` as fallback, and WebSocket updates trigger `queryClient.setQueryData` for instant updates.

**BigInt Aggregation:**

```typescript
const totalValue = activePositions.reduce((sum, p) => sum + (p.pnl?.currentValue ?? 0n), 0n)
const totalPnl = activePositions.reduce((sum, p) => sum + (p.pnl?.pnlAmount ?? 0n), 0n)
const totalEntry = activePositions.reduce((sum, p) => sum + (p.position?.amount ?? 0n), 0n)
const totalPnlPercent = totalEntry > 0n ? Number(totalPnl) / Number(totalEntry) * 100 : 0
```

**Collapsible Pattern (shadcn/ui):**

```typescript
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'

<Collapsible>
  <CollapsibleTrigger>Header row (always visible)</CollapsibleTrigger>
  <CollapsibleContent>Expanded detail (toggle on click)</CollapsibleContent>
</Collapsible>
```

The `collapsible.tsx` component is already installed in `web/src/components/ui/`.

**Layout Placement:**

```
TradingLayout
  ├── AssetTabs (BTC / ETH / SOL / FOGO)
  ├── Main Trading Area (flex row on desktop)
  │   ├── Left Column (70%)
  │   │   ├── ChartArea
  │   │   └── MultiAssetPositionsPanel ← below chart, inside 70% column
  │   │       ├── PortfolioSummary
  │   │       └── AssetPositionRow × N (one per active position)
  │   └── TradeTicketArea (30%)
  │       ├── PoolStateDisplay
  │       ├── YourPosition ← KEEP (single-asset detail)
  │       └── TradeTicket
```

**Do NOT remove `YourPosition`** from `TradeTicketArea`. It serves a different purpose — showing the detailed position card for the currently selected asset with sell/claim actions. The multi-asset panel is a read-only portfolio overview.

**Position Data Flow:**

```
useEpoch(asset) → epochPda → useUserPosition(epochPda) → position
usePool(asset) → { yesReserves, noReserves }
position + pool → calculatePositionPnL() → { currentValue, pnlAmount, pnlPercent }
All 4 assets aggregated → { totalValue, totalPnl, totalPnlPercent }
```

**Empty Epoch PDA Handling:**

Some assets may not have an active epoch (e.g., FOGO often has no active epoch because its Pyth feed is a placeholder). When `useEpoch(asset).epochState.epoch` is null, the epoch PDA is null, and no position can exist. These assets appear as "No position" in the portfolio (or are simply omitted from `activePositions`).

### Project Structure Notes

- New file: `web/src/hooks/use-multi-asset-positions.ts` — aggregation hook
- New file: `web/src/hooks/use-multi-asset-positions.test.ts` — hook tests
- New file: `web/src/components/trading/multi-asset-positions-panel.tsx` — container
- New file: `web/src/components/trading/multi-asset-positions-panel.test.tsx` — container tests
- New file: `web/src/components/trading/portfolio-summary.tsx` — aggregate display
- New file: `web/src/components/trading/asset-position-row.tsx` — per-asset collapsible row
- New file: `web/src/components/trading/asset-position-row.test.tsx` — row tests
- Modified: `web/src/components/trading/trading-layout.tsx` — add panel below main area

### Existing Code to Reuse (DO NOT DUPLICATE)

**Hooks (already implemented — extend, don't recreate):**
- `useEpoch(asset)` from `hooks/use-epoch.ts` — epoch PDA and state
- `usePool(asset)` from `hooks/use-pool.ts` — pool reserves with WebSocket
- `useUserPosition(epochPda)` from `hooks/use-user-position.ts` — single position
- `useUserPositionsBatch(epochPdas)` from `hooks/use-user-positions-batch.ts` — batch positions (preferred for efficiency)
- `useClaimableAmount(epoch, position)` from `hooks/use-claimable-amount.ts` — exports `formatUsdcAmount()`

**Utility Functions (already implemented):**
- `calculatePositionPnL()` from `lib/trade-preview.ts` — PnL math (Story 4.3)
- `getReservesForDirection()` from `lib/trade-preview.ts` — direction → reserves mapping
- `formatUsdcAmount(lamports)` from `hooks/use-claimable-amount.ts` — BigInt USDC → display string
- `deriveEpochPda()` from `lib/pda.ts` — epoch PDA derivation (if needed)

**UI Components (from shadcn/ui — already installed):**
- `Card`, `CardHeader`, `CardContent` from `ui/card`
- `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `ui/collapsible`
- `Skeleton` from `ui/skeleton`
- `Badge` from `ui/badge`
- `Button` from `ui/button`

**State Management:**
- `useUIStore` from `stores/ui-store.ts` — `activeAsset` for asset switching
- `ASSETS` from `types/assets.ts` — `['BTC', 'ETH', 'SOL', 'FOGO']` array
- `ASSET_METADATA` from `lib/constants.ts` — labels, colors, feed IDs

**Styling Patterns (from existing components):**
- Direction colors: `text-green-500` (UP/positive), `text-red-500` (DOWN/negative) — from `your-position.tsx`, `pnl-display.tsx`
- Muted text: `text-muted-foreground` — shadcn convention
- Asset colors: `ASSET_METADATA[asset].color` (e.g., `text-orange-500` for BTC)
- Compact sizing: `text-sm` for detail rows, `text-base font-semibold` for headers

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 4, Story 4.4]
- [Source: _bmad-output/planning-artifacts/prd.md - FR16 (view positions across multiple assets simultaneously)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md - Journey 3: Multi-Asset Trader, Multi-Asset UI Elements]
- [Source: _bmad-output/planning-artifacts/architecture.md - Position Management (FR15-FR20) components/positions/*]
- [Source: _bmad-output/project-context.md - Naming conventions, component patterns, BigInt arithmetic, TanStack Query patterns]
- [Source: web/src/components/trading/your-position.tsx - Single-asset position card pattern, hook usage]
- [Source: web/src/components/trading/pnl-display.tsx - PnL display component, color patterns]
- [Source: web/src/components/trading/trading-layout.tsx - Layout integration point]
- [Source: web/src/hooks/use-user-positions-batch.ts - Batch position fetching hook]
- [Source: web/src/hooks/use-epoch.ts - Epoch data with WebSocket subscription]
- [Source: web/src/hooks/use-pool.ts - Pool data with WebSocket subscription]
- [Source: web/src/lib/trade-preview.ts - calculatePositionPnL, getReservesForDirection]
- [Source: web/src/lib/constants.ts - ASSETS, ASSET_METADATA, POOL_PDAS, QUERY_KEYS]
- [Source: web/src/stores/ui-store.ts - activeAsset state for tab switching]
- [Source: web/src/components/ui/collapsible.tsx - Collapsible component (shadcn)]

### Previous Story Intelligence (Story 4.3)

- Story 4.3 added `calculatePositionPnL()` to `trade-preview.ts` — returns `{ currentValue, pnlAmount, pnlPercent }`. Reuse this directly for per-position PnL in the portfolio.
- `PnLDisplay` component exists but is coupled to single-position rendering. For the portfolio, compute PnL via the utility function and render custom aggregate display.
- `formatUsdcAmount()` is exported from `use-claimable-amount.ts` — already used for PnL display, reuse for portfolio totals.
- BigInt absolute value pattern: `value < 0n ? -value : value` (no `Math.abs` for BigInt). Already established in Story 4.3.
- Pre-existing test failures (12 failures) exist on master — do not attempt to fix unrelated test failures.
- `Number(bigint)` conversion is safe for USDC amounts (never approaches `Number.MAX_SAFE_INTEGER`).

### Git Intelligence

Recent commits:
- `7ef2756` feat(Story 4.3): Implement position PnL calculations with code review fixes
- `e325889` feat(Story 4.2): Implement active positions panel with code review fixes
- `1e5a24c` feat(Story 4.1): Implement sell_position instruction with code review fixes
- `393638a` feat(Story 7.2): Implement community feedback tracker with code review fixes
- `d63aec6` feat(Story 3.9): Implement settlement history display with code review fixes

Patterns established:
- Commit prefix: `feat(Story X.Y):` for story implementations
- Code review fixes included in same commit
- Tests co-located with components (`*.test.tsx` alongside `*.tsx`)
- All UI components use `'use client'` directive + shadcn/ui + Tailwind CSS
- React 19.2.1 + Next.js 16.0.10 + TanStack Query 5.89.0
- Jest 30.1.3 + `@testing-library/react` 16.3.2 for component tests

### Latest Tech Notes

- TanStack Query 5.89.0: `useQuery` returns `{ data, isLoading, error }`. Multiple `useQuery` calls in one component are fine — TanStack Query manages them independently.
- React 19.2.1: Hooks cannot be called conditionally. For 4 assets, must use 4 explicit hook calls or a batch hook.
- `Collapsible` (shadcn/ui): Based on Radix UI `@radix-ui/react-collapsible`. Default state is closed. Use `defaultOpen` prop if needed.
- `useUserPositionsBatch` uses `Promise.allSettled` — rejected promises mean "no position for that epoch" (not an error). This is the correct pattern for batch-checking positions across assets.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No issues encountered during initial implementation.

Post-implementation fix: Chart height was reduced after positions panel integration. Required two iterations:
1. Restored `h-full` on the Card in `chart-area.tsx` and changed `min-h-*` to fixed `h-*` on the ChartArea wrapper in `trading-layout.tsx` — but initial heights (300/350/400px) were too small, causing the card header (asset label, price, epoch status) to be clipped by `overflow-hidden`.
2. Increased fixed heights to `h-[450px] md:h-[500px] lg:h-[550px]` to properly accommodate the card header + epoch status display + chart content area. Root cause: `min-h-*` only sets a floor and doesn't force the element to actually fill that height; the Card's `h-full` had no definite parent height to resolve against. Switching to fixed `h-*` values gives the chart container a concrete size.

### Completion Notes List

- Created `useMultiAssetPositions` hook that aggregates position data across all 4 assets (BTC, ETH, SOL, FOGO) using explicit per-asset hook calls and `useUserPositionsBatch` for efficient batch position fetching
- Created `PortfolioSummary` component showing total value, aggregate PnL, and active position count
- Created `AssetPositionRow` component with collapsible expand/collapse per asset, showing direction, entry, PnL, and "Trade" navigation button
- Created `MultiAssetPositionsPanel` container that handles wallet connection, loading, and empty states
- Integrated panel into `TradingLayout` inside the 70% left column, below the chart (not full-width)
- Existing `YourPosition` component preserved in `TradeTicketArea` (complementary, not replaced)
- Fixed chart height regression: restored `h-full` on Card, added `overflow-hidden`, and used fixed heights (`h-[450px] md:h-[500px] lg:h-[550px]`) on ChartArea wrapper to ensure chart fills the correct height with positions panel below
- All 15 tests pass; pre-existing test failures remain (unchanged from master)
- Build compiles successfully with no TypeScript errors

### Change Log

- 2026-03-16: Implemented Story 4.4 - Multi-Asset Position View with aggregation hook, portfolio summary, collapsible asset rows, and layout integration
- 2026-03-16: Fixed chart height regression — changed ChartArea from `min-h-*` to fixed `h-[450px]/h-[500px]/h-[550px]`, restored `h-full` on Card, kept `overflow-hidden` to prevent content overflow
- 2026-03-16: Code review fixes — removed unused useEpoch calls from hook, rewrote hook tests to use renderHook with mocked sub-hooks, moderated chart heights to h-[400px]/h-[450px]/h-[500px], documented buy/sell hook changes in file list
- 2026-03-17: Layout refinement — moved MultiAssetPositionsPanel from full-width below main trading area into the 70% left column (below chart), so it doesn't span under the trade ticket

### File List

- web/src/hooks/use-multi-asset-positions.ts (new)
- web/src/hooks/use-multi-asset-positions.test.ts (new)
- web/src/components/trading/portfolio-summary.tsx (new)
- web/src/components/trading/asset-position-row.tsx (new)
- web/src/components/trading/multi-asset-positions-panel.tsx (new)
- web/src/components/trading/multi-asset-positions-panel.test.tsx (new)
- web/src/components/trading/asset-position-row.test.tsx (new)
- web/src/components/trading/trading-layout.tsx (modified)
- web/src/components/trading/chart-area.tsx (modified)
- web/src/hooks/use-buy-position.ts (modified — added positionsBatch query invalidation)
- web/src/hooks/use-sell-position.ts (modified — added positionsBatch query invalidation)
