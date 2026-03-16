# Story 4.5: Implement Early Exit UI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want an interface to sell my position before settlement,
so that I can lock in profits or cut losses with full transparency on fees, return, and price impact.

## Acceptance Criteria

1. **Given** an open position in an active epoch (state = Open), **When** I click "Sell" on my position in the `YourPosition` card, **Then** a sell dialog opens showing a comprehensive exit preview with estimated return, fees, price impact, and realized PnL.
2. **Given** the sell dialog is open, **When** I view the exit preview, **Then** I see: gross return (CPMM calculation), fee amount (1.8%), net return after fees, realized PnL (net return minus entry amount), and price impact percentage.
3. **Given** the sell dialog is open, **When** I view the fee breakdown, **Then** I can see the fee split: 70% LP, 20% Treasury, 10% Insurance (matching `TradePreview` tooltip pattern).
4. **Given** the sell dialog is open with a valid preview, **When** I click "Confirm Sell", **Then** the `sell_position` transaction is submitted, toast feedback shows progress, and on success the position updates reflect the sale.
5. **Given** the sell dialog is open, **When** the transaction is pending, **Then** the confirm button shows a loading spinner and is disabled (same pattern as buy flow).
6. **Given** I have an active position visible in the `AssetPositionRow` (multi-asset panel), **When** I expand the row and click "Sell Position", **Then** the app navigates to that asset tab AND opens the sell dialog on `YourPosition` for that asset.
7. **Given** the epoch transitions to Frozen state while the sell dialog is open, **When** the epoch state updates via WebSocket/polling, **Then** the sell button becomes disabled with a message "Epoch frozen — selling unavailable" and the dialog clearly indicates the epoch has entered freeze window.
8. **Given** a sell transaction fails (network error, insufficient reserves, etc.), **When** the error occurs, **Then** a toast error is shown with a retry action, and the dialog remains open with form state preserved.
9. **Given** FR12 (exit position early) from the PRD, **When** all acceptance criteria are met, **Then** the functional requirement is satisfied.

## Tasks / Subtasks

