/**
 * Tests for useClaimableAmount hook
 *
 * Tests payout calculation logic, claim state detection, and USDC formatting.
 */

import { PublicKey } from '@solana/web3.js'

import { EpochState, Outcome } from '@/types/epoch'
import type { EpochData } from '@/types/epoch'
import type { UserPositionData } from '@/hooks/use-user-position'
import { calculatePayout, getClaimState, formatUsdcAmount } from '@/hooks/use-claimable-amount'

// Helper to create mock epoch data
function createMockEpoch(overrides: Partial<EpochData> = {}): EpochData {
  return {
    pool: new PublicKey('11111111111111111111111111111111'),
    epochId: BigInt(1),
    state: EpochState.Settled,
    startTime: 1000,
    endTime: 1300,
    freezeTime: 1285,
    startPrice: BigInt(9500000000000),
    startConfidence: BigInt(1000000),
    startPublishTime: 995,
    settlementPrice: BigInt(9600000000000),
    settlementConfidence: BigInt(1000000),
    settlementPublishTime: 1305,
    outcome: Outcome.Up,
    yesTotalAtSettlement: BigInt(100_000_000), // 100 USDC
    noTotalAtSettlement: BigInt(50_000_000),   // 50 USDC
    bump: 255,
    ...overrides,
  }
}

// Helper to create mock position data
function createMockPosition(overrides: Partial<UserPositionData> = {}): UserPositionData {
  return {
    user: new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5'),
    epoch: new PublicKey('11111111111111111111111111111111'),
    direction: 'up',
    amount: BigInt(10_000_000), // 10 USDC
    shares: BigInt(5_000_000),
    entryPrice: BigInt(2_000_000),
    claimed: false,
    bump: 255,
    ...overrides,
  }
}

describe('calculatePayout', () => {
  it('calculates payout for a winner with losers', () => {
    // 10 USDC position, 100 USDC winners, 50 USDC losers
    // winnings = (10 * 50) / 100 = 5 USDC
    // payout = 10 + 5 = 15 USDC
    const payout = calculatePayout(
      BigInt(10_000_000),   // 10 USDC
      BigInt(100_000_000),  // 100 USDC winner total
      BigInt(50_000_000)    // 50 USDC loser total
    )
    expect(payout).toBe(BigInt(15_000_000)) // 15 USDC
  })

  it('returns original stake when loserTotal is 0 (sole winner side)', () => {
    const payout = calculatePayout(
      BigInt(10_000_000),
      BigInt(10_000_000),
      BigInt(0)
    )
    expect(payout).toBe(BigInt(10_000_000)) // Original stake only
  })

  it('handles sole winner getting all losers', () => {
    // Only winner gets all the loser money
    // 10 USDC position, 10 USDC winners (sole), 90 USDC losers
    // winnings = (10 * 90) / 10 = 90
    // payout = 10 + 90 = 100
    const payout = calculatePayout(
      BigInt(10_000_000),
      BigInt(10_000_000),
      BigInt(90_000_000)
    )
    expect(payout).toBe(BigInt(100_000_000)) // 100 USDC
  })

  it('uses BigInt floor division (matches on-chain truncation)', () => {
    // 7 / 3 = 2 (truncated, not rounded)
    // winnings = (7 * 10) / 3 = 70 / 3 = 23 (truncated)
    // payout = 7 + 23 = 30
    const payout = calculatePayout(
      BigInt(7),
      BigInt(3),
      BigInt(10)
    )
    expect(payout).toBe(BigInt(30)) // Floor division
  })

  it('handles large amounts without precision loss', () => {
    // 1M USDC positions
    const payout = calculatePayout(
      BigInt(1_000_000_000_000),  // 1M USDC in lamports
      BigInt(5_000_000_000_000),  // 5M USDC winners
      BigInt(3_000_000_000_000)   // 3M USDC losers
    )
    // winnings = (1M * 3M) / 5M = 600K USDC
    // payout = 1M + 600K = 1.6M USDC
    expect(payout).toBe(BigInt(1_600_000_000_000))
  })
})

