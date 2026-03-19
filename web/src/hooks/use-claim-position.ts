'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { toast } from 'sonner'

import type { Asset } from '@/types/assets'
import { QUERY_KEYS, FOGO_EXPLORER_TX_URL } from '@/lib/constants'
import { buildClaimPayoutInstruction, buildClaimRefundInstruction } from '@/lib/transactions/claim'
import { parseTransactionError } from '@/lib/transaction-errors'
import { useProgram } from '@/hooks/use-program'

interface ClaimPositionParams {
  asset: Asset
  type: 'payout' | 'refund'
  epochPda: PublicKey
  direction: 'up' | 'down'
  userPubkey: string // Pass publicKey.toString() to avoid stale closure in onSuccess
  displayAmount: string // Human-readable USDC amount for toast
}

interface ClaimPositionResult {
  signature: string
}

/**
 * Hook for executing claim_payout or claim_refund transactions.
 *
 * Transaction flow:
 * 1. Get latest blockhash
 * 2. Build claim instruction (payout or refund)
 * 3. Create Transaction with instruction, blockhash, and fee payer
 * 4. Send via wallet adapter's sendTransaction
 * 5. Confirm with blockhash expiry handling
 * 6. Invalidate relevant queries to refresh UI
 */
export function useClaimPosition() {
  const queryClient = useQueryClient()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const program = useProgram()

  const mutation = useMutation<ClaimPositionResult, Error, ClaimPositionParams>({
    mutationFn: async ({ asset, type, epochPda, direction, userPubkey }) => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      if (publicKey.toString() !== userPubkey) {
        throw new Error('Wallet changed during transaction preparation')
      }

      // 1. Get blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

      // 2. Build claim instruction
      const buildInstruction = type === 'payout'
        ? buildClaimPayoutInstruction
        : buildClaimRefundInstruction

      const instruction = await buildInstruction({
        asset,
        epochPda,
        direction,
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

    onSuccess: ({ signature }, { asset, type, userPubkey, displayAmount }) => {
      const label = type === 'payout' ? 'Payout claimed!' : 'Refund claimed!'
      const description = `${displayAmount} USDC transferred to your wallet`

      toast.success(label, {
        description,
        action: {
          label: 'View',
          onClick: () => window.open(`${FOGO_EXPLORER_TX_URL}/${signature}`, '_blank'),
        },
      })

      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.epoch(asset) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pool(asset) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lastSettledEpoch(asset) })
      queryClient.invalidateQueries({ queryKey: ['position'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['positionsBatch'] })
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
      toast.error('Claim failed', {
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
