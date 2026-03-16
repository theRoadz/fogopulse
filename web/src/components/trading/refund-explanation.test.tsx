/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { RefundExplanation } from './refund-explanation'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
  scalePrice: (price: bigint) => Number(price) * Math.pow(10, -8),
  formatUsdPrice: (price: number) => `$${price.toFixed(2)}`,
  formatConfidencePercent: (confidence: bigint, price: bigint) => {
    if (price === BigInt(0)) return '0.0000%'
    const pct = (Number(confidence) / Number(price)) * 100
    return `${pct.toFixed(4)}%`
  },
}))

// Mock ConfidenceBandChart
jest.mock('./confidence-band-chart', () => ({
  ConfidenceBandChart: (props: Record<string, unknown>) => (
    <div data-testid="confidence-band-chart" data-start-price={String(props.startPrice)} />
  ),
}))

// Mock shadcn components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: React.ComponentProps<'button'>) => (
    <button data-testid="button" onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, open, onOpenChange, className }: {
    children: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
    className?: string
  }) => (
    <div data-testid="collapsible" data-open={open} className={className}>
      {children}
    </div>
  ),
  CollapsibleTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="collapsible-trigger">{children}</div>
  ),
  CollapsibleContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="collapsible-content" className={className}>
      {children}
    </div>
  ),
}))

// Mock lucide-react
jest.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron-down" />,
  ChevronUp: () => <span data-testid="chevron-up" />,
  Eye: () => <span data-testid="eye" />,
  EyeOff: () => <span data-testid="eye-off" />,
}))

describe('RefundExplanation', () => {
  const defaultProps = {
    startPrice: BigInt(6917398000000), // $69,173.98 scaled with exponent -8
    startConfidence: BigInt(172935000000), // ~$1,729.35 scaled (2.50%)
    settlementPrice: BigInt(6917412000000), // $69,174.12 scaled
    settlementConfidence: BigInt(221357000000), // ~$2,213.57 scaled (3.20%)
  }

  it('should render the "Why?" trigger button', () => {
    render(<RefundExplanation {...defaultProps} />)
    expect(screen.getByText('Why?')).toBeInTheDocument()
  })

  it('should have collapsible content with explanation', () => {
    render(<RefundExplanation {...defaultProps} />)
    expect(screen.getByTestId('collapsible-content')).toBeInTheDocument()
  })

  it('should display explanation text about exact tie refund', () => {
    render(<RefundExplanation {...defaultProps} />)
    expect(
      screen.getByText(/The settlement price exactly matched the start price/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/resulting in a tie/i)
    ).toBeInTheDocument()
  })

  it('should display Start price with confidence', () => {
    render(<RefundExplanation {...defaultProps} />)
    expect(screen.getByText('Start:')).toBeInTheDocument()
  })

  it('should display End price with confidence', () => {
    render(<RefundExplanation {...defaultProps} />)
    expect(screen.getByText('End:')).toBeInTheDocument()
  })

  it('should show enabled "View Confidence Bands" button', () => {
    render(<RefundExplanation {...defaultProps} />)
    const viewButton = screen.getByText(/Confidence Bands/).closest('button')
    expect(viewButton).not.toBeDisabled()
  })

  it('should toggle visualization when "View Confidence Bands" button is clicked', () => {
    render(<RefundExplanation {...defaultProps} />)

    // Initially no chart visible
    expect(screen.queryByTestId('confidence-band-chart')).not.toBeInTheDocument()

    // Click to show
    const viewButton = screen.getByText(/Confidence Bands/).closest('button')!
    fireEvent.click(viewButton)

    // Chart should now be visible
    expect(screen.getByTestId('confidence-band-chart')).toBeInTheDocument()

    // Explanation text should be visible
    expect(screen.getByText(/Because the confidence ranges overlap/i)).toBeInTheDocument()
  })

  it('should hide visualization when button is clicked again', () => {
    render(<RefundExplanation {...defaultProps} />)

    const viewButton = screen.getByText(/Confidence Bands/).closest('button')!

    // Show
    fireEvent.click(viewButton)
    expect(screen.getByTestId('confidence-band-chart')).toBeInTheDocument()

    // Hide
    fireEvent.click(screen.getByText(/Confidence Bands/).closest('button')!)
    expect(screen.queryByTestId('confidence-band-chart')).not.toBeInTheDocument()
  })

  it('should show UX-spec copy when visualization is expanded', () => {
    render(<RefundExplanation {...defaultProps} />)

    const viewButton = screen.getByText(/Confidence Bands/).closest('button')!
    fireEvent.click(viewButton)

    expect(
      screen.getByText(/This protects you from unfair outcomes/i)
    ).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    render(<RefundExplanation {...defaultProps} className="custom-class" />)
    const collapsible = screen.getByTestId('collapsible')
    expect(collapsible.className).toContain('custom-class')
  })
})
