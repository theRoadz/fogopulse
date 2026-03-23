'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import { toast } from 'sonner'

import type { Asset } from '@/types/assets'
import { QUERY_KEYS, FOGO_EXPLORER_TX_URL } from '@/lib/constants'
import { buildDepositLiquidityInstruction } from '@/lib/transactions/deposit-liquidity'
import { parseTransactionError } from '@/lib/transaction-errors'
import { useProgram } from '@/hooks/use-program'

interface DepositLiquidityParams {
  asset: Asset
  amount: string // Human-readable USDC (e.g., "10.50")
  userPubkey: string // Pass publicKey.toString() to avoid stale closure in onSuccess
}

interface DepositLiquidityResult {
  signature: string
}

/**
 * Hook for executing deposit_liquidity transactions
 *
 * Transaction flow:
 * 1. Get latest blockhash for transaction expiry handling
 * 2. Build deposit_liquidity instruction
 * 3. Create Transaction with instruction, blockhash, and fee payer
 * 4. Sign via wallet, then send raw transaction through app's connection
 * 5. Confirm with blockhash expiry handling
 * 6. Invalidate relevant queries to refresh UI
 */
export function useDepositLiquidity() {
  const queryClient = useQueryClient()
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const program = useProgram()

  return useMutation<DepositLiquidityResult, Error, DepositLiquidityParams>({
    mutationFn: async ({ asset, amount, userPubkey }) => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      if (publicKey.toString() !== userPubkey) {
        throw new Error('Wallet changed during transaction preparation')
      }

      // 1. Get blockhash BEFORE building transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

      // 2. Build deposit_liquidity instruction
      const instruction = await buildDepositLiquidityInstruction({
        asset,
        amount,
        userPubkey: publicKey,
        program,
      })

      // 3. Create transaction with instruction
      const transaction = new Transaction()
      transaction.add(instruction)
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      // 4. Sign transaction via wallet, then send through app's connection
      if (!signTransaction) throw new Error('Wallet does not support signing')
      const signed = await signTransaction(transaction)
      const signature = await connection.sendRawTransaction(signed.serialize(), {
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

    onSuccess: ({ signature }, { asset, userPubkey }) => {
      toast.success('Deposit confirmed!', {
        description: 'Your liquidity has been deposited successfully.',
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
      toast.error('Deposit failed', { description: message })
    },
  })
}
