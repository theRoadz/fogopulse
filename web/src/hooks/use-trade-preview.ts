'use client'

import { useMemo } from 'react'

import type { Asset } from '@/types/assets'
import { usePool } from '@/hooks/use-pool'
import { useUserPosition } from '@/hooks/use-user-position'
import { useTradeStore } from '@/stores/trade-store'
import {
  calculateShares,
  calculateEntryPrice,
  calculateFeeSplit,
  calculateSlippage,
  estimateSettlementPayout,
  calculateProbabilityImpact,
  getReservesForDirection,
} from '@/lib/trade-preview'
import type { FeeSplit } from '@/lib/trade-preview'
import { getCapStatus } from '@/lib/cap-utils'
import type { CapStatus } from '@/lib/cap-utils'
import { TRADING_FEE_BPS, USDC_DECIMALS } from '@/lib/constants'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Trade preview data for UI display.
 */
export interface TradePreviewData {
  // Input values
  /** Gross trade amount in USDC (before fees) */
  amount: number
  /** Net trade amount in USDC (after fees) - used for share calculation */
  netAmount: number
  /** Trade direction */
  direction: 'up' | 'down'

  // Calculated values
  /** Shares to receive (in lamports scale) */
  shares: bigint
  /** Shares in USDC display units */
  sharesDisplay: number
  /** Price per share in USDC (e.g., 0.52) */
  entryPrice: number
  /** Total fee in USDC (e.g., 1.80) - deducted upfront at trade time */
  fee: number
  /** Fee percentage (e.g., 1.8) */
  feePercent: number
  /** Complete fee breakdown with LP/treasury/insurance split */
  feeSplit: FeeSplit
  /** Slippage percentage (e.g., 0.3) */
  slippage: number
  /** Estimated settlement payout if prediction wins (USDC) — approximate, based on current pool reserves */
  potentialPayout: number
  /** Potential profit (potentialPayout - grossAmount) */
  potentialProfit: number
  /** Profit as percentage based on gross amount ((potentialProfit / grossAmount) * 100) */
  profitPercent: number

  // Probability impact
  /** Current market probabilities */
  currentProbabilities: { pUp: number; pDown: number }
  /** New market probabilities after trade (based on net amount) */
  newProbabilities: { pUp: number; pDown: number }
  /** Absolute change in user's side probability */
  probabilityChange: number

  // Warnings
  /** True if slippage > 2% */
  hasHighSlippage: boolean
  /** True if trade would approach wallet/side cap */
  isNearCap: boolean
  /** Detailed cap status with wallet and side cap info */
  capStatus: CapStatus
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for computing trade preview calculations.
 *
 * Combines pool data with trade store state to compute:
 * - Shares to receive
 * - Entry price per share
 * - Fee amount
 * - Slippage estimate
 * - Potential payout and profit
 * - Probability impact
 *
 * @param asset - The asset being traded
 * @returns TradePreviewData or null if preview cannot be computed
 */
export function useTradePreview(asset: Asset): TradePreviewData | null {
  const { pool, isLoading } = usePool(asset)
  const { direction, amount } = useTradeStore()
  const { position: userPosition } = useUserPosition(pool?.activeEpoch ?? null, direction ?? 'up')

  return useMemo(() => {
    // Pool is still loading - check first to avoid stale data during refresh
    if (isLoading) {
      return null
    }

    // Cannot compute preview without pool data, direction, or amount
    if (!pool || !direction || !amount) {
      return null
    }

    // Parse and validate amount (gross amount before fees)
    const grossAmount = parseFloat(amount)
    if (isNaN(grossAmount) || grossAmount <= 0) {
      return null
    }

    // Calculate fee split (fees are deducted upfront in the new implementation)
    const feeSplit = calculateFeeSplit(grossAmount)

    // Convert NET amount to lamports (BigInt for precision)
    // Shares are calculated based on net amount after fees
    const netAmountLamports = BigInt(Math.floor(feeSplit.netAmount * 10 ** USDC_DECIMALS))

    // Get pool reserves
    const { yesReserves, noReserves } = pool

    // Get same/opposite reserves based on direction
    const [sameReserves, oppositeReserves] = getReservesForDirection(
      direction,
      yesReserves,
      noReserves
    )

    // Calculate shares using CPMM formula with NET amount
    const shares = calculateShares(netAmountLamports, sameReserves, oppositeReserves)
    const sharesDisplay = Number(shares) / 10 ** USDC_DECIMALS

    // Calculate entry price per share
    // Zero shares means calculation failed - return null to hide preview
    if (shares === 0n) {
      return null
    }
    const entryPrice = calculateEntryPrice(netAmountLamports, shares)

    // Fee is now calculated via feeSplit
    const fee = feeSplit.totalFee
    const feePercent = TRADING_FEE_BPS / 100

    // Calculate slippage (using net amount)
    const slippage = calculateSlippage(
      netAmountLamports,
      shares,
      sameReserves,
      oppositeReserves
    )

    // Estimate settlement payout using on-chain formula with current reserves
    const potentialPayout = estimateSettlementPayout(
      netAmountLamports,
      direction,
      yesReserves,
      noReserves
    )
    // Profit calculation: payout minus gross amount (user spent gross amount)
    const potentialProfit = potentialPayout - grossAmount
    const profitPercent = grossAmount > 0 ? (potentialProfit / grossAmount) * 100 : 0

    // Calculate probability impact (using net amount for reserves)
    const probImpact = calculateProbabilityImpact(
      netAmountLamports,
      direction,
      yesReserves,
      noReserves
    )

    // Calculate probability change for user's direction
    const probabilityChange =
      direction === 'up'
        ? probImpact.newPUp - probImpact.currentPUp
        : probImpact.newPDown - probImpact.currentPDown

    // Determine warnings
    const hasHighSlippage = slippage > 2

    // Cap status calculation
    const grossAmountLamports = BigInt(Math.floor(grossAmount * 10 ** USDC_DECIMALS))
    const existingPositionLamports = userPosition?.amount ?? 0n

    const capStatus = getCapStatus({
      existingPositionLamports,
      grossAmountLamports,
      yesReserves,
      noReserves,
      direction,
      walletCapBps: pool.walletCapBps,
      sideCapBps: pool.sideCapBps,
    })

    const isNearCap = capStatus.hasWarning

    return {
      amount: grossAmount,
      netAmount: feeSplit.netAmount,
      direction,
      shares,
      sharesDisplay,
      entryPrice,
      fee,
      feePercent,
      feeSplit,
      slippage,
      potentialPayout,
      potentialProfit,
      profitPercent,
      currentProbabilities: {
        pUp: probImpact.currentPUp,
        pDown: probImpact.currentPDown,
      },
      newProbabilities: {
        pUp: probImpact.newPUp,
        pDown: probImpact.newPDown,
      },
      probabilityChange,
      hasHighSlippage,
      isNearCap,
      capStatus,
    }
  }, [pool, direction, amount, isLoading, userPosition])
}
