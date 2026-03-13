'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { getAssociatedTokenAddress, getAccount, TokenAccountNotFoundError } from '@solana/spl-token'

import { USDC_MINT, USDC_DECIMALS } from '@/lib/constants'

export interface UseUsdcBalanceResult {
  /** USDC balance in display units (2 decimal places) */
  balance: number | null
  /** Raw balance in base units (6 decimals) */
  rawBalance: bigint | null
  /** Whether the balance is loading */
  isLoading: boolean
  /** Error if fetching failed */
  error: Error | null
  /** Formatted balance string (e.g., "123.45") */
  formattedBalance: string | null
  /** Refetch the balance manually */
  refetch: () => void
}

/**
 * Hook to fetch the connected wallet's USDC balance on FOGO testnet.
 * Uses TanStack Query for caching with 10s refresh interval.
 *
 * @returns Object containing balance, loading status, and error
 */
export function useUsdcBalance(): UseUsdcBalanceResult {
  const { connection } = useConnection()
  const { publicKey, connected } = useWallet()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['usdc-balance', publicKey?.toBase58()],
    queryFn: async (): Promise<{ balance: number; rawBalance: bigint } | null> => {
      if (!publicKey) return null

      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey)

      try {
        const account = await getAccount(connection, ata)
        // Convert from base units (6 decimals) to display value
        const rawBalance = account.amount
        const balance = Number(rawBalance) / 10 ** USDC_DECIMALS
        return { balance, rawBalance }
      } catch (err) {
        // Account doesn't exist (no USDC balance) - this is expected for new wallets
        if (err instanceof TokenAccountNotFoundError) {
          return { balance: 0, rawBalance: BigInt(0) }
        }
        // Re-throw other errors
        throw err
      }
    },
    enabled: connected && !!publicKey,
    refetchInterval: 10000, // Refresh every 10 seconds
    staleTime: 5000, // Consider data stale after 5 seconds
  })

  // Format balance to 2 decimal places
  const formattedBalance =
    data?.balance != null
      ? data.balance.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null

  return {
    balance: data?.balance ?? null,
    rawBalance: data?.rawBalance ?? null,
    isLoading,
    error: error as Error | null,
    formattedBalance,
    refetch,
  }
}
