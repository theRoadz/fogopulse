/**
 * Cap Calculation Utilities
 *
 * Frontend mirror of on-chain cap validation logic from
 * anchor/programs/fogopulse/src/utils/caps.rs
 *
 * All calculations use BigInt for precision matching on-chain Rust u64 math.
 * Cap formulas use integer truncation (standard division), NOT ceiling division.
 */

import { PER_WALLET_CAP_BPS, PER_SIDE_CAP_BPS, TRADING_FEE_BPS } from './constants'

// =============================================================================
// TYPES
// =============================================================================

/** Warning level for a cap check */
export type CapLevel = 'ok' | 'warning' | 'exceeded'

/** Info about a single cap check */
export interface CapInfo {
  /** Warning level: ok, warning (>80% used), or exceeded */
  level: CapLevel
  /** Remaining capacity in USDC lamports before cap is hit */
  remainingLamports: bigint
  /** Maximum allowed in USDC lamports */
  maxAllowedLamports: bigint
  /** Percentage of cap used (0-100, clamped) */
  usedPercent: number
  /** Human-readable label */
  label: string
}

/** Combined cap status for wallet and side caps */
export interface CapStatus {
  walletCap: CapInfo
  sideCap: CapInfo
  /** The most restrictive cap (lowest remaining) */
  mostRestrictive: 'wallet' | 'side'
  /** True if any cap is at warning or exceeded level */
  hasWarning: boolean
  /** True if any cap is exceeded */
  hasError: boolean
}

// =============================================================================
// WARNING THRESHOLD
// =============================================================================

/** Show warning when >80% of cap capacity is used */
const WARNING_THRESHOLD_PERCENT = 80

// =============================================================================
// NET AMOUNT CALCULATION (matches on-chain fee deduction)
// =============================================================================

/**
 * Calculate net amount after fee deduction using ceiling division.
 * Matches on-chain: fee = (gross * 180 + 9999) / 10000
 *
 * @param grossLamports - Gross trade amount in USDC lamports
 * @returns Net amount in USDC lamports after fee
 */
export function calculateNetAmountLamports(grossLamports: bigint): bigint {
  const fee = (grossLamports * BigInt(TRADING_FEE_BPS) + 9999n) / 10000n
  return grossLamports - fee
}

// =============================================================================
// PER-WALLET CAP
// =============================================================================

/**
 * Calculate remaining wallet cap capacity.
 * Mirrors on-chain check_wallet_cap() from caps.rs.
 *
 * @param existingPositionLamports - User's existing position amount in this epoch (USDC lamports)
 * @param newNetAmountLamports - New trade net amount (after fees) in USDC lamports
 * @param poolTotalLamports - Pool total (yesReserves + noReserves) BEFORE trade, in USDC lamports
 * @param capBps - Wallet cap in basis points (default: PER_WALLET_CAP_BPS = 500 = 5%)
 * @returns Remaining capacity in USDC lamports (negative if exceeded)
 */
export function calculateWalletCapRemaining(
  existingPositionLamports: bigint,
  newNetAmountLamports: bigint,
  poolTotalLamports: bigint,
  capBps: number = PER_WALLET_CAP_BPS
): bigint {
  // First trade when pool is empty — no cap
  if (poolTotalLamports === 0n) {
    return BigInt(Number.MAX_SAFE_INTEGER)
  }

  // max_allowed = pool_total * cap_bps / 10000 (truncating division)
  const maxAllowed = (poolTotalLamports * BigInt(capBps)) / 10000n

  // remaining = max_allowed - (existing + new)
  const totalAfterTrade = existingPositionLamports + newNetAmountLamports
  return maxAllowed - totalAfterTrade
}

// =============================================================================
// PER-SIDE CAP
// =============================================================================

/**
 * Calculate remaining side cap capacity.
 * Mirrors on-chain check_side_cap() from caps.rs.
 *
 * The cap is a max DEVIATION from 50% balance, not absolute percentage.
 *
 * @param targetSideAfterTradeLamports - Total on the target side AFTER trade (USDC lamports)
 * @param poolTotalLamports - Pool total (yesReserves + noReserves) BEFORE trade, in USDC lamports
 * @param capBps - Side cap in basis points (default: PER_SIDE_CAP_BPS = 3000 = 30%)
 * @returns Remaining capacity in USDC lamports (negative if exceeded)
 */
export function calculateSideCapRemaining(
  targetSideAfterTradeLamports: bigint,
  poolTotalLamports: bigint,
  capBps: number = PER_SIDE_CAP_BPS
): bigint {
  // First trade when pool is empty — no cap
  if (poolTotalLamports === 0n) {
    return BigInt(Number.MAX_SAFE_INTEGER)
  }

  // balanced_side = pool_total / 2 (truncating division)
  const balancedSide = poolTotalLamports / 2n

  // max_deviation = balanced_side * cap_bps / 10000 (truncating division)
  const maxDeviation = (balancedSide * BigInt(capBps)) / 10000n

  // max_allowed = balanced_side + max_deviation
  const maxAllowed = balancedSide + maxDeviation

  return maxAllowed - targetSideAfterTradeLamports
}

