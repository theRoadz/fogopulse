'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  createChart,
  LineSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts'
import { cn } from '@/lib/utils'
import type { Asset } from '@/types/assets'

interface PriceChartProps {
  asset: Asset
  data: LineData<UTCTimestamp>[]
  targetPrice?: number
  className?: string
}

// Price precision based on typical price ranges
const PRICE_PRECISION: Record<Asset, number> = {
  BTC: 2,   // $90,000.00
  ETH: 2,   // $3,000.00
  SOL: 2,   // $150.00
  FOGO: 6,  // $0.000001
}

// Theme-specific color palettes
const LIGHT_COLORS = {
  background: '#ffffff',
  textColor: '#0a0a0b',
  gridColor: '#e4e4e7', // zinc-200
  borderColor: '#e4e4e7',
  crosshairColor: '#a1a1aa',
  targetColor: '#71717a', // zinc-500
}

const DARK_COLORS = {
  background: '#0a0a0b',
  textColor: '#fafafa',
  gridColor: '#27272a', // zinc-800
  borderColor: '#27272a',
  crosshairColor: '#758696',
  targetColor: '#a1a1aa', // zinc-400
}

// Price line color (same for both themes)
const PRICE_LINE_COLOR = '#f7931a' // Orange/amber brand color

/**
 * Get chart options for the specified theme and asset
 */
function getChartOptions(isDark: boolean, asset: Asset) {
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS
  const precision = PRICE_PRECISION[asset]

  return {
    layout: {
      background: { type: ColorType.Solid, color: colors.background },
      textColor: colors.textColor,
    },
    grid: {
      vertLines: { color: colors.gridColor },
      horzLines: { color: colors.gridColor },
    },
    rightPriceScale: {
      borderColor: colors.borderColor,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      precision,
    },
    timeScale: {
      borderColor: colors.borderColor,
      timeVisible: true,
      secondsVisible: true,
    },
    crosshair: {
      mode: 0 as const, // Normal mode
      vertLine: { color: colors.crosshairColor, width: 1 as const, style: 3 as const },
      horzLine: { color: colors.crosshairColor, width: 1 as const, style: 3 as const },
    },
  }
}

/**
 * Get target line options for the specified theme
 */
function getTargetLineOptions(isDark: boolean, price: number) {
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS

  return {
    color: colors.targetColor,
    lineWidth: 1 as const,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title: 'Target',
    price,
  }
}

// Series options for the price line
const SERIES_OPTIONS = {
  color: PRICE_LINE_COLOR,
  lineWidth: 2 as const,
  lastValueVisible: false,
  priceLineVisible: false,
}

/**
 * Price chart component using TradingView Lightweight Charts.
 * Renders real-time price data with an optional target price line.
 *
 * Features:
 * - Theme-aware colors (light/dark mode support)
 * - Responsive sizing via autoSize
 * - Real-time updates via series.update()
 * - Optional dashed target line for "Price to Beat"
 * - Asset-specific price precision
 */
export function PriceChart({ asset, data, targetPrice, className }: PriceChartProps) {
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const targetLineRef = useRef<IPriceLine | null>(null)
  const prevAssetRef = useRef<Asset>(asset)
  const dataLengthRef = useRef<number>(0)
  const [chartError, setChartError] = useState<string | null>(null)

  // Determine if dark mode (default to dark for SSR)
  const isDark = resolvedTheme !== 'light'

  // Initialize chart on mount
  useEffect(() => {
    if (!containerRef.current) return

    try {
      const chart = createChart(containerRef.current, {
        ...getChartOptions(isDark, asset),
        autoSize: true,
      })
      chartRef.current = chart

      const series = chart.addSeries(LineSeries, SERIES_OPTIONS)
      seriesRef.current = series
      setChartError(null)
    } catch (error) {
      setChartError(error instanceof Error ? error.message : 'Failed to initialize chart')
      return
    }

    // Cleanup on unmount - capture ref values to avoid race conditions
    const chart = chartRef.current
    return () => {
      // Check if chart still exists before removing
      if (chart) {
        try {
          chart.remove()
        } catch {
          // Chart may already be removed, ignore
        }
      }
      chartRef.current = null
      seriesRef.current = null
      targetLineRef.current = null
    }
    // Ignore isDark/asset changes - handled by separate effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update chart colors and precision when theme or asset changes
  useEffect(() => {
    if (!chartRef.current) return

    try {
      chartRef.current.applyOptions(getChartOptions(isDark, asset))

      // Update target line color if it exists
      if (targetLineRef.current && seriesRef.current && targetPrice !== undefined) {
        seriesRef.current.removePriceLine(targetLineRef.current)
        targetLineRef.current = seriesRef.current.createPriceLine(
          getTargetLineOptions(isDark, targetPrice)
        )
      }
    } catch (error) {
      setChartError(error instanceof Error ? error.message : 'Failed to update chart options')
    }
  }, [isDark, asset, targetPrice])

  // Handle asset changes - clear data and reset
  useEffect(() => {
    if (!seriesRef.current) return

    if (prevAssetRef.current !== asset) {
      try {
        seriesRef.current.setData([])
        dataLengthRef.current = 0
        prevAssetRef.current = asset
      } catch (error) {
        setChartError(error instanceof Error ? error.message : 'Failed to clear chart data')
      }
    }
  }, [asset])

  // Handle data updates - use setData for initial load, update() for real-time
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return

    try {
      const prevLength = dataLengthRef.current

      if (prevLength === 0) {
        // Initial data load - use setData and fit content
        seriesRef.current.setData(data)
        chartRef.current?.timeScale().fitContent()
      } else if (data.length > prevLength) {
        // New data point(s) added - use efficient update()
        const lastPoint = data[data.length - 1]
        if (lastPoint) {
          seriesRef.current.update(lastPoint)
        }
      } else if (data.length === prevLength) {
        // Same length but possibly updated value (duplicate timestamp case)
        const lastPoint = data[data.length - 1]
        if (lastPoint) {
          seriesRef.current.update(lastPoint)
        }
      }
      // Note: data.length < prevLength shouldn't happen with current usePriceHistory impl

      dataLengthRef.current = data.length
    } catch (error) {
      setChartError(error instanceof Error ? error.message : 'Failed to update chart data')
    }
  }, [data])

  // Update target line when targetPrice changes
  useEffect(() => {
    if (!seriesRef.current) return

    try {
      // Remove existing target line
      if (targetLineRef.current) {
        seriesRef.current.removePriceLine(targetLineRef.current)
        targetLineRef.current = null
      }

      // Create new target line if price provided
      if (targetPrice !== undefined) {
        targetLineRef.current = seriesRef.current.createPriceLine(
          getTargetLineOptions(isDark, targetPrice)
        )
      }
    } catch (error) {
      setChartError(error instanceof Error ? error.message : 'Failed to update target line')
    }
  }, [targetPrice, isDark])

  // Show error state if chart failed to initialize
  if (chartError) {
    return (
      <div
        className={cn(
          'w-full h-full min-h-[200px] flex items-center justify-center text-destructive',
          className
        )}
        role="alert"
      >
        <span className="text-sm">Chart error: {chartError}</span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('w-full h-full min-h-[200px]', className)}
      role="img"
      aria-label={`Price chart for ${asset}`}
    />
  )
}
