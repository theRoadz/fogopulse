import { PublicKey } from '@solana/web3.js'
import type { Program } from '@coral-xyz/anchor'

import type { EpochData } from '@/types/epoch'
import { EpochState, Outcome, parseEpochState, parseOutcome } from '@/types/epoch'
import { scalePrice, formatConfidencePercent } from '@/lib/utils'
import { deriveEpochPda } from '@/lib/pda'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = Program<any>

/**
 * Settlement data for a settled epoch.
 * Used by useLastSettledEpoch, useSettlementHistory, and SettlementStatusPanel.
 */
export interface LastSettledEpochData {
  /** The epoch ID */
  epochId: bigint
  /** Epoch PDA */
  epochPda: PublicKey
  /** Epoch state (should be Settled or Refunded) */
  state: EpochState
  /** Settlement outcome */
  outcome: Outcome
  /** Start price in USD */
  startPrice: number
  /** Start confidence as percentage */
  startConfidencePercent: string
  /** Start publish time (unix seconds) */
  startPublishTime: number
  /** Settlement price in USD */
  settlementPrice: number
  /** Settlement confidence as percentage */
  settlementConfidencePercent: string
  /** Settlement publish time (unix seconds) */
  settlementPublishTime: number
  /** Price change from start to settlement */
  priceDelta: number
  /** Price change as percentage string */
  priceDeltaPercent: string
  /** Raw start confidence for RefundExplanation */
  startConfidenceRaw: bigint
  /** Raw settlement confidence for RefundExplanation */
  settlementConfidenceRaw: bigint
  /** YES side total at settlement (for payout calculation) */
  yesTotalAtSettlement: bigint | null
  /** NO side total at settlement (for payout calculation) */
  noTotalAtSettlement: bigint | null
  /** Full EpochData for ClaimButton consumption */
  rawEpochData: EpochData
}

/**
 * Try to fetch and parse a single epoch as settlement data.
 * Shared between useLastSettledEpoch and useSettlementHistory.
 *
 * @param program - Anchor program instance
 * @param poolPda - Pool PDA
 * @param epochId - Epoch ID to fetch
 * @returns LastSettledEpochData if epoch is settled/refunded, null otherwise
 */
export async function tryFetchSettledEpoch(
  program: AnchorProgram,
  poolPda: PublicKey,
  epochId: bigint
): Promise<LastSettledEpochData | null> {
  try {
    const epochPda = deriveEpochPda(poolPda, epochId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const epochAccount = await (program.account as any).epoch.fetch(epochPda)

    const state = parseEpochState(epochAccount.state)

    // Only return data if epoch is settled or refunded
    if (state !== EpochState.Settled && state !== EpochState.Refunded) {
      return null
    }

    const outcome = parseOutcome(epochAccount.outcome)
    if (!outcome) return null

    const settlementPrice = epochAccount.settlementPrice
      ? BigInt(epochAccount.settlementPrice.toString())
      : null
    const settlementConfidence = epochAccount.settlementConfidence
      ? BigInt(epochAccount.settlementConfidence.toString())
      : null
    const settlementPublishTime = epochAccount.settlementPublishTime?.toNumber() ?? null

    if (settlementPrice === null || settlementConfidence === null || settlementPublishTime === null) {
      return null
    }

    const startPrice = BigInt(epochAccount.startPrice.toString())
    const startConfidence = BigInt(epochAccount.startConfidence.toString())

    const yesTotalAtSettlement = epochAccount.yesTotalAtSettlement
      ? BigInt(epochAccount.yesTotalAtSettlement.toString())
      : null
    const noTotalAtSettlement = epochAccount.noTotalAtSettlement
      ? BigInt(epochAccount.noTotalAtSettlement.toString())
      : null

    const startPriceUsd = scalePrice(startPrice)
    const settlementPriceUsd = scalePrice(settlementPrice)
    const priceDelta = settlementPriceUsd - startPriceUsd
    const deltaPercent = (priceDelta / startPriceUsd) * 100
    const sign = deltaPercent >= 0 ? '+' : ''

    // Build full EpochData for ClaimButton
    const rawEpochData: EpochData = {
      pool: poolPda,
      epochId,
      state,
      startTime: epochAccount.startTime?.toNumber() ?? 0,
      endTime: epochAccount.endTime?.toNumber() ?? 0,
      freezeTime: epochAccount.freezeTime?.toNumber() ?? 0,
      startPrice,
      startConfidence,
      startPublishTime: epochAccount.startPublishTime.toNumber(),
      settlementPrice,
      settlementConfidence,
      settlementPublishTime,
      outcome,
      yesTotalAtSettlement,
      noTotalAtSettlement,
      bump: epochAccount.bump ?? 0,
    }

    return {
      epochId,
      epochPda,
      state,
      outcome,
      startPrice: startPriceUsd,
      startConfidencePercent: formatConfidencePercent(startConfidence, startPrice),
      startPublishTime: epochAccount.startPublishTime.toNumber(),
      settlementPrice: settlementPriceUsd,
      settlementConfidencePercent: formatConfidencePercent(settlementConfidence, settlementPrice),
      settlementPublishTime,
      priceDelta,
      priceDeltaPercent: `${sign}${deltaPercent.toFixed(2)}%`,
      startConfidenceRaw: startConfidence,
      settlementConfidenceRaw: settlementConfidence,
      yesTotalAtSettlement,
      noTotalAtSettlement,
      rawEpochData,
    }
  } catch {
    return null
  }
}
