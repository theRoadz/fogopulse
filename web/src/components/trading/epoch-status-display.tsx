'use client'

import { Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useEpoch, usePythPrice, useEpochCreation, useWalletConnection } from '@/hooks'
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
 * Get user-friendly label for epoch creation state
 */
function getCreationStateLabel(
  state: 'idle' | 'fetching_price' | 'building' | 'signing' | 'confirming' | 'success' | 'error'
): string {
  switch (state) {
    case 'fetching_price':
      return 'Fetching price...'
    case 'building':
      return 'Building transaction...'
    case 'signing':
      return 'Waiting for signature...'
    case 'confirming':
      return 'Confirming...'
    case 'success':
      return 'Epoch created!'
    default:
      return 'Create New Epoch'
  }
}

/**
 * Container component combining all epoch status sub-components:
 * - EpochStateBadge: Shows current state (Open, Frozen, Settling, Settled)
 * - PriceToBeat: Shows start price and delta from current price
 * - EpochCountdown: Shows time remaining until epoch end
 *
 * Handles loading and no-epoch states gracefully.
 * When no epoch exists, shows a "Create New Epoch" button.
 */
export function EpochStatusDisplay({ asset, className }: EpochStatusDisplayProps) {
  const { epochState, isLoading, noEpochStatus } = useEpoch(asset)
  const { price: pythPrice } = usePythPrice(asset)
  const { connected } = useWalletConnection()
  const { state: creationState, isCreating, createEpoch } = useEpochCreation(asset)

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

  // No active epoch state - show create epoch button
  if (!epochState.epoch || noEpochStatus) {
    // Special case: pool not initialized
    if (noEpochStatus === 'no-pool') {
      return (
        <div className={cn('flex items-center justify-center py-2', className)}>
          <span className="text-sm text-muted-foreground">Pool not initialized</span>
        </div>
      )
    }

    // Show create epoch button
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2 py-2', className)}>
        <span className="text-sm text-muted-foreground">
          {noEpochStatus === 'next-epoch-soon'
            ? 'Next epoch starting soon...'
            : 'No active epoch'}
        </span>
        <Button
          variant="default"
          size="sm"
          onClick={createEpoch}
          disabled={!connected || isCreating}
          className="gap-2"
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {getCreationStateLabel(creationState)}
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              {connected ? 'Create New Epoch' : 'Connect Wallet'}
            </>
          )}
        </Button>
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
