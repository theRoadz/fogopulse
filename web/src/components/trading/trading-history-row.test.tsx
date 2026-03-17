import { render, screen } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'

import { EpochState, Outcome } from '@/types/epoch'
import type { EpochData } from '@/types/epoch'
import type { LastSettledEpochData } from '@/lib/epoch-utils'
import type { UserPositionData } from '@/hooks/use-user-position'
import type { TradingHistoryEntry, TradeOutcome } from '@/hooks/use-trading-history'

import { TradingHistoryRow } from './trading-history-row'

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
    yesTotalAtSettlement: 100_000_000n,
    noTotalAtSettlement: 80_000_000n,
    bump: 255,
    ...overrides,
  }
}

function makeSettlement(overrides: Partial<LastSettledEpochData> = {}): LastSettledEpochData {
  const raw = makeEpochData()
  return {
    epochId: 1n,
    epochPda: dummyPubkey,
    state: EpochState.Settled,
    outcome: Outcome.Up,
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
    yesTotalAtSettlement: 100_000_000n,
    noTotalAtSettlement: 80_000_000n,
    rawEpochData: raw,
    ...overrides,
  }
}

function makePosition(overrides: Partial<UserPositionData> = {}): UserPositionData {
  return {
    user: dummyPubkey,
    epoch: dummyPubkey,
    direction: 'up',
    amount: 10_000_000n,
    shares: 10_000_000n,
    entryPrice: 1_000_000n,
    claimed: false,
    bump: 255,
    ...overrides,
  }
}

function makeEntry(overrides: Partial<TradingHistoryEntry> = {}): TradingHistoryEntry {
  return {
    asset: 'BTC',
    epochId: 1n,
    epochPda: dummyPubkey,
    direction: 'up',
    amountInvested: 10_000_000n,
    outcome: 'won',
    realizedPnl: 8_000_000n,
    payoutAmount: 18_000_000n,
    settlementTime: Math.floor(Date.now() / 1000) - 60, // 1 min ago
    settlement: makeSettlement(),
    position: makePosition(),
    ...overrides,
  }
}

describe('TradingHistoryRow', () => {
  it('renders a winning trade with green PnL', () => {
    render(<TradingHistoryRow entry={makeEntry()} />)

    expect(screen.getByTestId('trade-asset')).toHaveTextContent('BTC')
    expect(screen.getByTestId('trade-amount')).toHaveTextContent('$10.00')
    expect(screen.getByTestId('trade-outcome')).toHaveTextContent('WON')
    expect(screen.getByTestId('trade-pnl')).toHaveTextContent('+$8.00')
    expect(screen.getByTestId('trade-pnl')).toHaveClass('text-up')
  })

  it('renders a losing trade with red PnL', () => {
    const entry = makeEntry({
      outcome: 'lost',
      realizedPnl: -10_000_000n,
      payoutAmount: null,
      direction: 'down',
    })
    render(<TradingHistoryRow entry={entry} />)

    expect(screen.getByTestId('trade-outcome')).toHaveTextContent('LOST')
    expect(screen.getByTestId('trade-pnl')).toHaveTextContent('-$10.00')
    expect(screen.getByTestId('trade-pnl')).toHaveClass('text-down')
  })

  it('renders a refunded trade with $0.00 PnL', () => {
    const entry = makeEntry({
      outcome: 'refund',
      realizedPnl: 0n,
      payoutAmount: 10_000_000n,
    })
    render(<TradingHistoryRow entry={entry} />)

    expect(screen.getByTestId('trade-outcome')).toHaveTextContent('REFUNDED')
    expect(screen.getByTestId('trade-pnl')).toHaveTextContent('$0.00')
    expect(screen.getByTestId('trade-pnl')).toHaveClass('text-muted-foreground')
  })

  it('renders a sold-early trade with dash PnL', () => {
    const entry = makeEntry({
      outcome: 'sold-early',
      realizedPnl: null,
      payoutAmount: null,
      amountInvested: 0n,
    })
    render(<TradingHistoryRow entry={entry} />)

    expect(screen.getByTestId('trade-outcome')).toHaveTextContent('SOLD EARLY')
    expect(screen.getByTestId('trade-pnl')).toHaveTextContent('—')
    expect(screen.getByTestId('trade-pnl')).toHaveClass('text-muted-foreground')
  })

  it('renders time ago correctly', () => {
    render(<TradingHistoryRow entry={makeEntry()} />)
    expect(screen.getByTestId('trade-time')).toHaveTextContent('1m ago')
  })
})
