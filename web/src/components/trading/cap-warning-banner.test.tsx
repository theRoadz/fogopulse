/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { CapWarningBanner } from './cap-warning-banner'
import type { CapStatus } from '@/lib/cap-utils'

// Mock formatUsdcAmount
jest.mock('@/hooks/use-claimable-amount', () => ({
  formatUsdcAmount: (amount: bigint) => (Number(amount) / 1_000_000).toFixed(2),
}))

function createCapStatus(overrides: Partial<CapStatus> = {}): CapStatus {
  return {
    walletCap: {
      level: 'ok',
      remainingLamports: 40_000_000n,
      maxAllowedLamports: 50_000_000n,
      usedPercent: 20,
      label: 'wallet',
    },
    sideCap: {
      level: 'ok',
      remainingLamports: 140_000_000n,
      maxAllowedLamports: 650_000_000n,
      usedPercent: 78,
      label: 'side',
    },
    mostRestrictive: 'wallet',
    hasWarning: false,
    hasError: false,
    ...overrides,
  }
}

describe('CapWarningBanner', () => {
  it('renders nothing when no warnings', () => {
    const { container } = render(
      <CapWarningBanner capStatus={createCapStatus()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows wallet cap warning banner', () => {
    const status = createCapStatus({
      walletCap: {
        level: 'warning',
        remainingLamports: 5_000_000n,
        maxAllowedLamports: 50_000_000n,
        usedPercent: 90,
        label: 'wallet',
      },
      hasWarning: true,
    })

    render(<CapWarningBanner capStatus={status} />)
    expect(screen.getByText(/approaching per-wallet cap/i)).toBeInTheDocument()
    expect(screen.getByText(/5\.00 USDC remaining/i)).toBeInTheDocument()
  })

  it('shows side cap warning banner', () => {
    const status = createCapStatus({
      sideCap: {
        level: 'warning',
        remainingLamports: 10_000_000n,
        maxAllowedLamports: 650_000_000n,
        usedPercent: 98,
        label: 'side',
      },
      hasWarning: true,
    })

    render(<CapWarningBanner capStatus={status} />)
    expect(screen.getByText(/approaching per-side cap/i)).toBeInTheDocument()
    expect(screen.getByText(/10\.00 USDC remaining/i)).toBeInTheDocument()
  })

  it('shows wallet cap exceeded error', () => {
    const status = createCapStatus({
      walletCap: {
        level: 'exceeded',
        remainingLamports: 0n,
        maxAllowedLamports: 50_000_000n,
        usedPercent: 110,
        label: 'wallet',
      },
      hasWarning: true,
      hasError: true,
    })

    render(<CapWarningBanner capStatus={status} />)
    expect(screen.getByText(/trade exceeds per-wallet cap/i)).toBeInTheDocument()
  })

  it('shows side cap exceeded error', () => {
    const status = createCapStatus({
      sideCap: {
        level: 'exceeded',
        remainingLamports: 0n,
        maxAllowedLamports: 650_000_000n,
        usedPercent: 105,
        label: 'side',
      },
      hasWarning: true,
      hasError: true,
    })

    render(<CapWarningBanner capStatus={status} />)
    expect(screen.getByText(/trade exceeds per-side cap/i)).toBeInTheDocument()
  })

  it('shows both warnings when both caps triggered', () => {
    const status = createCapStatus({
      walletCap: {
        level: 'warning',
        remainingLamports: 3_000_000n,
        maxAllowedLamports: 50_000_000n,
        usedPercent: 94,
        label: 'wallet',
      },
      sideCap: {
        level: 'warning',
        remainingLamports: 8_000_000n,
        maxAllowedLamports: 650_000_000n,
        usedPercent: 98,
        label: 'side',
      },
      mostRestrictive: 'wallet',
      hasWarning: true,
    })

    render(<CapWarningBanner capStatus={status} />)
    expect(screen.getByText(/approaching per-wallet cap/i)).toBeInTheDocument()
    expect(screen.getByText(/approaching per-side cap/i)).toBeInTheDocument()
  })

  it('highlights most restrictive cap when both shown', () => {
    const status = createCapStatus({
      walletCap: {
        level: 'exceeded',
        remainingLamports: 0n,
        maxAllowedLamports: 50_000_000n,
        usedPercent: 110,
        label: 'wallet',
      },
      sideCap: {
        level: 'warning',
        remainingLamports: 8_000_000n,
        maxAllowedLamports: 650_000_000n,
        usedPercent: 98,
        label: 'side',
      },
      mostRestrictive: 'wallet',
      hasWarning: true,
      hasError: true,
    })

    render(<CapWarningBanner capStatus={status} />)

    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(2)

    // First alert (wallet) should have ring highlight
    expect(alerts[0]).toHaveClass('ring-1')
  })

  it('shows remaining capacity in USDC', () => {
    const status = createCapStatus({
      walletCap: {
        level: 'warning',
        remainingLamports: 12_340_000n,
        maxAllowedLamports: 50_000_000n,
        usedPercent: 75,
        label: 'wallet',
      },
      hasWarning: true,
    })

    render(<CapWarningBanner capStatus={status} />)
    expect(screen.getByText(/12\.34 USDC remaining/i)).toBeInTheDocument()
  })
})
