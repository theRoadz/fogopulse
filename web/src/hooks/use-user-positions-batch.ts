'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'

import { useProgram } from '@/hooks/use-program'
import { batchFetchUserPositions, positionKey } from '@/lib/batch-fetch'
import type { UserPositionData } from '@/hooks/use-user-position'

// Re-export positionKey so existing consumers don't break
export { positionKey }

interface UseUserPositionsBatchResult {
  /** Map of composite key (epochPda:direction) → UserPositionData (only includes positions that exist) */
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
    queryFn: async (): Promise<Map<string, UserPositionData>> => {
      if (!publicKey || epochPdas.length === 0) return new Map()
      return batchFetchUserPositions(program, epochPdas, publicKey)
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
