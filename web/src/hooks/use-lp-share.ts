'use client'

import { useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Connection, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { useConnection } from '@solana/wallet-adapter-react'

import type { Asset } from '@/types/assets'
import type { LpShareData } from '@/types/lp'
import { POOL_PDAS, FOGO_TESTNET_RPC, QUERY_KEYS } from '@/lib/constants'
import { deriveLpSharePda } from '@/lib/pda'

import idl from '@/lib/fogopulse.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = Program<any>

interface UseLpShareResult {
  lpShare: LpShareData | null
  isLoading: boolean
  error: Error | null
}

/**
 * Hook for fetching LpShare account data for a given asset and user.
 * Returns null gracefully if the account doesn't exist (user hasn't deposited).
 *
 * Follows use-pool.ts pattern for connection setup and Anchor program creation.
 */
export function useLpShare(asset: Asset, userPubkey: PublicKey | null): UseLpShareResult {
  const { connection } = useConnection()

  const poolPda = POOL_PDAS[asset]

  const sharedConnection = useMemo(() => {
    return connection || new Connection(FOGO_TESTNET_RPC, 'confirmed')
  }, [connection])

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

  const lpSharePda = useMemo(() => {
    if (!userPubkey) return null
    return deriveLpSharePda(userPubkey, poolPda)
  }, [userPubkey, poolPda])

  const fetchLpShare = useCallback(async (): Promise<LpShareData | null> => {
    if (!lpSharePda) return null
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await (program.account as any).lpShare.fetch(lpSharePda)
      return {
        user: account.user as PublicKey,
        pool: account.pool as PublicKey,
        shares: BigInt(account.shares.toString()),
        depositedAmount: BigInt(account.depositedAmount.toString()),
        pendingWithdrawal: BigInt(account.pendingWithdrawal.toString()),
        withdrawalRequestedAt: account.withdrawalRequestedAt
          ? BigInt(account.withdrawalRequestedAt.toString())
          : null,
        bump: account.bump,
      }
    } catch {
      return null // Account doesn't exist — user has no LP position in this pool
    }
  }, [program, lpSharePda])

  const {
    data: lpShare,
    isLoading,
    error,
  } = useQuery({
    queryKey: QUERY_KEYS.lpShare(asset, userPubkey?.toBase58()),
    queryFn: fetchLpShare,
    enabled: !!userPubkey,
    refetchInterval: 5000, // Poll every 5s (LP data changes infrequently)
    staleTime: 3000,
  })

  return {
    lpShare: lpShare ?? null,
    isLoading,
    error: error as Error | null,
  }
}
