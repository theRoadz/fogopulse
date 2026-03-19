import { PublicKey } from '@solana/web3.js'

import { Outcome, EpochState } from '@/types/epoch'
import type { EpochData } from '@/types/epoch'
import type { LastSettledEpochData } from '@/lib/epoch-utils'
import type { UserPositionData } from '@/hooks/use-user-position'
import {
  classifyPosition,
  computeTradingStats,
  type TradingHistoryEntry,
} from './use-trading-history'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dummyPubkey = PublicKey.default

function makeEpochData(overrides: Partial<EpochData> = {}): EpochData {
  return {
    pool: dummyPubkey,
    epochId: 1n,
    state: EpochState.Settled,
    startTime: 1000,
    endTime: 1300,
    freezeTime: 1285,
    startPrice: 50000_00000000n,
    startConfidence: 100_00000000n,
    startPublishTime: 1000,
    settlementPrice: 51000_00000000n,
    settlementConfidence: 100_00000000n,
    settlementPublishTime: 1300,
    outcome: Outcome.Up,
    yesTotalAtSettlement: 100_000_000n, // 100 USDC
    noTotalAtSettlement: 80_000_000n, // 80 USDC
    bump: 255,
    ...overrides,
  }
}

function makeSettlement(overrides: Partial<LastSettledEpochData> = {}): LastSettledEpochData {
  const raw = makeEpochData(overrides.rawEpochData ? overrides.rawEpochData : undefined)
  return {
    epochId: raw.epochId,
    epochPda: dummyPubkey,
    state: raw.state,
    outcome: raw.outcome ?? Outcome.Up,
    startPrice: 50000,
    startConfidencePercent: '0.20%',
    startPublishTime: 1000,
    settlementPrice: 51000,
    settlementConfidencePercent: '0.20%',
    settlementPublishTime: 1300,
    priceDelta: 1000,
    priceDeltaPercent: '+2.00%',
    startConfidenceRaw: 100_00000000n,
    settlementConfidenceRaw: 100_00000000n,
    yesTotalAtSettlement: raw.yesTotalAtSettlement,
    noTotalAtSettlement: raw.noTotalAtSettlement,
    rawEpochData: raw,
    ...overrides,
  }
}

