/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { EpochStatusDisplay } from './epoch-status-display'
import { EpochState } from '@/types/epoch'
import type { EpochUIState } from '@/types/epoch'
import type { Asset } from '@/types/assets'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
  formatUsdPrice: (price: number | null) => {
    if (price === null) return '$--,---.--'
    return `$${price.toLocaleString()}`
  },
}))

// Mock useEpoch hook
const mockEpochState: EpochUIState = {
  epoch: null,
  timeRemaining: 0,
  isFrozen: false,
  isSettling: false,
  isSettled: false,
  startPriceDisplay: null,
  priceExponent: -8,
}

const mockUseEpoch = jest.fn().mockReturnValue({
  epochState: mockEpochState,
  isLoading: false,
  error: null,
  noEpochStatus: 'no-epoch',
  refetch: jest.fn(),
})

const mockUsePythPrice = jest.fn().mockReturnValue({
  price: null,
  connectionState: 'connected',
})

const mockUseWalletConnection = jest.fn().mockReturnValue({
  connected: false,
  publicKey: null,
  connecting: false,
})

const mockUseEpochCreation = jest.fn().mockReturnValue({
  state: 'idle',
  needsEpochCreation: false,
  isCreating: false,
  error: null,
  createEpoch: jest.fn(),
  reset: jest.fn(),
})

jest.mock('@/hooks', () => ({
  useEpoch: (...args: unknown[]) => mockUseEpoch(...args),
  usePythPrice: (...args: unknown[]) => mockUsePythPrice(...args),
  useWalletConnection: () => mockUseWalletConnection(),
  useEpochCreation: (...args: unknown[]) => mockUseEpochCreation(...args),
  useLastSettledEpoch: () => ({
    lastSettledEpoch: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}))

// Mock child components
jest.mock('./epoch-countdown', () => ({
  EpochCountdown: ({ epochState }: { epochState: EpochUIState }) => (
    <div data-testid="epoch-countdown">Countdown: {epochState.timeRemaining}s</div>
  ),
}))

jest.mock('./epoch-state-badge', () => ({
  EpochStateBadge: ({ state }: { state: EpochState }) => (
    <div data-testid="epoch-state-badge">{state}</div>
  ),
}))

jest.mock('./price-to-beat', () => ({
  PriceToBeat: ({ startPrice, currentPrice }: { startPrice: number | null; currentPrice: number | null }) => (
    <div data-testid="price-to-beat">
      Start: {startPrice ?? 'null'}, Current: {currentPrice ?? 'null'}
    </div>
  ),
}))

jest.mock('./settlement-status-panel', () => ({
  SettlementStatusPanel: () => <div data-testid="settlement-status-panel" />,
}))

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  Loader2: ({ className }: { className?: string }) => <span data-testid="icon-loader" className={className} />,
  Plus: () => <span data-testid="icon-plus" />,
}))

// Mock Skeleton
jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

