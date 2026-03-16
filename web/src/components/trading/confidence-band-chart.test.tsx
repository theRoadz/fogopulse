/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ConfidenceBandChart } from './confidence-band-chart'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
  scalePrice: (price: bigint) => Number(price) * Math.pow(10, -8),
  formatUsdPrice: (price: number) => `$${price.toFixed(2)}`,
}))

describe('ConfidenceBandChart', () => {
  // Overlapping bands scenario (typical refund case)
  const overlappingProps = {
    startPrice: BigInt(4500550000000),       // $45,005.50
    startConfidence: BigInt(525000000),       // $5.25
    settlementPrice: BigInt(4501290000000),   // $45,012.90
    settlementConfidence: BigInt(790000000),  // $7.90
  }

  // Non-overlapping bands scenario (edge case)
  const nonOverlappingProps = {
    startPrice: BigInt(4500000000000),        // $45,000.00
    startConfidence: BigInt(100000000),       // $1.00
    settlementPrice: BigInt(4510000000000),   // $45,100.00
    settlementConfidence: BigInt(100000000),  // $1.00
  }

  it('should render the chart container with data-testid', () => {
    render(<ConfidenceBandChart {...overlappingProps} />)
    expect(screen.getByTestId('confidence-band-chart')).toBeInTheDocument()
  })

  it('should render SVG with role="img" and aria-label', () => {
    render(<ConfidenceBandChart {...overlappingProps} />)
    const svg = screen.getByRole('img')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Confidence band visualization showing overlapping price ranges')
  })

  it('should render start band element', () => {
    render(<ConfidenceBandChart {...overlappingProps} />)
    expect(screen.getByTestId('start-band')).toBeInTheDocument()
  })

  it('should render settlement band element', () => {
    render(<ConfidenceBandChart {...overlappingProps} />)
    expect(screen.getByTestId('settlement-band')).toBeInTheDocument()
  })

  it('should render overlap region when bands overlap', () => {
    render(<ConfidenceBandChart {...overlappingProps} />)
    expect(screen.getByTestId('overlap-region')).toBeInTheDocument()
  })

  it('should NOT render overlap region when bands do not overlap', () => {
    render(<ConfidenceBandChart {...nonOverlappingProps} />)
    expect(screen.queryByTestId('overlap-region')).not.toBeInTheDocument()
  })

  it('should apply custom className', () => {
    render(<ConfidenceBandChart {...overlappingProps} className="custom-test" />)
    const container = screen.getByTestId('confidence-band-chart')
    expect(container.className).toContain('custom-test')
  })

  it('should use SVG viewBox for responsive sizing', () => {
    render(<ConfidenceBandChart {...overlappingProps} />)
    const svg = screen.getByRole('img')
    expect(svg).toHaveAttribute('viewBox')
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
  })

  it('should render start and settlement band rects with non-zero dimensions', () => {
    render(<ConfidenceBandChart {...overlappingProps} />)
    const startBand = screen.getByTestId('start-band')
    const settleBand = screen.getByTestId('settlement-band')

    expect(Number(startBand.getAttribute('width'))).toBeGreaterThan(0)
    expect(Number(startBand.getAttribute('height'))).toBeGreaterThan(0)
    expect(Number(settleBand.getAttribute('width'))).toBeGreaterThan(0)
    expect(Number(settleBand.getAttribute('height'))).toBeGreaterThan(0)
  })

  it('should display correct formatted price labels', () => {
    render(<ConfidenceBandChart {...overlappingProps} />)
    // Start band: price=$45,005.50, conf=$5.25 → low=$45,000.25, high=$45,010.75
    expect(screen.getByText('$45000.25')).toBeInTheDocument()
    expect(screen.getByText('$45010.75')).toBeInTheDocument()
    expect(screen.getByText(/\$45005.50/)).toBeInTheDocument()
    // Settlement band: price=$45,012.90, conf=$7.90 → low=$45,005.00, high=$45,020.80
    expect(screen.getByText('$45005.00')).toBeInTheDocument()
    expect(screen.getByText('$45020.80')).toBeInTheDocument()
    expect(screen.getByText(/\$45012.90/)).toBeInTheDocument()
  })

  it('should position overlap region x between start and settlement band boundaries', () => {
    render(<ConfidenceBandChart {...overlappingProps} />)
    const startBand = screen.getByTestId('start-band')
    const settleBand = screen.getByTestId('settlement-band')
    const overlapRegion = screen.getByTestId('overlap-region')

    const startX = Number(startBand.getAttribute('x'))
    const startW = Number(startBand.getAttribute('width'))
    const settleX = Number(settleBand.getAttribute('x'))
    const settleW = Number(settleBand.getAttribute('width'))
    const overlapX = Number(overlapRegion.getAttribute('x'))
    const overlapW = Number(overlapRegion.getAttribute('width'))

    // Overlap must start at or after the later of the two band starts
    expect(overlapX).toBeGreaterThanOrEqual(Math.max(startX, settleX))
    // Overlap must end at or before the earlier of the two band ends
    expect(overlapX + overlapW).toBeLessThanOrEqual(Math.min(startX + startW, settleX + settleW) + 0.01)
  })

  it('should handle zero confidence gracefully (zero-width band, no crash)', () => {
    const zeroConfProps = {
      startPrice: BigInt(4500000000000),
      startConfidence: BigInt(0),
      settlementPrice: BigInt(4510000000000),
      settlementConfidence: BigInt(0),
    }
    render(<ConfidenceBandChart {...zeroConfProps} />)
    expect(screen.getByTestId('start-band')).toBeInTheDocument()
    expect(screen.getByTestId('settlement-band')).toBeInTheDocument()
    // Zero confidence = zero-width band = no overlap
    expect(screen.queryByTestId('overlap-region')).not.toBeInTheDocument()
  })
})
