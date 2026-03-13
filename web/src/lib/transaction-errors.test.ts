import { parseTransactionError, isRecoverableError } from './transaction-errors'

describe('parseTransactionError', () => {
  describe('user rejection errors', () => {
    it('handles "User rejected" error', () => {
      const error = new Error('User rejected the request')
      expect(parseTransactionError(error)).toBe('Transaction cancelled by user.')
    })

    it('handles "User denied" error', () => {
      const error = new Error('User denied transaction signature')
      expect(parseTransactionError(error)).toBe('Transaction cancelled by user.')
    })

    it('handles "cancelled" error', () => {
      const error = new Error('Transaction was cancelled')
      expect(parseTransactionError(error)).toBe('Transaction cancelled by user.')
    })
  })

  describe('Anchor program errors', () => {
    it('handles EpochNotOpen error', () => {
      const error = new Error('Error Code: EpochNotOpen. Error Message: Epoch is not open')
      expect(parseTransactionError(error)).toBe('Trading is not available. Epoch is not open.')
    })

    it('handles ProtocolPaused error', () => {
      const error = new Error('Error Code: ProtocolPaused')
      expect(parseTransactionError(error)).toBe('Trading is temporarily paused.')
    })

    it('handles ExceedsWalletCap error', () => {
      const error = new Error('ExceedsWalletCap: Wallet cap exceeded')
      expect(parseTransactionError(error)).toBe(
        'Trade exceeds your maximum position size (5% of pool).'
      )
    })

    it('handles ExceedsSideCap error', () => {
      const error = new Error('ExceedsSideCap: Side cap exceeded')
      expect(parseTransactionError(error)).toBe(
        'Trade exceeds the market side limit (30% of pool).'
      )
    })

    it('handles InvalidDirection error', () => {
      const error = new Error('InvalidDirection')
      expect(parseTransactionError(error)).toBe(
        'Cannot add to existing position in opposite direction.'
      )
    })

    it('handles BelowMinimumTrade error', () => {
      const error = new Error('BelowMinimumTrade')
      expect(parseTransactionError(error)).toBe('Minimum trade amount is $0.01')
    })

    it('handles ZeroAmount error', () => {
      const error = new Error('ZeroAmount')
      expect(parseTransactionError(error)).toBe('Please enter a valid amount.')
    })

    it('handles InsufficientBalance error', () => {
      const error = new Error('InsufficientBalance')
      expect(parseTransactionError(error)).toBe('Insufficient USDC balance.')
    })
  })

  describe('SOL insufficient funds errors', () => {
    it('handles 0x1 error code', () => {
      const error = new Error('Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1')
      expect(parseTransactionError(error)).toBe('Insufficient SOL for transaction fees.')
    })

    it('handles "insufficient lamports" error', () => {
      const error = new Error('insufficient lamports')
      expect(parseTransactionError(error)).toBe('Insufficient SOL for transaction fees.')
    })
  })

  describe('network and timeout errors', () => {
    it('handles blockhash expired error', () => {
      const error = new Error('Blockhash expired. Please try again.')
      expect(parseTransactionError(error)).toBe('Transaction expired. Please try again.')
    })

    it('handles BlockhashNotFound error', () => {
      const error = new Error('BlockhashNotFound')
      expect(parseTransactionError(error)).toBe('Transaction expired. Please try again.')
    })

    it('handles fetch failed error', () => {
      const error = new Error('fetch failed')
      expect(parseTransactionError(error)).toBe(
        'Network error. Please check your connection and try again.'
      )
    })
  })

  describe('fallback behavior', () => {
    it('returns generic message for unknown errors', () => {
      const error = new Error('Some unknown error')
      expect(parseTransactionError(error)).toBe('Transaction failed. Please try again.')
    })

    it('handles non-Error objects', () => {
      expect(parseTransactionError('string error')).toBe('Transaction failed. Please try again.')
    })

    it('handles null/undefined', () => {
      expect(parseTransactionError(null)).toBe('Transaction failed. Please try again.')
      expect(parseTransactionError(undefined)).toBe('Transaction failed. Please try again.')
    })
  })
})

describe('isRecoverableError', () => {
  describe('non-recoverable errors', () => {
    it('returns false for EpochNotOpen', () => {
      const error = new Error('EpochNotOpen')
      expect(isRecoverableError(error)).toBe(false)
    })

    it('returns false for ProtocolPaused', () => {
      const error = new Error('ProtocolPaused')
      expect(isRecoverableError(error)).toBe(false)
    })

    it('returns false for ProtocolFrozen', () => {
      const error = new Error('ProtocolFrozen')
      expect(isRecoverableError(error)).toBe(false)
    })

    it('returns false for PoolPaused', () => {
      const error = new Error('PoolPaused')
      expect(isRecoverableError(error)).toBe(false)
    })

    it('returns false for InvalidDirection', () => {
      const error = new Error('InvalidDirection')
      expect(isRecoverableError(error)).toBe(false)
    })

    it('returns false for Unauthorized', () => {
      const error = new Error('Unauthorized')
      expect(isRecoverableError(error)).toBe(false)
    })
  })

  describe('recoverable errors', () => {
    it('returns true for network errors', () => {
      const error = new Error('fetch failed')
      expect(isRecoverableError(error)).toBe(true)
    })

    it('returns true for blockhash expired', () => {
      const error = new Error('BlockhashNotFound')
      expect(isRecoverableError(error)).toBe(true)
    })

    it('returns true for user rejection', () => {
      const error = new Error('User rejected')
      expect(isRecoverableError(error)).toBe(true)
    })

    it('returns true for unknown errors', () => {
      const error = new Error('Some random error')
      expect(isRecoverableError(error)).toBe(true)
    })
  })
})
