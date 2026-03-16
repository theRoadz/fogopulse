'use client'

import { useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Connection, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { useConnection } from '@solana/wallet-adapter-react'

import type { Asset } from '@/types/assets'
import { EpochState, Outcome } from '@/types/epoch'
import { usePool } from './use-pool'
import { PROGRAM_ID, POOL_PDAS, FOGO_TESTNET_RPC } from '@/lib/constants'
import { scalePrice, formatConfidencePercent } from '@/lib/utils'

import idl from '@/lib/fogopulse.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = Program<any>

/**
 * Settlement data for the last settled epoch
 */
export interface LastSettledEpochData {
  /** The epoch ID */
  epochId: bigint
  /** Epoch PDA */
  epochPda: PublicKey
  /** Epoch state (should be Settled or Refunded) */
  state: EpochState
  /** Settlement outcome */
  outcome: Outcome
  /** Start price in USD */
  startPrice: number
  /** Start confidence as percentage */
  startConfidencePercent: string
  /** Start publish time (unix seconds) */
  startPublishTime: number
  /** Settlement price in USD */
  settlementPrice: number
  /** Settlement confidence as percentage */
  settlementConfidencePercent: string
  /** Settlement publish time (unix seconds) */
  settlementPublishTime: number
  /** Price change from start to settlement */
  priceDelta: number
  /** Price change as percentage string */
  priceDeltaPercent: string
  /** Raw start confidence for RefundExplanation */
  startConfidenceRaw: bigint
  /** Raw settlement confidence for RefundExplanation */
  settlementConfidenceRaw: bigint
}

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
 * Parse on-chain epoch state enum to EpochState
 */
function parseEpochState(state: unknown): EpochState {
  if (!state || typeof state !== 'object') return EpochState.Open
  const keys = Object.keys(state)
  if (keys.length === 0) return EpochState.Open
  const variant = keys[0]
  switch (variant) {
    case 'open':
      return EpochState.Open
    case 'frozen':
      return EpochState.Frozen
    case 'settling':
      return EpochState.Settling
    case 'settled':
      return EpochState.Settled
    case 'refunded':
      return EpochState.Refunded
    default:
      return EpochState.Open
  }
}

/**
 * Parse outcome from Anchor enum format
 */
function parseOutcome(outcome: unknown): Outcome | null {
  if (!outcome || typeof outcome !== 'object') return null
  const keys = Object.keys(outcome)
  if (keys.length === 0) return null
  const variant = keys[0]
  switch (variant) {
    case 'up':
      return Outcome.Up
    case 'down':
      return Outcome.Down
    case 'refunded':
      return Outcome.Refunded
    default:
      return null
  }
}

/**
 * Derive epoch PDA from pool and epoch ID
 * Browser-compatible implementation (no Buffer.writeBigUInt64LE)
 */
function deriveEpochPda(poolPda: PublicKey, epochId: bigint): PublicKey {
  const epochIdBuffer = new Uint8Array(8)
  let n = epochId
  for (let i = 0; i < 8; i++) {
    epochIdBuffer[i] = Number(n & BigInt(0xff))
    n = n >> BigInt(8)
  }

  const [epochPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), poolPda.toBuffer(), epochIdBuffer],
    PROGRAM_ID
  )
  return epochPda
}

/**
 * Hook to fetch the last settled epoch for an asset.
 * Uses pool.next_epoch_id - 1 to find the most recent epoch.
 *
 * @param asset - The asset to get last settled epoch for
 * @returns Last settled epoch data or null
 */
