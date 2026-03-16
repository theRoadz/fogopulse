/**
 * Trade Preview Calculations
 *
 * Pure calculation functions for trade preview that match on-chain CPMM logic.
 * All BigInt calculations for precision - USDC uses 6 decimals (lamports).
 *
 * @see anchor/programs/fogopulse/src/utils/cpmm.rs for on-chain implementation
 */

import {
  TRADING_FEE_BPS,
  USDC_DECIMALS,
  LP_FEE_SHARE_BPS,
  TREASURY_FEE_SHARE_BPS,
  INSURANCE_FEE_SHARE_BPS,
} from './constants'

// =============================================================================
// CPMM SHARES CALCULATION
// =============================================================================

/**
 * Calculate shares using CPMM formula.
 * MUST match on-chain implementation in cpmm.rs
 *
 * Formula:
 * - If same_reserves == 0 (first trade on side): shares = amount (1:1)
 * - Otherwise: shares = amount * opposite_reserves / same_reserves
 *
 * @param amount - USDC lamports (6 decimals) being deposited
 * @param sameReserves - Reserves on the side being bought (UP->yesReserves, DOWN->noReserves)
 * @param oppositeReserves - Reserves on the opposite side
 * @returns Shares to receive (in USDC lamports scale)
 */
export function calculateShares(
  amount: bigint,
  sameReserves: bigint,
  oppositeReserves: bigint
): bigint {
  if (sameReserves === 0n) {
    // First trade on this side - 1:1 shares
    // NOTE: Handles both empty pool and first trade on one side
    return amount
  }

  // Standard CPMM: shares = amount * opposite / same
  return (amount * oppositeReserves) / sameReserves
}

// =============================================================================
// ENTRY PRICE CALCULATION
// =============================================================================

/**
 * Calculate entry price per share.
 *
 * @param amount - USDC lamports deposited
 * @param shares - Shares received
 * @returns Price per share as a display number (e.g., 0.52 USDC per share)
 * @throws Error if shares is 0
 */
export function calculateEntryPrice(amount: bigint, shares: bigint): number {
  if (shares === 0n) {
    throw new Error('Cannot calculate entry price with zero shares')
  }

  // Convert to display units for division
  const amountNum = Number(amount) / 10 ** USDC_DECIMALS
  const sharesNum = Number(shares) / 10 ** USDC_DECIMALS

  return amountNum / sharesNum
}

// =============================================================================
// FEE CALCULATION
// =============================================================================

/**
 * Fee breakdown result showing the split between LP, treasury, and insurance.
 */
export interface FeeSplit {
  /** Total fee amount in USDC */
  totalFee: number
  /** LP portion (70% by default) - stays in pool for auto-compounding */
  lpFee: number
  /** Treasury portion (20% by default) - transferred to treasury */
  treasuryFee: number
  /** Insurance portion (10% by default) - transferred to insurance */
  insuranceFee: number
  /** Net amount after fees - used for share calculation */
  netAmount: number
}

/**
 * Calculate trading fee in USDC.
 *
 * Fees are now deducted UPFRONT at trade time:
 * - Total fee is deducted from the gross trade amount
 * - Net amount (after fees) is used for share calculation
 * - Fees are distributed: 70% LP (auto-compounds in pool), 20% treasury, 10% insurance
 *
 * Uses ceiling division for total fee (favors protocol) and floor division for
 * fee splits (LP gets remainder to prevent dust).
 *
 * @param amount - Trade amount in USDC display units (gross amount before fees)
 * @param feeBps - Fee in basis points (default: TRADING_FEE_BPS = 180 = 1.8%)
 * @returns Fee in USDC display units
 */
export function calculateFee(
  amount: number,
  feeBps: number = TRADING_FEE_BPS
): number {
  // Ceiling division matches on-chain logic for consistency
  return Math.ceil((amount * feeBps) / 10000 * 1000000) / 1000000
}

/**
 * Calculate complete fee breakdown with LP/treasury/insurance split.
 *
 * Matches on-chain calculate_fee_split() logic:
 * - Total fee uses ceiling division (favors protocol)
 * - Treasury and insurance use floor division
 * - LP gets remainder (no dust loss)
 *
 * @param grossAmount - Trade amount in USDC display units (before fees)
 * @returns Complete fee breakdown and net amount
 */
