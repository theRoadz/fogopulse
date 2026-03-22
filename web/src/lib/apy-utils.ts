import type { PublicKey } from '@solana/web3.js'
import type { Program } from '@coral-xyz/anchor'

import { batchFetchEpochs } from '@/lib/batch-fetch'
import { TRADING_FEE_BPS, LP_FEE_SHARE_BPS } from '@/lib/constants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = Program<any>

// Minimum period (in days) required for APY extrapolation to avoid inflated numbers
const MIN_PERIOD_DAYS = 1

/**
 * Compute LP share price from pool reserves and total LP shares.
 * Uses scaled bigint arithmetic to avoid precision loss.
 */
export function computeSharePrice(
  yesReserves: bigint,
  noReserves: bigint,
  totalLpShares: bigint
): number | null {
  if (totalLpShares === 0n) return null
  const totalReserves = yesReserves + noReserves
  return Number(totalReserves * 1_000_000n / totalLpShares) / 1_000_000
}

/**
 * Walk settled epochs backward to find the reference epoch nearest to
 * `targetTimestamp`, collecting trading volume along the way for fee estimation.
 *
 * Returns the reference epoch's endTime and estimated total trading volume
 * in the window, or null if insufficient data.
 */
export async function fetchHistoricalSharePrice(
  program: AnchorProgram,
  poolPda: PublicKey,
  nextEpochId: bigint,
  targetTimestamp: number
): Promise<{
  referenceEndTime: number
  totalVolume: bigint
  epochsInWindow: number
  sampledEpochs: number
  sampledVolume: bigint
  reachedTarget: boolean
} | null> {
  // Batch-fetch recent epochs only — 500 epochs covers ~7 days at 20min epochs
  // or ~42 hours at 5min epochs, sufficient for the 7-day APY window
  const searchDepth = 500n
  const fromId = nextEpochId - 1n - searchDepth < 0n ? 0n : nextEpochId - 1n - searchDepth
  const settledEpochs = await batchFetchEpochs(program, poolPda, fromId, nextEpochId - 1n)

  if (settledEpochs.length < 2) return null

  let referenceEndTime: number | null = null
  let referenceId: bigint | null = null
  let sampledVolume = 0n
  let sampledEpochs = 0
  let reachedTarget = false

  // First settled epoch (newest) for window calculation
  const firstSettledId = settledEpochs[settledEpochs.length - 1].epochId

  // Walk newest → oldest collecting volume until we pass the target timestamp
  for (let i = settledEpochs.length - 1; i >= 0; i--) {
    const result = settledEpochs[i]

    const yesTotal = result.yesTotalAtSettlement ?? 0n
    const noTotal = result.noTotalAtSettlement ?? 0n
    sampledVolume += yesTotal + noTotal
    sampledEpochs++

    const epochEndTime = result.rawEpochData.endTime
    if (epochEndTime <= targetTimestamp) {
      referenceEndTime = epochEndTime
      referenceId = result.epochId
      reachedTarget = true
      break
    }

    // Track oldest as fallback
    referenceEndTime = epochEndTime
    referenceId = result.epochId
  }

  if (referenceEndTime === null || referenceId === null) return null

  // Need at least 2 different settled epochs for a meaningful comparison
  if (firstSettledId === referenceId) return null

  const epochsInWindow = Number(firstSettledId - referenceId + 1n)

  return {
    referenceEndTime,
    totalVolume: sampledVolume,
    epochsInWindow,
    sampledEpochs,
    sampledVolume,
    reachedTarget,
  }
}

/**
 * Calculate estimated APY for a pool based on LP share price growth.
 *
 * Since epoch accounts don't store historical pool reserves, we estimate
 * the historical share price by:
 * 1. Computing current share price from live pool state
 * 2. Walking epochs backward to find volume in the 7-day window
 * 3. Estimating LP fees earned: volume * tradingFeeBps * lpFeeShareBps
 * 4. Deriving historical reserves: currentReserves - estimatedFees
 * 5. Computing APY from the share price growth
 *
 * @returns APY percentage, 0 if no historical data, null if zero TVL/shares
 */
export async function calculatePoolApy(
  program: AnchorProgram,
  poolPda: PublicKey,
  nextEpochId: bigint,
  currentYesReserves: bigint,
  currentNoReserves: bigint,
  currentTotalLpShares: bigint,
  feeConfig?: { tradingFeeBps?: number; lpFeeShareBps?: number }
): Promise<number | null> {
  if (currentTotalLpShares === 0n) return null
  const totalReserves = currentYesReserves + currentNoReserves
  if (totalReserves === 0n) return null
  if (nextEpochId <= 0n) return 0

  const currentSharePrice = computeSharePrice(
    currentYesReserves,
    currentNoReserves,
    currentTotalLpShares
  )
  if (currentSharePrice === null || currentSharePrice === 0) return null

  const now = Math.floor(Date.now() / 1000)
  const sevenDaysAgo = now - 7 * 24 * 60 * 60

  const historical = await fetchHistoricalSharePrice(
    program,
    poolPda,
    nextEpochId,
    sevenDaysAgo
  )

  if (!historical || historical.totalVolume === 0n) return 0

  const periodSeconds = now - historical.referenceEndTime
  const periodDays = periodSeconds / (24 * 60 * 60)

  // Require minimum period to avoid inflated extrapolation (H2 fix)
  if (periodDays < MIN_PERIOD_DAYS) return 0

  // Estimate LP fees earned in the window
  // LP fees = totalVolume * (tradingFeeBps / 10000) * (lpFeeShareBps / 10000)
  const tradingFeeBps = feeConfig?.tradingFeeBps ?? TRADING_FEE_BPS
  const lpFeeShareBps = feeConfig?.lpFeeShareBps ?? LP_FEE_SHARE_BPS
  const lpFees = historical.totalVolume * BigInt(tradingFeeBps) * BigInt(lpFeeShareBps) / (10000n * 10000n)

  // Historical reserves ≈ current reserves - accumulated LP fees
  // Note: This uses currentTotalLpShares as a proxy for historical shares.
  // If LP shares changed significantly during the window, accuracy is reduced.
  // We guard against extreme distortion by capping fee-based adjustment to
  // a maximum of 50% of current reserves — prevents nonsensical share prices.
  const maxFeeAdjustment = totalReserves / 2n
  const clampedFees = lpFees > maxFeeAdjustment ? maxFeeAdjustment : lpFees
  const historicalReserves = totalReserves - clampedFees
  const historicalSharePrice = Number(historicalReserves * 1_000_000n / currentTotalLpShares) / 1_000_000

  if (historicalSharePrice <= 0) return 0

  // Use actual period for annualization — don't extrapolate short periods to 365 days
  // For pools < 7 days old (reachedTarget=false), use actual observed period only
  const annualizationDays = historical.reachedTarget ? 365 : Math.min(365, 365 * (periodDays / 7))

  // APY = ((currentPrice / pastPrice) - 1) * (annualizationFactor) * 100
  const apy = ((currentSharePrice / historicalSharePrice) - 1) * (annualizationDays / periodDays) * 100

  return apy
}
