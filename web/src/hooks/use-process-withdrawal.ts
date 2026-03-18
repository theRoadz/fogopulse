'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import { toast } from 'sonner'

import type { Asset } from '@/types/assets'
import { QUERY_KEYS, FOGO_EXPLORER_TX_URL } from '@/lib/constants'
import { buildProcessWithdrawalInstruction } from '@/lib/transactions/process-withdrawal'
import { parseTransactionError } from '@/lib/transaction-errors'
import { useProgram } from '@/hooks/use-program'

interface ProcessWithdrawalParams {
  asset: Asset
  userPubkey: string // Pass publicKey.toString() to avoid stale closure in onSuccess
  estimatedUsdc?: string // Pre-computed USDC value for success toast display
}

interface ProcessWithdrawalResult {
  signature: string
}

/**
 * Hook for executing process_withdrawal transactions
 *
 * Transaction flow:
 * 1. Get latest blockhash for transaction expiry handling
 * 2. Build process_withdrawal instruction
 * 3. Create Transaction with instruction, blockhash, and fee payer
 * 4. Send via wallet adapter's sendTransaction
 * 5. Confirm with blockhash expiry handling
 * 6. Invalidate relevant queries to refresh UI
 */
export function useProcessWithdrawal() {
  const queryClient = useQueryClient()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const program = useProgram()

  return useMutation<ProcessWithdrawalResult, Error, ProcessWithdrawalParams>({
    mutationFn: async ({ asset, userPubkey }) => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      if (publicKey.toString() !== userPubkey) {
        throw new Error('Wallet changed during transaction preparation')
      }

      // 1. Get blockhash BEFORE building transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

      // 2. Build process_withdrawal instruction
      const instruction = await buildProcessWithdrawalInstruction({
        asset,
        userPubkey: publicKey,
        program,
      })

      // 3. Create transaction with instruction
      const transaction = new Transaction()
      transaction.add(instruction)
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      // 4. Send transaction via wallet adapter
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

    onSuccess: ({ signature }, { asset, userPubkey, estimatedUsdc }) => {
      const desc = estimatedUsdc
        ? `~$${estimatedUsdc} USDC transferred to your wallet.`
        : 'USDC has been transferred to your wallet.'
      toast.success('Withdrawal complete!', {
        description: desc,
        action: {
          label: 'View',
          onClick: () => window.open(`${FOGO_EXPLORER_TX_URL}/${signature}`, '_blank'),
        },
      })

      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pool(asset) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lpShare(asset, userPubkey) })
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.usdcBalance(userPubkey),
      })
    },

    onError: (error) => {
      const message = parseTransactionError(error)
      toast.error('Withdrawal processing failed', { description: message })
    },
  })
}
