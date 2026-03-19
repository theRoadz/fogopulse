'use client'

import { Fragment, useMemo } from 'react'
import { History, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Asset } from '@/types/assets'
import { useSettlementHistory } from '@/hooks/use-settlement-history'
import { useUserPositionsBatch, positionKey } from '@/hooks/use-user-positions-batch'
import { useWalletConnection } from '@/hooks'

import { SettlementHistoryRow } from './settlement-history-row'

interface SettlementHistoryListProps {
  /** Asset to display history for */
  asset: Asset
  /** Additional CSS classes */
  className?: string
}

/**
 * Loading skeleton for the history list
 */
function HistoryListSkeleton() {
  return (
    <div className="space-y-1" data-testid="settlement-history-skeleton">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-2">
          <Skeleton className="h-3.5 w-3.5" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-32 hidden sm:block" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="ml-auto h-4 w-14" />
        </div>
      ))}
    </div>
  )
}

/**
 * Scrollable list of settlement history rows.
 * Shows past epoch outcomes with optional user position indicators.
 */
export function SettlementHistoryList({ asset, className }: SettlementHistoryListProps) {
  const { history, isLoading, hasMore, fetchMore, isFetchingMore } = useSettlementHistory(asset)
  const { connected } = useWalletConnection()

  // Collect epoch PDAs for batch position fetch
  const epochPdas = useMemo(
    () => history.map((h) => h.epochPda),
    [history]
  )

  const { positions } = useUserPositionsBatch(epochPdas)

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('w-full', className)} data-testid="settlement-history-list">
        <HistoryListSkeleton />
      </div>
    )
  }

  // Empty state
  if (history.length === 0) {
    return (
      <div
        className={cn('flex flex-col items-center justify-center py-8 text-center', className)}
        data-testid="settlement-history-list"
      >
        <History className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No settlement history yet</p>
      </div>
    )
  }

  // Populated state
  return (
    <div className={cn('w-full', className)} data-testid="settlement-history-list">
      {/* Column headers */}
      <div className="flex items-center gap-2 px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="w-3.5" /> {/* Expand icon spacer */}
        <span className="w-16">Epoch</span>
        <span className="w-16">Outcome</span>
        <span className="hidden sm:inline">Price Range</span>
        <span>Change</span>
        <span className="ml-auto">Time</span>
        {connected && <span className="ml-2">Position</span>}
      </div>

      <ScrollArea className="max-h-[400px]">
        <div className="space-y-0.5">
          {history.map((settlement) => {
            const epochKey = settlement.epochPda.toBase58()
            // Check both directions — show a row for each existing position
            const upPos = positions.get(positionKey(epochKey, 'up')) ?? null
            const downPos = positions.get(positionKey(epochKey, 'down')) ?? null

            // If user has positions in both directions (hedging), render separate rows
            if (upPos && downPos) {
              return (
                <Fragment key={settlement.epochId.toString()}>
                  <SettlementHistoryRow
                    settlement={settlement}
                    position={upPos}
                    isWalletConnected={connected}
                    asset={asset}
                  />
                  <SettlementHistoryRow
                    settlement={settlement}
                    position={downPos}
                    isWalletConnected={connected}
                    asset={asset}
                  />
                </Fragment>
              )
            }

            // Single position or no position — render one row
            return (
              <SettlementHistoryRow
                key={settlement.epochId.toString()}
                settlement={settlement}
                position={upPos ?? downPos}
                isWalletConnected={connected}
                asset={asset}
              />
            )
          })}
        </div>

        {/* Load more button */}
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
