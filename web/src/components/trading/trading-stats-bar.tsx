'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'
import type { TradingStats } from '@/hooks/use-trading-history'

interface TradingStatsBarProps {
  stats: TradingStats
  className?: string
}

export function TradingStatsBar({ stats, className }: TradingStatsBarProps) {
  const totalTrades = stats.winCount + stats.lossCount + stats.refundCount + stats.soldEarlyCount
  const absPnl = stats.totalRealizedPnl < 0n ? -stats.totalRealizedPnl : stats.totalRealizedPnl
  const sign = stats.totalRealizedPnl > 0n ? '+' : stats.totalRealizedPnl < 0n ? '-' : ''
  const pnlColor =
    stats.totalRealizedPnl > 0n
      ? 'text-up'
      : stats.totalRealizedPnl < 0n
        ? 'text-down'
        : 'text-muted-foreground'

  return (
    <Card className={className} data-testid="trading-stats-bar">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 px-4 text-sm">
        <span className="text-muted-foreground">
          Total PnL:{' '}
          <span className={cn('font-medium', pnlColor)} data-testid="stats-total-pnl">
            {sign}${formatUsdcAmount(absPnl)}
          </span>
        </span>
        <span className="text-muted-foreground">
          Win Rate:{' '}
          <span className="font-medium text-foreground" data-testid="stats-win-rate">
            {(stats.winRate * 100).toFixed(0)}%
          </span>
        </span>
        <span className="text-muted-foreground">
          Trades:{' '}
          <span className="font-medium text-foreground" data-testid="stats-total-trades">
            {totalTrades}
          </span>
        </span>
        <span className="text-muted-foreground">
          Volume:{' '}
          <span className="font-medium text-foreground" data-testid="stats-total-volume">
            ${formatUsdcAmount(stats.totalVolume)}
          </span>
        </span>
      </CardContent>
    </Card>
  )
}
