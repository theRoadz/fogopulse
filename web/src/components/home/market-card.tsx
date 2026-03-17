'use client'

import Link from 'next/link'
import type { Asset } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'
import { usePool } from '@/hooks/use-pool'
import { useEpoch } from '@/hooks/use-epoch'
import { usePythPrice } from '@/hooks/use-pyth-price'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProbabilityBar } from '@/components/trading/probability-bar'
import { EpochStateBadge } from '@/components/trading/epoch-state-badge'
import { PoolDepth } from '@/components/trading/pool-depth'

const ASSET_BORDER_COLORS: Record<Asset, string> = {
  BTC: 'border-l-orange-500',
  ETH: 'border-l-blue-500',
  SOL: 'border-l-purple-500',
  FOGO: 'border-l-primary',
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price)
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

interface MarketCardProps {
  asset: Asset
}

export function MarketCard({ asset }: MarketCardProps) {
  const { poolState, isLoading: poolLoading } = usePool(asset)
  const { epochState, isLoading: epochLoading, noEpochStatus } = useEpoch(asset)
  const { price, connectionState } = usePythPrice(asset)

  const meta = ASSET_METADATA[asset]
  const isLoading = poolLoading || epochLoading
  const hasPriceFeed = connectionState === 'connected' && price !== null
  const hasNoFeed = meta.feedId === ''
  const tradePath = `/trade/${asset.toLowerCase()}`

  return (
    <Link href={tradePath} className="block group" data-testid={`market-card-${asset}`}>
      <Card className={`border-l-4 ${ASSET_BORDER_COLORS[asset]} transition-colors group-hover:border-l-primary/80 h-full py-4 gap-4`}>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className={meta.color} data-testid="asset-label">{meta.label}</CardTitle>
          {epochState.epoch ? (
            <EpochStateBadge state={epochState.epoch.state} />
          ) : (
            !isLoading && <span className="text-xs text-muted-foreground" data-testid="no-epoch-badge">No Active Epoch</span>
          )}
        </CardHeader>

        <CardContent className="space-y-2">
          {/* Live Price */}
          <div>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Price</span>
            {isLoading ? (
              <Skeleton className="h-7 w-28 mt-1" data-testid="price-skeleton" />
            ) : hasNoFeed ? (
              <p className="text-base font-mono font-semibold text-muted-foreground" data-testid="price-unavailable">Price Unavailable</p>
            ) : hasPriceFeed ? (
              <p className="text-base font-mono font-semibold" data-testid="live-price">{formatPrice(price.price)}</p>
            ) : (
              <Skeleton className="h-7 w-28 mt-1" data-testid="price-skeleton" />
            )}
          </div>

          {/* Probability Bar */}
          {isLoading ? (
            <Skeleton className="h-12 w-full" data-testid="probability-skeleton" />
          ) : (
            <ProbabilityBar probabilities={poolState.probabilities} />
          )}

          {/* Pool Depth */}
          <PoolDepth totalLiquidity={poolState.totalLiquidity} isLoading={isLoading} />

          {/* Epoch Countdown */}
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Epoch</span>
            {isLoading ? (
              <Skeleton className="h-5 w-16" data-testid="countdown-skeleton" />
            ) : epochState.epoch && !noEpochStatus ? (
              <span className="text-sm font-mono font-medium" data-testid="epoch-countdown">
                {formatCountdown(epochState.timeRemaining)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">--:--</span>
            )}
          </div>
        </CardContent>

        <CardFooter>
          <Button className="w-full" variant="outline" asChild>
            <span data-testid="trade-link">Trade {asset}</span>
          </Button>
        </CardFooter>
      </Card>
    </Link>
  )
}
