'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TrendingUp } from 'lucide-react'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'
import { formatApy } from '@/lib/utils'

interface LpSummaryCardProps {
  totalValue: bigint
  totalEarnings: bigint
  poolCount: number
  weightedApy?: number | null
}

export function LpSummaryCard({ totalValue, totalEarnings, poolCount, weightedApy }: LpSummaryCardProps) {
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
        <div className="flex items-center gap-4 mt-1">
          <p className="text-xs text-muted-foreground">
            Across {poolCount} {poolCount === 1 ? 'pool' : 'pools'}
          </p>
          {weightedApy !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-medium text-muted-foreground">
                  Est. APY: {formatApy(weightedApy)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[220px] text-xs">
                  Estimated APY based on 7-day LP share price growth.
                  Past performance does not guarantee future returns.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
