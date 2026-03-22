/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'

import { SettlementHistoryList } from './settlement-history-list'
import { EpochState, Outcome } from '@/types/epoch'
import type { LastSettledEpochData } from '@/lib/epoch-utils'
import type { EpochData } from '@/types/epoch'

// Mock utils
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
  formatUsdPrice: (price: number) => `$${price.toFixed(2)}`,
}))

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
}))

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

// Mock lucide-react
jest.mock('lucide-react', () => ({
  History: () => <span data-testid="history-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  ChevronDown: () => <span />,
  ChevronRight: () => <span />,
  ArrowUp: () => <span />,
  ArrowDown: () => <span />,
  Check: () => <span />,
  RefreshCw: () => <span />,
}))

// Mock hooks
const mockUseSettlementHistory = jest.fn()
const mockUseUserPositionsBatch = jest.fn()
const mockUseWalletConnection = jest.fn()

jest.mock('@/hooks/use-settlement-history', () => ({
  useSettlementHistory: (...args: unknown[]) => mockUseSettlementHistory(...args),
}))

jest.mock('@/hooks/use-user-positions-batch', () => ({
  useUserPositionsBatch: (...args: unknown[]) => mockUseUserPositionsBatch(...args),
  positionKey: (epochKey: string, direction: string) => `${epochKey}-${direction}`,
}))

jest.mock('@/hooks', () => ({
  useWalletConnection: () => mockUseWalletConnection(),
}))

// Mock SettlementHistoryRow
jest.mock('./settlement-history-row', () => ({
  SettlementHistoryRow: ({ settlement }: { settlement: LastSettledEpochData }) => (
    <div data-testid="settlement-history-row">Epoch #{settlement.epochId.toString()}</div>
  ),
}))

// Mock use-claimable-amount
jest.mock('@/hooks/use-claimable-amount', () => ({
  getClaimState: jest.fn(() => ({ type: 'lost' })),
  formatUsdcAmount: (amount: bigint) => (Number(amount) / 1_000_000).toFixed(2),
}))

const poolPda = new PublicKey('11111111111111111111111111111111')

function createMockSettlement(epochId: number): LastSettledEpochData {
  const rawEpochData: EpochData = {
    pool: poolPda,
    epochId: BigInt(epochId),
    state: EpochState.Settled,
    startTime: 1710496500,
    endTime: 1710497400,
    freezeTime: 1710497385,
    startPrice: BigInt(6917398000000),
    startConfidence: BigInt(4847879),
    startPublishTime: 1710496800,
    settlementPrice: BigInt(6918012000000),
    settlementConfidence: BigInt(3458947),
    settlementPublishTime: 1710497100,
    outcome: Outcome.Up,
    yesTotalAtSettlement: BigInt(100000000),
    noTotalAtSettlement: BigInt(50000000),
    bump: 255,
  }

  return {
    epochId: BigInt(epochId),
    epochPda: PublicKey.default,
    state: EpochState.Settled,
    outcome: Outcome.Up,
    startPrice: 69173.98,
    startConfidencePercent: '0.0701%',
    startPublishTime: 1710496800,
    settlementPrice: 69180.12,
    settlementConfidencePercent: '0.0500%',
    settlementPublishTime: 1710497100,
    priceDelta: 6.14,
    priceDeltaPercent: '+0.01%',
    startConfidenceRaw: BigInt(4847879),
    settlementConfidenceRaw: BigInt(3458947),
    yesTotalAtSettlement: BigInt(100000000),
    noTotalAtSettlement: BigInt(50000000),
    rawEpochData,
  }
}

describe('SettlementHistoryList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseWalletConnection.mockReturnValue({ connected: false })
    mockUseUserPositionsBatch.mockReturnValue({ positions: new Map(), isLoading: false, error: null })
  })

  describe('loading state', () => {
    it('should show skeleton loading state', () => {
      mockUseSettlementHistory.mockReturnValue({
        history: [],
        isLoading: true,
        error: null,
        hasMore: false,
        fetchMore: jest.fn(),
        isFetchingMore: false,
      })

      render(<SettlementHistoryList asset="BTC" />)

      expect(screen.getByTestId('settlement-history-skeleton')).toBeInTheDocument()
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('empty state', () => {
    it('should show empty state message when no history', () => {
      mockUseSettlementHistory.mockReturnValue({
        history: [],
        isLoading: false,
        error: null,
        hasMore: false,
        fetchMore: jest.fn(),
        isFetchingMore: false,
      })

      render(<SettlementHistoryList asset="BTC" />)

      expect(screen.getByText('No settlement history yet')).toBeInTheDocument()
    })
  })

  describe('populated state', () => {
    it('should render rows for each settlement', () => {
      mockUseSettlementHistory.mockReturnValue({
        history: [createMockSettlement(42), createMockSettlement(41), createMockSettlement(40)],
        isLoading: false,
        error: null,
        hasMore: false,
        fetchMore: jest.fn(),
        isFetchingMore: false,
      })

      render(<SettlementHistoryList asset="BTC" />)

      const rows = screen.getAllByTestId('settlement-history-row')
      expect(rows).toHaveLength(3)
      expect(rows[0]).toHaveTextContent('Epoch #42')
      expect(rows[1]).toHaveTextContent('Epoch #41')
      expect(rows[2]).toHaveTextContent('Epoch #40')
    })

  })

  describe('load more', () => {
    it('should show load more button when hasMore is true', () => {
      mockUseSettlementHistory.mockReturnValue({
        history: [createMockSettlement(42)],
        isLoading: false,
        error: null,
        hasMore: true,
        fetchMore: jest.fn(),
        isFetchingMore: false,
      })

      render(<SettlementHistoryList asset="BTC" />)

      expect(screen.getByTestId('load-more-button')).toBeInTheDocument()
      expect(screen.getByText('Load more')).toBeInTheDocument()
    })

    it('should not show load more button when hasMore is false', () => {
      mockUseSettlementHistory.mockReturnValue({
        history: [createMockSettlement(42)],
        isLoading: false,
        error: null,
        hasMore: false,
        fetchMore: jest.fn(),
        isFetchingMore: false,
      })

      render(<SettlementHistoryList asset="BTC" />)

      expect(screen.queryByTestId('load-more-button')).not.toBeInTheDocument()
    })

    it('should call fetchMore when load more button is clicked', () => {
      const fetchMore = jest.fn()
      mockUseSettlementHistory.mockReturnValue({
        history: [createMockSettlement(42)],
        isLoading: false,
        error: null,
        hasMore: true,
        fetchMore,
        isFetchingMore: false,
      })

      render(<SettlementHistoryList asset="BTC" />)

      fireEvent.click(screen.getByTestId('load-more-button'))
      expect(fetchMore).toHaveBeenCalledTimes(1)
    })

    it('should show loading state on load more button when fetching more', () => {
      mockUseSettlementHistory.mockReturnValue({
        history: [createMockSettlement(42)],
        isLoading: false,
        error: null,
        hasMore: true,
        fetchMore: jest.fn(),
        isFetchingMore: true,
      })

      render(<SettlementHistoryList asset="BTC" />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })


  it('should have data-testid attribute', () => {
    mockUseSettlementHistory.mockReturnValue({
      history: [],
      isLoading: false,
      error: null,
      hasMore: false,
      fetchMore: jest.fn(),
      isFetchingMore: false,
    })

    render(<SettlementHistoryList asset="BTC" />)

    expect(screen.getByTestId('settlement-history-list')).toBeInTheDocument()
  })
})
