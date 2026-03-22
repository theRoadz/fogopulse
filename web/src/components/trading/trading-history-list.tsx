'use client'

import { History, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useWalletConnection } from '@/hooks'
import { WalletButton } from '@/components/wallet/wallet-button'
import { useTradingHistory } from '@/hooks/use-trading-history'
import type { Asset } from '@/types/assets'

import { TradingHistoryRow } from './trading-history-row'
import { TradingStatsBar } from './trading-stats-bar'

interface TradingHistoryListProps {
  assetFilter: Asset
  className?: string
}

function TradingHistorySkeleton() {
  return (
    <div className="space-y-1" data-testid="trading-history-skeleton">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-3.5 w-3.5" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto h-4 w-14" />
        </div>
      ))}
    </div>
  )
}

export function TradingHistoryList({ assetFilter, className }: TradingHistoryListProps) {
  const { connected } = useWalletConnection()
  const { history, stats, isLoading, hasMore, fetchMore, isFetchingMore } = useTradingHistory(assetFilter)

  // Wallet not connected
  if (!connected) {
    return (
      <div
        className={cn('flex flex-col items-center justify-center py-8 text-center', className)}
        data-testid="trading-history-list"
      >
        <p className="mb-3 text-sm text-muted-foreground">Connect wallet to view your trading history</p>
        <WalletButton />
      </div>
    )
  }

  // Loading
  if (isLoading) {
    return (
      <div className={cn('w-full', className)} data-testid="trading-history-list">
        <TradingHistorySkeleton />
      </div>
    )
  }

  // Empty state
  if (history.length === 0) {
    return (
      <div
        className={cn('flex flex-col items-center justify-center py-8 text-center', className)}
        data-testid="trading-history-list"
      >
        <History className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Your trade history will appear here</p>
      </div>
    )
  }

  // Populated
  return (
    <div className={cn('w-full space-y-3', className)} data-testid="trading-history-list">
      <TradingStatsBar stats={stats} />

      <ScrollArea className="max-h-[600px]">
        <div className="space-y-1">
          {history.map((entry) => (
            <TradingHistoryRow
              key={`${entry.asset}-${entry.epochId.toString()}`}
              entry={entry}
            />
          ))}
        </div>

        {hasMore && (
          <div className="flex justify-center py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchMore}
              disabled={isFetchingMore}
              className="text-xs text-muted-foreground"
              data-testid="load-more-button"
            >
              {isFetchingMore ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load more'
              )}
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
