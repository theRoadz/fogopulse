/**
 * @jest-environment jsdom
 */
import { PublicKey } from '@solana/web3.js'

import { tryFetchSettledEpoch } from './epoch-utils'
import { EpochState, Outcome } from '@/types/epoch'

// Mock dependencies
jest.mock('@/lib/pda', () => ({
  deriveEpochPda: jest.fn(() => new PublicKey('11111111111111111111111111111111')),
}))

jest.mock('@/lib/utils', () => ({
  scalePrice: (price: bigint) => Number(price) * 1e-8,
  formatConfidencePercent: () => '0.0500%',
}))

// Helper to create a mock epoch account
function createMockEpochAccount(overrides: Record<string, unknown> = {}) {
  return {
    state: { settled: {} },
    outcome: { up: {} },
    startPrice: { toString: () => '6917398000000' },
    startConfidence: { toString: () => '4847879' },
    startPublishTime: { toNumber: () => 1710496800 },
    settlementPrice: { toString: () => '6918012000000' },
    settlementConfidence: { toString: () => '3458947' },
    settlementPublishTime: { toNumber: () => 1710497100 },
    startTime: { toNumber: () => 1710496500 },
    endTime: { toNumber: () => 1710497400 },
    freezeTime: { toNumber: () => 1710497385 },
    yesTotalAtSettlement: { toString: () => '100000000' },
    noTotalAtSettlement: { toString: () => '50000000' },
    bump: 255,
    ...overrides,
  }
}

describe('tryFetchSettledEpoch', () => {
  const poolPda = new PublicKey('11111111111111111111111111111111')

  it('should return settlement data for a settled epoch', async () => {
    const mockProgram = {
      account: {
        epoch: {
          fetch: jest.fn().mockResolvedValue(createMockEpochAccount()),
        },
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tryFetchSettledEpoch(mockProgram as any, poolPda, BigInt(5))

    expect(result).not.toBeNull()
    expect(result!.epochId).toBe(BigInt(5))
    expect(result!.state).toBe(EpochState.Settled)
    expect(result!.outcome).toBe(Outcome.Up)
    expect(result!.rawEpochData).toBeDefined()
    expect(result!.rawEpochData.epochId).toBe(BigInt(5))
  })

  it('should return settlement data for a refunded epoch', async () => {
    const mockProgram = {
      account: {
        epoch: {
          fetch: jest.fn().mockResolvedValue(
            createMockEpochAccount({
              state: { refunded: {} },
              outcome: { refunded: {} },
            })
          ),
        },
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tryFetchSettledEpoch(mockProgram as any, poolPda, BigInt(3))

    expect(result).not.toBeNull()
    expect(result!.state).toBe(EpochState.Refunded)
    expect(result!.outcome).toBe(Outcome.Refunded)
  })

  it('should return null for an open epoch', async () => {
    const mockProgram = {
      account: {
        epoch: {
          fetch: jest.fn().mockResolvedValue(
            createMockEpochAccount({ state: { open: {} } })
          ),
        },
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tryFetchSettledEpoch(mockProgram as any, poolPda, BigInt(5))

    expect(result).toBeNull()
  })

  it('should return null for a frozen epoch', async () => {
    const mockProgram = {
      account: {
        epoch: {
          fetch: jest.fn().mockResolvedValue(
            createMockEpochAccount({ state: { frozen: {} } })
          ),
        },
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tryFetchSettledEpoch(mockProgram as any, poolPda, BigInt(5))

    expect(result).toBeNull()
  })

  it('should return null when epoch account does not exist', async () => {
    const mockProgram = {
      account: {
        epoch: {
          fetch: jest.fn().mockRejectedValue(new Error('Account does not exist')),
        },
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tryFetchSettledEpoch(mockProgram as any, poolPda, BigInt(99))

    expect(result).toBeNull()
  })

  it('should return null when settlement price is missing', async () => {
    const mockProgram = {
      account: {
        epoch: {
          fetch: jest.fn().mockResolvedValue(
            createMockEpochAccount({ settlementPrice: null })
          ),
        },
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tryFetchSettledEpoch(mockProgram as any, poolPda, BigInt(5))

    expect(result).toBeNull()
  })

  it('should return force-closed epoch data when state is Refunded but no settlement data', async () => {
    const mockProgram = {
      account: {
        epoch: {
          fetch: jest.fn().mockResolvedValue(
            createMockEpochAccount({
              state: { refunded: {} },
              outcome: null,
              settlementPrice: null,
              settlementConfidence: null,
              settlementPublishTime: null,
              yesTotalAtSettlement: null,
              noTotalAtSettlement: null,
            })
          ),
        },
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tryFetchSettledEpoch(mockProgram as any, poolPda, BigInt(7))

    expect(result).not.toBeNull()
    expect(result!.epochId).toBe(BigInt(7))
    expect(result!.state).toBe(EpochState.Refunded)
    expect(result!.outcome).toBe(Outcome.Refunded)
    expect(result!.settlementPrice).toBe(0)
    expect(result!.settlementPublishTime).toBe(0)
    expect(result!.settlementConfidencePercent).toBe('0%')
    expect(result!.priceDelta).toBe(0)
    expect(result!.priceDeltaPercent).toBe('+0.00%')
    expect(result!.yesTotalAtSettlement).toBeNull()
    expect(result!.noTotalAtSettlement).toBeNull()
    expect(result!.rawEpochData.settlementPrice).toBeNull()
    expect(result!.rawEpochData.outcome).toBe(Outcome.Refunded)
  })

  it('should include yesTotalAtSettlement and noTotalAtSettlement in rawEpochData', async () => {
    const mockProgram = {
      account: {
        epoch: {
          fetch: jest.fn().mockResolvedValue(createMockEpochAccount()),
        },
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tryFetchSettledEpoch(mockProgram as any, poolPda, BigInt(5))

    expect(result!.yesTotalAtSettlement).toBe(BigInt(100000000))
    expect(result!.noTotalAtSettlement).toBe(BigInt(50000000))
    expect(result!.rawEpochData.yesTotalAtSettlement).toBe(BigInt(100000000))
  })
})
