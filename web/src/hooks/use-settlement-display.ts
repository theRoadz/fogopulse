'use client'

import { useMemo } from 'react'
import { PublicKey } from '@solana/web3.js'

import { useEpoch } from './use-epoch'
import type { Asset } from '@/types/assets'
import { EpochState, Outcome } from '@/types/epoch'
import { POOL_PDAS, PROGRAM_ID } from '@/lib/constants'
import { scalePrice, formatConfidencePercent } from '@/lib/utils'

/**
 * Settlement display data for UI consumption
 */
export interface SettlementDisplayData {
  /** Whether epoch has been settled (outcome determined) */
  isSettled: boolean
  /** The epoch outcome (Up, Down, or Refunded) */
  outcome: Outcome | null
  /** Human-readable start price (USD) */
  startPrice: number
  /** Raw start price (bigint) for lossless downstream use */
  startPriceRaw: bigint
  /** Raw start confidence (bigint) for calculations */
  startConfidenceRaw: bigint
  /** Human-readable start confidence (USD) */
  startConfidence: number
  /** Start confidence as percentage of price (e.g., "0.05%") */
  startConfidencePercent: string
  /** Start oracle publish timestamp (unix seconds) */
  startPublishTime: number
  /** Human-readable settlement price (USD), null if not settled */
  settlementPrice: number | null
  /** Raw settlement price (bigint) for lossless downstream use */
  settlementPriceRaw: bigint | null
  /** Raw settlement confidence (bigint) for calculations */
  settlementConfidenceRaw: bigint | null
  /** Human-readable settlement confidence (USD), null if not settled */
  settlementConfidence: number | null
  /** Settlement confidence as percentage of price (e.g., "0.05%"), null if not settled */
  settlementConfidencePercent: string | null
  /** Settlement oracle publish timestamp (unix seconds), null if not settled */
  settlementPublishTime: number | null
  /** Price change from start to settlement (USD), null if not settled */
  priceDelta: number | null
  /** Price change as percentage (e.g., "+0.01%"), null if not settled */
  priceDeltaPercent: string | null
  /** Epoch PDA for verification links */
  epochPda: PublicKey | null
  /** Epoch ID for display */
  epochId: bigint | null
}

/**
 * Derive epoch PDA from pool and epoch ID
 * Browser-compatible implementation (no Buffer.writeBigUInt64LE)
 */
function deriveEpochPda(poolPda: PublicKey, epochId: bigint, programId: PublicKey): PublicKey {
  // Convert epochId to little-endian bytes (browser-compatible)
  const epochIdBuffer = new Uint8Array(8)
  let n = epochId
  for (let i = 0; i < 8; i++) {
    epochIdBuffer[i] = Number(n & BigInt(0xff))
    n = n >> BigInt(8)
  }

  const [epochPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), poolPda.toBuffer(), epochIdBuffer],
    programId
  )
  return epochPda
}

/**
 * Hook for deriving settlement display data from epoch state.
 * Composes with existing useEpoch hook - does NOT duplicate fetching.
 *
 * @param asset - The asset to get settlement data for (optional)
 * @returns Settlement display data or null if no epoch or no asset
 */
export function useSettlementDisplay(asset?: Asset): SettlementDisplayData | null {
  // Use 'BTC' as default for hook call (required by rules of hooks)
  // Will return null if no real asset is provided
  const { epochState } = useEpoch(asset ?? 'BTC')
  const hasAsset = asset !== undefined

  return useMemo(() => {
    // Return null if no asset was provided
    if (!hasAsset) return null

    const epoch = epochState.epoch
    if (!epoch) return null

    const isSettled =
      epoch.state === EpochState.Settled || epoch.state === EpochState.Refunded

    // Start price data (always available)
    const startPrice = scalePrice(epoch.startPrice)
    const startConfidence = scalePrice(epoch.startConfidence)
    const startConfidencePercent = formatConfidencePercent(
      epoch.startConfidence,
      epoch.startPrice
    )

    // Settlement price data (only available when settled)
    let settlementPrice: number | null = null
    let settlementConfidence: number | null = null
    let settlementConfidencePercent: string | null = null
    let priceDelta: number | null = null
    let priceDeltaPercent: string | null = null

    if (epoch.settlementPrice !== null) {
      settlementPrice = scalePrice(epoch.settlementPrice)

      if (epoch.settlementConfidence !== null) {
        settlementConfidence = scalePrice(epoch.settlementConfidence)
        settlementConfidencePercent = formatConfidencePercent(
          epoch.settlementConfidence,
          epoch.settlementPrice
        )
      }

      priceDelta = settlementPrice - startPrice
      const deltaPercent = (priceDelta / startPrice) * 100
      const sign = deltaPercent >= 0 ? '+' : ''
      priceDeltaPercent = `${sign}${deltaPercent.toFixed(2)}%`
    }

    // Derive epoch PDA for verification
    const poolPda = POOL_PDAS[asset!]
    const epochPda = deriveEpochPda(poolPda, epoch.epochId, PROGRAM_ID)

    return {
      isSettled,
      outcome: epoch.outcome,
      startPrice,
      startPriceRaw: epoch.startPrice,
      startConfidenceRaw: epoch.startConfidence,
      startConfidence,
      startConfidencePercent,
      startPublishTime: epoch.startPublishTime,
      settlementPrice,
      settlementPriceRaw: epoch.settlementPrice,
      settlementConfidenceRaw: epoch.settlementConfidence,
      settlementConfidence,
      settlementConfidencePercent,
      settlementPublishTime: epoch.settlementPublishTime,
      priceDelta,
      priceDeltaPercent,
      epochPda,
      epochId: epoch.epochId,
    }
  }, [epochState.epoch, asset, hasAsset])
}
