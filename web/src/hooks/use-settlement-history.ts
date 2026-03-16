'use client'

import { useMemo, useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { Asset } from '@/types/assets'
import { usePool } from './use-pool'
import { POOL_PDAS, QUERY_KEYS } from '@/lib/constants'
import { useProgram } from '@/hooks/use-program'
import { tryFetchSettledEpoch } from '@/lib/epoch-utils'
import type { LastSettledEpochData } from '@/lib/epoch-utils'

const BATCH_SIZE = 10

interface UseSettlementHistoryResult {
  /** Array of settled epoch data, newest first */
  history: LastSettledEpochData[]
  /** Whether the initial data is loading */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
  /** Whether more epochs are available to load */
  hasMore: boolean
  /** Load more settled epochs */
  fetchMore: () => void
  /** Whether a "load more" fetch is in progress */
  isFetchingMore: boolean
}

/**
 * Hook to fetch settlement history for an asset.
 * Walks backwards through epoch IDs to find settled/refunded epochs.
 *
 * @param asset - The asset to get settlement history for
 * @param limit - Maximum number of epochs per batch (default 10)
 * @returns Settlement history data
 */
export function useSettlementHistory(asset: Asset, limit: number = BATCH_SIZE): UseSettlementHistoryResult {
  const { pool, isLoading: isPoolLoading } = usePool(asset)
  const program = useProgram()

  const poolPda = POOL_PDAS[asset]

  // Track how many batches have been loaded (state triggers re-render + query refetch)
  const [batchCount, setBatchCount] = useState(1)

  // Calculate the nextEpochId from pool (used as search starting point)
  const nextEpochId = useMemo(() => {
    if (!pool || pool.nextEpochId <= BigInt(0)) return null
    return pool.nextEpochId
  }, [pool])

  const totalLimit = limit * batchCount

  // Fetch settled epochs walking backwards from nextEpochId.
  // Uses tryFetchSettledEpoch directly to avoid double-fetching each epoch.
  // Tracks consecutive nulls to detect when we've passed all existing epochs.
  const fetchSettledEpochs = useCallback(async (): Promise<{
    epochs: LastSettledEpochData[]
    hasMore: boolean
  }> => {
    if (nextEpochId === null) return { epochs: [], hasMore: false }

    const settled: LastSettledEpochData[] = []
    let currentId = nextEpochId - BigInt(1)
    // At most ~2 consecutive non-settled epochs should exist (active + settling).
    // If we see more consecutive nulls than that, we've hit non-existent accounts.
    let consecutiveNulls = 0
    const MAX_CONSECUTIVE_NULLS = 3

    // Walk backwards through epoch IDs
    while (currentId >= BigInt(0) && settled.length < totalLimit) {
      const result = await tryFetchSettledEpoch(program, poolPda, currentId)
      if (result) {
        settled.push(result)
        consecutiveNulls = 0
      } else {
        consecutiveNulls++
        if (consecutiveNulls >= MAX_CONSECUTIVE_NULLS) {
          // Likely reached non-existent accounts — stop searching
          return { epochs: settled, hasMore: false }
        }
      }

      currentId = currentId - BigInt(1)
    }

    // If we hit the limit and haven't exhausted all epochs, there might be more
    const hasMore = currentId >= BigInt(0) && settled.length >= totalLimit

    return { epochs: settled, hasMore }
  }, [nextEpochId, program, poolPda, totalLimit])

  // TanStack Query
  const {
    data,
    isLoading: isQueryLoading,
    error,
    isFetching,
  } = useQuery({
    queryKey: [...QUERY_KEYS.settlementHistory(asset), nextEpochId?.toString(), totalLimit],
    queryFn: fetchSettledEpochs,
    enabled: nextEpochId !== null,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  })

  const fetchMore = useCallback(() => {
    setBatchCount((prev) => prev + 1)
  }, [])

  return {
    history: data?.epochs ?? [],
    isLoading: isPoolLoading || isQueryLoading,
    error: error as Error | null,
    hasMore: data?.hasMore ?? false,
    fetchMore,
    isFetchingMore: isFetching && (data?.epochs.length ?? 0) > 0,
  }
}