export function useLastSettledEpoch(asset: Asset): UseLastSettledEpochResult {
  const { connection } = useConnection()
  const { pool, isLoading: isPoolLoading } = usePool(asset)

  const poolPda = POOL_PDAS[asset]

  // Create a shared connection
  const sharedConnection = useMemo(() => {
    return connection || new Connection(FOGO_TESTNET_RPC, 'confirmed')
  }, [connection])

  // Create Anchor program instance
  const program: AnchorProgram = useMemo(() => {
    const dummyProvider = new AnchorProvider(
      sharedConnection,
      {
        publicKey: PublicKey.default,
        signTransaction: async () => {
          throw new Error('Read-only provider')
        },
        signAllTransactions: async () => {
          throw new Error('Read-only provider')
        },
      },
      { commitment: 'confirmed' }
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Program(idl as any, dummyProvider)
  }, [sharedConnection])

  // Calculate the nextEpochId from pool (used as search starting point)
  const nextEpochId = useMemo(() => {
    if (!pool || pool.nextEpochId <= BigInt(0)) return null
    return pool.nextEpochId
  }, [pool])

  // Try to fetch and parse a single epoch as settlement data
  const tryFetchSettledEpoch = useCallback(async (epochId: bigint): Promise<LastSettledEpochData | null> => {
    try {
      const epochPda = deriveEpochPda(poolPda, epochId)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const epochAccount = await (program.account as any).epoch.fetch(epochPda)

      const state = parseEpochState(epochAccount.state)

      // Only return data if epoch is settled or refunded
      if (state !== EpochState.Settled && state !== EpochState.Refunded) {
        return null
      }

      const outcome = parseOutcome(epochAccount.outcome)
      if (!outcome) return null

      const settlementPrice = epochAccount.settlementPrice
        ? BigInt(epochAccount.settlementPrice.toString())
        : null
      const settlementConfidence = epochAccount.settlementConfidence
        ? BigInt(epochAccount.settlementConfidence.toString())
        : null
      const settlementPublishTime = epochAccount.settlementPublishTime?.toNumber() ?? null

      if (settlementPrice === null || settlementConfidence === null || settlementPublishTime === null) {
        return null
      }

      const startPrice = BigInt(epochAccount.startPrice.toString())
      const startConfidence = BigInt(epochAccount.startConfidence.toString())

      const startPriceUsd = scalePrice(startPrice)
      const settlementPriceUsd = scalePrice(settlementPrice)
      const priceDelta = settlementPriceUsd - startPriceUsd
      const deltaPercent = (priceDelta / startPriceUsd) * 100
      const sign = deltaPercent >= 0 ? '+' : ''

      return {
        epochId,
        epochPda,
        state,
        outcome,
        startPrice: startPriceUsd,
        startConfidencePercent: formatConfidencePercent(startConfidence, startPrice),
        startPublishTime: epochAccount.startPublishTime.toNumber(),
        settlementPrice: settlementPriceUsd,
        settlementConfidencePercent: formatConfidencePercent(settlementConfidence, settlementPrice),
        settlementPublishTime,
        priceDelta,
        priceDeltaPercent: `${sign}${deltaPercent.toFixed(2)}%`,
        startConfidenceRaw: startConfidence,
        settlementConfidenceRaw: settlementConfidence,
      }
    } catch {
      return null
    }
  }, [poolPda, program])

  // Fetch last settled epoch, searching backwards from nextEpochId
  // advance_epoch atomically settles epoch N and creates N+1, so
  // nextEpochId - 1 may be the new active (Open) epoch, not the settled one.
  const fetchLastSettledEpoch = useCallback(async (): Promise<LastSettledEpochData | null> => {
    if (nextEpochId === null) return null

    // Try nextEpochId - 1 first (most common: no active epoch, last one is settled)
    const candidateId = nextEpochId - BigInt(1)
    const result = await tryFetchSettledEpoch(candidateId)
    if (result) return result

    // If nextEpochId - 1 is not settled (it's the active epoch),
    // try nextEpochId - 2 (the previously settled epoch)
    if (candidateId > BigInt(0)) {
      return tryFetchSettledEpoch(candidateId - BigInt(1))
    }

    return null
  }, [nextEpochId, tryFetchSettledEpoch])

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
    placeholderData: (previousData: LastSettledEpochData | null | undefined) => previousData,
  })

  return {
    lastSettledEpoch: lastSettledEpoch ?? null,
    isLoading: isPoolLoading || isEpochLoading,
    error: error as Error | null,
    refetch,
  }
}
