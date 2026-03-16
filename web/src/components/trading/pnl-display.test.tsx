import { render, screen } from '@testing-library/react'

import { PnLDisplay } from './pnl-display'

describe('PnLDisplay', () => {
  it('renders positive PnL with green text and + prefix', () => {
    // UP position, yesReserves > noReserves → favorable
    // currentValue = 100 * 600 / 400 = 150, pnl = +50
    const { container } = render(
      <PnLDisplay
        shares={100_000_000n}
        entryAmount={100_000_000n}
        direction="up"
        yesReserves={600_000_000n}
        noReserves={400_000_000n}
      />
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('text-green-500')
    expect(el.textContent).toContain('+')
    expect(el.textContent).toContain('USDC')
  })

  it('renders negative PnL with red text and - prefix (no double negative)', () => {
    // UP position, yesReserves < noReserves → unfavorable
    // currentValue = 100 * 400 / 600 = 66.666666, pnl = -33.333334
    // pnlPercent = -33.33...
    const { container } = render(
      <PnLDisplay
        shares={100_000_000n}
        entryAmount={100_000_000n}
        direction="up"
        yesReserves={400_000_000n}
        noReserves={600_000_000n}
      />
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('text-red-500')
    expect(el.textContent).toContain('-')
    // Verify no double negative on percentage (should be "-33.3%", not "--33.3%")
    expect(el.textContent).not.toContain('--')
    expect(el.textContent).toContain('(-33.3%)')
  })

  it('renders zero PnL with muted text', () => {
    // Balanced pool → PnL = 0
    const { container } = render(
      <PnLDisplay
        shares={100_000_000n}
        entryAmount={100_000_000n}
        direction="up"
        yesReserves={500_000_000n}
        noReserves={500_000_000n}
      />
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('text-muted-foreground')
  })

  it('renders nothing when shares is 0n (fully sold)', () => {
    const { container } = render(
      <PnLDisplay
        shares={0n}
        entryAmount={100_000_000n}
        direction="up"
        yesReserves={500_000_000n}
        noReserves={500_000_000n}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('formats USDC amount correctly (420000 lamports → "0.42")', () => {
    // Set up so pnlAmount = 420_000n
    // shares=100, entry=99.58 USDC, balanced pool
    // currentValue = 100 * 500 / 500 = 100 USDC = 100_000_000n
    // pnlAmount = 100_000_000 - 99_580_000 = 420_000
    const { container } = render(
      <PnLDisplay
        shares={100_000_000n}
        entryAmount={99_580_000n}
        direction="up"
        yesReserves={500_000_000n}
        noReserves={500_000_000n}
      />
    )
    const el = container.firstChild as HTMLElement
    expect(el.textContent).toContain('0.42')
  })

  it('displays PnL percentage', () => {
    // currentValue = 100 * 600 / 400 = 150, entry = 100
    // pnlPercent = 50%
    const { container } = render(
      <PnLDisplay
        shares={100_000_000n}
        entryAmount={100_000_000n}
        direction="up"
        yesReserves={600_000_000n}
        noReserves={400_000_000n}
      />
    )
    const el = container.firstChild as HTMLElement
    expect(el.textContent).toContain('50.0%')
  })
})
