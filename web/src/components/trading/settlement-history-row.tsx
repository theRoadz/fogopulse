'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, Check, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn, formatUsdPrice } from '@/lib/utils'
import { Outcome } from '@/types/epoch'
import type { LastSettledEpochData } from '@/lib/epoch-utils'
import type { UserPositionData } from '@/hooks/use-user-position'
import type { ClaimState } from '@/hooks/use-claimable-amount'
import { getClaimState, formatUsdcAmount } from '@/hooks/use-claimable-amount'
import type { Asset } from '@/types/assets'

import { SettlementStatusPanel } from './settlement-status-panel'

interface SettlementHistoryRowProps {
  /** Settlement data for this epoch */
  settlement: LastSettledEpochData
  /** User's position in this epoch (null if no position or not connected) */
  position: UserPositionData | null
  /** Whether wallet is connected (controls position column visibility) */
  isWalletConnected: boolean
  /** Asset for ClaimButton support in expanded view */
  asset: Asset
  /** Additional CSS classes */
  className?: string
}

/**
 * Format a Unix timestamp as relative "time ago" string
 */
function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/**
 * Get compact outcome label and color
 */
function getOutcomeStyle(outcome: Outcome) {
  switch (outcome) {
    case Outcome.Up:
      return { label: 'UP WON', textClass: 'text-up', bgClass: 'bg-up/20', borderClass: 'border-up/30' }
    case Outcome.Down:
      return { label: 'DOWN WON', textClass: 'text-down', bgClass: 'bg-down/20', borderClass: 'border-down/30' }
    case Outcome.Refunded:
      return { label: 'REFUNDED', textClass: 'text-warning', bgClass: 'bg-warning/20', borderClass: 'border-warning/30' }
  }
}

/**
 * Render position result text
 */
function PositionResult({
  position,
  claimState,
}: {
  position: UserPositionData
  claimState: ClaimState
}) {
  const directionIcon = position.direction === 'up'
    ? <ArrowUp className="h-3 w-3" />
    : <ArrowDown className="h-3 w-3" />

  const directionColor = position.direction === 'up' ? 'text-up' : 'text-down'

  switch (claimState.type) {
    case 'winner':
      return (
        <span className="flex items-center gap-1 text-xs text-up">
          <span className={directionColor}>{directionIcon}</span>
          +{formatUsdcAmount(claimState.amount)} USDC
        </span>
      )
    case 'refund':
      return (
        <span className="flex items-center gap-1 text-xs text-warning">
          <RefreshCw className="h-3 w-3" />
          {formatUsdcAmount(claimState.amount)} USDC
        </span>
      )
    case 'claimed':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="h-3 w-3" />
          Claimed
        </span>
      )
    case 'lost':
      return (
        <span className="flex items-center gap-1 text-xs text-down/70">
          <span className={directionColor}>{directionIcon}</span>
          Lost
        </span>
      )
    default:
      return null
  }
}

/**
 * A single row in the settlement history list.
 * Shows compact epoch info with an expandable detail view.
 */
export function SettlementHistoryRow({
  settlement,
  position,
  isWalletConnected,
  asset,
  className,
}: SettlementHistoryRowProps) {
  const [isOpen, setIsOpen] = useState(false)

  const outcomeStyle = getOutcomeStyle(settlement.outcome)
  const claimState = getClaimState(settlement.rawEpochData, position)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} data-testid="settlement-history-row">
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors hover:bg-muted/50',
            isOpen && 'bg-muted/30',
            className
          )}
          data-testid="settlement-history-row-trigger"
        >
          {/* Expand icon */}
          {isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}

          {/* Epoch ID */}
          <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground" data-testid="epoch-id">
            #{settlement.epochId.toString()}
          </span>

          {/* Outcome badge */}
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 px-2 py-0.5 text-xs font-semibold',
              outcomeStyle.bgClass,
              outcomeStyle.textClass,
              outcomeStyle.borderClass
            )}
            data-testid="outcome-badge"
          >
            {outcomeStyle.label}
          </Badge>

          {/* Prices — force-closed epochs have no settlement price */}
          {settlement.outcome === Outcome.Refunded && settlement.rawEpochData.settlementPrice === null ? (
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline" data-testid="price-range">
              {formatUsdPrice(settlement.startPrice)} — Force Closed
            </span>
          ) : (
            <>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline" data-testid="price-range">
                {formatUsdPrice(settlement.startPrice)} → {formatUsdPrice(settlement.settlementPrice)}
              </span>

              {/* Price delta */}
              <span
                className={cn(
                  'shrink-0 text-xs font-medium',
                  settlement.priceDelta >= 0 ? 'text-up' : 'text-down'
                )}
                data-testid="price-delta"
              >
                {settlement.priceDeltaPercent}
              </span>
            </>
          )}

          {/* Time ago — force-closed epochs use endTime as fallback */}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground" data-testid="time-ago">
            {formatTimeAgo(
              settlement.settlementPublishTime > 0
                ? settlement.settlementPublishTime
                : settlement.rawEpochData.endTime
            )}
          </span>

          {/* User position (only if wallet connected and has position) */}
          {isWalletConnected && position && (
            <div className="shrink-0 ml-2" data-testid="user-position">
              <PositionResult position={position} claimState={claimState} />
            </div>
          )}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3 pb-3 pt-1">
        <SettlementStatusPanel
          asset={asset}
          settlementData={settlement}
          title={`Epoch #${settlement.epochId.toString()} Settlement`}
          className="border-0 shadow-none bg-muted/20"
          direction={position?.direction}
        />
      </CollapsibleContent>
    </Collapsible>
  )
}
