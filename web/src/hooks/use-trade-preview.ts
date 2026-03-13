'use client'

import { useMemo } from 'react'

import type { Asset } from '@/types/assets'
import { usePool } from '@/hooks/use-pool'
import { useTradeStore } from '@/stores/trade-store'
import {
  calculateShares,
  calculateEntryPrice,
  calculateFee,
  calculateSlippage,
  calculatePotentialPayout,
  calculateProbabilityImpact,
  getReservesForDirection,
} from '@/lib/trade-preview'
import { TRADING_FEE_BPS, USDC_DECIMALS } from '@/lib/constants'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Trade preview data for UI display.
 */
export interface TradePreviewData {
  // Input values
  /** Trade amount in USDC */
  amount: number
  /** Trade direction */
  direction: 'up' | 'down'

  // Calculated values
  /** Shares to receive (in lamports scale) */
  shares: bigint
  /** Shares in USDC display units */
  sharesDisplay: number
  /** Price per share in USDC (e.g., 0.52) */
  entryPrice: number
  /** Fee in USDC (e.g., 1.80) - informational, collected at settlement */
  fee: number
  /** Fee percentage (e.g., 1.8) */
  feePercent: number
  /** Slippage percentage (e.g., 0.3) */
  slippage: number
  /** Max payout if prediction wins (USDC) */
  potentialPayout: number
  /** Potential profit (potentialPayout - amount) */
  potentialProfit: number
  /** Profit as percentage ((potentialProfit / amount) * 100) */
  profitPercent: number

  // Probability impact
  /** Current market probabilities */
  currentProbabilities: { pUp: number; pDown: number }
  /** New market probabilities after trade */
  newProbabilities: { pUp: number; pDown: number }
  /** Absolute change in user's side probability */
  probabilityChange: number

  // Warnings
  /** True if slippage > 2% */
  hasHighSlippage: boolean
  /** True if trade would approach wallet/side cap */
  isNearCap: boolean
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

  return useMemo(() => {
    // Pool is still loading - check first to avoid stale data during refresh
    if (isLoading) {
      return null
    }

    // Cannot compute preview without pool data, direction, or amount
    if (!pool || !direction || !amount) {
      return null
    }

    // Parse and validate amount
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return null
    }

    // Convert amount to lamports (BigInt for precision)
    const amountLamports = BigInt(Math.floor(amountNum * 10 ** USDC_DECIMALS))

    // Get pool reserves
    const { yesReserves, noReserves } = pool

    // Get same/opposite reserves based on direction
    const [sameReserves, oppositeReserves] = getReservesForDirection(
      direction,
      yesReserves,
      noReserves
    )

    // Calculate shares using CPMM formula
    const shares = calculateShares(amountLamports, sameReserves, oppositeReserves)
    const sharesDisplay = Number(shares) / 10 ** USDC_DECIMALS

    // Calculate entry price per share
    // Zero shares means calculation failed - return null to hide preview
    if (shares === 0n) {
      return null
    }
    const entryPrice = calculateEntryPrice(amountLamports, shares)

    // Calculate fee (informational - collected at settlement)
    const fee = calculateFee(amountNum, TRADING_FEE_BPS)
    const feePercent = TRADING_FEE_BPS / 100

    // Calculate slippage
    const slippage = calculateSlippage(
      amountLamports,
      shares,
      sameReserves,
      oppositeReserves
    )

    // Calculate potential payout
    const potentialPayout = calculatePotentialPayout(shares)
    const potentialProfit = potentialPayout - amountNum
    const profitPercent = amountNum > 0 ? (potentialProfit / amountNum) * 100 : 0

    // Calculate probability impact
    const probImpact = calculateProbabilityImpact(
      amountLamports,
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
    // Cap checking deferred to later story
    const isNearCap = false

    return {
      amount: amountNum,
      direction,
      shares,
      sharesDisplay,
      entryPrice,
      fee,
      feePercent,
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
    }
  }, [pool, direction, amount, isLoading])
}
