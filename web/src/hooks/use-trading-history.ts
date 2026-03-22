'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'

import type { Asset } from '@/types/assets'
import { Outcome } from '@/types/epoch'
import { usePool } from './use-pool'
import { POOL_PDAS, QUERY_KEYS } from '@/lib/constants'
import { useProgram } from '@/hooks/use-program'
import type { LastSettledEpochData } from '@/lib/epoch-utils'
import { batchFetchEpochs, batchFetchUserPositions } from '@/lib/batch-fetch'
import type { UserPositionData } from '@/hooks/use-user-position'
import { positionKey } from '@/hooks/use-user-positions-batch'
import { getClaimState, calculatePayout } from '@/hooks/use-claimable-amount'

const BATCH_SIZE = 10

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TradeOutcome = 'won' | 'lost' | 'refund' | 'sold-early'

export interface TradingHistoryEntry {
  asset: Asset
  epochId: bigint
  epochPda: PublicKey
  direction: 'up' | 'down'
  amountInvested: bigint
  outcome: TradeOutcome
  realizedPnl: bigint | null
  payoutAmount: bigint | null
  settlementTime: number
  settlement: LastSettledEpochData
  position: UserPositionData
}

export interface TradingStats {
  totalRealizedPnl: bigint
  winCount: number
  lossCount: number
  refundCount: number
  soldEarlyCount: number
  totalVolume: bigint
  winRate: number
}

interface UseTradingHistoryResult {
  history: TradingHistoryEntry[]
  stats: TradingStats
  isLoading: boolean
  error: Error | null
  hasMore: boolean
  fetchMore: () => void
  isFetchingMore: boolean
}

// ---------------------------------------------------------------------------
// Stats calculation (exported for testing)
// ---------------------------------------------------------------------------

export function computeTradingStats(entries: TradingHistoryEntry[]): TradingStats {
  let totalRealizedPnl = 0n
  let winCount = 0
  let lossCount = 0
  let refundCount = 0
  let soldEarlyCount = 0
  let totalVolume = 0n

  for (const entry of entries) {
    totalVolume += entry.amountInvested
    switch (entry.outcome) {
      case 'won':
        winCount++
        if (entry.realizedPnl !== null) totalRealizedPnl += entry.realizedPnl
        break
      case 'lost':
        lossCount++
        if (entry.realizedPnl !== null) totalRealizedPnl += entry.realizedPnl
        break
      case 'refund':
        refundCount++
        break
      case 'sold-early':
        soldEarlyCount++
        break
    }
  }

  const denominator = winCount + lossCount
  const winRate = denominator > 0 ? winCount / denominator : 0

  return { totalRealizedPnl, winCount, lossCount, refundCount, soldEarlyCount, totalVolume, winRate }
}

// ---------------------------------------------------------------------------
// Classify a position into a TradingHistoryEntry
// ---------------------------------------------------------------------------

export function classifyPosition(
  asset: Asset,
  settlement: LastSettledEpochData,
  position: UserPositionData
): TradingHistoryEntry {
  const claimState = getClaimState(settlement.rawEpochData, position)

  let outcome: TradeOutcome
  let realizedPnl: bigint | null = null
  let payoutAmount: bigint | null = null

  switch (claimState.type) {
    case 'winner': {
      outcome = 'won'
      payoutAmount = claimState.amount
      realizedPnl = claimState.amount - position.amount
      break
    }
    case 'claimed': {
      if (position.shares === 0n) {
        // Sold early — no PnL calculable from account state
        outcome = 'sold-early'
        realizedPnl = null
        payoutAmount = null
      } else if (settlement.rawEpochData.outcome === Outcome.Refunded) {
        // Claimed refund — original stake returned, zero PnL
        outcome = 'refund'
        realizedPnl = 0n
        payoutAmount = position.amount
      } else {
        // Claimed winner — recalculate payout for display
        outcome = 'won'
        const winnerTotal =
          settlement.rawEpochData.outcome === Outcome.Up
            ? settlement.yesTotalAtSettlement!
            : settlement.noTotalAtSettlement!
        const loserTotal =
          settlement.rawEpochData.outcome === Outcome.Up
            ? settlement.noTotalAtSettlement!
            : settlement.yesTotalAtSettlement!
        payoutAmount = calculatePayout(position.amount, winnerTotal, loserTotal)
        realizedPnl = payoutAmount - position.amount
      }
      break
    }
    case 'lost': {
      outcome = 'lost'
      realizedPnl = -position.amount
      payoutAmount = null
      break
    }
    case 'refund': {
      outcome = 'refund'
      realizedPnl = 0n
      payoutAmount = position.amount
      break
    }
    default: {
      // no-position / not-settled — should never reach here since we only
      // process settled epochs with confirmed positions
      throw new Error(
        `Unexpected claimState "${claimState.type}" for epoch ${settlement.epochId}`
      )
    }
  }

  return {
    asset,
    epochId: settlement.epochId,
    epochPda: settlement.epochPda,
    direction: position.direction,
    amountInvested: position.amount,
    outcome,
    realizedPnl,
    payoutAmount,
    settlementTime: settlement.settlementPublishTime > 0
      ? settlement.settlementPublishTime
      : settlement.rawEpochData.endTime,
    settlement,
    position,
  }
}

