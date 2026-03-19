'use client'

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'

import { derivePositionPda } from '@/lib/pda'
import { useProgram } from '@/hooks/use-program'

/**
 * Direction enum matching on-chain Direction type
 */
export type PositionDirection = 'up' | 'down'

/**
 * User position data from on-chain UserPosition account
 */
export interface UserPositionData {
  /** Wallet address of the position holder */
  user: PublicKey
  /** Reference to the epoch this position is in */
  epoch: PublicKey
  /** Direction of the prediction */
  direction: PositionDirection
  /** Position size in USDC lamports (6 decimals) */
  amount: bigint
  /** Shares received from CPMM calculation */
  shares: bigint
  /** Price paid per share at entry */
  entryPrice: bigint
  /** Whether payout or refund has been claimed */
  claimed: boolean
  /** PDA bump seed */
  bump: number
}

/**
 * Parse direction from Anchor enum format { up: {} } / { down: {} }
 */
export function parseDirection(direction: unknown): PositionDirection {
  if (!direction || typeof direction !== 'object') return 'up'
  const keys = Object.keys(direction)
  if (keys.length === 0) return 'up'
  return keys[0] === 'down' ? 'down' : 'up'
}

interface UseUserPositionResult {
  /** User's position data, null if no position exists */
  position: UserPositionData | null
  /** Whether position data is loading */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
  /** Refresh position data */
  refetch: () => void
}

/**
 * Hook for fetching a user's position for a given epoch.
 *
 * Returns null if user has no position in the epoch (account not found).
 * This is NOT an error — it means no claim UI should be shown.
 *
 * @param epochPda - The epoch PDA to check position for
 * @returns User position data or null
 */
export function useUserPosition(epochPda: PublicKey | null, direction: PositionDirection = 'up'): UseUserPositionResult {
  const { publicKey } = useWallet()
  const program = useProgram()

  const positionPda = useMemo(() => {
    if (!epochPda || !publicKey) return null
    return derivePositionPda(epochPda, publicKey, direction)
  }, [epochPda, publicKey, direction])

  const fetchPosition = useCallback(async (): Promise<UserPositionData | null> => {
    if (!positionPda) return null

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const positionAccount = await (program.account as any).userPosition.fetch(positionPda)

      return {
        user: positionAccount.user as PublicKey,
        epoch: positionAccount.epoch as PublicKey,
        direction: parseDirection(positionAccount.direction),
        amount: BigInt(positionAccount.amount.toString()),
        shares: BigInt(positionAccount.shares.toString()),
        entryPrice: BigInt(positionAccount.entryPrice.toString()),
        claimed: positionAccount.claimed,
        bump: positionAccount.bump,
      }
    } catch {
      // Account not found — user has no position in this epoch
      return null
    }
  }, [positionPda, program])

  const {
    data: position,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['position', epochPda?.toString(), publicKey?.toString(), direction],
    queryFn: fetchPosition,
    enabled: positionPda !== null,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  })

  return {
    position: position ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  }
}
