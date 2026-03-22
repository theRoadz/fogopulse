'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { Asset } from '@/types/assets'
import { usePool } from './use-pool'
import { POOL_PDAS, QUERY_KEYS } from '@/lib/constants'
import { useProgram } from '@/hooks/use-program'
import type { LastSettledEpochData } from '@/lib/epoch-utils'
import { batchFetchEpochs } from '@/lib/batch-fetch'

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
 * Uses batch RPC calls via fetchMultiple for fast loading.
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

  // Reset pagination when switching assets
  useEffect(() => {
    setBatchCount(1)
  }, [asset])

  // Calculate the nextEpochId from pool (used as search starting point)
  const nextEpochId = useMemo(() => {
    if (!pool || pool.nextEpochId <= BigInt(0)) return null
    return pool.nextEpochId
  }, [pool])

  const totalLimit = limit * batchCount

  // Batch-fetch all settled epochs in 1-2 RPC calls
  const fetchSettledEpochs = useCallback(async (): Promise<{
    epochs: LastSettledEpochData[]
    hasMore: boolean
  }> => {
    if (nextEpochId === null) return { epochs: [], hasMore: false }

    // Fetch recent epochs only — enough to fill the requested page
    const searchDepth = BigInt(Math.max(totalLimit * 2, 20))
    const fromId = nextEpochId - 1n - searchDepth < 0n ? 0n : nextEpochId - 1n - searchDepth

    const settled = await batchFetchEpochs(program, poolPda, fromId, nextEpochId - 1n)

    // batchFetchEpochs returns ascending order — reverse for newest-first
    settled.reverse()

    // Apply pagination
    const hasMore = settled.length > totalLimit
    return {
      epochs: settled.slice(0, totalLimit),
      hasMore,
    }
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
