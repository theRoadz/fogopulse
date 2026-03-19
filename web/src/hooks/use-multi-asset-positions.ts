'use client'

import { useMemo } from 'react'
import { PublicKey } from '@solana/web3.js'

import type { Asset } from '@/types/assets'
import type { UserPositionData } from '@/hooks/use-user-position'
import type { PoolData } from '@/types/pool'
import type { PositionPnL } from '@/lib/trade-preview'
import { calculatePositionPnL } from '@/lib/trade-preview'
import { usePool } from '@/hooks/use-pool'
import { useUserPositionsBatch, positionKey } from '@/hooks/use-user-positions-batch'

export interface AssetPositionInfo {
  asset: Asset
  position: UserPositionData | null
  pool: PoolData | null
  epochPda: PublicKey | null
  pnl: PositionPnL | null
  isLoading: boolean
}

export interface MultiAssetPositionsResult {
  positions: AssetPositionInfo[]
  activePositions: AssetPositionInfo[]
  totalValue: bigint
  totalPnl: bigint
  totalEntryAmount: bigint
  totalPnlPercent: number
  isLoading: boolean
  positionCount: number
}

/**
 * Hook that aggregates position data across all 4 assets.
 * Uses explicit hook calls per asset (React hooks cannot be called in loops).
 * Uses useUserPositionsBatch for efficient batch position fetching.
 */
export function useMultiAssetPositions(): MultiAssetPositionsResult {
  // Explicit pool hooks — one per asset (provides pool data + epoch PDA)
  const btcPool = usePool('BTC')
  const ethPool = usePool('ETH')
  const solPool = usePool('SOL')
  const fogoPool = usePool('FOGO')

  // Collect epoch PDAs from pool data for batch position fetch
  const btcEpochPda = btcPool.pool?.activeEpoch ?? null
  const ethEpochPda = ethPool.pool?.activeEpoch ?? null
  const solEpochPda = solPool.pool?.activeEpoch ?? null
  const fogoEpochPda = fogoPool.pool?.activeEpoch ?? null

  // Filter to non-null PDAs for batch fetch
  const epochPdas = useMemo(() => {
    const pdas: PublicKey[] = []
    if (btcEpochPda) pdas.push(btcEpochPda)
    if (ethEpochPda) pdas.push(ethEpochPda)
    if (solEpochPda) pdas.push(solEpochPda)
    if (fogoEpochPda) pdas.push(fogoEpochPda)
    return pdas
  }, [btcEpochPda, ethEpochPda, solEpochPda, fogoEpochPda])

  // Batch fetch all positions in a single query
  const { positions: positionsMap, isLoading: positionsLoading } =
    useUserPositionsBatch(epochPdas)

  // Build per-asset position info with PnL
  const allPositions: AssetPositionInfo[] = useMemo(() => {
    const assets: {
      asset: Asset
      epochPda: PublicKey | null
      pool: PoolData | null
      poolLoading: boolean
    }[] = [
      { asset: 'BTC', epochPda: btcEpochPda, pool: btcPool.pool, poolLoading: btcPool.isLoading },
      { asset: 'ETH', epochPda: ethEpochPda, pool: ethPool.pool, poolLoading: ethPool.isLoading },
      { asset: 'SOL', epochPda: solEpochPda, pool: solPool.pool, poolLoading: solPool.isLoading },
      { asset: 'FOGO', epochPda: fogoEpochPda, pool: fogoPool.pool, poolLoading: fogoPool.isLoading },
    ]

    // For each asset, check both Up and Down positions
    const result: AssetPositionInfo[] = []
    for (const { asset, epochPda, pool, poolLoading } of assets) {
      const directions: Array<'up' | 'down'> = ['up', 'down']
      for (const dir of directions) {
        const position = epochPda
          ? positionsMap.get(positionKey(epochPda.toBase58(), dir)) ?? null
          : null

        // Only include entries where position exists
        if (!position) continue

        let pnl: PositionPnL | null = null
        if (pool && position.shares > 0n) {
          pnl = calculatePositionPnL(
            position.shares,
            position.amount,
            position.direction,
            pool.yesReserves,
            pool.noReserves
          )
        }

        result.push({
          asset,
          position,
          pool,
          epochPda,
          pnl,
          isLoading: poolLoading || positionsLoading,
        })
      }

      // If no position in either direction, still include a placeholder entry
      const hasAnyPosition = epochPda && (
        positionsMap.has(positionKey(epochPda.toBase58(), 'up')) ||
        positionsMap.has(positionKey(epochPda.toBase58(), 'down'))
      )
      if (!hasAnyPosition) {
        result.push({
          asset,
          position: null,
          pool,
          epochPda,
          pnl: null,
          isLoading: poolLoading || positionsLoading,
        })
      }
    }
    return result
  }, [
    btcEpochPda, ethEpochPda, solEpochPda, fogoEpochPda,
    btcPool.pool, ethPool.pool, solPool.pool, fogoPool.pool,
    btcPool.isLoading, ethPool.isLoading, solPool.isLoading, fogoPool.isLoading,
    positionsMap, positionsLoading,
  ])

  // Compute aggregates
  const { activePositions, totalValue, totalPnl, totalEntryAmount, totalPnlPercent, isLoading } =
    useMemo(() => {
      const active = allPositions.filter(
        (p) => p.position !== null && p.position.shares > 0n
      )

      const totValue = active.reduce(
        (sum, p) => sum + (p.pnl?.currentValue ?? 0n),
        0n
      )
      const totPnl = active.reduce(
        (sum, p) => sum + (p.pnl?.pnlAmount ?? 0n),
        0n
      )
      const totEntry = active.reduce(
        (sum, p) => sum + (p.position?.amount ?? 0n),
        0n
      )
      const totPnlPercent =
        totEntry > 0n ? (Number(totPnl) / Number(totEntry)) * 100 : 0

      const anyLoading = allPositions.some((p) => p.isLoading)

      return {
        activePositions: active,
        totalValue: totValue,
        totalPnl: totPnl,
        totalEntryAmount: totEntry,
        totalPnlPercent: totPnlPercent,
        isLoading: anyLoading,
      }
    }, [allPositions])

  return {
    positions: allPositions,
    activePositions,
    totalValue,
    totalPnl,
    totalEntryAmount,
    totalPnlPercent,
    isLoading,
    positionCount: activePositions.length,
  }
}