// ---------------------------------------------------------------------------
// Fetch trading history for a single asset (batch RPC)
// ---------------------------------------------------------------------------

async function fetchAssetTradingHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: any,
  poolPda: PublicKey,
  nextEpochId: bigint,
  userPubkey: PublicKey,
  asset: Asset,
  totalLimit: number
): Promise<{ entries: TradingHistoryEntry[]; hasMore: boolean }> {
  if (nextEpochId <= 0n) return { entries: [], hasMore: false }

  // Fetch recent epochs only — go back far enough to fill the page.
  // Use a multiplier since not every epoch will have a user position.
  const searchDepth = BigInt(Math.max(totalLimit * 5, 50))
  const fromId = nextEpochId - 1n - searchDepth < 0n ? 0n : nextEpochId - 1n - searchDepth

  // Batch-fetch settled epochs in 1-2 RPC calls
  const settledEpochs = await batchFetchEpochs(program, poolPda, fromId, nextEpochId - 1n)

  // Batch-fetch all user positions in 1-2 RPC calls
  const positions = await batchFetchUserPositions(
    program,
    settledEpochs.map((e) => e.epochPda),
    userPubkey
  )

  // Match positions to settlements
  const entries: TradingHistoryEntry[] = []
  const directions: Array<'up' | 'down'> = ['up', 'down']

  for (const settlement of settledEpochs) {
    for (const dir of directions) {
      const key = positionKey(settlement.epochPda.toBase58(), dir)
      const position = positions.get(key)
      if (position) {
        entries.push(classifyPosition(asset, settlement, position))
      }
    }
  }

  // Sort by settlement time descending (newest first)
  entries.sort((a, b) => b.settlementTime - a.settlementTime)

  // Apply pagination limit
  // hasMore = true if we found more than the limit, OR if we didn't search
  // all the way back to epoch 0 (there may be older trades beyond searchDepth)
  const hasMore = entries.length > totalLimit || fromId > 0n
  return {
    entries: entries.slice(0, totalLimit),
    hasMore,
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTradingHistory(
  asset: Asset,
  limit: number = BATCH_SIZE
): UseTradingHistoryResult {
  const { publicKey } = useWallet()
  const program = useProgram()

  const { pool, isLoading: isPoolLoading } = usePool(asset)
  const poolPda = POOL_PDAS[asset]

  const [batchCount, setBatchCount] = useState(1)

  // Reset pagination when switching assets
  useEffect(() => {
    setBatchCount(1)
  }, [asset])

  const totalLimit = limit * batchCount

  const queryKey = useMemo(
    () => [
      ...QUERY_KEYS.tradingHistory(publicKey?.toBase58(), asset),
      totalLimit,
      pool?.nextEpochId?.toString() ?? '0',
    ],
    [publicKey, asset, totalLimit, pool]
  )

  const fetchHistory = useCallback(async (): Promise<{
    entries: TradingHistoryEntry[]
    hasMore: boolean
  }> => {
    if (!publicKey || !pool) return { entries: [], hasMore: false }

    return fetchAssetTradingHistory(
      program,
      poolPda,
      pool.nextEpochId,
      publicKey,
      asset,
      totalLimit
    )
  }, [publicKey, pool, program, poolPda, asset, totalLimit])

  const { data, isLoading: isQueryLoading, error, isFetching } = useQuery({
    queryKey,
    queryFn: fetchHistory,
    enabled: publicKey !== null && pool !== null,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  })

  const fetchMore = useCallback(() => {
    setBatchCount((prev) => prev + 1)
  }, [])

  const history = data?.entries ?? []

  const stats = useMemo(() => computeTradingStats(history), [history])

  return {
    history,
    stats,
    isLoading: isPoolLoading || isQueryLoading,
    error: error as Error | null,
    hasMore: data?.hasMore ?? false,
    fetchMore,
    isFetchingMore: isFetching && history.length > 0,
  }
}
