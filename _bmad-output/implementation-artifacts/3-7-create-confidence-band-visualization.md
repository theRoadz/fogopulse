# Story 3.7: Create Confidence Band Visualization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want a visual explanation of refund scenarios,
so that I understand why an epoch was refunded instead of settled with a winner.

## Acceptance Criteria

1. **Given** a refunded epoch, **when** I view the refund explanation, **then** a visual diagram shows the start price with its confidence band as a horizontal range/rectangle.

2. **Given** a refunded epoch, **when** I view the confidence band visualization, **then** the settlement price with its confidence band is overlaid as a second horizontal range/rectangle, visually distinct from the start band.

3. **Given** overlapping confidence bands, **when** the visualization renders, **then** the overlap region is shown with a distinct color/pattern for informational purposes (overlap no longer triggers refunds).

4. **Given** the confidence band visualization, **when** displayed, **then** text explains: "The confidence bands show the oracle's measurement uncertainty at each price point. Your funds have been returned because the settlement price exactly matched the start price." (from UX spec).

5. **Given** the visualization, **when** rendered, **then** exact confidence values and prices are shown alongside the visual (start price +/- confidence, settlement price +/- confidence).

6. **Given** the visualization component, **when** integrated, **then** it is accessible from the existing RefundExplanation component's "View Confidence Bands" button (currently disabled with Story 3.7 placeholder).

7. **Given** the confidence band visualization, **when** viewed on mobile, **then** it remains legible and properly responsive (scales to available width).

**Requirements Traceability:** FR25 (refund explanation), FR26 (confidence visualization), AR28 (confidence band visualization)

## Tasks / Subtasks

