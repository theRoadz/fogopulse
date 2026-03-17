'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import { toast } from 'sonner'

import type { Asset } from '@/types/assets'
import { QUERY_KEYS, FOGO_EXPLORER_TX_URL } from '@/lib/constants'
import { buildBuyPositionInstruction } from '@/lib/transactions/buy'
import { parseTransactionError } from '@/lib/transaction-errors'
import { useProgram } from '@/hooks/use-program'

interface BuyPositionParams {
  asset: Asset
  direction: 'up' | 'down'
  amount: string // Human-readable USDC (e.g., "10.50")
  epochId: bigint
  userPubkey: string // Pass publicKey.toString() to avoid stale closure in onSuccess
}

interface BuyPositionResult {
  signature: string
}

/**
 * Hook for executing buy_position transactions
 *
 * Uses TanStack Query mutation for:
 * - Optimistic UI updates
 * - Automatic cache invalidation on success
 * - Error handling and retry logic
 *
 * Transaction flow:
 * 1. Get latest blockhash for transaction expiry handling
 * 2. Build buy_position instruction via buildBuyPositionInstruction
 * 3. Create Transaction with instruction, blockhash, and fee payer
 * 4. Send via wallet adapter's sendTransaction
 * 5. Confirm with blockhash expiry handling
 * 6. Invalidate relevant queries to refresh UI
 */
export function useBuyPosition() {
  const queryClient = useQueryClient()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const program = useProgram()

  return useMutation<BuyPositionResult, Error, BuyPositionParams>({
    mutationFn: async ({ asset, direction, amount, epochId, userPubkey }) => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      // Validate userPubkey matches current wallet
      if (publicKey.toString() !== userPubkey) {
        throw new Error('Wallet changed during transaction preparation')
      }

      // 1. Get blockhash BEFORE building transaction (for expiry handling)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

      // 2. Build buy_position instruction
      const instruction = await buildBuyPositionInstruction({
        asset,
        direction,
        amount,
        epochId,
        userPubkey: publicKey,
        program,
      })

      // 3. Create transaction with instruction
      const transaction = new Transaction()
      transaction.add(instruction)
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      // 4. Send transaction via wallet adapter
      // This will prompt the wallet for signature
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      // 5. Confirm transaction with blockhash expiry handling
      // This waits until the transaction is confirmed or the blockhash expires
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      )

      // Check for confirmation errors
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      return { signature }
    },

    onSuccess: ({ signature }, { asset, userPubkey }) => {
      // Show success toast with link to explorer
      toast.success('Trade confirmed!', {
        description: 'Your position has been opened successfully.',
        action: {
          label: 'View',
          onClick: () => window.open(`${FOGO_EXPLORER_TX_URL}/${signature}`, '_blank'),
        },
      })

      // Invalidate relevant queries to refresh UI
      // This triggers refetch of epoch, pool, and positions data
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.epoch(asset) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pool(asset) })
      queryClient.invalidateQueries({ queryKey: ['position'] }) // Single position (YourPosition)
      queryClient.invalidateQueries({ queryKey: ['positions'] }) // All positions
      queryClient.invalidateQueries({ queryKey: ['positionsBatch'] })
      // Use userPubkey from mutation params (not closure) to avoid stale reference
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.usdcBalance(userPubkey),
      })
    },

    onError: (error) => {
      // Parse error and show user-friendly message
      const message = parseTransactionError(error)
      toast.error('Trade failed', { description: message })
    },
  })
}