export function calculateFeeSplit(grossAmount: number): FeeSplit {
  if (grossAmount <= 0) {
    return {
      totalFee: 0,
      lpFee: 0,
      treasuryFee: 0,
      insuranceFee: 0,
      netAmount: 0,
    }
  }

  // Convert to lamports for precision (6 decimals)
  const grossLamports = Math.floor(grossAmount * 1_000_000)

  // Total fee with ceiling division (matches on-chain)
  const totalFeeLamports = Math.ceil((grossLamports * TRADING_FEE_BPS) / 10_000)

  // Net amount after fees
  const netLamports = grossLamports - totalFeeLamports

  // Fee splits with floor division (matches on-chain)
  const treasuryLamports = Math.floor((totalFeeLamports * TREASURY_FEE_SHARE_BPS) / 10_000)
  const insuranceLamports = Math.floor((totalFeeLamports * INSURANCE_FEE_SHARE_BPS) / 10_000)
  // LP gets remainder (no dust)
  const lpLamports = totalFeeLamports - treasuryLamports - insuranceLamports

  // Convert back to display units
  return {
    totalFee: totalFeeLamports / 1_000_000,
    lpFee: lpLamports / 1_000_000,
    treasuryFee: treasuryLamports / 1_000_000,
    insuranceFee: insuranceLamports / 1_000_000,
    netAmount: netLamports / 1_000_000,
  }
}

// =============================================================================
// SLIPPAGE CALCULATION
// =============================================================================

// Maximum safe integer for BigInt to Number conversion (2^53 - 1)
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

/**
 * Calculate price impact percentage for a trade.
 *
 * Price impact = how much worse the execution price is vs the "fair" price.
 * Fair price = opposite_reserves / same_reserves (price before trade impact)
 * Actual price = amount / shares (what user actually pays per share)
 * Price impact = (actual_price - fair_price) / fair_price * 100%
 *
 * @param amount - USDC lamports being traded
 * @param shares - Shares to receive
 * @param sameReserves - Reserves on the side being bought
 * @param oppositeReserves - Reserves on the opposite side
 * @returns Price impact as percentage (e.g., 0.3 for 0.3%)
 */
export function calculateSlippage(
  amount: bigint,
  shares: bigint,
  sameReserves: bigint,
  oppositeReserves: bigint
): number {
  // Edge cases: first trade has no price impact concept
  if (sameReserves === 0n || shares === 0n) {
    return 0
  }

  // Check for BigInt overflow when converting to Number
  // If values exceed MAX_SAFE_INTEGER, scale down proportionally
  let scaledAmount = amount
  let scaledShares = shares
  let scaledSame = sameReserves
  let scaledOpposite = oppositeReserves

  const maxValue = [amount, shares, sameReserves, oppositeReserves].reduce(
    (max, val) => (val > max ? val : max),
    0n
  )

  if (maxValue > MAX_SAFE_BIGINT) {
    // Scale down all values by the same factor to preserve ratios
    const scaleFactor = maxValue / MAX_SAFE_BIGINT + 1n
    scaledAmount = amount / scaleFactor
    scaledShares = shares / scaleFactor
    scaledSame = sameReserves / scaleFactor
    scaledOpposite = oppositeReserves / scaleFactor

    // Prevent division by zero after scaling
    if (scaledSame === 0n || scaledShares === 0n) {
      return 0
    }
  }

  // Use Number for division - now safe after potential scaling
  const fairPrice = Number(scaledOpposite) / Number(scaledSame)
  const actualPrice = Number(scaledAmount) / Number(scaledShares)

  if (fairPrice === 0) {
    return 0
  }

  return ((actualPrice - fairPrice) / fairPrice) * 100
}

// =============================================================================
// POTENTIAL PAYOUT CALCULATION
// =============================================================================

/**
 * Calculate potential payout if the user wins.
 *
 * Winning side shares are redeemable 1:1 with USDC in settlement.
 * Each share is worth 1 USDC if the user's direction wins.
 *
 * @param shares - Shares held (in USDC lamports scale)
 * @returns Potential payout in USDC display units
 */
export function calculatePotentialPayout(shares: bigint): number {
  return Number(shares) / 10 ** USDC_DECIMALS
}

// =============================================================================
// PROBABILITY IMPACT CALCULATION
// =============================================================================

/**
 * Probability impact result showing before and after probabilities.
 */
