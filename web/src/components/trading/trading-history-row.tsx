'use client'

import { ArrowUp, ArrowDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ASSET_METADATA } from '@/lib/constants'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'
import type { TradingHistoryEntry } from '@/hooks/use-trading-history'

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

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm',
        className
      )}
      data-testid="trading-history-row"
    >
      {/* Asset */}
      <span
        className={cn('w-12 shrink-0 text-xs font-semibold', ASSET_METADATA[entry.asset].color)}
        data-testid="trade-asset"
      >
        {ASSET_METADATA[entry.asset].label}
      </span>

      {/* Direction */}
      <span className={cn('shrink-0', directionColor)} data-testid="trade-direction">
        <DirectionIcon className="h-3.5 w-3.5" />
      </span>

      {/* Amount invested */}
      <span className="w-16 shrink-0 text-xs text-foreground" data-testid="trade-amount">
        ${formatUsdcAmount(entry.amountInvested)}
      </span>

      {/* Outcome badge */}
      <Badge
        variant="outline"
        className={cn(
          'shrink-0 px-1.5 py-0.5 text-[10px] font-semibold',
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
        className={cn('w-20 shrink-0 text-xs font-medium', pnlColor)}
        data-testid="trade-pnl"
      >
        {pnlDisplay}
      </span>

      {/* Time ago */}
      <span className="ml-auto shrink-0 text-xs text-muted-foreground" data-testid="trade-time">
        {formatTimeAgo(entry.settlementTime)}
      </span>
    </div>
  )
}
