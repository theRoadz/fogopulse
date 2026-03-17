import type { PublicKey } from '@solana/web3.js'

/**
 * Pool data interface - matches on-chain Pool account structure
 */
export interface PoolData {
  /** Asset mint this pool tracks */
  assetMint: PublicKey
  /** YES (UP) token reserves in USDC base units */
  yesReserves: bigint
  /** NO (DOWN) token reserves in USDC base units */
  noReserves: bigint
  /** Total LP shares issued */
  totalLpShares: bigint
  /** Counter for next epoch creation */
  nextEpochId: bigint
  /** Current active epoch PDA (null if none) */
  activeEpoch: PublicKey | null
  /** Cached active epoch state: 0=None, 1=Open, 2=Frozen */
  activeEpochState: number
  /** Max position per wallet in basis points */
  walletCapBps: number
  /** Max exposure per side in basis points */
  sideCapBps: number
  /** Pool-level pause flag */
  isPaused: boolean
  /** Pool-level freeze flag */
  isFrozen: boolean
  /** PDA bump seed */
  bump: number
}

/**
 * Probability calculation result
 */
export interface Probabilities {
  /** Probability of UP outcome (0-100) */
  pUp: number
  /** Probability of DOWN outcome (0-100) */
  pDown: number
}

/**
 * Processed pool state for UI consumption
 */
export interface PoolUIState {
  /** Calculated probabilities from reserves */
  probabilities: Probabilities
  /** Total liquidity in pool (yesReserves + noReserves) in USDC display units */
  totalLiquidity: number
  /** Whether pool data is currently loading */
  isLoading: boolean
  /** Error if fetching failed */
  error: string | null
}

/**
 * USDC decimal configuration
 */
export const USDC_DECIMALS = 6
export const USDC_DIVISOR = 10 ** USDC_DECIMALS

/**
 * Calculate probabilities from pool reserves using CPMM formula.
 *
 * Formula: pUp = noReserves / (yesReserves + noReserves)
 *
 * This is because in CPMM, price = opposite_reserves / same_reserves.
 * Higher yesReserves means UP shares are cheaper (less desirable),
 * so pUp (market-implied probability) = noReserves / total.
 */
export function calculateProbabilities(
  yesReserves: bigint,
  noReserves: bigint
): Probabilities {
  const total = yesReserves + noReserves

  if (total === 0n) {
    // 50/50 when no liquidity
    return { pUp: 50, pDown: 50 }
  }

  // Convert to percentages using basis-point precision then rounding
  const pUp = Math.round(Number((noReserves * 10000n) / total) / 100)
  const pDown = 100 - pUp

  return { pUp, pDown }
}

/**
 * Convert pool reserves (USDC base units) to display value.
 *
 * Note: JavaScript Number has ~15 significant digits of precision.
 * This function is safe for pools up to ~$9 quadrillion USDC.
 * For pools larger than Number.MAX_SAFE_INTEGER base units (~$9B),
 * some precision may be lost in the fractional cents.
 */
export function reservesToDisplayValue(reserves: bigint): number {
  return Number(reserves) / USDC_DIVISOR
}

/**
 * Format pool liquidity as currency string.
 */
export function formatPoolLiquidity(reserves: bigint): string {
  const value = reservesToDisplayValue(reserves)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}
