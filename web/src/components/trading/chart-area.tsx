'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Asset } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'
import { cn, formatUsdPrice } from '@/lib/utils'
import { usePythPrice } from '@/hooks/use-pyth-price'
import { usePriceHistory } from '@/hooks/use-price-history'
import { ConnectionStatus } from './connection-status'
import { PriceChart } from './price-chart'

interface ChartAreaProps {
  asset: Asset
  className?: string
}

export function ChartArea({ asset, className }: ChartAreaProps) {
  const metadata = ASSET_METADATA[asset]
  const { price, connectionState } = usePythPrice(asset)
  const { history } = usePriceHistory(asset, price)

  // Check if this asset has a price feed
  const hasFeed = Boolean(metadata.feedId)
  const isConnecting = connectionState === 'connecting' || (connectionState === 'disconnected' && hasFeed && price === null)

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      <CardHeader className="border-b flex-shrink-0">
        <CardTitle className="flex items-center justify-between">
          <span className={metadata.color}>{metadata.label}/USD</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Price to Beat</span>
            <ConnectionStatus state={hasFeed ? connectionState : 'disconnected'} />
          </div>
        </CardTitle>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Live Price</span>
          {isConnecting ? (
            <Skeleton className="h-7 w-32" />
          ) : hasFeed ? (
            <span className="font-mono text-lg">{formatUsdPrice(price?.price ?? null)}</span>
          ) : (
            <span className="font-mono text-lg text-muted-foreground">Price Unavailable</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 min-h-[300px]">
        {!hasFeed ? (
          // FOGO placeholder - no price feed available
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-6">
            <div className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
              <svg
                className="h-12 w-12 text-muted-foreground/50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                />
              </svg>
            </div>
            <span className="text-sm">No price feed available for {metadata.label}</span>
          </div>
        ) : isConnecting && history.length === 0 ? (
          // Loading state while connecting
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-6">
            <Skeleton className="h-full w-full min-h-[200px]" />
          </div>
        ) : (
          // Render the price chart
          <PriceChart
            asset={asset}
            data={history}
            // targetPrice will be passed when epoch data is available (future story)
            className="h-full"
          />
        )}
      </CardContent>
    </Card>
  )
}