function makePosition(overrides: Partial<UserPositionData> = {}): UserPositionData {
  return {
    user: dummyPubkey,
    epoch: dummyPubkey,
    direction: 'up',
    amount: 10_000_000n, // 10 USDC
    shares: 10_000_000n,
    entryPrice: 1_000_000n,
    claimed: false,
    bump: 255,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// classifyPosition tests
// ---------------------------------------------------------------------------

describe('classifyPosition', () => {
  it('classifies a winning position (up direction, outcome Up)', () => {
    const settlement = makeSettlement()
    const position = makePosition({ direction: 'up' })
    const entry = classifyPosition('BTC', settlement, position)

    expect(entry.outcome).toBe('won')
    expect(entry.asset).toBe('BTC')
    expect(entry.direction).toBe('up')
    expect(entry.amountInvested).toBe(10_000_000n)
    // payout = 10 + (10 * 80) / 100 = 18 USDC → PnL = 8 USDC
    expect(entry.realizedPnl).toBe(8_000_000n)
    expect(entry.payoutAmount).toBe(18_000_000n)
  })

  it('classifies a losing position (down direction, outcome Up)', () => {
    const settlement = makeSettlement()
    const position = makePosition({ direction: 'down' })
    const entry = classifyPosition('ETH', settlement, position)

    expect(entry.outcome).toBe('lost')
    expect(entry.realizedPnl).toBe(-10_000_000n)
    expect(entry.payoutAmount).toBeNull()
  })

  it('classifies a refunded position', () => {
    const epochData = makeEpochData({
      state: EpochState.Refunded,
      outcome: Outcome.Refunded,
    })
    const settlement = makeSettlement({
      state: EpochState.Refunded,
      outcome: Outcome.Refunded,
      rawEpochData: epochData,
    })
    const position = makePosition({ direction: 'up' })
    const entry = classifyPosition('SOL', settlement, position)

    expect(entry.outcome).toBe('refund')
    expect(entry.realizedPnl).toBe(0n)
    expect(entry.payoutAmount).toBe(10_000_000n)
  })

  it('classifies a sold-early position (claimed with shares === 0n)', () => {
    const settlement = makeSettlement()
    const position = makePosition({
      direction: 'up',
      claimed: true,
      shares: 0n,
      amount: 0n,
    })
    const entry = classifyPosition('FOGO', settlement, position)

    expect(entry.outcome).toBe('sold-early')
    expect(entry.realizedPnl).toBeNull()
    expect(entry.payoutAmount).toBeNull()
    expect(entry.amountInvested).toBe(0n)
  })

  it('classifies a claimed refund (claimed with Refunded outcome)', () => {
    const epochData = makeEpochData({
      state: EpochState.Refunded,
      outcome: Outcome.Refunded,
      settlementPrice: null,
      settlementConfidence: null,
      settlementPublishTime: null,
      yesTotalAtSettlement: null,
      noTotalAtSettlement: null,
    })
    const settlement = makeSettlement({
      state: EpochState.Refunded,
      outcome: Outcome.Refunded,
      settlementPrice: 0,
      settlementPublishTime: 0,
      yesTotalAtSettlement: null,
      noTotalAtSettlement: null,
      rawEpochData: epochData,
    })
    const position = makePosition({
      direction: 'up',
      claimed: true,
      shares: 10_000_000n,
      amount: 10_000_000n,
    })
    const entry = classifyPosition('BTC', settlement, position)

    expect(entry.outcome).toBe('refund')
    expect(entry.realizedPnl).toBe(0n)
    expect(entry.payoutAmount).toBe(10_000_000n)
  })

  it('uses endTime as fallback for settlementTime when settlementPublishTime is 0', () => {
    const epochData = makeEpochData({
      state: EpochState.Refunded,
      outcome: Outcome.Refunded,
      endTime: 1500,
    })
    const settlement = makeSettlement({
      state: EpochState.Refunded,
      outcome: Outcome.Refunded,
      settlementPublishTime: 0,
      rawEpochData: epochData,
    })
    const position = makePosition()
    const entry = classifyPosition('BTC', settlement, position)

    expect(entry.settlementTime).toBe(1500)
  })

  it('classifies a claimed winner (claimed with shares > 0n)', () => {
    const settlement = makeSettlement()
    const position = makePosition({
      direction: 'up',
      claimed: true,
      shares: 10_000_000n,
      amount: 10_000_000n,
    })
    const entry = classifyPosition('BTC', settlement, position)

    expect(entry.outcome).toBe('won')
    // Recalculated payout = 10 + (10 * 80) / 100 = 18 USDC → PnL = 8
    expect(entry.realizedPnl).toBe(8_000_000n)
    expect(entry.payoutAmount).toBe(18_000_000n)
  })

  it('throws for unexpected claimState (no-position)', () => {
    const settlement = makeSettlement()
    // Pass null-like position that triggers 'no-position' claimState
    // getClaimState returns 'no-position' when position is null
    // Since classifyPosition requires a non-null position, we simulate by
    // creating a position with a state that doesn't settle properly
    const epochData = makeEpochData({
      state: EpochState.Settling as unknown as typeof EpochState.Settled,
      outcome: null as unknown as typeof Outcome.Up,
    })
    const unsettledSettlement = makeSettlement({
      rawEpochData: epochData,
    })
    const position = makePosition({ claimed: false, direction: 'up' })

    expect(() => classifyPosition('BTC', unsettledSettlement, position)).toThrow(
      /Unexpected claimState/
    )
  })
})

// ---------------------------------------------------------------------------
// computeTradingStats tests
// ---------------------------------------------------------------------------

describe('computeTradingStats', () => {
  function makeEntry(overrides: Partial<TradingHistoryEntry>): TradingHistoryEntry {
    const settlement = makeSettlement()
    const position = makePosition()
    return {
      asset: 'BTC',
      epochId: 1n,
      epochPda: dummyPubkey,
      direction: 'up',
      amountInvested: 10_000_000n,
      outcome: 'won',
      realizedPnl: 8_000_000n,
      payoutAmount: 18_000_000n,
      settlementTime: 1300,
      settlement,
      position,
      ...overrides,
    }
  }

  it('computes stats for mixed outcomes', () => {
    const entries = [
      makeEntry({ outcome: 'won', realizedPnl: 8_000_000n, amountInvested: 10_000_000n }),
      makeEntry({ outcome: 'lost', realizedPnl: -5_000_000n, amountInvested: 5_000_000n }),
      makeEntry({ outcome: 'refund', realizedPnl: 0n, amountInvested: 20_000_000n }),
      makeEntry({ outcome: 'sold-early', realizedPnl: null, amountInvested: 15_000_000n }),
    ]
    const stats = computeTradingStats(entries)

    expect(stats.winCount).toBe(1)
    expect(stats.lossCount).toBe(1)
    expect(stats.refundCount).toBe(1)
    expect(stats.soldEarlyCount).toBe(1)
    // totalPnl: +8 - 5 = 3 USDC
    expect(stats.totalRealizedPnl).toBe(3_000_000n)
    expect(stats.totalVolume).toBe(50_000_000n)
    // winRate: 1 / (1 + 1) = 0.5
    expect(stats.winRate).toBe(0.5)
  })

  it('returns 0 win rate when no wins or losses', () => {
    const entries = [
      makeEntry({ outcome: 'refund', realizedPnl: 0n }),
      makeEntry({ outcome: 'sold-early', realizedPnl: null }),
    ]
    const stats = computeTradingStats(entries)

    expect(stats.winRate).toBe(0)
    expect(stats.totalRealizedPnl).toBe(0n)
  })

  it('computes stats for empty entries', () => {
    const stats = computeTradingStats([])

    expect(stats.winCount).toBe(0)
    expect(stats.lossCount).toBe(0)
    expect(stats.refundCount).toBe(0)
    expect(stats.soldEarlyCount).toBe(0)
    expect(stats.totalRealizedPnl).toBe(0n)
    expect(stats.totalVolume).toBe(0n)
    expect(stats.winRate).toBe(0)
  })

  it('computes 100% win rate with all wins', () => {
    const entries = [
      makeEntry({ outcome: 'won', realizedPnl: 5_000_000n, amountInvested: 10_000_000n }),
      makeEntry({ outcome: 'won', realizedPnl: 3_000_000n, amountInvested: 10_000_000n }),
    ]
    const stats = computeTradingStats(entries)

    expect(stats.winRate).toBe(1)
    expect(stats.totalRealizedPnl).toBe(8_000_000n)
  })

  it('handles only sold-early positions correctly', () => {
    const entries = [
      makeEntry({ outcome: 'sold-early', realizedPnl: null, amountInvested: 10_000_000n }),
      makeEntry({ outcome: 'sold-early', realizedPnl: null, amountInvested: 20_000_000n }),
    ]
    const stats = computeTradingStats(entries)

    expect(stats.soldEarlyCount).toBe(2)
    expect(stats.totalRealizedPnl).toBe(0n)
    expect(stats.totalVolume).toBe(30_000_000n)
    expect(stats.winRate).toBe(0)
  })
})
