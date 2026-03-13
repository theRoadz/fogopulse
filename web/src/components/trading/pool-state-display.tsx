'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePool } from '@/hooks'
import type { Asset } from '@/types/assets'
import { ProbabilityBar } from './probability-bar'
import { PoolDepth } from './pool-depth'

interface PoolStateDisplayProps {
  /** The asset to display pool state for */
  asset: Asset
  /** Additional CSS classes */
  className?: string
}

/**
 * Container component combining pool UI sub-components:
 * - ProbabilityBar: Shows UP/DOWN probability visualization
 * - PoolDepth: Shows total pool liquidity
 *
 * Handles loading and no-pool states gracefully.
 */
export function PoolStateDisplay({ asset, className }: PoolStateDisplayProps) {
  const { pool, poolState, isLoading } = usePool(asset)

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn('', className)}>
        <CardContent className="p-4 space-y-3">
          {/* Probability bar skeleton */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-6" />
                <Skeleton className="h-6 w-12" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
          </div>
          {/* Pool depth skeleton */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // No pool or zero liquidity state
  if (!pool || (pool.yesReserves === 0n && pool.noReserves === 0n)) {
    return (
      <Card className={cn('', className)}>
        <CardContent className="p-4">
          <div className="flex flex-col items-center justify-center py-2 gap-1">
            <span className="text-sm text-muted-foreground">
              {!pool ? 'Pool not available' : 'No liquidity in pool'}
            </span>
            <span className="text-xs text-muted-foreground">
              Market sentiment will appear when trades occur
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Active pool with liquidity - show full display
  return (
    <Card className={cn('', className)}>
      <CardContent className="p-4 space-y-3">
        <ProbabilityBar probabilities={poolState.probabilities} />
        <PoolDepth totalLiquidity={poolState.totalLiquidity} />
      </CardContent>
    </Card>
  )
}
