import { render, screen } from '@testing-library/react'

import type { TradingStats } from '@/hooks/use-trading-history'
import { TradingStatsBar } from './trading-stats-bar'

function makeStats(overrides: Partial<TradingStats> = {}): TradingStats {
  return {
    totalRealizedPnl: 0n,
    winCount: 0,
    lossCount: 0,
    refundCount: 0,
    soldEarlyCount: 0,
    totalVolume: 0n,
    winRate: 0,
    ...overrides,
  }
}

describe('TradingStatsBar', () => {
  it('renders positive PnL in green', () => {
    const stats = makeStats({
      totalRealizedPnl: 50_000_000n,
      winCount: 5,
      lossCount: 2,
      totalVolume: 200_000_000n,
      winRate: 5 / 7,
    })
    render(<TradingStatsBar stats={stats} />)

    expect(screen.getByTestId('stats-total-pnl')).toHaveTextContent('+$50.00')
    expect(screen.getByTestId('stats-total-pnl')).toHaveClass('text-up')
    expect(screen.getByTestId('stats-win-rate')).toHaveTextContent('71%')
    expect(screen.getByTestId('stats-total-trades')).toHaveTextContent('7')
    expect(screen.getByTestId('stats-total-volume')).toHaveTextContent('$200.00')
  })

  it('renders negative PnL in red', () => {
    const stats = makeStats({
      totalRealizedPnl: -25_000_000n,
      winCount: 1,
      lossCount: 4,
      winRate: 0.2,
    })
    render(<TradingStatsBar stats={stats} />)

    expect(screen.getByTestId('stats-total-pnl')).toHaveTextContent('-$25.00')
    expect(screen.getByTestId('stats-total-pnl')).toHaveClass('text-down')
  })

  it('renders zero PnL in muted color', () => {
    render(<TradingStatsBar stats={makeStats()} />)

    expect(screen.getByTestId('stats-total-pnl')).toHaveTextContent('$0.00')
    expect(screen.getByTestId('stats-total-pnl')).toHaveClass('text-muted-foreground')
  })

  it('counts all trade types in total', () => {
    const stats = makeStats({
      winCount: 2,
      lossCount: 3,
      refundCount: 1,
      soldEarlyCount: 1,
    })
    render(<TradingStatsBar stats={stats} />)

    expect(screen.getByTestId('stats-total-trades')).toHaveTextContent('7')
  })
})
