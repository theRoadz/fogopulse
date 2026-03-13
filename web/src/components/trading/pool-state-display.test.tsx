/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { PoolStateDisplay } from './pool-state-display'
import type { PoolUIState, Probabilities } from '@/types/pool'
import type { Asset } from '@/types/assets'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock usePool hook
const mockPoolState: PoolUIState = {
  probabilities: { pUp: 50, pDown: 50 },
  totalLiquidity: 0,
  isLoading: false,
  error: null,
}

const mockUsePool = jest.fn().mockReturnValue({
  pool: null,
  poolState: mockPoolState,
  isLoading: false,
  error: null,
  refetch: jest.fn(),
})

jest.mock('@/hooks', () => ({
  usePool: (...args: unknown[]) => mockUsePool(...args),
}))

// Mock child components
jest.mock('./probability-bar', () => ({
  ProbabilityBar: ({ probabilities }: { probabilities: Probabilities }) => (
    <div data-testid="probability-bar">
      UP: {probabilities.pUp}%, DOWN: {probabilities.pDown}%
    </div>
  ),
}))

jest.mock('./pool-depth', () => ({
  PoolDepth: ({ totalLiquidity }: { totalLiquidity: number }) => (
    <div data-testid="pool-depth">Liquidity: ${totalLiquidity}</div>
  ),
}))

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>{children}</div>
  ),
}))

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

describe('PoolStateDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('loading state', () => {
    it('shows skeleton loaders when loading', () => {
      mockUsePool.mockReturnValue({
        pool: null,
        poolState: mockPoolState,
        isLoading: true,
        error: null,
        refetch: jest.fn(),
      })

      render(<PoolStateDisplay asset={'BTC' as Asset} />)

      const skeletons = screen.getAllByTestId('skeleton')
      expect(skeletons.length).toBeGreaterThan(0)
      expect(screen.queryByTestId('probability-bar')).not.toBeInTheDocument()
    })
  })

  describe('no pool state', () => {
    it('shows "Pool not available" when no pool exists', () => {
      mockUsePool.mockReturnValue({
        pool: null,
        poolState: mockPoolState,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<PoolStateDisplay asset={'BTC' as Asset} />)

      expect(screen.getByText('Pool not available')).toBeInTheDocument()
    })

    it('shows "No liquidity" when pool has zero reserves', () => {
      mockUsePool.mockReturnValue({
        pool: {
          assetMint: {} as never,
          yesReserves: BigInt(0),
          noReserves: BigInt(0),
          totalLpShares: BigInt(0),
          nextEpochId: BigInt(0),
          activeEpoch: null,
          activeEpochState: 0,
          walletCapBps: 500,
          sideCapBps: 3000,
          isPaused: false,
          isFrozen: false,
          bump: 255,
        },
        poolState: {
          probabilities: { pUp: 50, pDown: 50 },
          totalLiquidity: 0,
          isLoading: false,
          error: null,
        },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<PoolStateDisplay asset={'BTC' as Asset} />)

      expect(screen.getByText('No liquidity in pool')).toBeInTheDocument()
    })

    it('shows sentiment message in empty state', () => {
      mockUsePool.mockReturnValue({
        pool: null,
        poolState: mockPoolState,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<PoolStateDisplay asset={'BTC' as Asset} />)

      expect(
        screen.getByText('Market sentiment will appear when trades occur')
      ).toBeInTheDocument()
    })
  })

  describe('active pool state', () => {
    const activePool = {
      assetMint: {} as never,
      yesReserves: BigInt(30_000_000_000), // 30,000 USDC
      noReserves: BigInt(70_000_000_000), // 70,000 USDC
      totalLpShares: BigInt(100_000_000_000),
      nextEpochId: BigInt(1),
      activeEpoch: null,
      activeEpochState: 1,
      walletCapBps: 500,
      sideCapBps: 3000,
      isPaused: false,
      isFrozen: false,
      bump: 255,
    }

    const activePoolState: PoolUIState = {
      probabilities: { pUp: 70, pDown: 30 },
      totalLiquidity: 100_000,
      isLoading: false,
      error: null,
    }

    it('renders ProbabilityBar when pool has liquidity', () => {
      mockUsePool.mockReturnValue({
        pool: activePool,
        poolState: activePoolState,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<PoolStateDisplay asset={'BTC' as Asset} />)

      expect(screen.getByTestId('probability-bar')).toBeInTheDocument()
    })

    it('renders PoolDepth when pool has liquidity', () => {
      mockUsePool.mockReturnValue({
        pool: activePool,
        poolState: activePoolState,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<PoolStateDisplay asset={'BTC' as Asset} />)

      expect(screen.getByTestId('pool-depth')).toBeInTheDocument()
    })

    it('passes correct probabilities to ProbabilityBar', () => {
      mockUsePool.mockReturnValue({
        pool: activePool,
        poolState: activePoolState,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<PoolStateDisplay asset={'BTC' as Asset} />)

      const probabilityBar = screen.getByTestId('probability-bar')
      expect(probabilityBar).toHaveTextContent('UP: 70%')
      expect(probabilityBar).toHaveTextContent('DOWN: 30%')
    })

    it('passes correct liquidity to PoolDepth', () => {
      mockUsePool.mockReturnValue({
        pool: activePool,
        poolState: activePoolState,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<PoolStateDisplay asset={'BTC' as Asset} />)

      const poolDepth = screen.getByTestId('pool-depth')
      expect(poolDepth).toHaveTextContent('Liquidity: $100000')
    })
  })

  describe('asset switching', () => {
    it('calls usePool with correct asset', () => {
      mockUsePool.mockReturnValue({
        pool: null,
        poolState: mockPoolState,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<PoolStateDisplay asset={'ETH' as Asset} />)

      expect(mockUsePool).toHaveBeenCalledWith('ETH')
    })
  })

  describe('styling', () => {
    it('applies custom className', () => {
      mockUsePool.mockReturnValue({
        pool: null,
        poolState: mockPoolState,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<PoolStateDisplay asset={'BTC' as Asset} className="custom-class" />)

      const card = screen.getByTestId('card')
      expect(card).toHaveClass('custom-class')
    })
  })
})
