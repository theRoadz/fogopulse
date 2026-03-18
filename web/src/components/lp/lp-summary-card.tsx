'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'

interface LpSummaryCardProps {
  totalValue: bigint
  totalEarnings: bigint
  poolCount: number
}

export function LpSummaryCard({ totalValue, totalEarnings, poolCount }: LpSummaryCardProps) {
  const isPositive = totalEarnings >= 0n

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Total LP Value
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-4">
          <span className="text-2xl font-bold">
            ${formatUsdcAmount(totalValue)}
          </span>
          <span className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? '+' : '-'}${formatUsdcAmount(totalEarnings < 0n ? -totalEarnings : totalEarnings)} earnings
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Across {poolCount} {poolCount === 1 ? 'pool' : 'pools'}
        </p>
      </CardContent>
    </Card>
  )
}
