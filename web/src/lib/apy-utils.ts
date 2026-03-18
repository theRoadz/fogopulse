import type { PublicKey } from '@solana/web3.js'
import type { Program } from '@coral-xyz/anchor'

import { tryFetchSettledEpoch } from '@/lib/epoch-utils'
import { TRADING_FEE_BPS, LP_FEE_SHARE_BPS } from '@/lib/constants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = Program<any>

const MAX_CONSECUTIVE_NULLS = 3
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
  let currentId = nextEpochId - BigInt(1)
  let consecutiveNulls = 0
  let firstSettledId: bigint | null = null
  let referenceEndTime: number | null = null
  let referenceId: bigint | null = null
  let sampledVolume = 0n
  let sampledEpochs = 0
  let reachedTarget = false

  while (currentId >= BigInt(0)) {
    const result = await tryFetchSettledEpoch(program, poolPda, currentId)

    if (result) {
      consecutiveNulls = 0

      if (firstSettledId === null) firstSettledId = currentId

      // Collect volume from all settled epochs in the walk
      const yesTotal = result.yesTotalAtSettlement ?? 0n
      const noTotal = result.noTotalAtSettlement ?? 0n
      sampledVolume += yesTotal + noTotal
      sampledEpochs++

      const epochEndTime = result.rawEpochData.endTime
      if (epochEndTime <= targetTimestamp) {
        referenceEndTime = epochEndTime
        referenceId = currentId
        reachedTarget = true
        break
      }

      // Track oldest as fallback
      referenceEndTime = epochEndTime
      referenceId = currentId
    } else {
      consecutiveNulls++
      if (consecutiveNulls >= MAX_CONSECUTIVE_NULLS) break
    }

    currentId = currentId - BigInt(1)
  }

  if (referenceEndTime === null || referenceId === null || firstSettledId === null) {
    return null
  }

  // Need at least 2 different settled epochs for a meaningful comparison
  if (firstSettledId === referenceId) return null

  const epochsInWindow = Number(firstSettledId - referenceId + 1n)

  // Use collected volume directly — we sample every epoch in the walk
  // Only extrapolate if there are gap epochs (nulls that weren't consecutive enough to stop)
  const totalVolume = sampledVolume

  return {
    referenceEndTime,
    totalVolume,
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
  currentTotalLpShares: bigint
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
  // LP fees = totalVolume * (TRADING_FEE_BPS / 10000) * (LP_FEE_SHARE_BPS / 10000)
  const lpFees = historical.totalVolume * BigInt(TRADING_FEE_BPS) * BigInt(LP_FEE_SHARE_BPS) / (10000n * 10000n)

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
