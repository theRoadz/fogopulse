'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'

import { derivePositionPda } from '@/lib/pda'
import { useProgram } from '@/hooks/use-program'
import { parseDirection } from '@/hooks/use-user-position'
import type { UserPositionData } from '@/hooks/use-user-position'

interface UseUserPositionsBatchResult {
  /** Map of epoch PDA string → UserPositionData (only includes epochs where user has a position) */
  positions: Map<string, UserPositionData>
  /** Whether position data is loading */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
}

/**
 * Hook for batch-fetching user positions across multiple epochs.
 * Returns a Map keyed by epoch PDA string for efficient lookup.
 *
 * @param epochPdas - Array of epoch PDAs to check for positions
 * @returns Map of positions keyed by epoch PDA string
 */
export function useUserPositionsBatch(epochPdas: PublicKey[]): UseUserPositionsBatchResult {
  const { publicKey } = useWallet()
  const program = useProgram()

  // Stable serialized key for query dependency — ensures queryKey changes
  // only when actual PDA values change, not on every render
  const epochPdasKey = useMemo(
    () => epochPdas.map((p) => p.toBase58()).join(','),
    [epochPdas]
  )

  const {
    data: positions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['positionsBatch', publicKey?.toBase58(), epochPdasKey],
    // queryFn is stable via queryKey — TanStack Query re-runs when key changes
    queryFn: async (): Promise<Map<string, UserPositionData>> => {
      if (!publicKey || epochPdas.length === 0) return new Map()

      // Derive all position PDAs
      const positionPdas = epochPdas.map((epochPda) =>
        derivePositionPda(epochPda, publicKey)
      )

      // Batch fetch using Promise.allSettled (follows existing codebase pattern)
      const results = await Promise.allSettled(
        positionPdas.map((pda) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (program.account as any).userPosition.fetch(pda)
        )
      )

      // Map results: fulfilled = position exists, rejected = no position
      const positions = new Map<string, UserPositionData>()
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const acct = result.value
          positions.set(epochPdas[i].toBase58(), {
            user: acct.user as PublicKey,
            epoch: acct.epoch as PublicKey,
            direction: parseDirection(acct.direction),
            amount: BigInt(acct.amount.toString()),
            shares: BigInt(acct.shares.toString()),
            entryPrice: BigInt(acct.entryPrice.toString()),
            claimed: acct.claimed,
            bump: acct.bump,
          })
        }
        // rejected = account doesn't exist = user has no position in that epoch
      })

      return positions
    },
    enabled: publicKey !== null && epochPdas.length > 0,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  })

  return {
    positions: positions ?? new Map(),
    isLoading,
    error: error as Error | null,
  }
}
