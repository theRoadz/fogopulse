'use client'

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPoolLiquidity } from '@/types/pool'

interface PoolDepthProps {
  /** Total liquidity in USDC base units (bigint) */
  totalLiquidityRaw?: bigint
  /** Total liquidity in USDC display units (number) - alternative to raw */
  totalLiquidity?: number
  /** Whether the data is loading */
  isLoading?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Displays pool liquidity/depth with formatted currency value.
 * Shows a skeleton loader during loading state.
 */
export function PoolDepth({
  totalLiquidityRaw,
  totalLiquidity,
  isLoading = false,
  className,
}: PoolDepthProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-between', className)}>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Pool Liquidity
        </span>
        <Skeleton className="h-5 w-24" />
      </div>
    )
  }

  // Calculate display value
  let displayValue: string
  if (totalLiquidityRaw !== undefined) {
    displayValue = formatPoolLiquidity(totalLiquidityRaw)
  } else if (totalLiquidity !== undefined) {
    displayValue = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(totalLiquidity)
  } else {
    displayValue = '$0.00'
  }

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        Pool Liquidity
      </span>
      <span className="text-sm font-medium font-mono">{displayValue}</span>
    </div>
  )
}
