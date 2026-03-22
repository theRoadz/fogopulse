'use client'

import { useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { Asset } from '@/types/assets'
import { usePool } from './use-pool'
import { POOL_PDAS } from '@/lib/constants'
import { useProgram } from '@/hooks/use-program'
import { tryFetchSettledEpoch } from '@/lib/epoch-utils'
import type { LastSettledEpochData } from '@/lib/epoch-utils'

// Re-export for backwards compatibility and consumers
export type { LastSettledEpochData } from '@/lib/epoch-utils'

interface UseLastSettledEpochResult {
  /** The last settled epoch data */
  lastSettledEpoch: LastSettledEpochData | null
  /** Whether the data is loading */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
  /** Refresh the data */
  refetch: () => void
}

/**
 * Hook to fetch the last settled epoch for an asset.
 * Uses pool.next_epoch_id - 1 to find the most recent epoch.
 *
 * @param asset - The asset to get last settled epoch for
 * @returns Last settled epoch data or null
 */
export function useLastSettledEpoch(asset: Asset): UseLastSettledEpochResult {
  const { pool, isLoading: isPoolLoading } = usePool(asset)
  const program = useProgram()

  const poolPda = POOL_PDAS[asset]

  // Calculate the nextEpochId from pool (used as search starting point)
  const nextEpochId = useMemo(() => {
    if (!pool || pool.nextEpochId <= BigInt(0)) return null
    return pool.nextEpochId
  }, [pool])

  // Fetch last settled epoch, searching backwards from nextEpochId
  // advance_epoch atomically settles epoch N and creates N+1, so
  // nextEpochId - 1 may be the new active (Open) epoch, not the settled one.
  const fetchLastSettledEpoch = useCallback(async (): Promise<LastSettledEpochData | null> => {
    if (nextEpochId === null) return null

    // Try nextEpochId - 1 first (most common: no active epoch, last one is settled)
    const candidateId = nextEpochId - BigInt(1)
    const result = await tryFetchSettledEpoch(program, poolPda, candidateId)
    if (result) return result

    // If nextEpochId - 1 is not settled (it's the active epoch),
    // try nextEpochId - 2 (the previously settled epoch)
    if (candidateId > BigInt(0)) {
      return tryFetchSettledEpoch(program, poolPda, candidateId - BigInt(1))
    }

    return null
  }, [nextEpochId, program, poolPda])

  // TanStack Query
  const {
    data: lastSettledEpoch,
    isLoading: isEpochLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['lastSettledEpoch', asset, nextEpochId?.toString()],
    queryFn: fetchLastSettledEpoch,
    enabled: nextEpochId !== null,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  })

  return {
    lastSettledEpoch: lastSettledEpoch ?? null,
    isLoading: isPoolLoading || isEpochLoading,
    error: error as Error | null,
    refetch,
  }
}