// =============================================================================
// COMBINED CAP STATUS
// =============================================================================

/**
 * Determine cap level based on remaining capacity and max allowed.
 */
function getCapLevel(remainingLamports: bigint, maxAllowedLamports: bigint): CapLevel {
  if (remainingLamports < 0n) {
    return 'exceeded'
  }

  if (maxAllowedLamports === 0n) {
    return 'ok'
  }

  // usedPercent = ((maxAllowed - remaining) / maxAllowed) * 100
  const usedLamports = maxAllowedLamports - remainingLamports
  const usedPercent = Number(usedLamports * 100n / maxAllowedLamports)

  if (usedPercent >= WARNING_THRESHOLD_PERCENT) {
    return 'warning'
  }

  return 'ok'
}

/**
 * Get comprehensive cap status for a trade.
 *
 * @param params - Cap calculation parameters
 * @returns Combined cap status with wallet and side info
 */
export function getCapStatus(params: {
  /** User's existing position amount in USDC lamports (0n if no position) */
  existingPositionLamports: bigint
  /** Gross trade amount in USDC lamports */
  grossAmountLamports: bigint
  /** Pool yesReserves in USDC lamports */
  yesReserves: bigint
  /** Pool noReserves in USDC lamports */
  noReserves: bigint
  /** Trade direction */
  direction: 'up' | 'down'
  /** Wallet cap in basis points */
  walletCapBps?: number
  /** Side cap in basis points */
  sideCapBps?: number
}): CapStatus {
  const {
    existingPositionLamports,
    grossAmountLamports,
    yesReserves,
    noReserves,
    direction,
    walletCapBps = PER_WALLET_CAP_BPS,
    sideCapBps = PER_SIDE_CAP_BPS,
  } = params

  const poolTotal = yesReserves + noReserves

  // Calculate net amount (after fee deduction) — caps check against net
  const netAmountLamports = calculateNetAmountLamports(grossAmountLamports)

  // --- Wallet Cap ---
  const walletMaxAllowed =
    poolTotal === 0n ? 0n : (poolTotal * BigInt(walletCapBps)) / 10000n
  const walletRemaining = calculateWalletCapRemaining(
    existingPositionLamports,
    netAmountLamports,
    poolTotal,
    walletCapBps
  )
  const walletUsedPercent =
    walletMaxAllowed === 0n
      ? 0
      : Math.min(100, Number((walletMaxAllowed - walletRemaining) * 100n / walletMaxAllowed))
  const walletLevel = getCapLevel(walletRemaining, walletMaxAllowed)

  const walletCap: CapInfo = {
    level: walletLevel,
    remainingLamports: walletRemaining < 0n ? 0n : walletRemaining,
    maxAllowedLamports: walletMaxAllowed,
    usedPercent: walletUsedPercent,
    label: 'wallet',
  }

  // --- Side Cap ---
  // Target side after trade = current side reserves + net amount
  const targetSideReserves =
    direction === 'up' ? yesReserves : noReserves
  const targetSideAfterTrade = targetSideReserves + netAmountLamports

  const balancedSide = poolTotal === 0n ? 0n : poolTotal / 2n
  const maxDeviation =
    poolTotal === 0n ? 0n : (balancedSide * BigInt(sideCapBps)) / 10000n
  const sideMaxAllowed = balancedSide + maxDeviation

  const sideRemaining = calculateSideCapRemaining(
    targetSideAfterTrade,
    poolTotal,
    sideCapBps
  )
  const sideUsedPercent =
    sideMaxAllowed === 0n
      ? 0
      : Math.min(100, Number((sideMaxAllowed - sideRemaining) * 100n / sideMaxAllowed))
  const sideLevel = getCapLevel(sideRemaining, sideMaxAllowed)

  const sideCap: CapInfo = {
    level: sideLevel,
    remainingLamports: sideRemaining < 0n ? 0n : sideRemaining,
    maxAllowedLamports: sideMaxAllowed,
    usedPercent: sideUsedPercent,
    label: 'side',
  }

  // Determine most restrictive
  const mostRestrictive: 'wallet' | 'side' =
    walletRemaining <= sideRemaining ? 'wallet' : 'side'

  return {
    walletCap,
    sideCap,
    mostRestrictive,
    hasWarning:
      walletLevel === 'warning' ||
      walletLevel === 'exceeded' ||
      sideLevel === 'warning' ||
      sideLevel === 'exceeded',
    hasError: walletLevel === 'exceeded' || sideLevel === 'exceeded',
  }
}
