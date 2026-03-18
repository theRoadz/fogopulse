'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { Asset } from '@/types/assets'
import { usePool } from './use-pool'
import { useProgram } from './use-program'
import { POOL_PDAS, QUERY_KEYS } from '@/lib/constants'
import { calculatePoolApy } from '@/lib/apy-utils'

interface UsePoolApyResult {
  /** APY percentage, 0 if no data, null if zero TVL/shares (display as "—") */
  apy: number | null
  /** Whether APY is currently loading */
  isLoading: boolean
}

/**
 * Hook to calculate estimated APY for a pool based on LP share price growth.
 * Walks settled epochs backward to estimate fee accumulation over 7 days.
 *
 * @param asset - The asset pool to calculate APY for
 */
export function usePoolApy(asset: Asset): UsePoolApyResult {
  const { pool, isLoading: isPoolLoading } = usePool(asset)
  const program = useProgram()
  const poolPda = POOL_PDAS[asset]

  const fetchApy = useCallback(async (): Promise<number | null> => {
    if (!pool) return null
    if (pool.totalLpShares === 0n) return null

    return calculatePoolApy(
      program,
      poolPda,
      pool.nextEpochId,
      pool.yesReserves,
      pool.noReserves,
      pool.totalLpShares
    )
  }, [program, poolPda, pool])

  const { data, isLoading: isQueryLoading } = useQuery({
    queryKey: [...QUERY_KEYS.poolApy(asset), pool?.nextEpochId?.toString()],
    queryFn: fetchApy,
    enabled: !!pool && pool.totalLpShares > 0n,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  })

  return {
    apy: data ?? null,
    isLoading: isPoolLoading || isQueryLoading,
  }
}
