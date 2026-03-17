/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { MarketCard } from './market-card'
import type { Asset } from '@/types/assets'

// Mock hooks
const mockUsePool = jest.fn()
jest.mock('@/hooks/use-pool', () => ({
  usePool: (asset: Asset) => mockUsePool(asset),
}))

const mockUseEpoch = jest.fn()
jest.mock('@/hooks/use-epoch', () => ({
  useEpoch: (asset: Asset) => mockUseEpoch(asset),
}))

const mockUsePythPrice = jest.fn()
jest.mock('@/hooks/use-pyth-price', () => ({
  usePythPrice: (asset: Asset) => mockUsePythPrice(asset),
}))

// Mock constants
jest.mock('@/lib/constants', () => ({
  ASSET_METADATA: {
    BTC: { label: 'BTC', color: 'text-orange-500', feedId: '0xabc' },
    ETH: { label: 'ETH', color: 'text-blue-500', feedId: '0xdef' },
    SOL: { label: 'SOL', color: 'text-purple-500', feedId: '0xghi' },
    FOGO: { label: 'FOGO', color: 'text-primary', feedId: '' },
  },
}))

// Mock utils
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-header" className={className}>{children}</div>
  ),
  CardTitle: ({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: unknown }) => (
    <h3 data-testid="card-title" className={className} {...props}>{children}</h3>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>{children}</div>
  ),
  CardFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-footer">{children}</div>
  ),
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'> & { asChild?: boolean }) => (
    <button {...props}>{children}</button>
  ),
}))

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className, ...props }: { className?: string; [key: string]: unknown }) => (
    <div data-testid={props['data-testid'] || 'skeleton'} className={className} />
  ),
}))

// Mock trading sub-components
jest.mock('@/components/trading/probability-bar', () => ({
  ProbabilityBar: ({ probabilities }: { probabilities: { pUp: number; pDown: number } }) => (
    <div data-testid="probability-bar" data-pup={probabilities.pUp} data-pdown={probabilities.pDown} />
  ),
}))

jest.mock('@/components/trading/epoch-state-badge', () => ({
  EpochStateBadge: ({ state }: { state: string }) => (
    <span data-testid="epoch-state-badge">{state}</span>
  ),
}))

jest.mock('@/components/trading/pool-depth', () => ({
  PoolDepth: ({ totalLiquidity, isLoading }: { totalLiquidity: number; isLoading: boolean }) => (
    <div data-testid="pool-depth" data-liquidity={totalLiquidity} data-loading={isLoading} />
  ),
}))

// Default hook return values
const defaultPoolReturn = {
  pool: null,
  poolState: { probabilities: { pUp: 55, pDown: 45 }, totalLiquidity: 50000, isLoading: false, error: null },
  isLoading: false,
  error: null,
  isRealtimeConnected: false,
  refetch: jest.fn(),
}

const defaultEpochReturn = {
  epochState: {
    epoch: { state: 'Open', epochId: BigInt(1), startTime: 0, endTime: 0, freezeTime: 0, startPrice: BigInt(0), startConfidence: BigInt(0), startPublishTime: 0, settlementPrice: null, settlementConfidence: null, settlementPublishTime: null, outcome: null, yesTotalAtSettlement: null, noTotalAtSettlement: null, bump: 0, pool: null },
    timeRemaining: 180,
    isFrozen: false,
    isSettling: false,
    isSettled: false,
    startPriceDisplay: 50000,
    priceExponent: -8,
  },
  isLoading: false,
  error: null,
  noEpochStatus: null,
  refetch: jest.fn(),
}

const defaultPriceReturn = {
  price: { price: 67543.21, confidence: 10, timestamp: Date.now() },
  connectionState: 'connected' as const,
}

describe('MarketCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePool.mockReturnValue(defaultPoolReturn)
    mockUseEpoch.mockReturnValue(defaultEpochReturn)
    mockUsePythPrice.mockReturnValue(defaultPriceReturn)
  })

  it('displays the asset name', () => {
    render(<MarketCard asset="BTC" />)
    expect(screen.getByTestId('asset-label')).toHaveTextContent('BTC')
  })

  it('displays the live price formatted as USD', () => {
    render(<MarketCard asset="BTC" />)
    expect(screen.getByTestId('live-price')).toHaveTextContent('$67,543.21')
  })

  it('shows "Price Unavailable" for FOGO (no Pyth feed)', () => {
    mockUsePythPrice.mockReturnValue({ price: null, connectionState: 'disconnected' })
    render(<MarketCard asset="FOGO" />)
    expect(screen.getByTestId('price-unavailable')).toHaveTextContent('Price Unavailable')
  })

  it('passes correct probabilities to ProbabilityBar', () => {
    render(<MarketCard asset="BTC" />)
    const bar = screen.getByTestId('probability-bar')
    expect(bar).toHaveAttribute('data-pup', '55')
    expect(bar).toHaveAttribute('data-pdown', '45')
  })

  it('passes correct props to PoolDepth', () => {
    render(<MarketCard asset="BTC" />)
    const depth = screen.getByTestId('pool-depth')
    expect(depth).toHaveAttribute('data-liquidity', '50000')
    expect(depth).toHaveAttribute('data-loading', 'false')
  })

  it('shows EpochStateBadge when epoch is active', () => {
    render(<MarketCard asset="BTC" />)
    expect(screen.getByTestId('epoch-state-badge')).toHaveTextContent('Open')
  })

  it('shows "No Active Epoch" when no epoch exists', () => {
    mockUseEpoch.mockReturnValue({
      ...defaultEpochReturn,
      epochState: { ...defaultEpochReturn.epochState, epoch: null, timeRemaining: 0 },
      noEpochStatus: 'no-epoch',
    })
    render(<MarketCard asset="BTC" />)
    expect(screen.getByTestId('no-epoch-badge')).toHaveTextContent('No Active Epoch')
  })

  it('renders trade link pointing to correct path', () => {
    render(<MarketCard asset="ETH" />)
    expect(screen.getByTestId('trade-link')).toHaveTextContent('Trade ETH')
    // The wrapping Link should point to /trade/eth
    const link = screen.getByTestId('market-card-ETH')
    expect(link).toHaveAttribute('href', '/trade/eth')
  })

  it('shows skeletons during loading', () => {
    mockUsePool.mockReturnValue({ ...defaultPoolReturn, isLoading: true })
    mockUseEpoch.mockReturnValue({ ...defaultEpochReturn, isLoading: true })
    render(<MarketCard asset="BTC" />)
    expect(screen.getByTestId('price-skeleton')).toBeInTheDocument()
    expect(screen.getByTestId('probability-skeleton')).toBeInTheDocument()
    expect(screen.getByTestId('countdown-skeleton')).toBeInTheDocument()
  })

  it('shows countdown in MM:SS format', () => {
    render(<MarketCard asset="BTC" />)
    expect(screen.getByTestId('epoch-countdown')).toHaveTextContent('03:00')
  })

  it('shows --:-- when no epoch and not loading', () => {
    mockUseEpoch.mockReturnValue({
      ...defaultEpochReturn,
      epochState: { ...defaultEpochReturn.epochState, epoch: null, timeRemaining: 0 },
      noEpochStatus: 'no-epoch',
    })
    render(<MarketCard asset="BTC" />)
    expect(screen.getByText('--:--')).toBeInTheDocument()
  })
})