describe('getClaimState', () => {
  it('returns no-position when position is null', () => {
    const epoch = createMockEpoch()
    const result = getClaimState(epoch, null)
    expect(result).toEqual({ type: 'no-position' })
  })

  it('returns not-settled when epoch is null', () => {
    const position = createMockPosition()
    const result = getClaimState(null, position)
    expect(result).toEqual({ type: 'not-settled' })
  })

  it('returns claimed when position is already claimed', () => {
    const epoch = createMockEpoch()
    const position = createMockPosition({ claimed: true })
    const result = getClaimState(epoch, position)
    expect(result).toEqual({ type: 'claimed' })
  })

  it('returns refund for refunded epoch', () => {
    const epoch = createMockEpoch({
      state: EpochState.Refunded,
      outcome: Outcome.Refunded,
    })
    const position = createMockPosition({ amount: BigInt(50_000_000) })
    const result = getClaimState(epoch, position)
    expect(result).toEqual({ type: 'refund', amount: BigInt(50_000_000) })
  })

  it('returns not-settled for open epoch', () => {
    const epoch = createMockEpoch({
      state: EpochState.Open,
      outcome: null,
    })
    const position = createMockPosition()
    const result = getClaimState(epoch, position)
    expect(result).toEqual({ type: 'not-settled' })
  })

  it('returns winner with payout for matching direction (Up)', () => {
    const epoch = createMockEpoch({
      outcome: Outcome.Up,
      yesTotalAtSettlement: BigInt(100_000_000),
      noTotalAtSettlement: BigInt(50_000_000),
    })
    const position = createMockPosition({
      direction: 'up',
      amount: BigInt(10_000_000),
    })
    const result = getClaimState(epoch, position)
    expect(result).toEqual({ type: 'winner', amount: BigInt(15_000_000) })
  })

  it('returns winner with payout for matching direction (Down)', () => {
    const epoch = createMockEpoch({
      outcome: Outcome.Down,
      yesTotalAtSettlement: BigInt(60_000_000),
      noTotalAtSettlement: BigInt(40_000_000),
    })
    const position = createMockPosition({
      direction: 'down',
      amount: BigInt(20_000_000),
    })
    // winnerTotal = noTotal = 40M, loserTotal = yesTotal = 60M
    // winnings = (20M * 60M) / 40M = 30M
    // payout = 20M + 30M = 50M
    const result = getClaimState(epoch, position)
    expect(result).toEqual({ type: 'winner', amount: BigInt(50_000_000) })
  })

  it('returns lost for non-matching direction', () => {
    const epoch = createMockEpoch({ outcome: Outcome.Up })
    const position = createMockPosition({ direction: 'down' })
    const result = getClaimState(epoch, position)
    expect(result).toEqual({ type: 'lost' })
  })

  it('returns lost for down position when outcome is Up', () => {
    const epoch = createMockEpoch({ outcome: Outcome.Up })
    const position = createMockPosition({ direction: 'down' })
    const result = getClaimState(epoch, position)
    expect(result).toEqual({ type: 'lost' })
  })

  it('returns refund regardless of direction for refunded epoch', () => {
    const epoch = createMockEpoch({
      state: EpochState.Refunded,
      outcome: Outcome.Refunded,
    })
    // Even an "up" position gets refunded
    const position = createMockPosition({
      direction: 'up',
      amount: BigInt(25_000_000),
    })
    const result = getClaimState(epoch, position)
    expect(result).toEqual({ type: 'refund', amount: BigInt(25_000_000) })
  })
})

describe('formatUsdcAmount', () => {
  it('formats whole USDC amounts', () => {
    expect(formatUsdcAmount(BigInt(10_000_000))).toBe('10.00')
  })

  it('formats fractional USDC amounts', () => {
    expect(formatUsdcAmount(BigInt(10_500_000))).toBe('10.50')
  })

  it('formats small amounts', () => {
    expect(formatUsdcAmount(BigInt(10_000))).toBe('0.01')
  })

  it('formats zero', () => {
    expect(formatUsdcAmount(BigInt(0))).toBe('0.00')
  })

  it('formats large amounts', () => {
    expect(formatUsdcAmount(BigInt(95_000_000))).toBe('95.00')
  })

  it('formats amounts with all 6 decimal precision', () => {
    expect(formatUsdcAmount(BigInt(1_234_567))).toBe('1.23')
  })
})
