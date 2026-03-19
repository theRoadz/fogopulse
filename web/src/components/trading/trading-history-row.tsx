'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, ChevronDown, ChevronRight, CheckCircle, Loader2 } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { ASSET_METADATA } from '@/lib/constants'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'
import { useClaimPosition } from '@/hooks/use-claim-position'
import type { TradingHistoryEntry } from '@/hooks/use-trading-history'

import { SettlementStatusPanel } from './settlement-status-panel'

/**
 * Format a Unix timestamp as relative "time ago" string
 */
function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 0) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function getOutcomeBadge(outcome: TradingHistoryEntry['outcome']) {
  switch (outcome) {
    case 'won':
      return { label: 'WON', textClass: 'text-up', bgClass: 'bg-up/20', borderClass: 'border-up/30' }
    case 'lost':
      return { label: 'LOST', textClass: 'text-down', bgClass: 'bg-down/20', borderClass: 'border-down/30' }
    case 'refund':
      return { label: 'REFUNDED', textClass: 'text-warning', bgClass: 'bg-warning/20', borderClass: 'border-warning/30' }
    case 'sold-early':
      return { label: 'SOLD EARLY', textClass: 'text-muted-foreground', bgClass: 'bg-muted/20', borderClass: 'border-muted-foreground/30' }
  }
}

interface TradingHistoryRowProps {
  entry: TradingHistoryEntry
  className?: string
}

export function TradingHistoryRow({ entry, className }: TradingHistoryRowProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { publicKey } = useWallet()
  const claimMutation = useClaimPosition()

  const badge = getOutcomeBadge(entry.outcome)
  const DirectionIcon = entry.direction === 'up' ? ArrowUp : ArrowDown
  const directionColor = entry.direction === 'up' ? 'text-up' : 'text-down'

  const pnlDisplay = (() => {
    if (entry.realizedPnl === null) return '—'
    const abs = entry.realizedPnl < 0n ? -entry.realizedPnl : entry.realizedPnl
    const sign = entry.realizedPnl > 0n ? '+' : entry.realizedPnl < 0n ? '-' : ''
    return `${sign}$${formatUsdcAmount(abs)}`
  })()

  const pnlColor =
    entry.realizedPnl === null
      ? 'text-muted-foreground'
      : entry.realizedPnl > 0n
        ? 'text-up'
        : entry.realizedPnl < 0n
          ? 'text-down'
          : 'text-muted-foreground'

  // Determine if this trade is claimable
  const isClaimable =
    !entry.position.claimed &&
    (entry.outcome === 'won' || entry.outcome === 'refund') &&
    entry.payoutAmount !== null &&
    entry.payoutAmount > 0n

  const handleClaim = (e: React.MouseEvent) => {
    e.stopPropagation() // Don't toggle collapsible
    if (!publicKey || !entry.epochPda || !entry.payoutAmount) return

    const displayAmount = formatUsdcAmount(entry.payoutAmount)
    claimMutation.mutate({
      asset: entry.asset,
      type: entry.outcome === 'won' ? 'payout' : 'refund',
      epochPda: entry.epochPda,
      direction: entry.direction,
      userPubkey: publicKey.toString(),
      displayAmount,
    })
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} data-testid="trading-history-row">
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors hover:bg-muted/50',
            isOpen && 'bg-muted/30',
            className
          )}
        >
          {/* Expand icon */}
          {isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}

          {/* Asset */}
          <span
            className={cn('w-12 shrink-0 text-sm font-semibold', ASSET_METADATA[entry.asset].color)}
            data-testid="trade-asset"
          >
            {ASSET_METADATA[entry.asset].label}
          </span>

          {/* Direction */}
          <span className={cn('shrink-0', directionColor)} data-testid="trade-direction">
            <DirectionIcon className="h-4 w-4" />
          </span>

          {/* Amount invested */}
          <span className="w-20 shrink-0 text-sm text-foreground" data-testid="trade-amount">
            ${formatUsdcAmount(entry.amountInvested)}
          </span>

          {/* Outcome badge */}
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 px-2 py-0.5 text-xs font-semibold',
              badge.bgClass,
              badge.textClass,
              badge.borderClass
            )}
            data-testid="trade-outcome"
          >
            {badge.label}
          </Badge>

          {/* Realized PnL */}
          <span
            className={cn('w-24 shrink-0 text-sm font-medium', pnlColor)}
            data-testid="trade-pnl"
          >
            {pnlDisplay}
          </span>

          {/* Claim button or Claimed badge */}
          <span className="shrink-0">
            {isClaimable ? (
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  'h-7 gap-1 px-2 text-xs font-medium',
                  entry.outcome === 'won'
                    ? 'border-up/40 text-up hover:bg-up/10'
                    : 'border-warning/40 text-warning hover:bg-warning/10'
                )}
                onClick={handleClaim}
                disabled={claimMutation.isPending}
              >
                {claimMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  entry.outcome === 'won' ? 'Claim' : 'Refund'
                )}
              </Button>
            ) : entry.position.claimed ? (
              <Badge
                variant="outline"
                className="gap-1 border-muted-foreground/30 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground"
              >
                <CheckCircle className="h-3 w-3" />
                Claimed
              </Badge>
            ) : null}
          </span>

          {/* Time ago */}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground" data-testid="trade-time">
            {formatTimeAgo(entry.settlementTime)}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3 pb-3 pt-1">
        <SettlementStatusPanel
          asset={entry.asset}
          settlementData={entry.settlement}
          title={`Epoch #${entry.epochId.toString()} Settlement`}
          className="border-0 shadow-none bg-muted/20"
        />
      </CollapsibleContent>
    </Collapsible>
  )
}
