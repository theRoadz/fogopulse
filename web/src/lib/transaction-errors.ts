/**
 * Map of Anchor error codes to user-friendly messages
 * Reference: anchor/programs/fogopulse/src/errors.rs
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Epoch state errors
  EpochNotOpen: 'Trading is not available. Epoch is not open.',
  EpochAlreadyOpen: 'An epoch is already active.',
  EpochNotSettled: 'Epoch has not been settled yet.',
  EpochAlreadySettled: 'This epoch has already been settled.',

  // Protocol state errors
  ProtocolPaused: 'Trading is temporarily paused.',
  PoolPaused: 'This market is temporarily paused.',
  ProtocolFrozen: 'Protocol is in emergency freeze mode.',

  // Trade validation errors
  ZeroAmount: 'Please enter a valid amount.',
  BelowMinimumTrade: 'Minimum trade amount is $0.01',
  ExceedsWalletCap: 'Trade exceeds your maximum position size (5% of pool).',
  ExceedsSideCap: 'Trade exceeds the market side limit (30% of pool).',
  InvalidDirection: 'Cannot add to existing position in opposite direction.',

  // Authorization errors
  Unauthorized: 'Wallet signature verification failed.',
  InvalidSession: 'Session is invalid or expired.',

  // Token errors
  InsufficientBalance: 'Insufficient USDC balance.',
  TokenOwnerMismatch: 'Token account does not belong to your wallet.',
  InvalidTokenAccount: 'Invalid token account.',

  // Oracle errors
  OracleStale: 'Oracle price is stale. Please try again.',
  OracleConfidenceTooWide: 'Oracle price confidence is too wide.',
  InvalidOracleData: 'Invalid oracle data received.',

  // Position errors
  PositionNotFound: 'Position not found.',
  PositionAlreadyExists: 'You already have a position in this epoch.',
  NoPosition: 'No position to claim.',

  // Claim errors
  AlreadyClaimed: 'This position has already been claimed.',
  PositionNotWinner: 'This position did not win the epoch.',
}

/**
 * Parse transaction error and return user-friendly message
 *
 * Handles:
 * - Wallet rejection errors
 * - Anchor program errors
 * - Insufficient funds errors
 * - Generic transaction failures
 */
export function parseTransactionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  // Check for user rejection - wallet cancelled the transaction
  if (
    message.includes('User rejected') ||
    message.includes('rejected the request') ||
    message.includes('User denied') ||
    message.includes('cancelled')
  ) {
    return 'Transaction cancelled by user.'
  }

  // Check for simulation failure with Anchor error
  for (const [code, userMessage] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) {
      return userMessage
    }
  }

  // Check for insufficient funds (SOL for transaction fees)
  if (
    message.includes('0x1') ||
    message.includes('insufficient lamports') ||
    message.includes('Insufficient balance')
  ) {
    return 'Insufficient SOL for transaction fees.'
  }

  // Check for account not found
  if (message.includes('Account does not exist') || message.includes('AccountNotFound')) {
    return 'Required account not found. The epoch may have ended.'
  }

  // Check for blockhash expired (be specific to avoid matching "Session expired" etc.)
  if (
    message.includes('Blockhash') ||
    message.includes('blockhash') ||
    message.includes('BlockhashNotFound') ||
    message.includes('block height exceeded') ||
    message.includes('transaction has already been processed')
  ) {
    return 'Transaction expired. Please try again.'
  }

  // Check for network errors
  if (
    message.includes('fetch failed') ||
    message.includes('NetworkError') ||
    message.includes('ECONNREFUSED')
  ) {
    return 'Network error. Please check your connection and try again.'
  }

  // Generic fallback
  return 'Transaction failed. Please try again.'
}

/**
 * Check if an error is recoverable (user can retry)
 */
export function isRecoverableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  // Non-recoverable errors
  const nonRecoverable = [
    'EpochNotOpen',
    'EpochAlreadySettled',
    'ProtocolPaused',
    'ProtocolFrozen',
    'PoolPaused',
    'InvalidDirection',
    'Unauthorized',
  ]

  return !nonRecoverable.some((code) => message.includes(code))
}
