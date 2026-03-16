'use client'

import { formatUsdcAmount } from '@/hooks/use-claimable-amount'
import { Card, CardContent } from '@/components/ui/card'

interface PortfolioSummaryProps {
  totalValue: bigint
  totalPnl: bigint
  totalPnlPercent: number
  positionCount: number
}

export function PortfolioSummary({
  totalValue,
  totalPnl,
  totalPnlPercent,
  positionCount,
}: PortfolioSummaryProps) {
  const absPnl = totalPnl < 0n ? -totalPnl : totalPnl
  const sign = totalPnl > 0n ? '+' : totalPnl < 0n ? '-' : ''

  const colorClass =
    totalPnl > 0n
      ? 'text-green-500'
      : totalPnl < 0n
        ? 'text-red-500'
        : 'text-muted-foreground'

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 px-4 text-sm">
        <span className="text-muted-foreground">
          Portfolio: <span className="font-medium text-foreground">{positionCount}</span> active position{positionCount !== 1 ? 's' : ''}
        </span>
        <span className="text-muted-foreground">
          Total Value: <span className="font-medium text-foreground">{formatUsdcAmount(totalValue)} USDC</span>
        </span>
        <span className="text-muted-foreground">
          PnL: <span className={`font-medium ${colorClass}`}>
            {sign}{formatUsdcAmount(absPnl)} USDC ({sign}{Math.abs(totalPnlPercent).toFixed(1)}%)
          </span>
        </span>
      </CardContent>
    </Card>
  )
}
