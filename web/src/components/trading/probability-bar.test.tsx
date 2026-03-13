/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ProbabilityBar } from './probability-bar'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

describe('ProbabilityBar', () => {
  describe('probability display', () => {
    it('displays correct percentages for 70/30 split', () => {
      render(<ProbabilityBar probabilities={{ pUp: 70, pDown: 30 }} />)

      expect(screen.getByText('70%')).toBeInTheDocument()
      expect(screen.getByText('30%')).toBeInTheDocument()
    })

    it('displays correct percentages for 50/50 split', () => {
      render(<ProbabilityBar probabilities={{ pUp: 50, pDown: 50 }} />)

      expect(screen.getAllByText('50%')).toHaveLength(2)
    })

    it('displays correct percentages for extreme 95/5 split', () => {
      render(<ProbabilityBar probabilities={{ pUp: 95, pDown: 5 }} />)

      expect(screen.getByText('95%')).toBeInTheDocument()
      expect(screen.getByText('5%')).toBeInTheDocument()
    })

    it('displays correct percentages for 0/100 split', () => {
      render(<ProbabilityBar probabilities={{ pUp: 0, pDown: 100 }} />)

      expect(screen.getByText('0%')).toBeInTheDocument()
      expect(screen.getByText('100%')).toBeInTheDocument()
    })
  })

  describe('labels', () => {
    it('shows UP and DOWN labels', () => {
      render(<ProbabilityBar probabilities={{ pUp: 60, pDown: 40 }} />)

      expect(screen.getByText('UP')).toBeInTheDocument()
      expect(screen.getByText('DOWN')).toBeInTheDocument()
    })
  })

  describe('color coding', () => {
    it('applies green color to UP percentage', () => {
      render(<ProbabilityBar probabilities={{ pUp: 65, pDown: 35 }} />)

      const upPercentage = screen.getByText('65%')
      expect(upPercentage).toHaveClass('text-green-500')
    })

    it('applies red color to DOWN percentage', () => {
      render(<ProbabilityBar probabilities={{ pUp: 65, pDown: 35 }} />)

      const downPercentage = screen.getByText('35%')
      expect(downPercentage).toHaveClass('text-red-500')
    })
  })

  describe('progress bar', () => {
    it('renders progress bar elements', () => {
      const { container } = render(
        <ProbabilityBar probabilities={{ pUp: 60, pDown: 40 }} />
      )

      // Check for the progress bar container
      const progressContainer = container.querySelector('.rounded-full.bg-muted')
      expect(progressContainer).toBeInTheDocument()

      // Check for the UP (green) bar
      const greenBar = container.querySelector('.bg-green-500\\/80')
      expect(greenBar).toBeInTheDocument()
      expect(greenBar).toHaveStyle({ width: '60%' })

      // Check for the DOWN (red) bar
      const redBar = container.querySelector('.bg-red-500\\/80')
      expect(redBar).toBeInTheDocument()
      expect(redBar).toHaveStyle({ width: '40%' })
    })

    it('applies transition classes for smooth animation', () => {
      const { container } = render(
        <ProbabilityBar probabilities={{ pUp: 50, pDown: 50 }} />
      )

      const bars = container.querySelectorAll('.transition-all')
      expect(bars.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <ProbabilityBar
          probabilities={{ pUp: 50, pDown: 50 }}
          className="custom-class"
        />
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })
  })
})
