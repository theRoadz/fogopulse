'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useEpoch, usePythPrice, useEpochCreation, useWalletConnection, useLastSettledEpoch } from '@/hooks'
import type { Asset } from '@/types/assets'
import { EpochCountdown } from './epoch-countdown'
import { EpochStateBadge } from './epoch-state-badge'
import { PriceToBeat } from './price-to-beat'
import { SettlementStatusPanel } from './settlement-status-panel'

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
 * Props for the LastSettlementSection component
 */
interface LastSettlementSectionProps {
  lastSettledEpoch: ReturnType<typeof useLastSettledEpoch>['lastSettledEpoch']
  isLoading: boolean
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Collapsible section showing the last settled epoch's result
 */
function LastSettlementSection({
  lastSettledEpoch,
  isLoading,
  isOpen,
  onOpenChange,
}: LastSettlementSectionProps) {
  // Don't render if no last settled epoch and not loading
  if (!isLoading && !lastSettledEpoch) {
    return null
  }

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange} className="w-full">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex w-full items-center justify-between px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Last Settlement
            {lastSettledEpoch && (
              <span className="text-xs opacity-75">
                (Epoch #{lastSettledEpoch.epochId.toString()})
              </span>
            )}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        {isLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : lastSettledEpoch ? (
          <SettlementStatusPanel
            settlementData={lastSettledEpoch}
            title={`Last Settlement (Epoch #${lastSettledEpoch.epochId.toString()})`}
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
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
  const { lastSettledEpoch, isLoading: isLastSettledLoading } = useLastSettledEpoch(asset)
  const [isLastSettlementOpen, setIsLastSettlementOpen] = useState(false)

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

    // Show create epoch button + last settlement
    return (
      <div className={cn('flex flex-col gap-4', className)}>
        {/* Create epoch section */}
        <div className="flex flex-col items-center justify-center gap-2 py-2">
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

        {/* Last settlement section (collapsible) */}
        <LastSettlementSection
          lastSettledEpoch={lastSettledEpoch}
          isLoading={isLastSettledLoading}
          isOpen={isLastSettlementOpen}
          onOpenChange={setIsLastSettlementOpen}
        />
      </div>
    )
  }

  // Settled epoch - show settlement panel
  if (epochState.isSettled) {
    return (
      <div className={cn('space-y-4', className)}>
        {/* Show epoch state badge for context */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <EpochStateBadge state={epochState.epoch.state} />
            <PriceToBeat
              startPrice={epochState.startPriceDisplay}
              currentPrice={pythPrice?.price ?? null}
            />
          </div>
        </div>

        {/* Settlement details panel */}
        <SettlementStatusPanel asset={asset} />
      </div>
    )
  }

  // Active epoch - show full status
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Active epoch info row */}
      <div className="flex items-center justify-between gap-4">
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

      {/* Last settlement section (collapsible) */}
      <LastSettlementSection
        lastSettledEpoch={lastSettledEpoch}
        isLoading={isLastSettledLoading}
        isOpen={isLastSettlementOpen}
        onOpenChange={setIsLastSettlementOpen}
      />
    </div>
  )
}
