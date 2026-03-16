'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { toast } from 'sonner'

import type { Asset } from '@/types/assets'
import { QUERY_KEYS, FOGO_EXPLORER_TX_URL } from '@/lib/constants'
import { buildSellPositionInstruction } from '@/lib/transactions/sell'
import { parseTransactionError } from '@/lib/transaction-errors'
import { useProgram } from '@/hooks/use-program'

interface SellPositionParams {
  asset: Asset
  epochPda: PublicKey
  shares: bigint
  userPubkey: string // Pass publicKey.toString() to avoid stale closure in onSuccess
  isFullExit: boolean // Used for success toast message
}

interface SellPositionResult {
  signature: string
}

/**
 * Hook for executing sell_position transactions.
 *
 * Uses claim_position error handling pattern (separate wallet rejection → toast.info).
 *
 * Transaction flow:
 * 1. Get latest blockhash
 * 2. Build sell_position instruction
 * 3. Create Transaction with instruction, blockhash, and fee payer
 * 4. Send via wallet adapter's sendTransaction
 * 5. Confirm with blockhash expiry handling
 * 6. Invalidate relevant queries to refresh UI
 */
export function useSellPosition() {
  const queryClient = useQueryClient()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const program = useProgram()

  const mutation = useMutation<SellPositionResult, Error, SellPositionParams>({
    mutationFn: async ({ asset, epochPda, shares, userPubkey }) => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      if (publicKey.toString() !== userPubkey) {
        throw new Error('Wallet changed during transaction preparation')
      }

      // 1. Get blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

      // 2. Build sell_position instruction
      const instruction = await buildSellPositionInstruction({
        asset,
        epochPda,
        shares,
        userPubkey: publicKey,
        program,
      })

      // 3. Create transaction
      const transaction = new Transaction()
      transaction.add(instruction)
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      // 4. Send transaction
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      // 5. Confirm transaction
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      )

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      return { signature }
    },

    onSuccess: ({ signature }, { asset, userPubkey, isFullExit }) => {
      const label = isFullExit ? 'Position closed!' : 'Position sold!'

      toast.success(label, {
        description: isFullExit
          ? 'Your position has been fully exited.'
          : 'Shares sold successfully.',
        action: {
          label: 'View',
          onClick: () => window.open(`${FOGO_EXPLORER_TX_URL}/${signature}`, '_blank'),
        },
      })

      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.epoch(asset) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pool(asset) })
      // Invalidate BOTH singular and plural position keys (known inconsistency — see Dev Notes)
      queryClient.invalidateQueries({ queryKey: ['position'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.usdcBalance(userPubkey),
      })
    },

    onError: (error, variables) => {
      const message = error.message
      // Handle wallet rejection gracefully (info toast, not error)
      if (
        message.includes('User rejected') ||
        message.includes('rejected the request') ||
        message.includes('User denied') ||
        message.includes('cancelled')
      ) {
        toast.info('Transaction cancelled')
        return
      }

      const userMessage = parseTransactionError(error)
      toast.error('Sell failed', {
        description: userMessage,
        action: {
          label: 'Retry',
          onClick: () => mutation.mutate(variables),
        },
      })
    },
  })

  return mutation
}
