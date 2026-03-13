'use client'

import { useMemo, useEffect, useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Connection, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { useConnection } from '@solana/wallet-adapter-react'

import type { Asset } from '@/types/assets'
import type { PoolData, PoolUIState } from '@/types/pool'
import { calculateProbabilities, reservesToDisplayValue } from '@/types/pool'
import { POOL_PDAS, FOGO_TESTNET_RPC } from '@/lib/constants'

// Import the generated IDL
import idl from '@/lib/fogopulse.json'

// Note: Using `any` for Anchor Program type because the IDL is loaded dynamically.
// Generating typed Anchor clients would require build-time IDL processing.
// This pattern matches use-epoch.ts and other hooks in this codebase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = Program<any>

interface UsePoolResult {
  /** The raw pool data from on-chain */
  pool: PoolData | null
  /** Processed UI state with probabilities and liquidity */
  poolState: PoolUIState
  /** Whether the pool data is currently loading */
  isLoading: boolean
  /** Error if fetching failed */
  error: Error | null
  /** Whether WebSocket subscription is active for real-time updates */
  isRealtimeConnected: boolean
  /** Refresh pool data manually */
  refetch: () => void
}

/**
 * Hook for fetching and subscribing to pool data for a given asset.
 * Uses TanStack Query for caching with WebSocket subscription for real-time updates.
 *
 * @param asset - The asset to get pool data for (BTC, ETH, SOL, or FOGO)
 * @returns Object containing pool data, UI state, loading status, and error
 */
export function usePool(asset: Asset): UsePoolResult {
  const { connection } = useConnection()
  const queryClient = useQueryClient()

  // Track WebSocket subscription status
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)

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

  // Fetch pool account data
  const fetchPool = useCallback(async (): Promise<PoolData | null> => {
    try {
      // Fetch pool account
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const poolAccount = await (program.account as any).pool.fetch(poolPda)

      // Parse pool data
      const poolData: PoolData = {
        assetMint: poolAccount.assetMint as PublicKey,
        yesReserves: BigInt(poolAccount.yesReserves.toString()),
        noReserves: BigInt(poolAccount.noReserves.toString()),
        totalLpShares: BigInt(poolAccount.totalLpShares.toString()),
        nextEpochId: BigInt(poolAccount.nextEpochId.toString()),
        activeEpoch: poolAccount.activeEpoch
          ? (poolAccount.activeEpoch as PublicKey)
          : null,
        activeEpochState: poolAccount.activeEpochState,
        walletCapBps: poolAccount.walletCapBps,
        sideCapBps: poolAccount.sideCapBps,
        isPaused: poolAccount.isPaused,
        isFrozen: poolAccount.isFrozen,
        bump: poolAccount.bump,
      }

      return poolData
    } catch (err) {
      // Account doesn't exist or other error
      console.warn('Error fetching pool:', err)
      return null
    }
  }, [program, poolPda])

  // TanStack Query for pool data
  const {
    data: pool,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['pool', asset],
    queryFn: fetchPool,
    refetchInterval: 2000, // Poll every 2 seconds as fallback
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
            // Pool account changed - refetch data
            try {
              const poolResult = await fetchPool()
              queryClient.setQueryData(['pool', asset], poolResult)
            } catch (err) {
              console.warn('Error updating pool from WebSocket:', err)
            }
          },
          'confirmed'
        )
        // Mark WebSocket as connected
        setIsRealtimeConnected(true)
      } catch (err) {
        console.warn('Error setting up WebSocket subscription:', err)
        setIsRealtimeConnected(false)
      }
    }

    subscribeToPool()

    return () => {
      setIsRealtimeConnected(false)
      if (subscriptionId !== undefined) {
        sharedConnection.removeAccountChangeListener(subscriptionId)
      }
    }
  }, [poolPda, sharedConnection, queryClient, asset, fetchPool])

  // Calculate UI state from pool data
  const poolState: PoolUIState = useMemo(() => {
    if (!pool) {
      return {
        probabilities: { pUp: 50, pDown: 50 },
        totalLiquidity: 0,
        isLoading,
        error: error ? error.message : null,
      }
    }

    const probabilities = calculateProbabilities(pool.yesReserves, pool.noReserves)
    const totalLiquidity = reservesToDisplayValue(
      pool.yesReserves + pool.noReserves
    )

    return {
      probabilities,
      totalLiquidity,
      isLoading: false,
      error: null,
    }
  }, [pool, isLoading, error])

  return {
    pool: pool ?? null,
    poolState,
    isLoading,
    error: error as Error | null,
    isRealtimeConnected,
    refetch,
  }
}
