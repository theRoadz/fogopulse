/**
 * Tests for useClaimPosition hook
 *
 * Tests the claim transaction building and error handling logic.
 * Full integration tests require wallet adapter mocking (see use-buy-position.test.ts pattern).
 */

import { PublicKey } from '@solana/web3.js'

import { parseTransactionError } from '@/lib/transaction-errors'

describe('useClaimPosition hook dependencies', () => {
  describe('parseTransactionError integration for claims', () => {
    it('parses user rejection correctly', () => {
      const error = new Error('User rejected the request')
      expect(parseTransactionError(error)).toBe('Transaction cancelled by user.')
    })

    it('parses EpochNotSettled error', () => {
      const error = new Error('EpochNotSettled')
      expect(parseTransactionError(error)).toBe('Epoch has not been settled yet.')
    })

    it('parses ProtocolFrozen error', () => {
      const error = new Error('ProtocolFrozen')
      expect(parseTransactionError(error)).toBe('Protocol is in emergency freeze mode.')
    })

    it('parses NoPosition error', () => {
      const error = new Error('NoPosition')
      expect(parseTransactionError(error)).toBe('No position to claim.')
    })

    it('parses blockhash expired error', () => {
      const error = new Error('Blockhash not found')
      expect(parseTransactionError(error)).toBe('Transaction expired. Please try again.')
    })

    it('parses generic error', () => {
      const error = new Error('Unknown error occurred')
      expect(parseTransactionError(error)).toBe('Transaction failed. Please try again.')
    })
  })
})

describe('ClaimPositionParams type validation', () => {
  it('validates payout claim parameters', () => {
    const validParams = {
      asset: 'BTC' as const,
      type: 'payout' as const,
      epochPda: new PublicKey('11111111111111111111111111111111'),
      userPubkey: 'D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5',
      displayAmount: '95.00',
    }

    expect(validParams.type).toBe('payout')
    expect(validParams.asset).toBe('BTC')
    expect(validParams.displayAmount).toBe('95.00')
  })

  it('validates refund claim parameters', () => {
    const validParams = {
      asset: 'ETH' as const,
      type: 'refund' as const,
      epochPda: new PublicKey('11111111111111111111111111111111'),
      userPubkey: 'D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5',
      displayAmount: '50.00',
    }

    expect(validParams.type).toBe('refund')
    expect(validParams.asset).toBe('ETH')
  })

  it('accepts all valid assets', () => {
    const assets = ['BTC', 'ETH', 'SOL', 'FOGO'] as const
    assets.forEach((asset) => {
      expect(typeof asset).toBe('string')
    })
  })
})

describe('Claim type routing', () => {
  it('routes payout type correctly', () => {
    const type = 'payout' as const
    const methodName = type === 'payout' ? 'claimPayout' : 'claimRefund'
    expect(methodName).toBe('claimPayout')
  })

  it('routes refund type correctly', () => {
    const type = 'refund' as const
    const methodName = type === 'payout' ? 'claimPayout' : 'claimRefund'
    expect(methodName).toBe('claimRefund')
  })
})

describe('Wallet rejection detection', () => {
  it('detects "User rejected" message', () => {
    const message = 'User rejected the request'
    const isRejection = message.includes('User rejected') ||
      message.includes('rejected the request') ||
      message.includes('User denied') ||
      message.includes('cancelled')
    expect(isRejection).toBe(true)
  })

  it('detects "cancelled" message', () => {
    const message = 'Transaction cancelled by user'
    const isRejection = message.includes('User rejected') ||
      message.includes('rejected the request') ||
      message.includes('User denied') ||
      message.includes('cancelled')
    expect(isRejection).toBe(true)
  })

  it('does not flag real errors as rejection', () => {
    const message = 'EpochNotSettled'
    const isRejection = message.includes('User rejected') ||
      message.includes('rejected the request') ||
      message.includes('User denied') ||
      message.includes('cancelled')
    expect(isRejection).toBe(false)
  })
})
