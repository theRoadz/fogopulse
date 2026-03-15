/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'

import { SettlementStatusPanel } from './settlement-status-panel'
import { Outcome } from '@/types/epoch'
import type { SettlementDisplayData } from '@/hooks/use-settlement-display'

// Mock the useSettlementDisplay hook
const mockSettlementData: SettlementDisplayData = {
  isSettled: true,
  outcome: Outcome.Up,
  startPrice: 69173.98,
  startPriceRaw: BigInt(6917398000000),
  startConfidenceRaw: BigInt(4847879),
  startConfidence: 48.47879,
  startConfidencePercent: '0.0701%',
  startPublishTime: 1710496800, // Mar 15, 2024 10:00:00 AM UTC
  settlementPrice: 69180.12,
  settlementPriceRaw: BigInt(6918012000000),
  settlementConfidenceRaw: BigInt(3458947),
  settlementConfidence: 34.58947,
  settlementConfidencePercent: '0.0500%',
  settlementPublishTime: 1710497100, // Mar 15, 2024 10:05:00 AM UTC
  priceDelta: 6.14,
  priceDeltaPercent: '+0.01%',
  epochPda: new PublicKey('11111111111111111111111111111111'),
  epochId: BigInt(5),
}

let mockUseSettlementDisplay = jest.fn()

jest.mock('@/hooks/use-settlement-display', () => ({
  useSettlementDisplay: (asset: string) => mockUseSettlementDisplay(asset),
}))

// Mock utils
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
  formatUsdPrice: (price: number) => `$${price.toFixed(2)}`,
  formatSettlementTime: (timestamp: number) => new Date(timestamp * 1000).toLocaleString(),
}))

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className, ...props }: React.ComponentProps<'div'>) => (
    <div data-testid="card" className={className} {...props}>
      {children}
    </div>
  ),
  CardHeader: ({ children, className }: React.ComponentProps<'div'>) => (
    <div data-testid="card-header" className={className}>
      {children}
    </div>
  ),
  CardTitle: ({ children, className }: React.ComponentProps<'h3'>) => (
    <h3 data-testid="card-title" className={className}>
      {children}
    </h3>
  ),
  CardContent: ({ children, className }: React.ComponentProps<'div'>) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: React.ComponentProps<'button'>) => (
    <button data-testid="button" onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

// Mock lucide-react
jest.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon" />,
  Check: () => <span data-testid="check-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  Copy: () => <span data-testid="copy-icon" />,
  ExternalLink: () => <span data-testid="external-link-icon" />,
  ChevronDown: () => <span data-testid="chevron-down-icon" />,
  ChevronUp: () => <span data-testid="chevron-up-icon" />,
}))

// Mock child components
jest.mock('./outcome-badge', () => ({
  OutcomeBadge: ({ outcome, priceDeltaText }: { outcome: Outcome; priceDeltaText?: string }) => (
    <div data-testid="outcome-badge" data-outcome={outcome}>
      {outcome} {priceDeltaText && <span data-testid="price-delta">{priceDeltaText}</span>}
    </div>
  ),
}))

jest.mock('./refund-explanation', () => ({
  RefundExplanation: () => <div data-testid="refund-explanation">Why explanation</div>,
}))

jest.mock('./verification-links', () => ({
  VerificationLinks: ({ epochPda }: { epochPda: PublicKey }) => (
    <div data-testid="verification-links">{epochPda.toBase58()}</div>
  ),
}))

describe('SettlementStatusPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseSettlementDisplay.mockReturnValue(mockSettlementData)
  })

  describe('rendering for UP outcome', () => {
    it('should render settlement details for UP outcome', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      expect(screen.getByText('Settlement Details')).toBeInTheDocument()
      expect(screen.getByText('Start Price')).toBeInTheDocument()
      expect(screen.getByText('Settlement Price')).toBeInTheDocument()
      expect(screen.getByTestId('outcome-badge')).toHaveAttribute('data-outcome', Outcome.Up)
    })

    it('should display start price information', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      expect(screen.getByText('$69173.98')).toBeInTheDocument()
      expect(screen.getByText('Confidence: 0.0701%')).toBeInTheDocument()
    })

    it('should display settlement price information', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      expect(screen.getByText('$69180.12')).toBeInTheDocument()
      expect(screen.getByText('Confidence: 0.0500%')).toBeInTheDocument()
    })

    it('should show price delta text on badge', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      expect(screen.getByTestId('price-delta')).toHaveTextContent('+$6.14 / +0.01%')
    })

    it('should render verification links', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      expect(screen.getByTestId('verification-links')).toBeInTheDocument()
    })
  })

  describe('rendering for DOWN outcome', () => {
    beforeEach(() => {
      mockUseSettlementDisplay.mockReturnValue({
        ...mockSettlementData,
        outcome: Outcome.Down,
        priceDelta: -6.14,
        priceDeltaPercent: '-0.01%',
      })
    })

    it('should render settlement details for DOWN outcome', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      expect(screen.getByTestId('outcome-badge')).toHaveAttribute('data-outcome', Outcome.Down)
    })
  })

  describe('rendering for REFUNDED outcome', () => {
    beforeEach(() => {
      mockUseSettlementDisplay.mockReturnValue({
        ...mockSettlementData,
        outcome: Outcome.Refunded,
        priceDelta: 0.14,
        priceDeltaPercent: '+0.00%',
      })
    })

    it('should render settlement details for REFUNDED outcome', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      expect(screen.getByTestId('outcome-badge')).toHaveAttribute('data-outcome', Outcome.Refunded)
    })

    it('should show refund explanation for refunded epochs', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      expect(screen.getByTestId('refund-explanation')).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('should render skeleton when data is null', () => {
      mockUseSettlementDisplay.mockReturnValue(null)

      render(<SettlementStatusPanel asset="BTC" />)

      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('not settled state', () => {
    it('should render nothing when epoch is not settled', () => {
      mockUseSettlementDisplay.mockReturnValue({
        ...mockSettlementData,
        isSettled: false,
        outcome: null,
      })

      const { container } = render(<SettlementStatusPanel asset="BTC" />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('close button', () => {
    it('should render close button when onClose is provided', () => {
      const onClose = jest.fn()
      render(<SettlementStatusPanel asset="BTC" onClose={onClose} />)

      const closeButton = screen.getByLabelText('Close settlement details')
      expect(closeButton).toBeInTheDocument()
    })

    it('should call onClose when close button is clicked', () => {
      const onClose = jest.fn()
      render(<SettlementStatusPanel asset="BTC" onClose={onClose} />)

      const closeButton = screen.getByLabelText('Close settlement details')
      fireEvent.click(closeButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should not render close button when onClose is not provided', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      expect(screen.queryByLabelText('Close settlement details')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('should have proper region role and aria-label', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      const card = screen.getByRole('region')
      expect(card).toHaveAttribute('aria-label', 'Settlement Details')
    })

    it('should have aria-live for outcome announcement', () => {
      render(<SettlementStatusPanel asset="BTC" />)

      const liveRegion = screen.getByTestId('outcome-badge').closest('[aria-live]')
      expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    })
  })
})
