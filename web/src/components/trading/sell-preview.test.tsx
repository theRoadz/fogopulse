import { render, screen } from '@testing-library/react'

import type { SellReturn } from '@/lib/trade-preview'
import { SellPreview } from './sell-preview'

// Mock formatUsdcAmount — matches real implementation
jest.mock('@/hooks/use-claimable-amount', () => ({
  formatUsdcAmount: (amount: bigint) => (Number(amount) / 1_000_000).toFixed(2),
}))

function createSellReturn(overrides: Partial<SellReturn> = {}): SellReturn {
  return {
    gross: 100_000_000n,
    fee: 1_800_000n,
    net: 98_200_000n,
    feeSplit: {
      lpFee: 1_260_000n,
      treasuryFee: 360_000n,
      insuranceFee: 180_000n,
    },
    realizedPnl: -1_800_000n,
    realizedPnlPercent: -1.8,
    priceImpact: 0.3,
    ...overrides,
  }
}

describe('SellPreview', () => {
  it('renders all preview fields (gross, fee, net, PnL, price impact)', () => {
    const sellReturn = createSellReturn()

    render(
      <SellPreview
        sellReturn={sellReturn}
        shares={100_000_000n}
        entryAmount={100_000_000n}
      />
    )

    expect(screen.getByTestId('sell-preview')).toBeTruthy()
    expect(screen.getByText('Exit Preview')).toBeTruthy()
    expect(screen.getByText('Shares to sell')).toBeTruthy()
    expect(screen.getByText('Gross return')).toBeTruthy()
    expect(screen.getByText(/Fee/)).toBeTruthy()
    expect(screen.getByText('Net return')).toBeTruthy()
    expect(screen.getByText('Entry amount')).toBeTruthy()
    expect(screen.getByText('Realized PnL')).toBeTruthy()
    expect(screen.getByText('Price impact')).toBeTruthy()
  })

  it('renders positive PnL with green text', () => {
    const sellReturn = createSellReturn({
      realizedPnl: 5_000_000n,
      realizedPnlPercent: 5.0,
    })

    render(
      <SellPreview
        sellReturn={sellReturn}
        shares={100_000_000n}
        entryAmount={100_000_000n}
      />
    )

    const pnlEl = screen.getByTestId('realized-pnl')
    expect(pnlEl.className).toContain('text-green-500')
    expect(pnlEl.textContent).toContain('+')
  })

  it('renders negative PnL with red text', () => {
    const sellReturn = createSellReturn({
      realizedPnl: -5_000_000n,
      realizedPnlPercent: -5.0,
    })

    render(
      <SellPreview
        sellReturn={sellReturn}
        shares={100_000_000n}
        entryAmount={100_000_000n}
      />
    )

    const pnlEl = screen.getByTestId('realized-pnl')
    expect(pnlEl.className).toContain('text-red-500')
    expect(pnlEl.textContent).toContain('-')
  })

  it('renders zero PnL with muted text', () => {
    const sellReturn = createSellReturn({
      realizedPnl: 0n,
      realizedPnlPercent: 0,
    })

    render(
      <SellPreview
        sellReturn={sellReturn}
        shares={100_000_000n}
        entryAmount={100_000_000n}
      />
    )

    const pnlEl = screen.getByTestId('realized-pnl')
    expect(pnlEl.className).toContain('text-muted-foreground')
  })

  it('shows warning icon when price impact > 1%', () => {
    const sellReturn = createSellReturn({
      priceImpact: 2.5,
    })

    render(
      <SellPreview
        sellReturn={sellReturn}
        shares={100_000_000n}
        entryAmount={100_000_000n}
      />
    )

    expect(screen.getByTestId('price-impact-warning')).toBeTruthy()
    // Should also show warning text
    expect(screen.getByText(/High price impact/)).toBeTruthy()
  })

  it('renders fee label with tooltip trigger', () => {
    const sellReturn = createSellReturn()

    render(
      <SellPreview
        sellReturn={sellReturn}
        shares={100_000_000n}
        entryAmount={100_000_000n}
      />
    )

    // Fee label with tooltip trigger should be rendered
    expect(screen.getByText(/Fee \(1\.8%\)/)).toBeTruthy()
    // Fee amount should be displayed
    expect(screen.getByText('-1.80 USDC')).toBeTruthy()
    // Tooltip trigger (cursor-help span) should exist
    const feeTrigger = screen.getByText(/Fee \(1\.8%\)/)
    expect(feeTrigger.className).toContain('cursor-help')
  })

  it('displays shares as formatted USDC amount', () => {
    const sellReturn = createSellReturn()

    render(
      <SellPreview
        sellReturn={sellReturn}
        shares={5_000_000n}
        entryAmount={100_000_000n}
      />
    )

    // Shares should be formatted via formatUsdcAmount (5.00), not raw "5000000"
    expect(screen.getByText('5.00')).toBeTruthy()
    expect(screen.queryByText('5000000')).toBeNull()
  })

  it('does NOT show warning when price impact <= 1%', () => {
    const sellReturn = createSellReturn({
      priceImpact: 0.5,
    })

    render(
      <SellPreview
        sellReturn={sellReturn}
        shares={100_000_000n}
        entryAmount={100_000_000n}
      />
    )

    expect(screen.queryByTestId('price-impact-warning')).toBeNull()
    expect(screen.queryByText(/High price impact/)).toBeNull()
  })
})
