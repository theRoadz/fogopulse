'use client'

import type { Asset } from '@/types/assets'
import { epochStateFromU8 } from '@/types/epoch'
import { formatPoolLiquidity, reservesToDisplayValue } from '@/types/pool'
import { usePool } from '@/hooks/use-pool'
import { useEpoch } from '@/hooks/use-epoch'
import { ASSET_METADATA } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface PoolOverviewCardProps {
  asset: Asset
}

export function PoolOverviewCard({ asset }: PoolOverviewCardProps) {
  const { pool } = usePool(asset)
  const { epochState } = useEpoch(asset)

  const meta = ASSET_METADATA[asset]
  const epoch = epochState.epoch

  // Determine epoch state label from pool's cached activeEpochState
  const epochStateLabel = pool
    ? epochStateFromU8(pool.activeEpochState) ?? 'None'
    : 'Loading...'

  const epochStateColor =
    epochStateLabel === 'Open'
      ? 'bg-green-500/20 text-green-500 border-green-500/30'
      : epochStateLabel === 'Frozen'
        ? 'bg-blue-500/20 text-blue-500 border-blue-500/30'
        : epochStateLabel === 'Settling'
          ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
          : 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'

  return (
    <Card className={pool?.isPaused || pool?.isFrozen ? 'border-amber-500/50' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className={meta.color}>{meta.label}</span>
          <div className="flex items-center gap-2">
            {pool?.isPaused && (
              <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-xs">
                Paused
              </Badge>
            )}
            {pool?.isFrozen && (
              <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-xs">
                Frozen
              </Badge>
            )}
            <Badge className={`${epochStateColor} text-xs`}>{epochStateLabel}</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!pool ? (
          <p className="text-sm text-muted-foreground">Loading pool data...</p>
        ) : (
          <div className="space-y-3 text-sm">
            {epochStateLabel === 'Open' && epochState.timeRemaining > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time Remaining</span>
                <span className="font-mono font-medium">{formatTime(epochState.timeRemaining)}</span>
              </div>
            )}

            {epoch && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Epoch ID</span>
                <span className="font-medium">{epoch.epochId.toString()}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-muted-foreground">UP Reserves</span>
              <span className="font-medium">{formatPoolLiquidity(pool.yesReserves)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">DOWN Reserves</span>
              <span className="font-medium">{formatPoolLiquidity(pool.noReserves)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Total LP Shares</span>
              <span className="font-medium">{reservesToDisplayValue(pool.totalLpShares).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Next Epoch ID</span>
              <span className="font-medium">{pool.nextEpochId.toString()}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
