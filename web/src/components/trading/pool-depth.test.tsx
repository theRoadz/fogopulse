/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { PoolDepth } from './pool-depth'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock the pool types module
jest.mock('@/types/pool', () => ({
  formatPoolLiquidity: (reserves: bigint) => {
    const value = Number(reserves) / 1_000_000
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  },
}))

// Mock Skeleton
jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

describe('PoolDepth', () => {
  describe('display values', () => {
    it('displays formatted liquidity from number value', () => {
      render(<PoolDepth totalLiquidity={100000} />)

      expect(screen.getByText('$100,000.00')).toBeInTheDocument()
    })

    it('displays formatted liquidity from raw bigint value', () => {
      // 100,000 USDC in base units (6 decimals)
      render(<PoolDepth totalLiquidityRaw={BigInt(100_000_000_000)} />)

      expect(screen.getByText('$100,000.00')).toBeInTheDocument()
    })

    it('displays small liquidity amounts correctly', () => {
      render(<PoolDepth totalLiquidity={123.45} />)

      expect(screen.getByText('$123.45')).toBeInTheDocument()
    })

    it('displays large liquidity amounts with proper formatting', () => {
      render(<PoolDepth totalLiquidity={1234567.89} />)

      expect(screen.getByText('$1,234,567.89')).toBeInTheDocument()
    })

    it('displays zero liquidity correctly', () => {
      render(<PoolDepth totalLiquidity={0} />)

      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })

    it('displays $0.00 when no value provided', () => {
      render(<PoolDepth />)

      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows skeleton loader when loading', () => {
      render(<PoolDepth isLoading={true} totalLiquidity={50000} />)

      expect(screen.getByTestId('skeleton')).toBeInTheDocument()
      expect(screen.queryByText('$50,000.00')).not.toBeInTheDocument()
    })

    it('shows label even during loading', () => {
      render(<PoolDepth isLoading={true} />)

      expect(screen.getByText('Pool Liquidity')).toBeInTheDocument()
    })
  })

  describe('labels', () => {
    it('shows Pool Liquidity label', () => {
      render(<PoolDepth totalLiquidity={10000} />)

      expect(screen.getByText('Pool Liquidity')).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <PoolDepth totalLiquidity={10000} className="custom-class" />
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })

    it('applies font-mono to value display', () => {
      render(<PoolDepth totalLiquidity={10000} />)

      const value = screen.getByText('$10,000.00')
      expect(value).toHaveClass('font-mono')
    })
  })
})
