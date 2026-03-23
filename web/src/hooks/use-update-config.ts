'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import { toast } from 'sonner'

import { QUERY_KEYS, FOGO_EXPLORER_TX_URL } from '@/lib/constants'
import { buildUpdateConfigInstruction, UpdateConfigParams } from '@/lib/transactions/update-config'
import { parseTransactionError } from '@/lib/transaction-errors'
import { useProgram } from '@/hooks/use-program'

interface UpdateConfigResult {
  signature: string
}

interface UpdateConfigMutationParams {
  params: UpdateConfigParams
  userPubkey: string
}

/**
 * Hook for executing update_config transactions.
 *
 * Follows the same pattern as useBuyPosition:
 * 1. Get latest blockhash
 * 2. Build update_config instruction
 * 3. Create Transaction with instruction, blockhash, fee payer
 * 4. Sign via wallet, then send raw transaction through app's connection
 * 5. Confirm with blockhash expiry handling
 * 6. Invalidate globalConfig query on success
 */
export function useUpdateConfig() {
  const queryClient = useQueryClient()
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const program = useProgram()

  return useMutation<UpdateConfigResult, Error, UpdateConfigMutationParams>({
    mutationFn: async ({ params, userPubkey }) => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      if (publicKey.toString() !== userPubkey) {
        throw new Error('Wallet changed during transaction preparation')
      }

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

      const instruction = await buildUpdateConfigInstruction(program, publicKey, params)

      const transaction = new Transaction()
      transaction.add(instruction)
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      if (!signTransaction) throw new Error('Wallet does not support signing')
      const signed = await signTransaction(transaction)
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      )

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      return { signature }
    },

    onSuccess: ({ signature }) => {
      toast.success('Configuration updated!', {
        description: 'Protocol parameters have been updated successfully.',
        action: {
          label: 'View',
          onClick: () => window.open(`${FOGO_EXPLORER_TX_URL}/${signature}`, '_blank'),
        },
      })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.globalConfig() })
    },

    onError: (error) => {
      const message = parseTransactionError(error)
      toast.error('Configuration update failed', { description: message })
    },
  })
}
