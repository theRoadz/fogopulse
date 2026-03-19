'use client'

import { useMemo, useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'

import type { Asset } from '@/types/assets'
import { ASSETS } from '@/types/assets'
import { Outcome } from '@/types/epoch'
import { usePool } from './use-pool'
import { POOL_PDAS, QUERY_KEYS } from '@/lib/constants'
import { useProgram } from '@/hooks/use-program'
import { tryFetchSettledEpoch } from '@/lib/epoch-utils'
import type { LastSettledEpochData } from '@/lib/epoch-utils'
import { derivePositionPda } from '@/lib/pda'
import { parseDirection } from '@/hooks/use-user-position'
import type { UserPositionData } from '@/hooks/use-user-position'
import { getClaimState, calculatePayout } from '@/hooks/use-claimable-amount'

const BATCH_SIZE = 10
const MAX_CONSECUTIVE_NULLS = 3

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
// Fetch trading history for a single asset
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
  const entries: TradingHistoryEntry[] = []
  let currentId = nextEpochId - 1n
  let consecutiveNulls = 0

  while (currentId >= 0n && entries.length < totalLimit) {
    const settlement = await tryFetchSettledEpoch(program, poolPda, currentId)
    if (settlement) {
      consecutiveNulls = 0
      // Check if user has positions in this epoch (both directions)
      const directions: Array<'up' | 'down'> = ['up', 'down']
      for (const dir of directions) {
        if (entries.length >= totalLimit) break
        const positionPda = derivePositionPda(settlement.epochPda, userPubkey, dir)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const acct = await (program.account as any).userPosition.fetch(positionPda)
          const position: UserPositionData = {
            user: acct.user as PublicKey,
            epoch: acct.epoch as PublicKey,
            direction: parseDirection(acct.direction),
            amount: BigInt(acct.amount.toString()),
            shares: BigInt(acct.shares.toString()),
            entryPrice: BigInt(acct.entryPrice.toString()),
            claimed: acct.claimed,
            bump: acct.bump,
          }
          entries.push(classifyPosition(asset, settlement, position))
        } catch {
          // No position in this epoch/direction — skip
        }
      }
    } else {
      consecutiveNulls++
      if (consecutiveNulls >= MAX_CONSECUTIVE_NULLS) {
        return { entries, hasMore: false }
      }
    }
    currentId = currentId - 1n
  }

  const hasMore = currentId >= 0n && entries.length >= totalLimit
  return { entries, hasMore }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTradingHistory(
  assetFilter: Asset | 'ALL' = 'ALL',
  limit: number = BATCH_SIZE
): UseTradingHistoryResult {
  const { publicKey } = useWallet()
  const program = useProgram()

  // We need pool data for each asset to get nextEpochId
  const btcPool = usePool('BTC')
  const ethPool = usePool('ETH')
  const solPool = usePool('SOL')
  const fogoPool = usePool('FOGO')

  const pools = useMemo(
    () => ({ BTC: btcPool, ETH: ethPool, SOL: solPool, FOGO: fogoPool }),
    [btcPool, ethPool, solPool, fogoPool]
  )

  const [batchCount, setBatchCount] = useState(1)
  const totalLimit = limit * batchCount

  const assetsToFetch = useMemo(
    () => (assetFilter === 'ALL' ? [...ASSETS] : [assetFilter]),
    [assetFilter]
  )

  // Check if all needed pools are ready
  const poolsReady = useMemo(
    () => assetsToFetch.every((a) => pools[a].pool !== null),
    [assetsToFetch, pools]
  )

  const isPoolLoading = useMemo(
    () => assetsToFetch.some((a) => pools[a].isLoading),
    [assetsToFetch, pools]
  )

  // Stable query key
  const queryKey = useMemo(
    () => [
      ...QUERY_KEYS.tradingHistory(publicKey?.toBase58(), assetFilter),
      totalLimit,
      // Include nextEpochIds so query refreshes when new epochs appear
      ...assetsToFetch.map((a) => pools[a].pool?.nextEpochId?.toString() ?? '0'),
    ],
    [publicKey, assetFilter, totalLimit, assetsToFetch, pools]
  )

  const fetchHistory = useCallback(async (): Promise<{
    entries: TradingHistoryEntry[]
    hasMore: boolean
  }> => {
    if (!publicKey || !poolsReady) return { entries: [], hasMore: false }

    // Fetch all assets in parallel
    const results = await Promise.all(
      assetsToFetch.map((asset) => {
        const pool = pools[asset].pool!
        const poolPda = POOL_PDAS[asset]
        return fetchAssetTradingHistory(
          program,
          poolPda,
          pool.nextEpochId,
          publicKey,
          asset,
          totalLimit
        )
      })
    )

    // Merge all entries
    let allEntries: TradingHistoryEntry[] = []
    let anyHasMore = false
    for (const result of results) {
      allEntries = allEntries.concat(result.entries)
      if (result.hasMore) anyHasMore = true
    }

    // Sort by settlement time descending (newest first)
    allEntries.sort((a, b) => b.settlementTime - a.settlementTime)

    return { entries: allEntries, hasMore: anyHasMore }
  }, [publicKey, poolsReady, assetsToFetch, pools, program, totalLimit])

  const { data, isLoading: isQueryLoading, error, isFetching } = useQuery({
    queryKey,
    queryFn: fetchHistory,
    enabled: publicKey !== null && poolsReady,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
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
