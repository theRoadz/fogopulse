import type { PublicKey } from '@solana/web3.js'

/**
 * Epoch state machine - matches on-chain EpochState enum from anchor program
 */
export enum EpochState {
  /** Trading allowed */
  Open = 'Open',
  /** In freeze window, no trades allowed */
  Frozen = 'Frozen',
  /** Settlement in progress */
  Settling = 'Settling',
  /** Outcome determined, payouts available */
  Settled = 'Settled',
  /** Oracle failed, all positions refunded */
  Refunded = 'Refunded',
}

/**
 * Map the on-chain u8 representation to EpochState enum
 * From Pool.active_epoch_state cache field:
 * 0 = None (no active epoch), 1 = Open, 2 = Frozen, 3 = Settling, 4 = Settled, 5 = Refunded
 */
export function epochStateFromU8(value: number): EpochState | null {
  switch (value) {
    case 0:
      return null
    case 1:
      return EpochState.Open
    case 2:
      return EpochState.Frozen
    case 3:
      return EpochState.Settling
    case 4:
      return EpochState.Settled
    case 5:
      return EpochState.Refunded
    default:
      return null
  }
}

/**
 * Final outcome of an epoch after settlement
 */
export enum Outcome {
  /** Settlement price > Start price */
  Up = 'Up',
  /** Settlement price < Start price */
  Down = 'Down',
  /** Exact price tie - all refunded */
  Refunded = 'Refunded',
}

/**
 * Epoch data interface - matches on-chain Epoch account structure
 */
export interface EpochData {
  /** Parent pool pubkey reference */
  pool: PublicKey
  /** Sequential identifier within pool (0, 1, 2, ...) */
  epochId: bigint
  /** Current epoch state */
  state: EpochState
  /** Unix timestamp when epoch begins (seconds) */
  startTime: number
  /** Unix timestamp when epoch ends (seconds) */
  endTime: number
  /** When trading stops (end_time - freeze_window_seconds) (seconds) */
  freezeTime: number
  /** Oracle price at epoch creation (scaled u64) */
  startPrice: bigint
  /** Oracle confidence at epoch creation (scaled u64) */
  startConfidence: bigint
  /** Oracle publish timestamp at epoch creation (seconds) */
  startPublishTime: number
  /** Oracle price at settlement (None until settled) */
  settlementPrice: bigint | null
  /** Oracle confidence at settlement */
  settlementConfidence: bigint | null
  /** Oracle publish timestamp at settlement */
  settlementPublishTime: number | null
  /** Final outcome (Up, Down, or Refunded) */
  outcome: Outcome | null
  /** YES side total at settlement (before rebalance) - for payout calculation */
  yesTotalAtSettlement: bigint | null
  /** NO side total at settlement (before rebalance) - for payout calculation */
  noTotalAtSettlement: bigint | null
  /** PDA bump seed */
  bump: number
}

/**
 * Processed epoch state for UI consumption
 */
export interface EpochUIState {
  /** The raw epoch data, null if no active epoch */
  epoch: EpochData | null
  /** Time remaining in seconds until epoch end */
  timeRemaining: number
  /** Whether the epoch is in frozen state (trading stopped) */
  isFrozen: boolean
  /** Whether the epoch is currently settling */
  isSettling: boolean
  /** Whether the epoch has been settled */
  isSettled: boolean
  /** Human-readable start price (converted from scaled u64) */
  startPriceDisplay: number | null
  /** Pyth exponent for price formatting (typically -8) */
  priceExponent: number
}

/**
 * Status when no epoch is active
 */
export type NoEpochStatus = 'no-pool' | 'no-epoch' | 'next-epoch-soon'

/**
 * Parse on-chain epoch state from Anchor enum format (e.g., { open: {} })
 */
export function parseEpochState(state: unknown): EpochState {
  if (!state || typeof state !== 'object') return EpochState.Open
  const keys = Object.keys(state)
  if (keys.length === 0) return EpochState.Open
  const variant = keys[0]
  switch (variant) {
    case 'open':
      return EpochState.Open
    case 'frozen':
      return EpochState.Frozen
    case 'settling':
      return EpochState.Settling
    case 'settled':
      return EpochState.Settled
    case 'refunded':
      return EpochState.Refunded
    default:
      return EpochState.Open
  }
}

/**
 * Parse outcome from Anchor enum format (e.g., { up: {} })
 */
export function parseOutcome(outcome: unknown): Outcome | null {
  if (!outcome || typeof outcome !== 'object') return null
  const keys = Object.keys(outcome)
  if (keys.length === 0) return null
  const variant = keys[0]
  switch (variant) {
    case 'up':
      return Outcome.Up
    case 'down':
      return Outcome.Down
    case 'refunded':
      return Outcome.Refunded
    default:
      return null
  }
}