- [x] Task 1: Extract and enhance sell preview calculation into shared library (AC: #2, #3)
  - [x] 1.1: Move `estimateSellReturn()` from `your-position.tsx` into `web/src/lib/trade-preview.ts` as `calculateSellReturn()`. Signature:
    ```typescript
    export interface SellReturn {
      gross: bigint       // shares * sameReserves / oppositeReserves
      fee: bigint         // gross * TRADING_FEE_BPS / 10000
      net: bigint         // gross - fee
      feeSplit: {
        lpFee: bigint     // fee * 7000 / 10000
        treasuryFee: bigint // fee * 2000 / 10000
        insuranceFee: bigint // fee - lpFee - treasuryFee
      }
      realizedPnl: bigint // net - entryAmount
      realizedPnlPercent: number // Number(realizedPnl) / Number(entryAmount) * 100
      priceImpact: number // percentage change in implied probability
    }
    export function calculateSellReturn(
      shares: bigint,
      entryAmount: bigint,
      direction: 'up' | 'down',
      yesReserves: bigint,
      noReserves: bigint
    ): SellReturn
    ```
  - [x] 1.2: CPMM formula (matches on-chain `cpmm.rs::calculate_refund`):
    ```typescript
    const [sameReserves, oppositeReserves] = getReservesForDirection(direction, yesReserves, noReserves)
    if (oppositeReserves === 0n) return zeroResult
    const gross = (shares * sameReserves) / oppositeReserves
    // CRITICAL: On-chain uses ceiling division for fee. Match it:
    const fee = (gross * BigInt(TRADING_FEE_BPS) + 9999n) / 10000n
    const net = gross - fee
    ```
  - [x] 1.3: Fee split calculation (matches on-chain `calculate_fee_split`). Use named constants from `lib/constants.ts`:
    ```typescript
    import { LP_FEE_SHARE_BPS, TREASURY_FEE_SHARE_BPS, INSURANCE_FEE_SHARE_BPS } from '@/lib/constants'
    const lpFee = (fee * BigInt(LP_FEE_SHARE_BPS)) / 10000n
    const treasuryFee = (fee * BigInt(TREASURY_FEE_SHARE_BPS)) / 10000n
    const insuranceFee = fee - lpFee - treasuryFee  // remainder to avoid rounding loss
    ```
  - [x] 1.4: Price impact: compute probability shift if this sell were executed. Current probability = `sameReserves / (sameReserves + oppositeReserves)`. After sell, same_reserves decreases by net amount → recalculate. Display as percentage point change.
  - [x] 1.5: Remove inline `estimateSellReturn()` from `your-position.tsx` and import `calculateSellReturn` from `trade-preview.ts` instead.
  - [x] 1.6: Handle edge cases: `oppositeReserves === 0n` → all zeros; `entryAmount === 0n` → `realizedPnlPercent = 0`.

- [x] Task 2: Create `SellPreview` component (AC: #2, #3)
  - [x] 2.1: Create `web/src/components/trading/sell-preview.tsx` with `'use client'` directive
  - [x] 2.2: Props:
    ```typescript
    interface SellPreviewProps {
      sellReturn: SellReturn
      shares: bigint
      entryAmount: bigint
      direction: 'up' | 'down'
    }
    ```
  - [x] 2.3: Layout matches existing `TradePreview` pattern — `rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm`:
    ```
    EXIT PREVIEW
    ─────────────────────────
    Shares to sell:     1,234
    Gross return:      52.40 USDC
    Fee (1.8%):        -0.94 USDC  [?] ← tooltip with LP/Treasury/Insurance split
    ─────────────────────────
    Net return:        51.46 USDC
    Entry amount:      50.00 USDC
    Realized PnL:      +1.46 USDC (+2.9%)  ← green/red coloring
    Price impact:       0.2%  ← yellow warning if > 1%
    ```
  - [x] 2.4: Fee tooltip uses shadcn `Tooltip` (already installed) with `<Info className="h-3 w-3" />` icon from lucide-react and `cursor-help` class on the trigger span — matching `TradePreview` exactly. Show: "LP: 0.66 USDC | Treasury: 0.19 USDC | Insurance: 0.09 USDC".
  - [x] 2.5: Realized PnL coloring: `text-green-500` positive, `text-red-500` negative, `text-muted-foreground` zero.
  - [x] 2.6: Price impact warning: show `AlertTriangle` icon + yellow text if price impact > 1% (same threshold as buy preview in `trade-preview.tsx`).
  - [x] 2.7: Use `formatUsdcAmount()` from `hooks/use-claimable-amount.ts` for all USDC formatting.

- [x] Task 3: Enhance `YourPosition` sell dialog (AC: #1, #4, #5, #7, #8)
  - [x] 3.1: Modify `web/src/components/trading/your-position.tsx`
  - [x] 3.2: Replace the existing simple sell dialog content with the new `SellPreview` component:
    ```tsx
    <Dialog open={showSellDialog} onOpenChange={(open) => { if (!sellMutation.isPending) setShowSellDialog(open) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sell {direction.toUpperCase()} Position</DialogTitle>
          <DialogDescription>
            Exit your {ASSET_METADATA[asset].label} position
          </DialogDescription>
        </DialogHeader>
        <SellPreview
          sellReturn={sellReturn}
          shares={position.shares}
          entryAmount={position.amount}
          direction={direction}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowSellDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSellConfirm}
            disabled={sellMutation.isPending || epochState.isFrozen}
          >
            {sellMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Selling...</>
            ) : (
              'Confirm Sell'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    ```
  - [x] 3.3: Compute `sellReturn` using `calculateSellReturn(position.shares, position.amount, direction, pool.yesReserves, pool.noReserves)` with `useMemo` — dependencies: `[position.shares, position.amount, direction, pool?.yesReserves, pool?.noReserves]`.
  - [x] 3.4: Epoch freeze guard: Use `epochState.isFrozen` boolean from `useEpoch` hook (more reliable than raw state check — also covers the edge case where freeze time has passed but on-chain state hasn't transitioned yet). Disable confirm button when `epochState.isFrozen === true`. Show inline message: "Epoch frozen — selling unavailable" when frozen.
  - [x] 3.5: Keep existing sell button trigger ("Sell Position" button). No changes to button placement or visibility logic.
  - [x] 3.6: Error handling: existing `useSellPosition` hook already handles toast errors with retry. Dialog stays open on error (no `onOpenChange` triggered by mutation).
- [x] Task 4: Add sell entry point to `AssetPositionRow` (AC: #6)
  - [x] 4.1: Modify `web/src/components/trading/asset-position-row.tsx`
  - [x] 4.2: Add "Sell Position" button next to existing "Trade {label}" button in expanded content. Show when shares > 0 (the actual epoch freeze guard is handled at the `YourPosition` dialog level — `AssetPositionRow` does not have epoch state in its `AssetPositionInfo` props, so do NOT try to check epoch state here).
  - [x] 4.3: The sell action from multi-asset panel must:
    1. Navigate to the asset tab: `useUIStore.setState({ activeAsset: asset })`
    2. Signal that the sell dialog should open on `YourPosition`
  - [x] 4.4: Communication pattern — use `useUIStore` to add a `pendingSellAsset` field:
    ```typescript
    // In ui-store.ts, add:
    pendingSellAsset: Asset | null  // Set when sell triggered from multi-asset panel
    setPendingSellAsset: (asset: Asset | null) => void
    ```
  - [x] 4.5: In `AssetPositionRow`, the sell button handler:
    ```typescript
    const handleSellFromRow = () => {
      useUIStore.setState({ activeAsset: asset, pendingSellAsset: asset })
    }
    ```
  - [x] 4.6: In `YourPosition`, add a `useEffect` that watches `pendingSellAsset`:
    ```typescript
    const pendingSellAsset = useUIStore((s) => s.pendingSellAsset)
    useEffect(() => {
      if (pendingSellAsset === asset && position && position.shares > 0n) {
        setShowSellDialog(true)
        useUIStore.setState({ pendingSellAsset: null }) // Clear after opening
      }
    }, [pendingSellAsset, asset, position])
    ```
  - [x] 4.7: Props change for `AssetPositionRow`: add `onSellPosition?: (asset: Asset) => void` callback. `MultiAssetPositionsPanel` passes the handler.

- [x] Task 5: Update `ui-store.ts` with sell coordination state (AC: #6)
  - [x] 5.1: Modify `web/src/stores/ui-store.ts`
  - [x] 5.2: Add `pendingSellAsset: Asset | null` to state (default: `null`)
  - [x] 5.3: Add `setPendingSellAsset` action
  - [x] 5.4: Minimal change — do NOT restructure existing store logic.

- [x] Task 6: Update `MultiAssetPositionsPanel` to wire sell action (AC: #6)
  - [x] 6.1: Modify `web/src/components/trading/multi-asset-positions-panel.tsx`
  - [x] 6.2: Add `handleSellPosition` handler that sets `pendingSellAsset` via store
  - [x] 6.3: Pass `onSellPosition={handleSellPosition}` to each `AssetPositionRow`

- [x] Task 7: Write unit tests for `calculateSellReturn` (AC: #2, #3)
  - [x] 7.1: Add tests to `web/src/lib/trade-preview.test.ts` (existing test file)
  - [x] 7.2: Test: basic sell return calculation matches inverse CPMM formula
  - [x] 7.3: Test: fee split sums to total fee (lpFee + treasuryFee + insuranceFee === fee)
  - [x] 7.4: Test: realized PnL = net - entryAmount (positive and negative cases)
  - [x] 7.5: Test: `oppositeReserves === 0n` → all zeros
  - [x] 7.6: Test: `entryAmount === 0n` → `realizedPnlPercent === 0`
  - [x] 7.7: Test: price impact calculation is non-negative

- [x] Task 8: Write component tests for `SellPreview` (AC: #2, #3)
  - [x] 8.1: Create `web/src/components/trading/sell-preview.test.tsx`
  - [x] 8.2: Test: renders all preview fields (gross, fee, net, PnL, price impact)
  - [x] 8.3: Test: positive PnL renders with green text
  - [x] 8.4: Test: negative PnL renders with red text
  - [x] 8.5: Test: high price impact shows warning icon

- [x] Task 9: Write component tests for enhanced sell dialog (AC: #1, #4, #5, #7)
  - [x] 9.1: Add tests to existing `web/src/components/trading/your-position.test.tsx`
  - [x] 9.2: Test: sell button opens dialog with SellPreview
  - [x] 9.3: Test: confirm button disabled when epoch is frozen
  - [x] 9.4: Test: confirm button shows spinner during pending transaction
  - [x] 9.5: Test: `pendingSellAsset` from store triggers dialog open

- [x] Task 10: Write component tests for `AssetPositionRow` sell button (AC: #6)
  - [x] 10.1: Add tests to existing `web/src/components/trading/asset-position-row.test.tsx`
  - [x] 10.2: Test: "Sell Position" button visible when epoch is Open and shares > 0
  - [x] 10.3: Test: clicking sell button calls `onSellPosition` callback

## Dev Notes

### Architecture Patterns & Constraints

**This is a FRONTEND-ONLY story — no on-chain changes required.**

The `sell_position` instruction was implemented in Story 4.1. The `useSellPosition` hook and `buildSellPositionInstruction` already handle the full transaction flow. This story enhances the UI layer only.

**On-chain sell_position supports partial sells** — the instruction accepts a `shares: u64` argument and handles both full and partial exits. However, this story implements **full exit only** (selling all shares), matching the current behavior. Partial sell UI can be added later as an enhancement.

### Existing Code to Reuse (DO NOT DUPLICATE)

**Hooks (already implemented):**
- `useSellPosition()` from `hooks/use-sell-position.ts` — TanStack Query mutation, handles toast feedback, query invalidation, wallet rejection
- `useEpoch(asset)` from `hooks/use-epoch.ts` — epoch state for Open/Frozen checks
- `usePool(asset)` from `hooks/use-pool.ts` — pool reserves for sell calculations
- `useUserPosition(epochPda)` from `hooks/use-user-position.ts` — position data

**Utility Functions (already implemented):**
- `getReservesForDirection(direction, yesReserves, noReserves)` from `lib/trade-preview.ts` — maps direction to same/opposite reserves
- `formatUsdcAmount(lamports)` from `hooks/use-claimable-amount.ts` — BigInt USDC → display string
- `TRADING_FEE_BPS` from `lib/constants.ts` — value is `180` (1.8%)

**UI Components (shadcn/ui — already installed):**
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `ui/dialog`
- `Button` from `ui/button`
- `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` from `ui/tooltip`
- `Separator` from `ui/separator`
- `Loader2` from `lucide-react` — spinner icon
- `AlertTriangle` from `lucide-react` — warning icon
- `Info` from `lucide-react` — fee tooltip trigger icon (h-3 w-3, cursor-help)

**Pattern References:**
- `TradePreview` component (`components/trading/trade-preview.tsx`) — layout pattern for preview display: `rounded-lg border bg-muted/30 p-3 space-y-2 text-sm` with label-value rows
- `TradePreview` fee tooltip — tooltip showing LP/Treasury/Insurance breakdown
- Buy confirmation flow in `trade-ticket.tsx` — button state machine pattern
- `PnLDisplay` (`components/trading/pnl-display.tsx`) — green/red color pattern for PnL

### CPMM Sell Formula (Must Match On-Chain)

The frontend sell preview MUST match the on-chain calculation in `anchor/programs/fogopulse/src/utils/cpmm.rs::calculate_refund`:

```typescript
// Frontend (BigInt) — must produce same result as on-chain (u64/u128)
const gross = (shares * sameReserves) / oppositeReserves
```

On-chain uses u128 intermediates: `(shares as u128 * same_reserves as u128) / opposite_reserves as u128`. JavaScript BigInt division truncates toward zero (same as Rust integer division), so results match exactly.

**Fee calculation on-chain** (`calculate_fee_split`) — USES CEILING DIVISION for total fee:
```rust
total_fee = (gross_amount * trading_fee_bps as u64 + 9999) / 10000  // ceiling
lp_fee = (total_fee * lp_fee_share_bps as u64) / 10000              // floor
treasury_fee = (total_fee * treasury_fee_share_bps as u64) / 10000   // floor
insurance_fee = total_fee - lp_fee - treasury_fee                    // remainder
```

Frontend MUST use ceiling division for total fee to match on-chain: `(gross * BigInt(TRADING_FEE_BPS) + 9999n) / 10000n`. The existing `estimateSellReturn()` in `your-position.tsx` uses floor division — this is a known pre-existing discrepancy being fixed in this story.

### Sell Flow State Management

**No new Zustand store needed.** The sell dialog state stays local to `YourPosition` (existing `showSellDialog` useState). The only store addition is `pendingSellAsset` in `ui-store.ts` for cross-component sell triggering from the multi-asset panel.

**Data flow for sell from multi-asset panel:**
```
AssetPositionRow "Sell Position" click
  → useUIStore.setState({ activeAsset: asset, pendingSellAsset: asset })
  → Asset tab switches (AssetTabs reads activeAsset)
  → YourPosition re-renders for new asset
  → useEffect detects pendingSellAsset === asset
  → setShowSellDialog(true)
  → useUIStore.setState({ pendingSellAsset: null })  // clear
```

### Epoch Freeze Handling

Use `epochState.isFrozen` boolean from the `useEpoch` hook — this is more reliable than checking `epoch.state === EpochState.Frozen` directly because it also covers the edge case where the local timer has entered the freeze window but the on-chain state hasn't transitioned yet (computed from timestamps).

When `epochState.isFrozen` becomes `true`:
- The "Sell Position" button on `YourPosition` should remain visible but the confirm button in the dialog should be disabled
- Show message: "Epoch frozen — selling unavailable"
- The `sell_position` on-chain instruction will reject with `EpochNotOpen` if epoch is frozen, but the frontend should prevent the attempt

### Project Structure Notes

- New file: `web/src/components/trading/sell-preview.tsx` — sell exit preview component
- New file: `web/src/components/trading/sell-preview.test.tsx` — preview tests
- Modified: `web/src/lib/trade-preview.ts` — add `calculateSellReturn()` and `SellReturn` interface
- Modified: `web/src/components/trading/your-position.tsx` — enhanced sell dialog with SellPreview
- Modified: `web/src/components/trading/asset-position-row.tsx` — add sell button
- Modified: `web/src/components/trading/multi-asset-positions-panel.tsx` — wire sell callback
- Modified: `web/src/stores/ui-store.ts` — add `pendingSellAsset` state

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 4, Story 4.5]
- [Source: _bmad-output/planning-artifacts/prd.md - FR12 (exit position early)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md - Early Exit flow: Click Exit → Preview Exit Payout → Confirm Exit]
- [Source: _bmad-output/planning-artifacts/architecture.md - CPMM formula, fee structure, cap enforcement, sell_position instruction]
- [Source: _bmad-output/project-context.md - Transaction handler pattern, naming conventions, BigInt arithmetic]
- [Source: anchor/programs/fogopulse/src/instructions/sell_position.rs - On-chain sell instruction, validations, fee split]
- [Source: anchor/programs/fogopulse/src/utils/cpmm.rs - calculate_refund formula]
- [Source: web/src/hooks/use-sell-position.ts - Sell mutation hook with toast feedback]
- [Source: web/src/lib/transactions/sell.ts - buildSellPositionInstruction]
- [Source: web/src/components/trading/your-position.tsx - Current sell dialog (to enhance)]
- [Source: web/src/components/trading/trade-preview.tsx - Layout pattern and fee tooltip pattern]
- [Source: web/src/components/trading/asset-position-row.tsx - Multi-asset row (add sell button)]
- [Source: web/src/stores/ui-store.ts - activeAsset state (add pendingSellAsset)]
- [Source: web/src/lib/trade-preview.ts - Existing calculation utilities to extend]

### Previous Story Intelligence (Story 4.4)

- Story 4.4 established the multi-asset panel with `AssetPositionRow` components. The "Trade" button navigates to asset tabs via `useUIStore.setState({ activeAsset })`. The sell button should follow the same pattern but additionally trigger the sell dialog.
- `useMultiAssetPositions` hook provides `AssetPositionInfo` with `position`, `pool`, `epochPda`, and `pnl` data — all needed for sell preview but calculated at the `YourPosition` level, not passed from multi-asset panel.
- Chart height fix in Story 4.4 — changed ChartArea from `min-h-*` to fixed `h-[400px]/h-[450px]/h-[500px]`. Do not modify chart heights.
- Pre-existing test failures (12 failures) exist on master — do not attempt to fix unrelated test failures.
- `useUserPositionsBatch` query key `['positionsBatch']` is already invalidated in `useSellPosition` hook (added in Story 4.4).

### Git Intelligence

Recent commits:
- `ddd8403` feat(Story 4.4): Implement multi-asset position view with code review fixes
- `200e645` fix: Remove ConfidenceOverlap refund logic from settlement
- `7ef2756` feat(Story 4.3): Implement position PnL calculations with code review fixes
- `e325889` feat(Story 4.2): Implement active positions panel with code review fixes
- `1e5a24c` feat(Story 4.1): Implement sell_position instruction with code review fixes

Patterns established:
- Commit prefix: `feat(Story X.Y):` for story implementations
- Code review fixes included in same commit
- Tests co-located with components (`*.test.tsx` alongside `*.tsx`)
- All UI components use `'use client'` directive + shadcn/ui + Tailwind CSS
- React 19.2.1 + Next.js 16.0.10 + TanStack Query 5.89.0
- Jest 30.1.3 + `@testing-library/react` 16.3.2 for component tests

### Latest Tech Notes

- TanStack Query 5.89.0: `useMutation` returns `{ mutateAsync, isPending }`. `isPending` replaces deprecated `isLoading` in v5.
- React 19.2.1: `useEffect` cleanup runs synchronously. The `pendingSellAsset` clear in useEffect is safe.
- shadcn/ui Dialog: `onOpenChange` callback fires when user clicks backdrop or presses Escape. Must NOT close dialog during pending mutation — use `onOpenChange={(open) => { if (!sellMutation.isPending) setShowSellDialog(open) }}`.
- `Loader2` icon from lucide-react: animate with `className="animate-spin"`.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed lint warnings: removed unused `useMemo` import, unused `direction` destructure in SellPreview, restored missing `YourPositionProps` interface
- Fixed test mock for `useUIStore.setState` (jest.mock hoisting issue)
- Pre-existing test failures (12 tests in 5 suites) confirmed on master — no regressions introduced

### Completion Notes List

- Extracted `calculateSellReturn()` with full `SellReturn` interface into shared `trade-preview.ts` library
- Fixed pre-existing fee calculation discrepancy: now uses ceiling division `(gross * 180n + 9999n) / 10000n` matching on-chain `calculate_fee_split`
- Created `SellPreview` component matching `TradePreview` layout pattern with fee tooltip, PnL coloring, price impact warning
- Enhanced `YourPosition` sell dialog with `SellPreview`, epoch freeze guard, loading spinner, dialog close prevention during pending
- Added sell entry point in `AssetPositionRow` with `onSellPosition` callback
- Added `pendingSellAsset` coordination state in `ui-store.ts` for cross-component sell triggering
- Wired sell action from `MultiAssetPositionsPanel` through `AssetPositionRow` to `YourPosition`
- All 88 story-related tests pass (10 unit + 8 SellPreview + 22 YourPosition + 8 AssetPositionRow + 10 MultiAssetPositionsPanel + 30 trade-preview)

### Code Review Fixes Applied (2026-03-16)

- **H1 FIX**: `calculateSellReturn` now returns 1:1 refund (matching on-chain `calculate_refund`) when `oppositeReserves === 0n`, instead of incorrectly showing total loss
- **H2/M1 FIX**: Added `useMemo` for `sellReturn` calculation in `your-position.tsx` as specified in Task 3.3
- **H3 FIX**: `SellPreview` shares display now uses `formatUsdcAmount(shares)` instead of raw `shares.toString()` for human-readable formatting
- **M2 FIX**: Removed unused `direction` prop from `SellPreviewProps` interface and all call sites
- **M3 FIX**: Added fee tooltip trigger test and shares formatting test to `sell-preview.test.tsx`
- **M4 FIX**: Added proper freeze guard test that opens dialog while open, then freezes epoch to verify disabled confirm button and freeze message

### Change Log

- 2026-03-16: Implemented Story 4.5 — Early Exit UI with comprehensive sell preview, cross-component sell coordination, and epoch freeze guard
- 2026-03-16: Code review fixes — Fixed oppositeReserves=0 edge case, added useMemo, fixed shares display, removed unused direction prop, improved tests

### File List

- web/src/lib/trade-preview.ts (modified) — Added `SellReturn` interface and `calculateSellReturn()` function
- web/src/lib/trade-preview.test.ts (modified) — Added 8 unit tests for `calculateSellReturn`
- web/src/components/trading/sell-preview.tsx (new) — SellPreview component with fee tooltip, PnL coloring, price impact warning
- web/src/components/trading/sell-preview.test.tsx (new) — 8 component tests for SellPreview
- web/src/components/trading/your-position.tsx (modified) — Enhanced sell dialog with SellPreview, epoch freeze guard, pendingSellAsset listener
- web/src/components/trading/your-position.test.tsx (modified) — Updated sell dialog tests, added freeze guard + spinner + pendingSellAsset tests
- web/src/components/trading/asset-position-row.tsx (modified) — Added Sell Position button with onSellPosition callback
- web/src/components/trading/asset-position-row.test.tsx (modified) — Added 3 sell button tests
- web/src/components/trading/multi-asset-positions-panel.tsx (modified) — Wired handleSellPosition to AssetPositionRow
- web/src/stores/ui-store.ts (modified) — Added pendingSellAsset state and setPendingSellAsset action
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified) — Updated story status
- _bmad-output/implementation-artifacts/4-5-implement-early-exit-ui.md (modified) — Story file updates
