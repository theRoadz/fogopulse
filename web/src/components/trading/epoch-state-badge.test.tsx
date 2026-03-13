/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { EpochStateBadge } from './epoch-state-badge'
import { EpochState } from '@/types/epoch'

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

describe('EpochStateBadge', () => {
  describe('state labels', () => {
    it.each([
      [EpochState.Open, 'Open'],
      [EpochState.Frozen, 'Frozen'],
      [EpochState.Settling, 'Settling'],
      [EpochState.Settled, 'Settled'],
      [EpochState.Refunded, 'Refunded'],
    ])('should display correct label for %s state', (state, expectedLabel) => {
      render(<EpochStateBadge state={state} />)
      expect(screen.getByText(expectedLabel)).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('should apply green styling for Open state', () => {
      render(<EpochStateBadge state={EpochState.Open} />)
      const badge = screen.getByTestId('badge')
      expect(badge.className).toContain('text-green-500')
    })

    it('should apply amber styling for Frozen state', () => {
      render(<EpochStateBadge state={EpochState.Frozen} />)
      const badge = screen.getByTestId('badge')
      expect(badge.className).toContain('text-amber-500')
    })

    it('should apply blue styling for Settling state', () => {
      render(<EpochStateBadge state={EpochState.Settling} />)
      const badge = screen.getByTestId('badge')
      expect(badge.className).toContain('text-blue-500')
    })

    it('should apply muted styling for Settled state', () => {
      render(<EpochStateBadge state={EpochState.Settled} />)
      const badge = screen.getByTestId('badge')
      expect(badge.className).toContain('text-muted-foreground')
    })

    it('should apply muted styling for Refunded state', () => {
      render(<EpochStateBadge state={EpochState.Refunded} />)
      const badge = screen.getByTestId('badge')
      expect(badge.className).toContain('text-muted-foreground')
    })

    it('should apply custom className', () => {
      render(<EpochStateBadge state={EpochState.Open} className="custom-class" />)
      const badge = screen.getByTestId('badge')
      expect(badge.className).toContain('custom-class')
    })
  })
})