- [x] Task 1: Create ConfidenceBandChart component (AC: #1, #2, #3, #5, #7)
  - [x] 1.1: Create SVG-based horizontal band visualization component with this props interface:
    ```typescript
    interface ConfidenceBandChartProps {
      startPrice: bigint      // Pyth-scaled (exponent -8)
      startConfidence: bigint  // Pyth-scaled (exponent -8)
      settlementPrice: bigint  // Pyth-scaled (exponent -8)
      settlementConfidence: bigint // Pyth-scaled (exponent -8)
      className?: string
    }
    ```
  - [x] 1.2: Render start price band as a colored rectangle using band boundary math (see Dev Notes)
  - [x] 1.3: Render settlement price band as a second colored rectangle
  - [x] 1.4: Calculate and highlight the overlap region with distinct styling (informational, no longer triggers refunds)
  - [x] 1.5: Add price labels (formatted USD) at band edges and center price markers
  - [x] 1.6: Use SVG `viewBox` with `preserveAspectRatio="xMidYMid meet"` for responsive sizing (no ResizeObserver)
  - [x] 1.7: Add `data-testid` attributes: `confidence-band-chart`, `start-band`, `settlement-band`, `overlap-region`
  - [x] 1.8: Support dark/light theme using inline `style={{ fill: 'var(--primary)' }}` for SVG fills

- [x] Task 2: Integrate inline expansion in RefundExplanation (AC: #4, #6)
  - [x] 2.1: Replace disabled "View Confidence Bands" button with a toggle button that expands to show the visualization inline
  - [x] 2.2: Expand within the existing CollapsibleContent (no Dialog/modal needed)
  - [x] 2.3: Include UX-spec copy: "The confidence bands show the oracle's measurement uncertainty at each price point. Your funds have been returned because the settlement price exactly matched the start price."
  - [x] 2.4: Render ConfidenceBandChart component with the existing bigint props
  - [x] 2.5: Include formatted price range details below the chart

- [x] Task 3: Wire up data flow (AC: #1, #2, #5)
  - [x] 3.1: Pass raw bigint values from RefundExplanation props directly into ConfidenceBandChart (same props, no transformation needed)
  - [x] 3.2: Inside ConfidenceBandChart, use `scalePrice()` from `lib/utils` to convert bigint to float for SVG coordinate calculation
  - [x] 3.3: Calculate band boundaries using the formulas in Dev Notes (band boundary math section)

- [x] Task 4: Styling and responsiveness (AC: #7)
  - [x] 4.1: Use design system colors via inline SVG styles: `style={{ fill: 'var(--primary)', opacity: 0.2 }}` for start band, `var(--warning)` for settlement band, `var(--destructive)` for overlap
  - [x] 4.2: Ensure mobile-first responsive layout (SVG viewBox handles scaling, labels use font-mono text-xs)
  - [x] 4.3: Match existing component patterns (rounded-lg border, font-mono for values, text-muted-foreground for labels)

- [x] Task 5: Update existing tests + write new tests (AC: all)
  - [x] 5.1: **Update `refund-explanation.test.tsx`** - Change assertions from disabled button with "(Coming in Story 3.7)" text to enabled toggle button that shows visualization
  - [x] 5.2: Test ConfidenceBandChart renders with valid data (check for start-band, settlement-band data-testid elements)
  - [x] 5.3: Test overlap region is highlighted when bands overlap (overlap-region data-testid present; overlap is informational, no longer triggers refunds)
  - [x] 5.4: Test no overlap region rendered when bands don't overlap (edge case)
  - [x] 5.5: Test RefundExplanation button toggles visualization visibility
  - [x] 5.6: Test accessibility (aria-label on SVG, role="img")
  - [x] 5.7: Run full test suite to verify no regressions in existing 48 tests

## Dev Notes

### Architecture & Approach

**SVG-based visualization (NOT canvas/Lightweight Charts).** The confidence band visualization is a static diagram showing two price ranges, not a real-time streaming chart. SVG is the right choice because:
- It's a one-time render of static settlement data (no animation/streaming needed)
- SVG scales perfectly for responsive design via viewBox
- SVG elements are accessible (aria-labels on rects/text)
- No additional library dependency needed
- The existing PriceChart uses Lightweight Charts for real-time data - this is a different use case

### Component Design

The visualization should be a **horizontal bar diagram** showing:

```
         Start Price Band (primary, 20% opacity)
    ┌─────────────[====OVERLAP====]──────────┐
    │    ├──────────────────────┤             │
    │    $45,000.25            $45,010.75     │
    │              ▼ $45,005.50              │
    │                                        │
    │         ├────────────────────────┤      │
    │         $45,005.00      $45,020.80     │
    │                  ▼ $45,012.90          │
    └────────────────────────────────────────┘
         Settlement Price Band (warning, 20% opacity)
         Overlap Region (destructive, 30% opacity)
```

**Visual Elements:**
- Two horizontal rectangles (bands) with semi-transparent fills
- Overlap region highlighted with distinct color
- Price labels at band edges
- Center markers (triangle/line) for actual price values within each band
- Legend identifying start vs settlement bands

### Band Boundary Calculation

All values are Pyth-scaled bigint (exponent -8). Convert to float for SVG coordinates:

```typescript
// Convert bigint to float
const startPriceF = scalePrice(startPrice)        // e.g., 45005.50
const startConfF  = scalePrice(startConfidence)    // e.g., 5.25
const settlePriceF = scalePrice(settlementPrice)   // e.g., 45012.90
const settleConfF  = scalePrice(settlementConfidence) // e.g., 7.90

// Band boundaries
const startLow  = startPriceF - startConfF         // left edge of start band
const startHigh = startPriceF + startConfF          // right edge of start band
const settleLow  = settlePriceF - settleConfF       // left edge of settlement band
const settleHigh = settlePriceF + settleConfF       // right edge of settlement band

// Overlap region (only if bands intersect)
const overlapLow  = Math.max(startLow, settleLow)
const overlapHigh = Math.min(startHigh, settleHigh)
const hasOverlap  = overlapLow < overlapHigh        // true = bands overlap = refund reason

// SVG coordinate space: map [globalMin, globalMax] to [padding, svgWidth - padding]
const globalMin = Math.min(startLow, settleLow)
const globalMax = Math.max(startHigh, settleHigh)
```

### Existing Infrastructure (from Story 3.6)

**RefundExplanation component** (`web/src/components/trading/refund-explanation.tsx`):
- Already has disabled "View Confidence Bands" button with `(Coming in Story 3.7)` text
- Already receives all needed props: `startPrice`, `startConfidence`, `settlementPrice`, `settlementConfidence` (all bigint)
- Already calculates display values using `scalePrice()` and `formatConfidencePercent()`
- Uses Collapsible from shadcn/ui - expand inline or switch to Dialog

**Data availability:**
- `SettlementDisplayData` interface in `hooks/use-settlement-display.ts` provides:
  - `startPriceRaw: bigint`, `startConfidenceRaw: bigint`
  - `settlementPriceRaw: bigint | null`, `settlementConfidenceRaw: bigint | null`
- `LastSettledEpochData` interface in `hooks/use-last-settled-epoch.ts` provides:
  - `startConfidenceRaw: bigint`, `settlementConfidenceRaw: bigint`
  - **Note:** `LastSettledEpochData` does NOT have `startPriceRaw` or `settlementPriceRaw` fields - only float versions. The `SettlementStatusPanel` uses `getStartPriceRaw()` helper to rescale float back to bigint when needed. However, `RefundExplanation` already receives raw bigint `startPrice` and `settlementPrice` props (passed by SettlementStatusPanel via those helpers), so ConfidenceBandChart will receive lossless bigint values.
- All values are Pyth-scaled (exponent -8), use `scalePrice(bigint)` to convert

**Formatting utilities** in `lib/utils.ts`:
- `scalePrice(price: bigint, exponent?: number): number` - bigint to float
- `formatUsdPrice(price: number): string` - format as "$X,XXX.XX"
- `formatConfidencePercent(confidence: bigint, price: bigint): string` - format as "X.XXXX%"

### Color Scheme

The project uses OKLch color space in `globals.css`. For SVG `fill`/`stroke` attributes, use inline `style` with CSS custom properties:

```tsx
// SVG rect fill using CSS variables (works in all modern browsers)
<rect style={{ fill: 'var(--primary)', opacity: 0.2 }} />   // Start band
<rect style={{ fill: 'var(--warning)', opacity: 0.2 }} />   // Settlement band
<rect style={{ fill: 'var(--destructive)', opacity: 0.3 }} /> // Overlap
<line style={{ stroke: 'var(--foreground)' }} />              // Price markers
```

Do NOT use `hsl(var(...))` - the variables already contain complete OKLch color values.

- **Start price band:** `var(--primary)` at 20% opacity (FOGO orange)
- **Settlement price band:** `var(--warning)` at 20% opacity (amber)
- **Overlap region:** `var(--destructive)` at 30% opacity (red)
- **Price labels:** Use `<foreignObject>` with Tailwind classes (`font-mono text-xs text-foreground`) or SVG `<text>` with `style={{ fill: 'var(--foreground)' }}`
- **Explanatory text:** `text-muted-foreground` (Tailwind class on wrapping HTML elements)

### Integration Pattern

**Inline expansion within RefundExplanation** - Replace the disabled button with a toggle that expands to show the visualization within the existing Collapsible flow. No Dialog/modal needed.

### Modification to RefundExplanation

Replace the disabled button block (lines 97-108 in `refund-explanation.tsx`):
```tsx
// BEFORE (Story 3.6 placeholder):
<Button variant="outline" size="sm" disabled className="gap-1.5 text-xs opacity-60">
  <ExternalLink className="h-3 w-3" />
  View Confidence Bands
  <span className="text-muted-foreground">(Coming in Story 3.7)</span>
</Button>

// AFTER (Story 3.7 implementation):
// Toggle button + ConfidenceBandChart component inline
```

### Testing Approach

- Use Vitest + React Testing Library (co-located tests)
- Test SVG renders with correct number of rect elements
- Test overlap calculation logic (pure function, easy to unit test)
- Test button in RefundExplanation is now enabled and toggles visualization
- Snapshot test for visual regression baseline

### Project Structure Notes

- **Files to Create:**
  - `web/src/components/trading/confidence-band-chart.tsx` - SVG visualization component
  - `web/src/components/trading/confidence-band-chart.test.tsx` - Component tests

- **Files to Modify:**
  - `web/src/components/trading/refund-explanation.tsx` - Replace disabled button with functional visualization trigger + inline ConfidenceBandChart
  - `web/src/components/trading/refund-explanation.test.tsx` - Update assertions: disabled button with "(Coming in Story 3.7)" text must be changed to test enabled toggle + visualization rendering

- **No new dependencies required** - SVG is native React, all utilities already exist

### Existing Patterns to Follow

From Story 3.6 and codebase analysis:
- Component files: kebab-case (`confidence-band-chart.tsx`)
- Component names: PascalCase (`ConfidenceBandChart`)
- Use `cn()` utility for class merging
- Use `'use client'` directive for interactive components
- Co-locate tests with source files
- Loading states via Skeleton component (not needed here - static data)
- Accessibility: `role`, `aria-label`, `aria-describedby` attributes
- Font styles: `font-mono text-xs` for numeric values, `text-muted-foreground` for labels

### Previous Story Intelligence (Story 3.6)

Key learnings from Story 3.6 implementation:
- **Reuse existing hooks** - Don't duplicate data fetching. The `useSettlementDisplay` and `useLastSettledEpoch` hooks already provide all needed data
- **Formatting utilities are shared** - `scalePrice`, `formatUsdPrice`, `formatConfidencePercent` already in `lib/utils.ts`. Do NOT create duplicates
- **Raw bigint values preserved** - Story 3.6 specifically kept raw bigint values (startConfidenceRaw, settlementConfidenceRaw) for use in Story 3.7
- **48 existing tests pass** - Don't break them. Run full test suite after changes
- **Code review found duplicate utilities** - Story 3.6 review caught duplicate formatting functions. Avoid creating any new utility that already exists

### Git Intelligence

Recent commit patterns:
- `feat(Story 3.6): Implement settlement status UI with code review fixes` - Combined implementation + review fixes in single commit
- `feat(Story 3.5): Implement fee distribution with code review fixes` - Same pattern
- Story commits reference the story number in conventional commit format

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 3, Story 3.7]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md - SettlementExplainer Component, Refund Experience Journey]
- [Source: _bmad-output/planning-artifacts/architecture.md - Epoch Account, Settlement Outcomes, Frontend Components]
- [Source: _bmad-output/planning-artifacts/prd.md - FR25, FR26, AR28, Confidence-Aware Settlement]
- [Source: web/src/components/trading/refund-explanation.tsx - Existing placeholder for Story 3.7]
- [Source: web/src/hooks/use-settlement-display.ts - SettlementDisplayData interface with raw values]
- [Source: web/src/hooks/use-last-settled-epoch.ts - LastSettledEpochData with confidence raw values]
- [Source: web/src/lib/utils.ts - scalePrice, formatUsdPrice, formatConfidencePercent]
- [Source: _bmad-output/project-context.md - UI/UX Rules, Color System, Component Patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None required - clean implementation with no debugging needed.

### Completion Notes List

- Created `ConfidenceBandChart` SVG-based visualization component with horizontal bands for start and settlement price ranges, overlap highlighting (informational, no longer triggers refunds), price labels, center markers, and legend
- Replaced disabled "View Confidence Bands" placeholder button in `RefundExplanation` with functional toggle that expands inline to show the chart and UX-spec explanation text
- Data flow uses existing bigint props from `RefundExplanation` directly into `ConfidenceBandChart`; `scalePrice()` converts to float for SVG coordinates inside the chart component
- Band boundary math follows Dev Notes formulas exactly (price +/- confidence for each band, overlap = max of lows to min of highs)
- Styling uses CSS custom properties via inline SVG styles: `var(--primary)` for start band, `var(--warning)` for settlement band, `var(--destructive)` for overlap (informational, no longer triggers refunds)
- Responsive via SVG `viewBox` with `preserveAspectRatio="xMidYMid meet"` - no ResizeObserver needed
- 10 new tests for ConfidenceBandChart (rendering, overlap/no-overlap, accessibility, responsive attributes)
- 9 updated tests for RefundExplanation (enabled toggle button, visualization toggle, UX-spec copy display)
- All 19 story tests pass; no regressions in other test suites (3 pre-existing failures in unrelated components confirmed on master)
- No new dependencies added - pure SVG with existing utils

### Change Log

- 2026-03-16: Implemented Story 3.7 - Created confidence band visualization with SVG chart component and integrated into RefundExplanation
- 2026-03-16: Code review fixes applied (3 HIGH, 4 MEDIUM, 1 LOW):
  - H1: Replaced CSS className on SVG text with inline fontFamily style for reliable rendering
  - H2: Added Math.max(0, ...) guard on confidence values to prevent negative/zero-width band issues
  - H3: Added minimum range floor to prevent stacked labels when prices are identical
  - M1: Split overlap region into two per-band rects instead of spanning full vertical gap
  - M2/M4: Added 3 new tests: price label accuracy, overlap coordinate validation, zero-confidence edge case
  - M3: Removed unnecessary 'use client' directive from ConfidenceBandChart (pure render component)
  - L1: Updated stale JSDoc referencing Story 3.7 placeholder

### File List

- `web/src/components/trading/confidence-band-chart.tsx` (NEW) - SVG confidence band visualization component
- `web/src/components/trading/confidence-band-chart.test.tsx` (NEW) - 12 tests for ConfidenceBandChart
- `web/src/components/trading/refund-explanation.tsx` (MODIFIED) - Replaced disabled placeholder button with functional toggle + inline ConfidenceBandChart
- `web/src/components/trading/refund-explanation.test.tsx` (MODIFIED) - Updated 10 tests for new toggle behavior
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED) - Story status updated
- `_bmad-output/implementation-artifacts/3-7-create-confidence-band-visualization.md` (MODIFIED) - Story file updated
