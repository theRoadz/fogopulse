# Story 4.7: Create Trading History View

Status: done
Created: 2026-03-17
Epic: 4 - Position Management & History
Sprint: Current

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Overview

This is the **final story in Epic 4**, completing the Position Management & History epic. It builds a comprehensive Trading History View that shows the trader's past trades across all assets with realized PnL, aggregate statistics (total PnL, win rate), and filtering capabilities. This is distinct from the existing Settlement History (Story 3.9) which shows epoch-level settlement outcomes — this story focuses on the **user's personal trading performance**.

**FRs Covered:** FR17 (view realized PnL from settled trades), FR27 (view epoch history with outcomes)
**Dependencies:** Stories 3.8/3.9 (settlement/claim UI), Story 4.3 (PnL calculations), Story 4.4 (multi-asset positions)

## Story

As a trader,
I want to see my past trades,
so that I can review my performance over time.

## Acceptance Criteria

1. **Given** I have completed trades (settled/refunded epochs where I held a position), **When** I view my trading history, **Then** past positions are listed with settlement details (asset, direction, amount invested, outcome, realized PnL)
2. **Given** a settled epoch where I won, **When** viewing that trade in history, **Then** realized PnL is calculated as `payout_received - amount_invested` and shown in green with a positive amount
3. **Given** a settled epoch where I lost, **When** viewing that trade in history, **Then** realized PnL is shown as `-amount_invested` in red
4. **Given** a refunded epoch where I held a position, **When** viewing that trade in history, **Then** outcome shows "Refunded" and PnL shows $0.00
5. **Given** I have trades across multiple assets, **When** viewing history, **Then** I can filter by asset (BTC, ETH, SOL, FOGO) and "All Assets"
6. **Given** I have multiple past trades, **When** viewing history, **Then** aggregate statistics are shown: total realized PnL, win/loss/refund counts, win rate percentage, and total volume traded
7. **Given** I have many past trades, **When** scrolling through history, **Then** pagination loads more results (same pattern as Settlement History — batch loading with "Load more")
8. **Given** my wallet is not connected, **When** I navigate to the "My Trades" tab, **Then** a centered message "Connect wallet to view your trading history" is shown with a `WalletButton` to connect
9. **Given** I sold a position early (full exit via sell_position), **When** viewing that trade in history, **Then** outcome shows "Sold Early" badge and PnL column shows "—" (dash) since the realized PnL from the sale is not available from on-chain account state

## Tasks / Subtasks

