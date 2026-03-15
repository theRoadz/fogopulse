/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { OutcomeBadge } from './outcome-badge'
import { Outcome } from '@/types/epoch'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock shadcn Badge component
jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  ),
}))

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Check: ({ className }: { className?: string }) => (
    <span data-testid="check-icon" className={className}>
      CheckIcon
    </span>
  ),
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="refresh-icon" className={className}>
      RefreshIcon
    </span>
  ),
}))

describe('OutcomeBadge', () => {
  describe('UP outcome', () => {
    it('should display "UP WON" label', () => {
      render(<OutcomeBadge outcome={Outcome.Up} />)
      expect(screen.getByText('UP WON')).toBeInTheDocument()
    })

    it('should render Check icon', () => {
      render(<OutcomeBadge outcome={Outcome.Up} />)
      expect(screen.getByTestId('check-icon')).toBeInTheDocument()
    })

    it('should apply green styling', () => {
      render(<OutcomeBadge outcome={Outcome.Up} />)
      const badge = screen.getByTestId('badge')
      expect(badge.className).toContain('bg-up/20')
      expect(badge.className).toContain('text-up')
    })

    it('should show price delta text when provided', () => {
      render(<OutcomeBadge outcome={Outcome.Up} priceDeltaText="+$6.14 / +0.01%" />)
      expect(screen.getByText('+$6.14 / +0.01%')).toBeInTheDocument()
    })
  })

  describe('DOWN outcome', () => {
    it('should display "DOWN WON" label', () => {
      render(<OutcomeBadge outcome={Outcome.Down} />)
      expect(screen.getByText('DOWN WON')).toBeInTheDocument()
    })

    it('should render Check icon', () => {
      render(<OutcomeBadge outcome={Outcome.Down} />)
      expect(screen.getByTestId('check-icon')).toBeInTheDocument()
    })

    it('should apply red styling', () => {
      render(<OutcomeBadge outcome={Outcome.Down} />)
      const badge = screen.getByTestId('badge')
      expect(badge.className).toContain('bg-down/20')
      expect(badge.className).toContain('text-down')
    })

    it('should show price delta text when provided', () => {
      render(<OutcomeBadge outcome={Outcome.Down} priceDeltaText="-$6.14 / -0.01%" />)
      expect(screen.getByText('-$6.14 / -0.01%')).toBeInTheDocument()
    })
  })

  describe('REFUNDED outcome', () => {
    it('should display "REFUNDED - Oracle Uncertain" label', () => {
      render(<OutcomeBadge outcome={Outcome.Refunded} />)
      expect(screen.getByText('REFUNDED - Oracle Uncertain')).toBeInTheDocument()
    })

    it('should render RefreshCw icon', () => {
      render(<OutcomeBadge outcome={Outcome.Refunded} />)
      expect(screen.getByTestId('refresh-icon')).toBeInTheDocument()
    })

    it('should apply amber/warning styling', () => {
      render(<OutcomeBadge outcome={Outcome.Refunded} />)
      const badge = screen.getByTestId('badge')
      expect(badge.className).toContain('bg-warning/20')
      expect(badge.className).toContain('text-warning')
    })

    it('should NOT show price delta text for refunded outcomes', () => {
      render(<OutcomeBadge outcome={Outcome.Refunded} priceDeltaText="+$0.14 / +0.00%" />)
      expect(screen.queryByText('+$0.14 / +0.00%')).not.toBeInTheDocument()
    })
  })

  describe('custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(<OutcomeBadge outcome={Outcome.Up} className="custom-class" />)
      expect(container.firstChild).toHaveClass('custom-class')
    })
  })
})
