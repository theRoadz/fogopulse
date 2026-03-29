'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { formatUsdPrice } from '@/lib/utils'

interface PriceToBeatProps {
  /** The epoch start price (price to beat) in human-readable format */
  startPrice: number | null
  /** Current price from Pyth oracle in human-readable format */
  currentPrice: number | null
  /** Additional CSS classes */
  className?: string
}

/**
 * Displays the "Target Price" (epoch start price) with a delta indicator
 * showing how far the current price is from the target.
 *
 * Delta is shown as:
 * - Green with up arrow (positive): Current price is above target
 * - Red with down arrow (negative): Current price is below target
 */
export function PriceToBeat({ startPrice, currentPrice, className }: PriceToBeatProps) {
  // Calculate delta between current and start price
  const delta = useMemo(() => {
    if (startPrice === null || currentPrice === null) return null
    return currentPrice - startPrice
  }, [startPrice, currentPrice])

  const isPositive = delta !== null && delta >= 0

  // Format delta as a dollar amount
  const formattedDelta = useMemo(() => {
    if (delta === null) return null
    const symbol = isPositive ? '\u25B2' : '\u25BC' // Unicode up/down triangles
    const absValue = Math.abs(delta)
    // For large deltas use compact format, for small use full precision
    const formatted = absValue >= 1
      ? `$${absValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `$${absValue.toFixed(4)}`
    return `${symbol} ${formatted}`
  }, [delta, isPositive])

  // If no start price, show placeholder
  if (startPrice === null) {
    return (
      <div className={cn('flex flex-col', className)}>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Target Price
        </span>
        <span className="font-mono text-base sm:text-xl font-bold text-muted-foreground">
          --
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Label */}
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        Target Price
      </span>

      {/* Price row */}
      <div className="flex items-baseline gap-2 flex-wrap">
        {/* Start price */}
        <span className="font-mono text-base sm:text-xl font-bold">
          {formatUsdPrice(startPrice)}
        </span>

        {/* Delta indicator */}
        {formattedDelta !== null && (
          <span
            className={cn(
              'font-mono text-sm font-medium',
              isPositive ? 'text-green-500' : 'text-red-500'
            )}
          >
            {formattedDelta}
          </span>
        )}
      </div>
    </div>
  )
}
