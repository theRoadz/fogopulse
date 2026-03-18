import type { PublicKey } from '@solana/web3.js'

/**
 * LpShare account data — matches on-chain LpShare account structure.
 *
 * Note: Anchor auto-converts snake_case IDL fields to camelCase at runtime.
 * All u64 fields are BN objects on-chain — convert with BigInt(account.field.toString()).
 */
export interface LpShareData {
  user: PublicKey
  pool: PublicKey
  shares: bigint
  depositedAmount: bigint
  pendingWithdrawal: bigint
  withdrawalRequestedAt: bigint | null
  bump: number
}

/**
 * Calculate the USDC value of LP shares.
 *
 * Formula: (shares * poolValue) / totalLpShares
 * Guards totalLpShares > 0 to prevent division by zero (Story 5.4 code review finding).
 */
export function calculateShareValue(
  shares: bigint,
  totalLpShares: bigint,
  yesReserves: bigint,
  noReserves: bigint
): bigint {
  if (totalLpShares === 0n) return 0n
  const poolValue = yesReserves + noReserves
  return (shares * poolValue) / totalLpShares
}

/**
 * Calculate earnings (current value minus deposited amount).
 * Can be negative if impermanent loss occurred.
 */
export function calculateEarnings(currentValue: bigint, depositedAmount: bigint): bigint {
  return currentValue - depositedAmount
}
