'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Connection, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { useConnection } from '@solana/wallet-adapter-react'

import type { Asset } from '@/types/assets'
import { EpochState, Outcome, parseEpochState, parseOutcome } from '@/types/epoch'
import type { EpochData, EpochUIState, NoEpochStatus } from '@/types/epoch'
import { PROGRAM_ID, POOL_PDAS, SEEDS, FOGO_TESTNET_RPC } from '@/lib/constants'

// Import the generated IDL (copied from anchor/target/idl during build)
import idl from '@/lib/fogopulse.json'

// Pyth exponent for USD pairs (typically -8)
const PYTH_PRICE_EXPONENT = -8

/**
 * Convert scaled u64 price to human-readable price
 */
function scalePrice(price: BN | bigint, exponent: number = PYTH_PRICE_EXPONENT): number {
  const priceNum = typeof price === 'bigint' ? Number(price) : price.toNumber()
  return priceNum * Math.pow(10, exponent)
}

interface UseEpochResult {
  /** The current epoch UI state */
  epochState: EpochUIState
  /** Whether the epoch data is currently loading */
  isLoading: boolean
  /** Error if fetching failed */
  error: Error | null
  /** Status when no active epoch */
  noEpochStatus: NoEpochStatus | null
  /** Refresh the epoch data manually */
  refetch: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = Program<any>

/**
 * Hook for fetching and subscribing to epoch data for a given asset.
 * Uses TanStack Query for caching with WebSocket subscription for real-time updates.
 *
 * @param asset - The asset to get epoch data for (BTC, ETH, SOL, or FOGO)
 * @returns Object containing epoch state, loading status, and error
 */
export function useEpoch(asset: Asset): UseEpochResult {
  const { connection } = useConnection()
  const queryClient = useQueryClient()

  // State for countdown timer
  const [timeRemaining, setTimeRemaining] = useState<number>(0)

  // Get pool PDA for this asset
  const poolPda = POOL_PDAS[asset]

  // Create a shared connection for queries (independent of wallet)
  const sharedConnection = useMemo(() => {
    return connection || new Connection(FOGO_TESTNET_RPC, 'confirmed')
  }, [connection])

  // Create an Anchor program instance for account decoding
  const program: AnchorProgram = useMemo(() => {
    // Create a minimal provider for account fetching (no wallet required for reads)
    const dummyProvider = new AnchorProvider(
      sharedConnection,
      // Use a dummy wallet for read-only operations
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

  // Fetch pool data to get active epoch
  const fetchPoolAndEpoch = useCallback(async (): Promise<EpochData | null> => {
    try {
      // Fetch pool account
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const poolAccount = await (program.account as any).pool.fetch(poolPda)

      // Check if there's an active epoch
      if (!poolAccount.activeEpoch) {
        return null
      }

      // Fetch epoch account
      const epochPda = poolAccount.activeEpoch as PublicKey
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const epochAccount = await (program.account as any).epoch.fetch(epochPda)

      // Parse epoch data
      const epochData: EpochData = {
        pool: epochAccount.pool as PublicKey,
        epochId: BigInt(epochAccount.epochId.toString()),
        state: parseEpochState(epochAccount.state),
        startTime: epochAccount.startTime.toNumber(),
        endTime: epochAccount.endTime.toNumber(),
        freezeTime: epochAccount.freezeTime.toNumber(),
        startPrice: BigInt(epochAccount.startPrice.toString()),
        startConfidence: BigInt(epochAccount.startConfidence.toString()),
        startPublishTime: epochAccount.startPublishTime.toNumber(),
        settlementPrice: epochAccount.settlementPrice
          ? BigInt(epochAccount.settlementPrice.toString())
          : null,
        settlementConfidence: epochAccount.settlementConfidence
          ? BigInt(epochAccount.settlementConfidence.toString())
          : null,
        settlementPublishTime: epochAccount.settlementPublishTime?.toNumber() ?? null,
        outcome: parseOutcome(epochAccount.outcome),
        yesTotalAtSettlement: epochAccount.yesTotalAtSettlement
          ? BigInt(epochAccount.yesTotalAtSettlement.toString())
          : null,
        noTotalAtSettlement: epochAccount.noTotalAtSettlement
          ? BigInt(epochAccount.noTotalAtSettlement.toString())
          : null,
        bump: epochAccount.bump,
      }

      return epochData
    } catch (err) {
      // Account doesn't exist or other error
      console.warn('Error fetching epoch:', err)
      return null
    }
  }, [program, poolPda])

  // TanStack Query for epoch data
  const {
    data: epochData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['epoch', asset],
    queryFn: fetchPoolAndEpoch,
    refetchInterval: 5000, // Poll every 5 seconds as fallback
    staleTime: 1000, // Consider data stale after 1 second
  })

  // WebSocket subscription for real-time updates
  useEffect(() => {
    if (!poolPda) return

    let subscriptionId: number | undefined

    const subscribeToPool = async () => {
      try {
        // Subscribe to pool account changes
        subscriptionId = sharedConnection.onAccountChange(
          poolPda,
          async () => {
            // Pool account changed - refetch epoch data
            try {
              const epochResult = await fetchPoolAndEpoch()
              queryClient.setQueryData(['epoch', asset], epochResult)
              // Invalidate lastSettledEpoch so it refetches with updated pool data
              queryClient.invalidateQueries({ queryKey: ['lastSettledEpoch', asset] })
            } catch (err) {
              console.warn('Error updating epoch from WebSocket:', err)
            }
          },
          'confirmed'
        )
      } catch (err) {
        console.warn('Error setting up WebSocket subscription:', err)
      }
    }

    subscribeToPool()

    return () => {
      if (subscriptionId !== undefined) {
        sharedConnection.removeAccountChangeListener(subscriptionId)
      }
    }
  }, [poolPda, sharedConnection, queryClient, asset, fetchPoolAndEpoch])

  // Countdown timer effect
  useEffect(() => {
    if (!epochData) {
      setTimeRemaining(0)
      return
    }

    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000)
      const remaining = epochData.endTime - now
      setTimeRemaining(Math.max(0, remaining))
    }

    // Update immediately
    updateCountdown()

    // Set up interval for 1-second updates
    const intervalId = setInterval(updateCountdown, 1000)

    return () => clearInterval(intervalId)
  }, [epochData])

  // Compute UI state
  const epochState: EpochUIState = useMemo(() => {
    if (!epochData) {
      return {
        epoch: null,
        timeRemaining: 0,
        isFrozen: false,
        isSettling: false,
        isSettled: false,
        startPriceDisplay: null,
        priceExponent: PYTH_PRICE_EXPONENT,
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const isFrozen = epochData.state === EpochState.Frozen || now >= epochData.freezeTime
    const isSettling = epochData.state === EpochState.Settling
    const isSettled =
      epochData.state === EpochState.Settled || epochData.state === EpochState.Refunded

    return {
      epoch: epochData,
      timeRemaining,
      isFrozen,
      isSettling,
      isSettled,
      startPriceDisplay: scalePrice(epochData.startPrice),
      priceExponent: PYTH_PRICE_EXPONENT,
    }
  }, [epochData, timeRemaining])

  // Determine no-epoch status
  const noEpochStatus: NoEpochStatus | null = useMemo(() => {
    if (epochData) return null
    if (isLoading) return null
    // For now, we just show "no-epoch" - future stories may add "next-epoch-soon" logic
    return 'no-epoch'
  }, [epochData, isLoading])

  return {
    epochState,
    isLoading,
    error: error as Error | null,
    noEpochStatus,
    refetch,
  }
}
