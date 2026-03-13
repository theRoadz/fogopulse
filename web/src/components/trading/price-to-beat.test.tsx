/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { PriceToBeat } from './price-to-beat'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
  formatUsdPrice: (price: number | null) => {
    if (price === null) return '$--,---.--'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: price < 1 ? 6 : 2,
    }).format(price)
  },
}))

describe('PriceToBeat', () => {
  describe('placeholder state', () => {
    it('should show placeholder when startPrice is null', () => {
      render(<PriceToBeat startPrice={null} currentPrice={null} />)

      expect(screen.getByText('Price to Beat')).toBeInTheDocument()
      expect(screen.getByText('--')).toBeInTheDocument()
    })
  })

  describe('price display', () => {
    it('should display formatted start price', () => {
      render(<PriceToBeat startPrice={95000} currentPrice={null} />)

      expect(screen.getByText('Price to Beat')).toBeInTheDocument()
      expect(screen.getByText('$95,000.00')).toBeInTheDocument()
    })

    it('should display small prices with more precision', () => {
      render(<PriceToBeat startPrice={0.0012} currentPrice={null} />)

      expect(screen.getByText('$0.001200')).toBeInTheDocument()
    })
  })

  describe('delta indicator', () => {
    it('should not show delta when currentPrice is null', () => {
      render(<PriceToBeat startPrice={95000} currentPrice={null} />)

      // Should not have any delta indicator text
      expect(screen.queryByText(/\u25B2/)).not.toBeInTheDocument() // Up triangle
      expect(screen.queryByText(/\u25BC/)).not.toBeInTheDocument() // Down triangle
    })

    it('should show positive delta with up arrow', () => {
      render(<PriceToBeat startPrice={95000} currentPrice={95500} />)

      // Should show up arrow and positive delta
      expect(screen.getByText(/\u25B2.*\$500\.00/)).toBeInTheDocument()
    })

    it('should show negative delta with down arrow', () => {
      render(<PriceToBeat startPrice={95000} currentPrice={94500} />)

      // Should show down arrow and negative delta
      expect(screen.getByText(/\u25BC.*\$500\.00/)).toBeInTheDocument()
    })

    it('should show zero delta with up arrow', () => {
      render(<PriceToBeat startPrice={95000} currentPrice={95000} />)

      // Zero delta should show up arrow (positive side)
      expect(screen.getByText(/\u25B2.*\$0\.00/)).toBeInTheDocument()
    })

    it('should apply green styling for positive delta', () => {
      const { container } = render(<PriceToBeat startPrice={95000} currentPrice={95500} />)

      const deltaElement = container.querySelector('.text-green-500')
      expect(deltaElement).toBeInTheDocument()
    })

    it('should apply red styling for negative delta', () => {
      const { container } = render(<PriceToBeat startPrice={95000} currentPrice={94500} />)

      const deltaElement = container.querySelector('.text-red-500')
      expect(deltaElement).toBeInTheDocument()
    })

    it('should format small deltas with more precision', () => {
      render(<PriceToBeat startPrice={1.5} currentPrice={1.5005} />)

      // Small delta should show 4 decimal places
      expect(screen.getByText(/\u25B2.*\$0\.0005/)).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <PriceToBeat startPrice={95000} currentPrice={null} className="custom-class" />
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })
  })
})
