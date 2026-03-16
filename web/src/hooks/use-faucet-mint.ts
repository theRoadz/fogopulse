'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FOGO_EXPLORER_TX_URL } from '@/lib/constants'

interface FaucetMintResult {
  signature: string
}

/**
 * Hook to request test USDC from the faucet.
 * Checks eligibility on load via GET /api/faucet?wallet=...
 * POSTs to /api/faucet to mint, and invalidates usdc-balance on success.
 * No cap/amount values are shipped to the client.
 */
export function useFaucetMint() {
  const { publicKey } = useWallet()
  const queryClient = useQueryClient()

  const walletAddress = publicKey?.toBase58()

  // Check faucet eligibility on load
  const { data: faucetStatus } = useQuery({
    queryKey: ['faucet-status', walletAddress],
    queryFn: async () => {
      const response = await fetch(`/api/faucet?wallet=${walletAddress}`)
      const data = await response.json()
      return { canMint: data.canMint as boolean }
    },
    enabled: !!walletAddress,
    staleTime: 30_000, // recheck every 30s
  })

  const isOverCap = faucetStatus ? !faucetStatus.canMint : false

  const mutation = useMutation<FaucetMintResult, Error>({
    mutationKey: ['faucet-mint'],
    mutationFn: async () => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      const response = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to mint USDC')
      }

      return { signature: data.signature }
    },
    onSuccess: ({ signature }) => {
      toast.success('USDC minted successfully', {
        description: 'Test USDC has been sent to your wallet.',
        action: {
          label: 'View',
          onClick: () =>
            window.open(`${FOGO_EXPLORER_TX_URL}/${signature}`, '_blank'),
        },
      })

      // Refresh balance and faucet eligibility
      queryClient.invalidateQueries({ queryKey: ['usdc-balance'] })
      queryClient.invalidateQueries({ queryKey: ['faucet-status'] })
    },
    onError: (error) => {
      // Re-check eligibility after error (may have been a 429)
      queryClient.invalidateQueries({ queryKey: ['faucet-status'] })

      toast.error('Faucet request failed', {
        description: error.message,
      })
    },
  })

  return { ...mutation, isOverCap }
}
