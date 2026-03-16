'use client'

import { useMemo } from 'react'

import type { EpochData } from '@/types/epoch'
import { EpochState, Outcome } from '@/types/epoch'
import type { UserPositionData } from '@/hooks/use-user-position'

/**
 * Claim state for the UI
 */
export type ClaimState =
  | { type: 'winner'; amount: bigint }
  | { type: 'refund'; amount: bigint }
  | { type: 'claimed' }
  | { type: 'lost' }
  | { type: 'no-position' }
  | { type: 'not-settled' }

/**
 * Calculate payout amount for a winning position using BigInt arithmetic.
 *
 * CRITICAL: Must match on-chain logic exactly. On-chain uses u128 intermediate
 * then truncates to u64. BigInt division truncates (floor division) which matches.
 *
 * Formula:
 *   winnings = (position.amount * loserTotal) / winnerTotal
 *   payout = position.amount + winnings
 *
 * Edge case: if loserTotal is 0, payout = original stake only (no winnings).
 */
export function calculatePayout(
  positionAmount: bigint,
  winnerTotal: bigint,
  loserTotal: bigint
): bigint {
  if (loserTotal === 0n) {
    return positionAmount
  }
  const winnings = (positionAmount * loserTotal) / winnerTotal
  return positionAmount + winnings
}

/**
 * Determine the claim state for a position given epoch data.
 */
export function getClaimState(
  epoch: EpochData | null,
  position: UserPositionData | null
): ClaimState {
  if (!position) return { type: 'no-position' }
  if (!epoch) return { type: 'not-settled' }

  if (position.claimed) return { type: 'claimed' }

  // Refunded epoch — all positions get refund
  if (epoch.state === EpochState.Refunded) {
    return { type: 'refund', amount: position.amount }
  }

  // Not settled yet
  if (epoch.state !== EpochState.Settled || epoch.outcome === null) {
    return { type: 'not-settled' }
  }

  // Settled epoch — check if position is a winner
  const isWinner =
    (epoch.outcome === Outcome.Up && position.direction === 'up') ||
    (epoch.outcome === Outcome.Down && position.direction === 'down')

  if (!isWinner) {
    return { type: 'lost' }
  }

  // Winner — calculate payout
  const winnerTotal = epoch.outcome === Outcome.Up
    ? epoch.yesTotalAtSettlement!
    : epoch.noTotalAtSettlement!
  const loserTotal = epoch.outcome === Outcome.Up
    ? epoch.noTotalAtSettlement!
    : epoch.yesTotalAtSettlement!

  const payout = calculatePayout(position.amount, winnerTotal, loserTotal)
  return { type: 'winner', amount: payout }
}

/**
 * Format a bigint USDC amount (lamports) to a human-readable display string.
 *
 * @param amount - Amount in USDC lamports (6 decimals)
 * @returns Formatted string like "95.00"
 */
export function formatUsdcAmount(amount: bigint): string {
  return (Number(amount) / 1_000_000).toFixed(2)
}

interface UseClaimableAmountResult {
  /** The claim state */
  claimState: ClaimState
  /** Display-ready USDC amount (e.g., "95.00"), null if not claimable */
  displayAmount: string | null
}

/**
 * Hook that determines the claim state and amount for a user's position.
 *
 * @param epoch - The epoch data (settled or refunded)
 * @param position - The user's position data (null if no position)
 * @returns Claim state and display amount
 */
export function useClaimableAmount(
  epoch: EpochData | null,
  position: UserPositionData | null
): UseClaimableAmountResult {
  return useMemo(() => {
    const claimState = getClaimState(epoch, position)

    let displayAmount: string | null = null
    if (claimState.type === 'winner' || claimState.type === 'refund') {
      displayAmount = formatUsdcAmount(claimState.amount)
    }

    return { claimState, displayAmount }
  }, [epoch, position])
}
