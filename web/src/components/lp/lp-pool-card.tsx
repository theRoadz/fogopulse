'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import type { PoolLpInfo } from '@/hooks/use-multi-pool-lp'
import { ASSET_METADATA } from '@/lib/constants'
import { formatPoolLiquidity } from '@/types/pool'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'
import { LpPendingWithdrawal } from '@/components/lp/lp-pending-withdrawal'

interface LpPoolCardProps {
  info: PoolLpInfo
  onDeposit?: () => void
  onWithdraw?: () => void
}

export function LpPoolCard({ info, onDeposit, onWithdraw }: LpPoolCardProps) {
  const { asset, pool, lpShare, shareValue, earnings, isLoading } = info
  const meta = ASSET_METADATA[asset]

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    )
  }

  const tvl = pool ? pool.yesReserves + pool.noReserves : 0n
  const myShares = lpShare?.shares ?? 0n
  const hasPosition = lpShare !== null && myShares > 0n
  const isEarningsPositive = earnings >= 0n
  const hasPendingWithdrawal = lpShare !== null && BigInt(lpShare.pendingWithdrawal) > 0n

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className={`text-base font-semibold ${meta.color}`}>
            {meta.label}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            APY — Coming Soon
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Pool TVL</span>
          <span className="font-medium">{pool ? formatPoolLiquidity(tvl) : '—'}</span>
        </div>

        {hasPosition ? (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">My Shares</span>
              <span className="font-medium">{Number(myShares).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Share Value</span>
              <span className="font-medium">${formatUsdcAmount(shareValue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Earnings</span>
              <span className={`font-medium ${isEarningsPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isEarningsPositive ? '+' : '-'}${formatUsdcAmount(earnings < 0n ? -earnings : earnings)}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            No position in this pool
          </p>
        )}

        {hasPendingWithdrawal && pool && lpShare && (
          <LpPendingWithdrawal asset={asset} lpShare={lpShare} pool={pool} />
        )}

        <div className="flex gap-2 mt-2">
          {onDeposit && (
            <Button variant="outline" size="sm" className="flex-1" onClick={onDeposit}>
              Deposit
            </Button>
          )}
          {onWithdraw && hasPosition && (
            <Button variant="outline" size="sm" className="flex-1" onClick={onWithdraw}>
              Withdraw
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
