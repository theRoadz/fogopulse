'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useEpoch, usePythPrice } from '@/hooks'
import type { Asset } from '@/types/assets'
import { EpochCountdown } from './epoch-countdown'
import { EpochStateBadge } from './epoch-state-badge'
import { PriceToBeat } from './price-to-beat'

interface EpochStatusDisplayProps {
  /** The asset to display epoch status for */
  asset: Asset
  /** Additional CSS classes */
  className?: string
}

/**
 * Container component combining all epoch status sub-components:
 * - EpochStateBadge: Shows current state (Open, Frozen, Settling, Settled)
 * - PriceToBeat: Shows start price and delta from current price
 * - EpochCountdown: Shows time remaining until epoch end
 *
 * Handles loading and no-epoch states gracefully.
 */
export function EpochStatusDisplay({ asset, className }: EpochStatusDisplayProps) {
  const { epochState, isLoading, noEpochStatus } = useEpoch(asset)
  const { price: pythPrice } = usePythPrice(asset)

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-between gap-4', className)}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-14 rounded-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-28" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    )
  }

  // No active epoch state
  if (!epochState.epoch || noEpochStatus) {
    return (
      <div className={cn('flex items-center justify-center py-2', className)}>
        <span className="text-sm text-muted-foreground">
          {noEpochStatus === 'no-pool'
            ? 'Pool not initialized'
            : noEpochStatus === 'next-epoch-soon'
            ? 'Next epoch starting soon...'
            : 'No active epoch'}
        </span>
      </div>
    )
  }

  // Active epoch - show full status
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {/* Left side: State badge + Price to Beat */}
      <div className="flex items-center gap-3">
        <EpochStateBadge state={epochState.epoch.state} />
        <PriceToBeat
          startPrice={epochState.startPriceDisplay}
          currentPrice={pythPrice?.price ?? null}
        />
      </div>

      {/* Right side: Countdown */}
      <EpochCountdown epochState={epochState} />
    </div>
  )
}