// Mock Button
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) => (
    <button data-testid="create-epoch-button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}))

// Mock Collapsible
jest.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('EpochStatusDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('loading state', () => {
    it('should show skeleton loader when loading', () => {
      mockUseEpoch.mockReturnValue({
        epochState: mockEpochState,
        isLoading: true,
        error: null,
        noEpochStatus: null,
        refetch: jest.fn(),
      })

      render(<EpochStatusDisplay asset={'BTC' as Asset} />)

      const skeletons = screen.getAllByTestId('skeleton')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('no epoch state', () => {
    it('should show "No active epoch" when no epoch exists', () => {
      mockUseEpoch.mockReturnValue({
        epochState: mockEpochState,
        isLoading: false,
        error: null,
        noEpochStatus: 'no-epoch',
        refetch: jest.fn(),
      })

      render(<EpochStatusDisplay asset={'BTC' as Asset} />)

      expect(screen.getByText('No active epoch')).toBeInTheDocument()
    })

    it('should show "Pool not initialized" for no-pool status', () => {
      mockUseEpoch.mockReturnValue({
        epochState: mockEpochState,
        isLoading: false,
        error: null,
        noEpochStatus: 'no-pool',
        refetch: jest.fn(),
      })

      render(<EpochStatusDisplay asset={'BTC' as Asset} />)

      expect(screen.getByText('Pool not initialized')).toBeInTheDocument()
    })

    it('should show "Next epoch starting soon..." for next-epoch-soon status', () => {
      mockUseEpoch.mockReturnValue({
        epochState: mockEpochState,
        isLoading: false,
        error: null,
        noEpochStatus: 'next-epoch-soon',
        refetch: jest.fn(),
      })

      render(<EpochStatusDisplay asset={'BTC' as Asset} />)

      expect(screen.getByText('Next epoch starting soon...')).toBeInTheDocument()
    })
  })

  describe('active epoch state', () => {
    const activeEpochState: EpochUIState = {
      epoch: {
        pool: {} as never, // Mock PublicKey
        epochId: BigInt(1),
        state: EpochState.Open,
        startTime: 1000,
        endTime: 1300,
        freezeTime: 1285,
        startPrice: BigInt(9500000000000),
        startConfidence: BigInt(1000000),
        startPublishTime: 995,
        settlementPrice: null,
        settlementConfidence: null,
        settlementPublishTime: null,
        outcome: null,
        yesTotalAtSettlement: null,
        noTotalAtSettlement: null,
        bump: 255,
      },
      timeRemaining: 240,
      isFrozen: false,
      isSettling: false,
      isSettled: false,
      startPriceDisplay: 95000,
      priceExponent: -8,
    }

    it('should render all sub-components when epoch is active', () => {
      mockUseEpoch.mockReturnValue({
        epochState: activeEpochState,
        isLoading: false,
        error: null,
        noEpochStatus: null,
        refetch: jest.fn(),
      })

      mockUsePythPrice.mockReturnValue({
        price: { price: 95500 },
        connectionState: 'connected',
      })

      render(<EpochStatusDisplay asset={'BTC' as Asset} />)

      expect(screen.getByTestId('epoch-state-badge')).toBeInTheDocument()
      expect(screen.getByTestId('price-to-beat')).toBeInTheDocument()
      expect(screen.getByTestId('epoch-countdown')).toBeInTheDocument()
    })

    it('should pass correct props to PriceToBeat', () => {
      mockUseEpoch.mockReturnValue({
        epochState: activeEpochState,
        isLoading: false,
        error: null,
        noEpochStatus: null,
        refetch: jest.fn(),
      })

      mockUsePythPrice.mockReturnValue({
        price: { price: 95500 },
        connectionState: 'connected',
      })

      render(<EpochStatusDisplay asset={'BTC' as Asset} />)

      const priceToBeat = screen.getByTestId('price-to-beat')
      expect(priceToBeat).toHaveTextContent('Start: 95000')
      expect(priceToBeat).toHaveTextContent('Current: 95500')
    })

    it('should pass correct epoch state to countdown', () => {
      mockUseEpoch.mockReturnValue({
        epochState: activeEpochState,
        isLoading: false,
        error: null,
        noEpochStatus: null,
        refetch: jest.fn(),
      })

      render(<EpochStatusDisplay asset={'BTC' as Asset} />)

      const countdown = screen.getByTestId('epoch-countdown')
      expect(countdown).toHaveTextContent('Countdown: 240s')
    })
  })

  describe('styling', () => {
    it('should apply custom className', () => {
      mockUseEpoch.mockReturnValue({
        epochState: mockEpochState,
        isLoading: false,
        error: null,
        noEpochStatus: 'no-epoch',
        refetch: jest.fn(),
      })

      const { container } = render(
        <EpochStatusDisplay asset={'BTC' as Asset} className="custom-class" />
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })
  })
})
