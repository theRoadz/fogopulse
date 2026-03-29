/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'

import { TradingHistoryList } from './trading-history-list'
import { EpochState, Outcome } from '@/types/epoch'
import type { EpochData } from '@/types/epoch'
import type { LastSettledEpochData } from '@/lib/epoch-utils'
import type { UserPositionData } from '@/hooks/use-user-position'
import type { TradingHistoryEntry, TradingStats } from '@/hooks/use-trading-history'

// Mock utils
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className, ...props }: React.ComponentProps<'div'>) => (
    <div className={className} {...props}>{children}</div>
  ),
  CardContent: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
}))

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, ...props }: React.ComponentProps<'span'>) => (
    <span className={className} {...props}>{children}</span>
  ),
}))

jest.mock('lucide-react', () => ({
  History: () => <span data-testid="history-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  ArrowUp: () => <span data-testid="arrow-up" />,
  ArrowDown: () => <span data-testid="arrow-down" />,
}))

// Mock hooks
const mockUseTradingHistory = jest.fn()
const mockUseWalletConnection = jest.fn()

jest.mock('@/hooks/use-trading-history', () => ({
  useTradingHistory: (...args: unknown[]) => mockUseTradingHistory(...args),
}))

jest.mock('@/hooks', () => ({
  useWalletConnection: () => mockUseWalletConnection(),
}))

jest.mock('@/components/wallet/wallet-button', () => ({
  WalletButton: () => <button data-testid="wallet-button">Connect Wallet</button>,
}))

jest.mock('@/hooks/use-claimable-amount', () => ({
  formatUsdcAmount: (amount: bigint) => (Number(amount) / 1_000_000).toFixed(2),
}))

jest.mock('@/lib/constants', () => ({
  ASSET_METADATA: {
    BTC: { label: 'BTC', color: 'text-orange-500' },
    ETH: { label: 'ETH', color: 'text-blue-500' },
    SOL: { label: 'SOL', color: 'text-purple-500' },
    FOGO: { label: 'FOGO', color: 'text-primary' },
  },
}))

// Helpers
const dummyPubkey = PublicKey.default

function makeEntry(overrides: Partial<TradingHistoryEntry> = {}): TradingHistoryEntry {
  const rawEpochData: EpochData = {
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
  }
  const settlement: LastSettledEpochData = {
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
    rawEpochData,
  }
  const position: UserPositionData = {
    user: dummyPubkey,
    epoch: dummyPubkey,
    direction: 'up',
    amount: 10_000_000n,
    shares: 10_000_000n,
    entryPrice: 1_000_000n,
    claimed: false,
    bump: 255,
  }
  return {
    asset: 'BTC',
    epochId: 1n,
    epochPda: dummyPubkey,
    direction: 'up',
    amountInvested: 10_000_000n,
    outcome: 'won',
    realizedPnl: 8_000_000n,
    payoutAmount: 18_000_000n,
    settlementTime: Math.floor(Date.now() / 1000) - 60,
    settlement,
    position,
    ...overrides,
  }
}

const defaultStats: TradingStats = {
  totalRealizedPnl: 0n,
  winCount: 0,
  lossCount: 0,
  refundCount: 0,
  soldEarlyCount: 0,
  totalVolume: 0n,
  winRate: 0,
}

describe('TradingHistoryList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows wallet-not-connected state', () => {
    mockUseWalletConnection.mockReturnValue({ connected: false })
    mockUseTradingHistory.mockReturnValue({
      history: [],
      stats: defaultStats,
      isLoading: false,
      hasMore: false,
      fetchMore: jest.fn(),
      isFetchingMore: false,
    })

    render(<TradingHistoryList assetFilter="BTC" />)

    expect(screen.getByText('Connect wallet to view your trading history')).toBeInTheDocument()
    expect(screen.getByTestId('wallet-button')).toBeInTheDocument()
  })

  it('shows loading skeleton', () => {
    mockUseWalletConnection.mockReturnValue({ connected: true })
    mockUseTradingHistory.mockReturnValue({
      history: [],
      stats: defaultStats,
      isLoading: true,
      hasMore: false,
      fetchMore: jest.fn(),
      isFetchingMore: false,
    })

    render(<TradingHistoryList assetFilter="BTC" />)

    expect(screen.getByTestId('trading-history-skeleton')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    mockUseWalletConnection.mockReturnValue({ connected: true })
    mockUseTradingHistory.mockReturnValue({
      history: [],
      stats: defaultStats,
      isLoading: false,
      hasMore: false,
      fetchMore: jest.fn(),
      isFetchingMore: false,
    })

    render(<TradingHistoryList assetFilter="BTC" />)

    expect(screen.getByText('Your trade history will appear here')).toBeInTheDocument()
  })

  it('renders history rows when data is available', () => {
    mockUseWalletConnection.mockReturnValue({ connected: true })
    mockUseTradingHistory.mockReturnValue({
      history: [makeEntry(), makeEntry({ epochId: 2n, asset: 'ETH' })],
      stats: { ...defaultStats, winCount: 2, totalRealizedPnl: 16_000_000n },
      isLoading: false,
      hasMore: false,
      fetchMore: jest.fn(),
      isFetchingMore: false,
    })

    render(<TradingHistoryList assetFilter="BTC" />)

    const rows = screen.getAllByTestId('trading-history-row')
    expect(rows).toHaveLength(2)
    expect(screen.getByTestId('trading-stats-bar')).toBeInTheDocument()
  })

  it('shows load more button when hasMore is true', () => {
    const fetchMore = jest.fn()
    mockUseWalletConnection.mockReturnValue({ connected: true })
    mockUseTradingHistory.mockReturnValue({
      history: [makeEntry()],
      stats: { ...defaultStats, winCount: 1 },
      isLoading: false,
      hasMore: true,
      fetchMore,
      isFetchingMore: false,
    })

    render(<TradingHistoryList assetFilter="BTC" />)

    const loadMoreBtn = screen.getByTestId('load-more-button')
    expect(loadMoreBtn).toHaveTextContent('Load more')
    fireEvent.click(loadMoreBtn)
    expect(fetchMore).toHaveBeenCalledTimes(1)
  })

  it('renders unique keys for same asset+epoch with different directions', () => {
    mockUseWalletConnection.mockReturnValue({ connected: true })
    mockUseTradingHistory.mockReturnValue({
      history: [
        makeEntry({ asset: 'BTC', epochId: 5n, direction: 'up' }),
        makeEntry({ asset: 'BTC', epochId: 5n, direction: 'down', outcome: 'lost', realizedPnl: -10_000_000n, payoutAmount: null }),
      ],
      stats: { ...defaultStats, winCount: 1, lossCount: 1 },
      isLoading: false,
      hasMore: false,
      fetchMore: jest.fn(),
      isFetchingMore: false,
    })

    // Should render without duplicate key warnings — 2 distinct rows
    render(<TradingHistoryList assetFilter="BTC" />)

    const rows = screen.getAllByTestId('trading-history-row')
    expect(rows).toHaveLength(2)
  })
})
