# Story 2.5: Implement Price Chart Component

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want to see a price chart for the selected asset,
So that I can analyze price trends before trading.

## Acceptance Criteria

1. **Given** the trading page with Pyth price feed connected, **When** I view the chart area, **Then** TradingView Lightweight Charts renders the price history
2. The chart shows a line chart (primary style as per UX spec - smooth line with ~10 second data points)
3. The epoch start price ("Price to Beat") is marked with a horizontal dashed target line
4. Real-time price updates animate smoothly on the chart via the existing `usePythPrice` hook
5. The chart is responsive and fills the 65% width allocation on desktop
6. FR2 (view live price chart) is satisfied
7. NFR4 (price chart updates in real-time ≤1 second) is satisfied

## Tasks / Subtasks

- [x] Task 0: Install Lightweight Charts dependency (MUST DO FIRST)
  - [x] Subtask 0.1: Run `cd web && pnpm add lightweight-charts`
  - [x] Subtask 0.2: Verify installation in package.json

- [x] Task 1: Create PriceChart component (AC: #1, #2, #4, #5)
  - [x] Subtask 1.1: Create `web/src/components/trading/price-chart.tsx`
  - [x] Subtask 1.2: Import `createChart`, `LineSeries`, `ColorType`, `LineStyle` from `lightweight-charts`
  - [x] Subtask 1.3: Accept props: `asset: Asset`, `priceData: PriceData | null`, `targetPrice?: number`, `className?: string`
  - [x] Subtask 1.4: Use `useRef` for chart container and chart/series instances
  - [x] Subtask 1.5: Initialize chart in `useEffect` with proper cleanup
  - [x] Subtask 1.6: Configure dark theme colors matching design system (`--background: #0a0a0b`, `--chart-line: #f7931a`)
  - [x] Subtask 1.7: Use `ResizeObserver` for responsive resizing
  - [x] Subtask 1.8: Update chart data in real-time using `series.update()` method (not `setData`)

- [x] Task 2: Implement price history accumulation (AC: #2, #4)
  - [x] Subtask 2.1: Create `usePriceHistory` hook in `web/src/hooks/use-price-history.ts`
  - [x] Subtask 2.2: Accept `priceData: PriceData | null` from `usePythPrice`
  - [x] Subtask 2.3: Accumulate price points with Unix timestamps
  - [x] Subtask 2.4: Limit history to epoch duration (~300 data points for 5-minute epoch at ~1/sec)
  - [x] Subtask 2.5: Clear history on asset change
  - [x] Subtask 2.6: Return `{ history: LineData[], latestPrice: PriceData | null }`

- [x] Task 3: Implement target line ("Price to Beat") (AC: #3)
  - [x] Subtask 3.1: Use `series.createPriceLine()` for horizontal target line
  - [x] Subtask 3.2: Style as dashed line with muted color (`--chart-target: #a1a1aa`)
  - [x] Subtask 3.3: Display "Target" or "Price to Beat" label via `title` option
  - [x] Subtask 3.4: Make target line optional (only show when `targetPrice` prop is provided)
  - [x] Subtask 3.5: Update target line position when `targetPrice` prop changes

- [x] Task 4: Configure chart styling and theming (AC: #5)
  - [x] Subtask 4.1: Set dark theme background: `{ type: ColorType.Solid, color: '#0a0a0b' }`
  - [x] Subtask 4.2: Set text color: `#fafafa`
  - [x] Subtask 4.3: Set grid colors: `#27272a` (subtle)
  - [x] Subtask 4.4: Set line series color: `#f7931a` (orange/amber price line)
  - [x] Subtask 4.5: Set line width: 2
  - [x] Subtask 4.6: Configure time scale with `timeVisible: true`, `secondsVisible: true`
  - [x] Subtask 4.7: Hide last value visible and price line visible (custom display elsewhere)
  - [x] Subtask 4.8: Configure price scale with appropriate precision for crypto prices

- [x] Task 5: Integrate chart into ChartArea component (AC: #1, #5)
  - [x] Subtask 5.1: Modify `web/src/components/trading/chart-area.tsx`
  - [x] Subtask 5.2: Import `PriceChart` component and `usePriceHistory` hook
  - [x] Subtask 5.3: Replace placeholder chart content with actual `PriceChart` component
  - [x] Subtask 5.4: Pass `priceData` from `usePythPrice` to `usePriceHistory`
  - [x] Subtask 5.5: Pass accumulated history to `PriceChart`
  - [x] Subtask 5.6: Keep "Price to Beat" header display (existing)
  - [x] Subtask 5.7: Keep `ConnectionStatus` indicator (existing)
  - [x] Subtask 5.8: Handle FOGO case - show placeholder when no price feed

- [x] Task 6: Update component exports
  - [x] Subtask 6.1: Export `PriceChart` from `web/src/components/trading/index.ts`
  - [x] Subtask 6.2: Export `usePriceHistory` from `web/src/hooks/index.ts`

- [x] Task 7: Testing and build verification
  - [x] Subtask 7.1: Verify chart renders on page load with BTC selected
  - [x] Subtask 7.2: Verify real-time price updates animate smoothly on chart
  - [x] Subtask 7.3: Verify target line appears when `targetPrice` is provided
  - [x] Subtask 7.4: Test asset switching - chart clears and shows new asset data
  - [x] Subtask 7.5: Test responsive behavior - resize browser window
  - [x] Subtask 7.6: Verify cleanup on component unmount (no memory leaks)
  - [x] Subtask 7.7: Run `pnpm build` - ensure no TypeScript errors
  - [x] Subtask 7.8: Test FOGO asset shows placeholder (no chart when no feed)

## Dev Notes

### CRITICAL: Dependency Installation

Lightweight Charts is NOT currently installed. Run this FIRST:
```bash
cd web && pnpm add lightweight-charts
```

### CRITICAL: Lightweight Charts v5+ API

Use the modern Lightweight Charts API with named imports:
```typescript
import { createChart, LineSeries, ColorType, LineStyle } from 'lightweight-charts'
```

**Key patterns:**
- Use `chart.addSeries(LineSeries, options)` NOT `chart.addLineSeries()`
- Use `series.update()` for real-time updates (efficient)
- Use `series.setData()` only for initial/full data load
- Use `series.createPriceLine()` for horizontal target lines

### Previous Story Learnings (Story 2.4)

1. **HermesClient SSE streaming:** Price data arrives via `usePythPrice` hook
2. **Price format:** `{ price: number, confidence: number, timestamp: number }` where timestamp is in milliseconds
3. **Connection states:** `'connected' | 'connecting' | 'disconnected' | 'reconnecting'`
4. **FOGO handling:** No price feed available, show "Price Unavailable"
5. **Build validation:** Always run `pnpm build` before marking complete

### Architecture Compliance

From architecture.md:
> **Chart Library:** Lightweight Charts (TradingView) - Professional trading terminal aesthetic, real-time capable

From UX design specification:
> - Smooth line chart with ~10 second data point intervals
> - Dashed horizontal target line at "Price to Beat" with "Target" label
> - Orange/amber price line (`#f7931a`)
> - Dark background (`#0a0a0b`)
> - Position markers on chart showing user entry points with amounts (FUTURE - Story scope is chart only)

### Lightweight Charts Integration Pattern

**Reference Implementation:**

```typescript
// web/src/components/trading/price-chart.tsx
'use client'

import { useEffect, useRef } from 'react'
import {
  createChart,
  LineSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type IPriceLine,
} from 'lightweight-charts'
import { cn } from '@/lib/utils'
import type { Asset } from '@/types/assets'

interface PriceChartProps {
  asset: Asset
  data: LineData[]
  targetPrice?: number
  className?: string
}

const CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid, color: '#0a0a0b' },
    textColor: '#fafafa',
  },
  grid: {
    vertLines: { color: '#27272a' },
    horzLines: { color: '#27272a' },
  },
  rightPriceScale: {
    borderColor: '#27272a',
    scaleMargins: { top: 0.1, bottom: 0.1 },
  },
  timeScale: {
    borderColor: '#27272a',
    timeVisible: true,
    secondsVisible: true,
  },
  crosshair: {
    mode: 0, // Normal mode
    vertLine: { color: '#758696', width: 1, style: 3 },
    horzLine: { color: '#758696', width: 1, style: 3 },
  },
}

const SERIES_OPTIONS = {
  color: '#f7931a', // Orange/amber price line
  lineWidth: 2,
  lastValueVisible: false,
  priceLineVisible: false,
}

const TARGET_LINE_OPTIONS = {
  color: '#a1a1aa', // Muted gray
  lineWidth: 1,
  lineStyle: LineStyle.Dashed,
  axisLabelVisible: true,
  title: 'Target',
}

export function PriceChart({ asset, data, targetPrice, className }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const targetLineRef = useRef<IPriceLine | null>(null)

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      autoSize: true,
    })
    chartRef.current = chart

    const series = chart.addSeries(LineSeries, SERIES_OPTIONS)
    seriesRef.current = series

    // Cleanup on unmount
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      targetLineRef.current = null
    }
  }, [])

  // Update data
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return

    // Set full data on asset change or initial load
    seriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [data, asset])

  // Handle real-time updates (update last point)
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return
    const lastPoint = data[data.length - 1]
    if (lastPoint) {
      seriesRef.current.update(lastPoint)
    }
  }, [data])

  // Update target line
  useEffect(() => {
    if (!seriesRef.current) return

    // Remove existing target line
    if (targetLineRef.current) {
      seriesRef.current.removePriceLine(targetLineRef.current)
      targetLineRef.current = null
    }

    // Create new target line if price provided
    if (targetPrice !== undefined) {
      targetLineRef.current = seriesRef.current.createPriceLine({
        ...TARGET_LINE_OPTIONS,
        price: targetPrice,
      })
    }
  }, [targetPrice])

  return (
    <div
      ref={containerRef}
      className={cn('w-full h-full min-h-[200px]', className)}
      role="img"
      aria-label={`Price chart for ${asset}`}
    />
  )
}
```

### usePriceHistory Hook Pattern

```typescript
// web/src/hooks/use-price-history.ts
'use client'

import { useEffect, useRef, useState } from 'react'
import type { LineData } from 'lightweight-charts'
import type { PriceData } from './use-pyth-price'
import type { Asset } from '@/types/assets'

const MAX_HISTORY_POINTS = 300 // ~5 minutes at 1 point/second

export function usePriceHistory(asset: Asset, priceData: PriceData | null) {
  const [history, setHistory] = useState<LineData[]>([])
  const prevAssetRef = useRef<Asset>(asset)

  // Clear history on asset change
  useEffect(() => {
    if (prevAssetRef.current !== asset) {
      setHistory([])
      prevAssetRef.current = asset
    }
  }, [asset])

  // Accumulate price data
  useEffect(() => {
    if (!priceData) return

    const point: LineData = {
      time: Math.floor(priceData.timestamp / 1000) as number, // Unix seconds
      value: priceData.price,
    }

    setHistory((prev) => {
      // Check if this is a duplicate timestamp
      const lastPoint = prev[prev.length - 1]
      if (lastPoint && lastPoint.time === point.time) {
        // Update existing point
        return [...prev.slice(0, -1), point]
      }

      // Add new point, limit history size
      const newHistory = [...prev, point]
      if (newHistory.length > MAX_HISTORY_POINTS) {
        return newHistory.slice(-MAX_HISTORY_POINTS)
      }
      return newHistory
    })
  }, [priceData])

  return { history, latestPrice: priceData }
}
```

### Files to Create

| File | Purpose |
|------|---------|
| `web/src/components/trading/price-chart.tsx` | Lightweight Charts wrapper component |
| `web/src/hooks/use-price-history.ts` | Price history accumulation hook |

### Files to Modify

| File | Changes |
|------|---------|
| `web/src/components/trading/chart-area.tsx` | Replace placeholder with PriceChart component |
| `web/src/components/trading/index.ts` | Export PriceChart component |
| `web/src/hooks/index.ts` | Export usePriceHistory hook |
| `web/package.json` | Add lightweight-charts dependency (via pnpm add) |

### Project Structure Notes

Files should follow existing patterns:
- Components: `web/src/components/trading/*.tsx` with barrel export
- Hooks: `web/src/hooks/use-*.ts` with barrel export
- Chart component follows same structure as other trading components

### Design System Colors (from UX spec)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#0a0a0b` | Chart background |
| `--chart-line` | `#f7931a` | Price line (orange/amber) |
| `--chart-target` | `#a1a1aa` | Dashed target line (muted) |
| `--chart-grid` | `#27272a` | Chart grid lines (subtle) |
| `--foreground` | `#fafafa` | Text/axis labels |

### Responsive Design

Chart should be responsive within its container:
- Desktop: Fills 65% width of trading layout (left side)
- Tablet: Full width when stacked
- Mobile: Full width with reduced height

Use `autoSize: true` option and container CSS for responsive behavior.

### Error Handling

1. **No price feed (FOGO)**: Show existing placeholder, don't render chart
2. **No data yet**: Show loading skeleton while connecting
3. **Stale data**: Handled by ConnectionStatus component (existing)

### Testing Checklist

**Manual Testing:**
1. Navigate to `/trade/btc` - chart should render with real-time price data
2. Wait 30 seconds - chart should show accumulating price history
3. Switch to ETH tab - chart should clear and show new asset data
4. Provide `targetPrice` prop - dashed horizontal line should appear
5. Resize browser window - chart should resize responsively
6. Check browser console - no errors or warnings
7. Switch to FOGO tab - should show placeholder, not chart

**Build Verification:**
```bash
cd web && pnpm build
```

### Anti-Patterns to Avoid

1. **DO NOT** use `setData()` for every price update - use `update()` for real-time
2. **DO NOT** forget to clean up chart on component unmount
3. **DO NOT** use older Lightweight Charts API (`addLineSeries`) - use v5 API (`addSeries(LineSeries)`)
4. **DO NOT** create multiple charts on re-render - use refs properly
5. **DO NOT** block rendering while waiting for data - show skeleton/placeholder
6. **DO NOT** forget to handle FOGO case (no price feed)

### Performance Considerations

- Use `series.update()` for real-time price updates (O(1) operation)
- Limit history to ~300 points to prevent memory growth
- Use `ResizeObserver` or `autoSize: true` for responsive resizing
- Clean up chart on unmount to prevent memory leaks

### Git Intelligence (Recent Commits)

```
27462e0 Story 2.4: Integrate Pyth Hermes Price Feed
982d780 Story 2.3: Create Asset Selector and Market Layout
374161f Story 2.2: Implement Wallet Connection UI
```

Pyth price feed is now integrated. This story adds visual chart rendering using that price data.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#story-25] - Story definition and acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#chart-library] - Lightweight Charts requirement
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#primary-chart-reference] - Chart design patterns
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#color-system] - Design tokens for theming
- [Source: web/src/hooks/use-pyth-price.ts] - Existing price feed hook
- [Source: web/src/components/trading/chart-area.tsx] - Current placeholder component
- [Source: web/src/lib/constants.ts] - ASSET_METADATA and constants
- [Library: lightweight-charts] - TradingView Lightweight Charts documentation

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Build verified successfully with `pnpm build` - no TypeScript errors

### Completion Notes List

- Installed lightweight-charts v5.1.0 dependency
- Created PriceChart component using TradingView Lightweight Charts v5+ API
- Implemented usePriceHistory hook for accumulating price data with 300-point limit
- Configured theme-aware colors using `useTheme` from next-themes
- Light mode: white background (#ffffff), dark text, zinc-200 grid
- Dark mode: near-black background (#0a0a0b), light text, zinc-800 grid
- Orange price line (#f7931a) consistent across both themes
- Added target line support for "Price to Beat" feature (theme-aware dashed line)
- Integrated PriceChart into ChartArea, replacing placeholder content
- Added proper loading skeleton and FOGO placeholder states
- Used autoSize for responsive chart sizing
- Implemented proper cleanup on unmount to prevent memory leaks
- Used series.update() for efficient real-time updates
- Chart dynamically updates colors when user toggles theme

### File List

**New Files:**
- `web/src/components/trading/price-chart.tsx` - Lightweight Charts wrapper component
- `web/src/hooks/use-price-history.ts` - Price history accumulation hook

**Modified Files:**
- `web/src/components/trading/chart-area.tsx` - Replace placeholder with PriceChart
- `web/src/components/trading/index.ts` - Add PriceChart export
- `web/src/hooks/index.ts` - Add usePriceHistory export
- `web/package.json` - Add lightweight-charts ^5.1.0 dependency
- `pnpm-lock.yaml` - Updated lockfile from lightweight-charts installation

## Change Log

- 2026-03-12: Story 2.5 created - Implement Price Chart Component
- 2026-03-13: Story 2.5 implemented - All tasks complete, build verified
- 2026-03-13: Added theme-aware chart colors - light/dark mode support using useTheme hook
- 2026-03-13: Code review fixes applied:
  - Fixed memory leak: Changed from setData() on every update to update() for real-time data
  - Fixed cleanup race condition: Captured ref values before cleanup, added try-catch
  - Added asset-specific price precision (BTC/ETH/SOL: 2 decimals, FOGO: 6 decimals)
  - Added error boundary with user-visible error state for chart failures
  - Optimized usePriceHistory: O(1) duplicate detection via timestamp ref
  - Added eslint-disable explanation comment
  - Updated File List to include pnpm-lock.yaml

