'use client'

import { useState, useCallback, useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { Asset } from '@/types/assets'
import { QUERY_KEYS, FOGO_EXPLORER_TX_URL, POOL_PDAS } from '@/lib/constants'
import {
  fetchPythLazerMessage,
  PYTH_LAZER_FEED_IDS,
  type PythConnectionState,
} from '@/lib/pyth-lazer-client'
import { buildCreateEpochTransaction } from '@/lib/transactions/create-epoch'
import { parseTransactionError } from '@/lib/transaction-errors'
import { useEpoch } from '@/hooks/use-epoch'

/**
 * Epoch creation states for UI feedback
 */
export type EpochCreationState =
  | 'idle'
  | 'fetching_price'
  | 'building'
  | 'signing'
  | 'confirming'
  | 'success'
  | 'error'

/**
 * Error messages for epoch creation
 */
const EPOCH_ERROR_MESSAGES: Record<string, string> = {
  ProtocolFrozen: 'Protocol is currently frozen. Please try again later.',
  ProtocolPaused: 'Protocol is paused. Please try again later.',
  PoolFrozen: 'This pool is currently frozen.',
  PoolPaused: 'This pool is currently paused.',
  EpochAlreadyActive: 'An epoch is already active. Refresh the page.',
  OracleDataStale: 'Price data is too old. Please try again.',
  OracleConfidenceTooWide: 'Price confidence is too low. Please try again.',
  OracleVerificationFailed: 'Oracle signature verification failed.',
  OraclePriceMissing: 'Price data is missing from oracle.',
}

/**
 * Parse epoch creation error and return user-friendly message
 */
function parseEpochCreationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  // Check for epoch-specific errors
  for (const [code, userMessage] of Object.entries(EPOCH_ERROR_MESSAGES)) {
    if (message.includes(code)) {
      return userMessage
    }
  }

  // Fall back to general transaction error parsing
  return parseTransactionError(error)
}

export interface UseEpochCreationResult {
  /** Current state of epoch creation */
  state: EpochCreationState
  /** Whether epoch creation is needed */
  needsEpochCreation: boolean
  /** Whether creation is currently in progress */
  isCreating: boolean
  /** Error message if creation failed */
  error: string | null
  /** Create a new epoch */
  createEpoch: () => Promise<void>
  /** Reset state to idle */
  reset: () => void
}

/**
 * Hook for creating new epochs
 *
 * Orchestrates the full epoch creation flow:
 * 1. Fetch signed price message from Pyth Lazer WebSocket
 * 2. Build create_epoch transaction with Ed25519 verification
 * 3. Sign and send transaction via wallet adapter
 * 4. Confirm transaction and update UI
 *
 * @param asset - The asset to create an epoch for
 * @returns Epoch creation state and controls
 */
export function useEpochCreation(asset: Asset): UseEpochCreationResult {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const queryClient = useQueryClient()

  // Get current epoch state
  const { noEpochStatus, isLoading: epochLoading } = useEpoch(asset)

  // Local state
  const [state, setState] = useState<EpochCreationState>('idle')
  const [error, setError] = useState<string | null>(null)

  // Determine if epoch creation is needed
  const needsEpochCreation = useMemo(() => {
    // Don't show if still loading
    if (epochLoading) return false
    // Show if no active epoch
    return noEpochStatus === 'no-epoch'
  }, [noEpochStatus, epochLoading])

  // Whether creation is in progress
  const isCreating = useMemo(() => {
    return ['fetching_price', 'building', 'signing', 'confirming'].includes(state)
  }, [state])

  // Reset state
  const reset = useCallback(() => {
    setState('idle')
    setError(null)
  }, [])

  // Create epoch
  const createEpoch = useCallback(async () => {
    if (!publicKey) {
      setError('Wallet not connected')
      setState('error')
      return
    }

    // Check pool exists
    const poolPda = POOL_PDAS[asset]
    if (!poolPda) {
      setError('Pool not found for this asset')
      setState('error')
      return
    }

    // Reset any previous error
    setError(null)
    setState('fetching_price')

    try {
      // 1. Fetch signed Pyth price message via server-side API
      const feedId = PYTH_LAZER_FEED_IDS[asset]
      const onPythStateChange = (pythState: PythConnectionState) => {
        // Update state based on Pyth connection
        if (pythState === 'connecting' || pythState === 'connected') {
          setState('fetching_price')
        }
      }

      const pythMessage = await fetchPythLazerMessage(feedId, onPythStateChange)

      // 2. Build transaction
      setState('building')
      const { transaction, epochId } = await buildCreateEpochTransaction({
        asset,
        pythMessage,
        payer: publicKey,
        connection,
      })

      // 3. Send transaction (prompts wallet for signature)
      setState('signing')
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      // 4. Confirm transaction
      setState('confirming')
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

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

      // 5. Success!
      setState('success')

      // Show success toast
      toast.success('Epoch created!', {
        description: `Epoch #${epochId.toString()} is now active for trading.`,
        action: {
          label: 'View',
          onClick: () => window.open(`${FOGO_EXPLORER_TX_URL}/${signature}`, '_blank'),
        },
      })

      // Invalidate epoch query to trigger refetch
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.epoch(asset) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pool(asset) })

      // Reset to idle after short delay
      setTimeout(() => setState('idle'), 2000)
    } catch (err) {
      const message = parseEpochCreationError(err)
      setError(message)
      setState('error')
      toast.error('Failed to create epoch', { description: message })
    }
  }, [publicKey, asset, connection, sendTransaction, queryClient])

  return {
    state,
    needsEpochCreation,
    isCreating,
    error,
    createEpoch,
    reset,
  }
}
