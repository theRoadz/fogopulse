/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { BalanceDisplay } from './balance-display'

// Mock shadcn Skeleton component
jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  CircleDollarSign: ({ className }: { className?: string }) => (
    <svg data-testid="usdc-icon" className={className} />
  ),
}))

describe('BalanceDisplay', () => {
  describe('when wallet is connected', () => {
    it('should display formatted balance with USDC label', () => {
      render(
        <BalanceDisplay
          formattedBalance="100.00"
          isLoading={false}
          isConnected={true}
        />
      )

      expect(screen.getByText('Balance:')).toBeInTheDocument()
      expect(screen.getByText(/\$100\.00/)).toBeInTheDocument()
      expect(screen.getByText('USDC')).toBeInTheDocument()
    })

    it('should display zero balance correctly', () => {
      render(
        <BalanceDisplay
          formattedBalance="0.00"
          isLoading={false}
          isConnected={true}
        />
      )

      expect(screen.getByText(/\$0\.00/)).toBeInTheDocument()
    })

    it('should display large balance with formatting', () => {
      render(
        <BalanceDisplay
          formattedBalance="12,345.67"
          isLoading={false}
          isConnected={true}
        />
      )

      expect(screen.getByText(/\$12,345\.67/)).toBeInTheDocument()
    })

    it('should fallback to 0.00 when formattedBalance is null', () => {
      render(
        <BalanceDisplay
          formattedBalance={null}
          isLoading={false}
          isConnected={true}
        />
      )

      expect(screen.getByText(/\$0\.00/)).toBeInTheDocument()
    })
  })

  describe('when wallet is disconnected', () => {
    it('should show connect wallet message', () => {
      render(
        <BalanceDisplay
          formattedBalance={null}
          isLoading={false}
          isConnected={false}
        />
      )

      expect(screen.getByText('Connect wallet to see balance')).toBeInTheDocument()
    })

    it('should not show balance when disconnected', () => {
      render(
        <BalanceDisplay
          formattedBalance={null}
          isLoading={false}
          isConnected={false}
        />
      )

      expect(screen.queryByText('Balance:')).not.toBeInTheDocument()
      expect(screen.queryByText('USDC')).not.toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('should show loading skeleton when loading', () => {
      render(
        <BalanceDisplay
          formattedBalance={null}
          isLoading={true}
          isConnected={true}
        />
      )

      expect(screen.getByText('Balance:')).toBeInTheDocument()
      expect(screen.getByTestId('skeleton')).toBeInTheDocument()
    })

    it('should not show balance value when loading', () => {
      render(
        <BalanceDisplay
          formattedBalance="100.00"
          isLoading={true}
          isConnected={true}
        />
      )

      expect(screen.queryByText('$100.00')).not.toBeInTheDocument()
      expect(screen.getByTestId('skeleton')).toBeInTheDocument()
    })
  })

  describe('USDC icon/label', () => {
    it('should display USDC icon', () => {
      render(
        <BalanceDisplay
          formattedBalance="50.00"
          isLoading={false}
          isConnected={true}
        />
      )

      // Should have USDC icon
      expect(screen.getByTestId('usdc-icon')).toBeInTheDocument()
    })

    it('should display USDC text label', () => {
      render(
        <BalanceDisplay
          formattedBalance="50.00"
          isLoading={false}
          isConnected={true}
        />
      )

      // Should have USDC text label
      expect(screen.getByText('USDC')).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('should apply monospace font to balance value', () => {
      render(
        <BalanceDisplay
          formattedBalance="100.00"
          isLoading={false}
          isConnected={true}
        />
      )

      const balanceContainer = screen.getByText(/\$100\.00/).closest('span')
      expect(balanceContainer?.className).toContain('font-mono')
    })
  })
})