- [x] Task 1: Create `useTradingHistory` hook (AC: #1, #5, #7, #9)
  - [x] 1.1: Walk backwards through settled epochs across ALL assets (or filtered asset), fetch user positions via `useUserPositionsBatch`
  - [x] 1.2: Compute realized PnL per trade using `getClaimState` + `calculatePayout` from `use-claimable-amount.ts`
  - [x] 1.3: Detect sold-early positions: `position.shares === 0n && position.claimed === true` → outcome `'sold-early'`, PnL `null`
  - [x] 1.4: Return `TradingHistoryEntry[]` with pagination (`hasMore`, `fetchMore`)
  - [x] 1.5: Support asset filter parameter ("All" or specific asset)
  - [x] 1.6: For "All Assets" mode, fetch all 4 pools in parallel via `Promise.all` in queryFn
  - [x] 1.7: Write unit tests for the hook (include sold-early edge case)
- [x] Task 2: Create `useTradingStats` hook or derive stats in `useTradingHistory` (AC: #6)
  - [x] 2.1: Aggregate: total realized PnL, win count, loss count, refund count, sold-early count, total volume
  - [x] 2.2: Calculate win rate = wins / (wins + losses) (exclude refunds and sold-early)
  - [x] 2.3: Write unit tests for stat calculations
- [x] Task 3: Create `TradingHistoryRow` component (AC: #1, #2, #3, #4, #9)
  - [x] 3.1: Display asset icon/label, direction (UP/DOWN), amount invested, outcome badge, realized PnL
  - [x] 3.2: Color-code PnL (green positive, red negative, muted for refund/zero, dash for sold-early)
  - [x] 3.3: Show settlement time as relative "time ago" (duplicate `formatTimeAgo` locally — do NOT modify settlement-history-row.tsx)
  - [x] 3.4: Write component tests (include sold-early display)
- [x] Task 4: Create `TradingHistoryList` component (AC: #1, #7, #8)
  - [x] 4.1: Loading skeleton, empty state ("Your trade history will appear here"), wallet-not-connected state with `WalletButton`
  - [x] 4.2: Column headers: Asset, Direction, Amount, Outcome, PnL, Time
  - [x] 4.3: ScrollArea with max height + "Load more" pagination button
  - [x] 4.4: Write component tests (include wallet-not-connected state)
- [x] Task 5: Create `TradingStatsBar` component (AC: #6)
  - [x] 5.1: Display total PnL, win rate, total trades, total volume in a compact stats bar
  - [x] 5.2: Color-code total PnL (green/red)
  - [x] 5.3: Write component tests
- [x] Task 6: Update `HistoryFeature` with tab navigation (AC: #5, #8)
  - [x] 6.1: Add shadcn `Tabs` to `history-feature.tsx` with "Settlement History" (default) and "My Trades" tabs
  - [x] 6.2: "Settlement History" tab renders existing `SettlementHistoryList` + `AssetTabs` (unchanged behavior)
  - [x] 6.3: "My Trades" tab renders asset filter tabs ("All", BTC, ETH, SOL, FOGO) + `TradingStatsBar` + `TradingHistoryList`
  - [x] 6.4: Update page metadata title to "History | FOGO Pulse"
  - [x] 6.5: Write component tests
- [x] Task 7: Integration and regression testing
  - [x] 7.1: Verify existing Settlement History (Story 3.9) still works correctly under new tab
  - [x] 7.2: Verify existing Positions Panel (Story 4.2/4.4) unaffected
  - [x] 7.3: Run full test suite, confirm no regressions

## Dev Notes

### Critical: Distinction from Settlement History (Story 3.9)

The existing `/history` route (`web/src/app/history/page.tsx`) renders `HistoryFeature` which shows **epoch-level settlement outcomes** — any epoch that settled, regardless of whether the user traded in it. This story creates a **personal trading history** that ONLY shows epochs where the connected user had a position, with realized PnL calculations.

**DO NOT modify the existing Settlement History components.** Create new, separate components for Trading History.

### Approach: Extend Existing `/history` Route vs New Route

The existing `/history` page currently only shows Settlement History. The recommended approach is to **add a tab system to the existing `/history` page** with two tabs:
- "Settlement History" (existing `SettlementHistoryList` — default)
- "My Trades" (new `TradingHistoryList`)

This keeps history-related views colocated and avoids creating a new route. Update `HistoryFeature` to include tab navigation.

### Realized PnL Calculation — MUST REUSE Existing Functions

**DO NOT reinvent PnL math.** Reuse these existing functions from `web/src/hooks/use-claimable-amount.ts`:
- `getClaimState(epoch, position)` — returns `ClaimState` ('winner'|'refund'|'claimed'|'lost'|'no-position'|'not-settled')
- `calculatePayout(positionAmount, winnerTotal, loserTotal)` — exact on-chain payout formula
- `formatUsdcAmount(amount)` — formats bigint USDC lamports to display string

**Realized PnL per trade:**
- `winner`: `payout - position.amount` (positive). Payout = `calculatePayout(position.amount, winnerTotal, loserTotal)`
- `claimed` with `shares > 0n`: user already claimed a winning payout — recalculate payout using `calculatePayout(position.amount, winnerTotal, loserTotal)`, show PnL as positive
- `claimed` with `shares === 0n`: **SOLD EARLY** — user exited via `sell_position` before settlement. On-chain sets `claimed=true, shares=0, amount=0`. The sale proceeds are NOT stored in the position account. Display outcome as "Sold Early" with PnL as "—" (not calculable from on-chain state)
- `lost`: `-position.amount` (negative, lost entire stake)
- `refund`: `0n` (got original amount back)

**CRITICAL: Detecting Sold-Early Positions**
The `getClaimState` function returns `{ type: 'claimed' }` for BOTH:
1. Winners who claimed their payout (have `shares > 0n`, `amount > 0n`)
2. Users who sold early via `sell_position` (have `shares === 0n`, `amount === 0n`, `claimed === true`)

You MUST distinguish these two cases by checking `position.shares === 0n` after `getClaimState` returns `'claimed'`:
```typescript
if (claimState.type === 'claimed') {
  if (position.shares === 0n) {
    // Sold early — no PnL calculable from account state
    outcome = 'sold-early'
    realizedPnl = null
  } else {
    // Claimed winner — recalculate payout for display
    outcome = 'won'
    realizedPnl = calculatePayout(position.amount, winnerTotal, loserTotal) - position.amount
  }
}
```

### `TradingHistoryEntry` Type Definition

Define this type in `use-trading-history.ts`:
```typescript
export interface TradingHistoryEntry {
  asset: Asset
  epochId: bigint
  epochPda: PublicKey
  direction: 'up' | 'down'
  amountInvested: bigint        // Original position.amount (0n for sold-early)
  outcome: 'won' | 'lost' | 'refund' | 'sold-early'
  realizedPnl: bigint | null    // null for sold-early (not calculable)
  payoutAmount: bigint | null   // Full payout for winners, null for sold-early
  settlementTime: number        // Unix timestamp of settlement
  settlement: LastSettledEpochData
  position: UserPositionData
}

export interface TradingStats {
  totalRealizedPnl: bigint
  winCount: number
  lossCount: number
  refundCount: number
  soldEarlyCount: number
  totalVolume: bigint           // Sum of amountInvested across all trades
  winRate: number               // wins / (wins + losses), 0 if no wins+losses
}
```

### Data Fetching Strategy — Multi-Asset History

For "All Assets" mode, the hook must iterate across all 4 asset pools. **Fetch all 4 pools in parallel** using `Promise.all` in the queryFn for performance. Follow this pattern:

1. For each asset (or selected asset), use `usePool(asset)` to get `pool.nextEpochId`
2. Walk backwards from `nextEpochId - 1` using `tryFetchSettledEpoch()` (from `web/src/lib/epoch-utils.ts`)
3. For each settled epoch found, check if user has a position via `derivePositionPda` + fetch
4. Only include epochs where the user HAD a position
5. Merge results from all assets, sort by settlement time descending

**Existing pattern to follow:** `useSettlementHistory` hook (`web/src/hooks/use-settlement-history.ts`) — same backward-walk with `tryFetchSettledEpoch`, same `batchCount` pagination pattern with "Load more".

**Key difference:** Settlement History fetches ALL settled epochs. Trading History must ALSO fetch user positions and FILTER to only those with positions.

### Batch Position Fetching

Reuse `useUserPositionsBatch` (`web/src/hooks/use-user-positions-batch.ts`) for efficient batch position fetching. This hook:
- Takes `PublicKey[]` of epoch PDAs
- Returns `Map<string, UserPositionData>` keyed by epoch PDA base58
- Uses `Promise.allSettled` — gracefully handles missing positions

### Asset Filter Tabs — "All" Tab Addition

The existing `AssetTabs` component (`web/src/components/trading/asset-tabs.tsx`) renders 4 tabs for BTC/ETH/SOL/FOGO with no "All" option. For this story you need an "All" tab.

**Options:**
1. Create a new `TradingHistoryTabs` component that extends the pattern with an "All" option (recommended — keeps `AssetTabs` unchanged for other consumers)
2. Use a `filter` prop: `Asset | 'ALL'`

### Component Patterns to Follow

**Row component:** Follow `SettlementHistoryRow` pattern (`web/src/components/trading/settlement-history-row.tsx`):
- Compact single-line layout with columns
- Use `Badge` for outcome badges with same color patterns: `text-up/bg-up/20` for wins, `text-down/bg-down/20` for losses, `text-warning/bg-warning/20` for refunds
- `formatTimeAgo()` — **duplicate** the local function from `settlement-history-row.tsx` into `trading-history-row.tsx` (do NOT modify settlement-history-row.tsx to extract it)
- Direction arrows: `ArrowUp`/`ArrowDown` from `lucide-react` with `text-up`/`text-down` colors

**List component:** Follow `SettlementHistoryList` pattern:
- `ScrollArea` with `max-h-[400px]`
- Skeleton loading state (4 placeholder rows)
- Empty state with centered icon + message ("Your trade history will appear here" + "Make your first trade" CTA per UX spec)
- Column headers in `text-[10px] font-medium uppercase tracking-wider text-muted-foreground`
- "Load more" button: `variant="ghost" size="sm"` with `Loader2` spinner when loading

**Wallet-not-connected state:** Follow the `FaucetFeature` pattern — show centered message + `WalletButton`:
```tsx
import { WalletButton } from '@/components/wallet/wallet-button'

if (!connected) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="mb-3 text-sm text-muted-foreground">Connect wallet to view your trading history</p>
      <WalletButton />
    </div>
  )
}
```

**Sold-early badge:** Add a 4th outcome variant alongside Won/Lost/Refunded:
- Badge: `"SOLD EARLY"` with `text-muted-foreground/bg-muted/20` styling (neutral, not win/loss)
- PnL column: show "—" dash instead of a dollar amount

**Stats bar:** No direct precedent exists. Create a compact horizontal bar using `Card` component with 4 stat items. Follow `PortfolioSummary` pattern from `multi-asset-positions-panel.tsx` if it exists.

### UI Color Tokens

- **Positive/Win:** `text-up` (green)
- **Negative/Loss:** `text-down` (red)
- **Refund/Warning:** `text-warning` (amber)
- **Neutral/Muted:** `text-muted-foreground`
- **Asset colors:** `ASSET_METADATA[asset].color` from `web/src/lib/constants.ts` (BTC=orange, ETH=blue, SOL=purple, FOGO=primary)

### Testing Standards

- **Framework:** Vitest + React Testing Library (co-located tests)
- **Hook tests:** Mock `useQuery`, `useWallet`, `useProgram`. Test data transformation logic.
- **Component tests:** Render with mock data, verify correct display, test loading/empty/populated states, test filter interactions
- **Naming:** `*.test.tsx` or `*.test.ts` co-located with source file
- **Coverage:** All acceptance criteria must have at least one test. Test edge cases: no positions, all refunds, mixed results, single asset, sold-early positions (shares=0, claimed=true), wallet not connected, user with only sold-early positions (should show empty PnL stats)

### TanStack Query Key Convention

Add a new query key to `QUERY_KEYS` in `web/src/lib/constants.ts`:
```typescript
tradingHistory: (userPubkey?: string, asset?: string) =>
  userPubkey ? (['tradingHistory', userPubkey, asset] as const) : (['tradingHistory'] as const),
```

### Hooks Index Export

Add new hooks to `web/src/hooks/index.ts` barrel export.

### Project Structure Notes

**New files to create:**
```
web/src/hooks/use-trading-history.ts           — Main hook: fetches user's trading history
web/src/hooks/use-trading-history.test.ts      — Hook unit tests
web/src/components/trading/trading-history-row.tsx          — Single trade row
web/src/components/trading/trading-history-row.test.tsx     — Row component tests
web/src/components/trading/trading-history-list.tsx         — Scrollable trade list
web/src/components/trading/trading-history-list.test.tsx    — List component tests
web/src/components/trading/trading-stats-bar.tsx            — Aggregate stats display
web/src/components/trading/trading-stats-bar.test.tsx       — Stats bar tests
```

**Files to modify:**
```
web/src/components/history/history-feature.tsx  — Add tab system (Settlement History / My Trades)
web/src/app/history/page.tsx                    — Update metadata title to "History | FOGO Pulse"
web/src/lib/constants.ts                        — Add tradingHistory query key
web/src/hooks/index.ts                          — Export new hooks
```

**DO NOT modify:**
```
web/src/components/trading/settlement-history-list.tsx  — Existing, leave untouched
web/src/components/trading/settlement-history-row.tsx   — Existing, leave untouched
web/src/hooks/use-settlement-history.ts                — Existing, leave untouched
web/src/hooks/use-claimable-amount.ts                  — Existing, REUSE only
web/src/hooks/use-user-positions-batch.ts              — Existing, REUSE only
web/src/lib/epoch-utils.ts                             — Existing, REUSE only
```

### Previous Story Intelligence (Story 4.6)

**Key learnings from Story 4.6 (Cap Warning Indicators):**
- Always use `useMemo` for expensive calculations
- Use `formatUsdcAmount()` for consistent USDC display formatting
- Fee formula uses ceiling division: `(gross * 180n + 9999n) / 10000n` — relevant if showing fees in history
- Full test suite had 675/687 tests passing (12 pre-existing failures) — ensure no new failures

**Patterns established in Epic 4:**
- Components in `web/src/components/trading/` directory
- Hooks in `web/src/hooks/` directory
- Use `cn()` from `@/lib/utils` for conditional classnames
- Use `data-testid` attributes on all testable elements
- Use shadcn/ui components (`Badge`, `Card`, `ScrollArea`, `Skeleton`, `Button`, `Tabs`)
- BigInt arithmetic throughout for USDC lamports (6 decimals)

### Git Intelligence

Recent commits follow pattern: `feat(Story X.Y): Description with code review fixes`

Files consistently modified in Epic 4 stories:
- New components in `web/src/components/trading/`
- New hooks in `web/src/hooks/`
- Tests co-located with source files
- Sprint status updated in `_bmad-output/implementation-artifacts/sprint-status.yaml`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4 Story 4.7] — Story requirements and AC
- [Source: _bmad-output/planning-artifacts/prd.md#FR17] — Realized PnL requirement
- [Source: _bmad-output/planning-artifacts/prd.md#FR27] — Epoch history with outcomes
- [Source: _bmad-output/planning-artifacts/architecture.md#Client State] — Zustand + TanStack Query pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#Testing Strategy] — Vitest + RTL
- [Source: _bmad-output/planning-artifacts/architecture.md#Pattern Quick Reference] — Naming conventions
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty States] — "Your trade history will appear here" messaging
- [Source: web/src/hooks/use-settlement-history.ts] — Backward-walk pagination pattern to follow
- [Source: web/src/hooks/use-claimable-amount.ts] — PnL calculation functions to REUSE
- [Source: web/src/hooks/use-user-positions-batch.ts] — Batch position fetching to REUSE
- [Source: web/src/lib/epoch-utils.ts] — `tryFetchSettledEpoch` and `LastSettledEpochData` type
- [Source: web/src/components/trading/settlement-history-row.tsx] — Row layout pattern to follow
- [Source: web/src/components/trading/settlement-history-list.tsx] — List layout pattern to follow
- [Source: web/src/components/history/history-feature.tsx] — Existing history page to extend
- [Source: web/src/lib/constants.ts#QUERY_KEYS] — Query key convention
- [Source: web/src/lib/constants.ts#ASSET_METADATA] — Asset color tokens
- [Source: _bmad-output/implementation-artifacts/4-6-add-cap-warning-indicators.md] — Previous story learnings
- [Source: _bmad-output/project-context.md] — Project conventions and critical rules

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Test framework is Jest (not Vitest as stated in story Dev Notes) — adjusted test files accordingly
- Full test suite: 708 passed, 12 failed (all pre-existing failures in wallet-button, price-to-beat, direction-button, use-trade-preview, feedback route tests)
- TypeScript check: 7 pre-existing errors in 3 test files, no new errors from this story

### Completion Notes List

- Created `useTradingHistory` hook with backward-walk pagination across all 4 assets, reusing `getClaimState` + `calculatePayout` for PnL
- Stats computed via `computeTradingStats` (exported for testability) — integrated into same hook using `useMemo`
- Sold-early detection: `claimState.type === 'claimed' && position.shares === 0n` correctly distinguishes from claimed winners
- Multi-asset "ALL" mode fetches all 4 pools in parallel via `Promise.all`
- `TradingHistoryRow` displays asset, direction arrow, amount, outcome badge, color-coded PnL, and relative time
- `TradingStatsBar` follows `PortfolioSummary` pattern with Card layout
- `TradingHistoryList` handles wallet-not-connected, loading, empty, and populated states with "Load more" pagination
- `HistoryFeature` updated with shadcn Tabs: "Settlement History" (default) and "My Trades" tabs
- "My Trades" tab includes 5-column asset filter (All, BTC, ETH, SOL, FOGO) built inline in HistoryFeature
- Page metadata updated to "History | FOGO Pulse"
- No existing files from DO NOT modify list were changed
- 31 tests across 5 test suites, all passing (30 original + 1 added during code review)
- No regressions introduced (same 12 pre-existing failures)
- Added `PositionsAndTradesPanel` wrapper on trading page: tabbed panel below chart with "Positions" (default) and "My Trades" tabs, reusing `MultiAssetPositionsPanel` and `TradingHistoryList` (auto-filtered by active asset from `useUIStore`)
- Trading layout updated to swap `MultiAssetPositionsPanel` for `PositionsAndTradesPanel` — `/history` page remains independent with its own "ALL" filter
- Redesigned My Trades rows: `TradingHistoryRow` now uses `Collapsible` for expand/collapse. Collapsed row shows asset, direction, amount, outcome badge, PnL, inline claim button (for unclaimed won/refund trades), and time ago. Expanded row renders `SettlementStatusPanel` with full epoch settlement details (start/settlement prices, confidence, outcome, verification links). Rows have larger padding (`py-3 px-3`), hover states, and card-like feel. Column headers removed from `TradingHistoryList`. Max height increased from 400px to 600px.

### Change Log

- 2026-03-17: Story 4.7 implementation — Trading History View with realized PnL, aggregate stats, asset filtering, and tab navigation
- 2026-03-17: Code review fixes — H1: consistent PnL calculation in computeTradingStats (use realizedPnl field for losses); M2: throw on unexpected claimState instead of silent misclassification; M3: handle negative timestamp diff in formatTimeAgo; added error-case test for classifyPosition
- 2026-03-17: Added "My Trades" tab to trading page — new `PositionsAndTradesPanel` wrapper below chart, auto-filters by active asset; updated `TradingLayout` to use it
- 2026-03-17: Redesign — My Trades rows as collapsible cards with inline claim buttons and expandable settlement details

### File List

**New files:**
- web/src/components/trading/positions-and-trades-panel.tsx
- web/src/hooks/use-trading-history.ts
- web/src/hooks/use-trading-history.test.ts
- web/src/components/trading/trading-history-row.tsx
- web/src/components/trading/trading-history-row.test.tsx
- web/src/components/trading/trading-history-list.tsx
- web/src/components/trading/trading-history-list.test.tsx
- web/src/components/trading/trading-stats-bar.tsx
- web/src/components/trading/trading-stats-bar.test.tsx
- web/src/components/history/history-feature.test.tsx

**Modified files:**
- web/src/components/history/history-feature.tsx — Added tab navigation (Settlement History / My Trades)
- web/src/app/history/page.tsx — Updated metadata title to "History | FOGO Pulse"
- web/src/lib/constants.ts — Added `tradingHistory` query key to QUERY_KEYS
- web/src/hooks/index.ts — Added barrel export for `use-trading-history`
- web/src/components/trading/trading-layout.tsx — Swapped `MultiAssetPositionsPanel` for `PositionsAndTradesPanel`
- _bmad-output/implementation-artifacts/sprint-status.yaml — Status updated
