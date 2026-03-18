'use client'

import { useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

import type { Asset } from '@/types/assets'
import type { PoolData } from '@/types/pool'
import type { LpShareData } from '@/types/lp'
import { calculateShareValue, calculateEarnings } from '@/types/lp'
import { usePool } from '@/hooks/use-pool'
import { useLpShare } from '@/hooks/use-lp-share'

export interface PoolLpInfo {
  asset: Asset
  pool: PoolData | null
  lpShare: LpShareData | null
  shareValue: bigint
  earnings: bigint
  isLoading: boolean
}

export interface MultiPoolLpResult {
  pools: PoolLpInfo[]
  activePools: PoolLpInfo[]
  totalValue: bigint
  totalEarnings: bigint
  isLoading: boolean
  hasError: boolean
}

/**
 * Hook that aggregates LP data across all 4 assets.
 * Explicit per-asset hook calls (React hooks cannot be called in loops).
 * Follows use-multi-asset-positions.ts pattern.
 */
export function useMultiPoolLp(): MultiPoolLpResult {
  const { publicKey } = useWallet()

  // Explicit pool hooks — one per asset
  const btcPool = usePool('BTC')
  const ethPool = usePool('ETH')
  const solPool = usePool('SOL')
  const fogoPool = usePool('FOGO')

  // Explicit LP share hooks — one per asset
  const btcLp = useLpShare('BTC', publicKey)
  const ethLp = useLpShare('ETH', publicKey)
  const solLp = useLpShare('SOL', publicKey)
  const fogoLp = useLpShare('FOGO', publicKey)

  const allPools: PoolLpInfo[] = useMemo(() => {
    const items: {
      asset: Asset
      pool: PoolData | null
      lpShare: LpShareData | null
      poolLoading: boolean
      lpLoading: boolean
    }[] = [
      { asset: 'BTC', pool: btcPool.pool, lpShare: btcLp.lpShare, poolLoading: btcPool.isLoading, lpLoading: btcLp.isLoading },
      { asset: 'ETH', pool: ethPool.pool, lpShare: ethLp.lpShare, poolLoading: ethPool.isLoading, lpLoading: ethLp.isLoading },
      { asset: 'SOL', pool: solPool.pool, lpShare: solLp.lpShare, poolLoading: solPool.isLoading, lpLoading: solLp.isLoading },
      { asset: 'FOGO', pool: fogoPool.pool, lpShare: fogoLp.lpShare, poolLoading: fogoPool.isLoading, lpLoading: fogoLp.isLoading },
    ]

    return items.map(({ asset, pool, lpShare, poolLoading, lpLoading }) => {
      let shareValue = 0n
      let earnings = 0n

      if (lpShare && pool && lpShare.shares > 0n) {
        shareValue = calculateShareValue(
          lpShare.shares,
          pool.totalLpShares,
          pool.yesReserves,
          pool.noReserves
        )
        earnings = calculateEarnings(shareValue, lpShare.depositedAmount)
      }

      return {
        asset,
        pool,
        lpShare,
        shareValue,
        earnings,
        isLoading: poolLoading || lpLoading,
      }
    })
  }, [
    btcPool.pool, ethPool.pool, solPool.pool, fogoPool.pool,
    btcPool.isLoading, ethPool.isLoading, solPool.isLoading, fogoPool.isLoading,
    btcLp.lpShare, ethLp.lpShare, solLp.lpShare, fogoLp.lpShare,
    btcLp.isLoading, ethLp.isLoading, solLp.isLoading, fogoLp.isLoading,
  ])

  const hasError = !!(btcLp.error || ethLp.error || solLp.error || fogoLp.error)

  const { activePools, totalValue, totalEarnings, isLoading } = useMemo(() => {
    const active = allPools.filter((p) => p.lpShare !== null && p.lpShare.shares > 0n)
    const totValue = active.reduce((sum, p) => sum + p.shareValue, 0n)
    const totEarnings = active.reduce((sum, p) => sum + p.earnings, 0n)
    const anyLoading = allPools.some((p) => p.isLoading)

    return {
      activePools: active,
      totalValue: totValue,
      totalEarnings: totEarnings,
      isLoading: anyLoading,
    }
  }, [allPools])

  return {
    pools: allPools,
    activePools,
    totalValue,
    totalEarnings,
    isLoading,
    hasError,
  }
}