export interface ProbabilityImpact {
  /** Current UP probability (0-100) */
  currentPUp: number
  /** New UP probability after trade (0-100) */
  newPUp: number
  /** Current DOWN probability (0-100) */
  currentPDown: number
  /** New DOWN probability after trade (0-100) */
  newPDown: number
}

/**
 * Calculate how a trade will change market probabilities.
 *
 * Probability formula: pUp = noReserves / (yesReserves + noReserves)
 *
 * @param amount - USDC lamports being traded
 * @param direction - Trade direction ('up' or 'down')
 * @param yesReserves - Current YES (UP) reserves
 * @param noReserves - Current NO (DOWN) reserves
 * @returns Before and after probabilities
 */
export function calculateProbabilityImpact(
  amount: bigint,
  direction: 'up' | 'down',
  yesReserves: bigint,
  noReserves: bigint
): ProbabilityImpact {
  const total = yesReserves + noReserves

  // Current probabilities
  const currentPUp = total === 0n ? 50 : Number((noReserves * 100n) / total)
  const currentPDown = 100 - currentPUp

  // Calculate new reserves after trade
  // UP position adds to yesReserves
  // DOWN position adds to noReserves
  const newYes = direction === 'up' ? yesReserves + amount : yesReserves
  const newNo = direction === 'down' ? noReserves + amount : noReserves
  const newTotal = newYes + newNo

  // New probabilities
  const newPUp = newTotal === 0n ? 50 : Number((newNo * 100n) / newTotal)
  const newPDown = 100 - newPUp

  return { currentPUp, newPUp, currentPDown, newPDown }
}

// =============================================================================
// POSITION PNL CALCULATION
// =============================================================================

/**
 * PnL calculation result for an open position.
 */
export interface PositionPnL {
  /** Current mark-to-market value in USDC lamports */
  currentValue: bigint
  /** Unrealized PnL amount in USDC lamports (currentValue - entryAmount) */
  pnlAmount: bigint
  /** Unrealized PnL as percentage */
  pnlPercent: number
}

/**
 * Calculate unrealized PnL for an open position (mark-to-market, NO fees).
 *
 * Uses inverse CPMM formula: currentValue = (shares * sameReserves) / oppositeReserves
 *
 * @param shares - Position shares (bigint)
 * @param entryAmount - Original entry amount in USDC lamports
 * @param direction - Trade direction ('up' or 'down')
 * @param yesReserves - Pool's YES reserves
 * @param noReserves - Pool's NO reserves
 * @returns PnL calculation result
 */
export function calculatePositionPnL(
  shares: bigint,
  entryAmount: bigint,
  direction: 'up' | 'down',
  yesReserves: bigint,
  noReserves: bigint
): PositionPnL {
  // Sold position — no PnL
  if (shares === 0n) {
    return { currentValue: 0n, pnlAmount: 0n, pnlPercent: 0 }
  }

  const [sameReserves, oppositeReserves] = getReservesForDirection(
    direction,
    yesReserves,
    noReserves
  )

  // No liquidity on opposite side — position is worthless
  if (oppositeReserves === 0n) {
    return { currentValue: 0n, pnlAmount: -entryAmount, pnlPercent: -100 }
  }

  const currentValue = (shares * sameReserves) / oppositeReserves
  const pnlAmount = currentValue - entryAmount

  // Handle zero entry amount edge case
  const pnlPercent =
    entryAmount === 0n ? 0 : (Number(pnlAmount) / Number(entryAmount)) * 100

  return { currentValue, pnlAmount, pnlPercent }
}

// =============================================================================
// DIRECTION TO RESERVES HELPER
// =============================================================================

/**
 * Map trade direction to same/opposite reserves.
 *
 * UP position -> buys YES shares -> sameReserves = yesReserves
 * DOWN position -> buys NO shares -> sameReserves = noReserves
 *
 * @param direction - Trade direction
 * @param yesReserves - Pool's YES reserves
 * @param noReserves - Pool's NO reserves
 * @returns [sameReserves, oppositeReserves] tuple
 */
export function getReservesForDirection(
  direction: 'up' | 'down',
  yesReserves: bigint,
  noReserves: bigint
): [bigint, bigint] {
  if (direction === 'up') {
    return [yesReserves, noReserves]
  } else {
    return [noReserves, yesReserves]
  }
}
