import { cn, scalePrice, formatUsdPrice } from '@/lib/utils'

interface ConfidenceBandChartProps {
  startPrice: bigint
  startConfidence: bigint
  settlementPrice: bigint
  settlementConfidence: bigint
  className?: string
}

/**
 * SVG-based confidence band visualization showing why an epoch was refunded.
 *
 * Renders two horizontal bands (start and settlement price ranges) and
 * highlights the overlap region that caused the refund.
 */
export function ConfidenceBandChart({
  startPrice,
  startConfidence,
  settlementPrice,
  settlementConfidence,
  className,
}: ConfidenceBandChartProps) {
  // Convert bigint to float for SVG coordinate calculation
  const startPriceF = scalePrice(startPrice)
  const startConfF = Math.max(0, scalePrice(startConfidence))
  const settlePriceF = scalePrice(settlementPrice)
  const settleConfF = Math.max(0, scalePrice(settlementConfidence))

  // Band boundaries
  const startLow = startPriceF - startConfF
  const startHigh = startPriceF + startConfF
  const settleLow = settlePriceF - settleConfF
  const settleHigh = settlePriceF + settleConfF

  // Overlap region
  const overlapLow = Math.max(startLow, settleLow)
  const overlapHigh = Math.min(startHigh, settleHigh)
  const hasOverlap = overlapLow < overlapHigh

  // SVG coordinate space — use a minimum range to avoid stacked labels when prices are identical
  const globalMin = Math.min(startLow, settleLow)
  const globalMax = Math.max(startHigh, settleHigh)
  const rawRange = globalMax - globalMin
  const range = rawRange > 0 ? rawRange : 1

  // SVG dimensions
  const svgWidth = 400
  const svgHeight = 160
  const padding = 20
  const chartWidth = svgWidth - padding * 2

  // Map price to SVG x coordinate
  const toX = (price: number) => {
    return padding + ((price - globalMin) / range) * chartWidth
  }

  // Band vertical positions
  const startBandY = 30
  const settleBandY = 85
  const bandHeight = 28

  const monoStyle = { fontFamily: 'var(--font-mono, ui-monospace, monospace)' }

  return (
    <div
      className={cn('w-full', className)}
      data-testid="confidence-band-chart"
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full"
        role="img"
        aria-label="Confidence band visualization showing overlapping price ranges"
      >
        {/* Start price band */}
        <rect
          data-testid="start-band"
          x={toX(startLow)}
          y={startBandY}
          width={Math.max(0, toX(startHigh) - toX(startLow))}
          height={bandHeight}
          rx={4}
          style={{ fill: 'var(--primary)', opacity: 0.2 }}
        />

        {/* Start price center marker */}
        <line
          x1={toX(startPriceF)}
          y1={startBandY}
          x2={toX(startPriceF)}
          y2={startBandY + bandHeight}
          strokeWidth={2}
          style={{ stroke: 'var(--primary)' }}
        />

        {/* Settlement price band */}
        <rect
          data-testid="settlement-band"
          x={toX(settleLow)}
          y={settleBandY}
          width={Math.max(0, toX(settleHigh) - toX(settleLow))}
          height={bandHeight}
          rx={4}
          style={{ fill: 'var(--warning)', opacity: 0.2 }}
        />

        {/* Settlement price center marker */}
        <line
          x1={toX(settlePriceF)}
          y1={settleBandY}
          x2={toX(settlePriceF)}
          y2={settleBandY + bandHeight}
          strokeWidth={2}
          style={{ stroke: 'var(--warning)' }}
        />

        {/* Overlap regions — one per band row so highlighting stays within each band */}
        {hasOverlap && (
          <>
            <rect
              data-testid="overlap-region"
              x={toX(overlapLow)}
              y={startBandY}
              width={toX(overlapHigh) - toX(overlapLow)}
              height={bandHeight}
              rx={4}
              style={{ fill: 'var(--destructive)', opacity: 0.3 }}
            />
            <rect
              x={toX(overlapLow)}
              y={settleBandY}
              width={toX(overlapHigh) - toX(overlapLow)}
              height={bandHeight}
              rx={4}
              style={{ fill: 'var(--destructive)', opacity: 0.3 }}
            />
          </>
        )}

        {/* Start band labels */}
        <text
          x={toX(startLow)}
          y={startBandY - 6}
          style={{ fill: 'var(--foreground)', fontSize: '9px', ...monoStyle }}
          textAnchor="start"
        >
          {formatUsdPrice(startLow)}
        </text>
        <text
          x={toX(startHigh)}
          y={startBandY - 6}
          style={{ fill: 'var(--foreground)', fontSize: '9px', ...monoStyle }}
          textAnchor="end"
        >
          {formatUsdPrice(startHigh)}
        </text>
        <text
          x={toX(startPriceF)}
          y={startBandY + bandHeight + 14}
          style={{ fill: 'var(--primary)', fontSize: '10px', fontWeight: 600, ...monoStyle }}
          textAnchor="middle"
        >
          ▼ {formatUsdPrice(startPriceF)}
        </text>

        {/* Settlement band labels */}
        <text
          x={toX(settleLow)}
          y={settleBandY - 6}
          style={{ fill: 'var(--foreground)', fontSize: '9px', ...monoStyle }}
          textAnchor="start"
        >
          {formatUsdPrice(settleLow)}
        </text>
        <text
          x={toX(settleHigh)}
          y={settleBandY - 6}
          style={{ fill: 'var(--foreground)', fontSize: '9px', ...monoStyle }}
          textAnchor="end"
        >
          {formatUsdPrice(settleHigh)}
        </text>
        <text
          x={toX(settlePriceF)}
          y={settleBandY + bandHeight + 14}
          style={{ fill: 'var(--warning)', fontSize: '10px', fontWeight: 600, ...monoStyle }}
          textAnchor="middle"
        >
          ▼ {formatUsdPrice(settlePriceF)}
        </text>

        {/* Legend */}
        <rect x={padding} y={svgHeight - 18} width={10} height={10} rx={2} style={{ fill: 'var(--primary)', opacity: 0.4 }} />
        <text x={padding + 14} y={svgHeight - 9} style={{ fill: 'var(--muted-foreground)', fontSize: '9px' }}>Start Price Band</text>
        <rect x={padding + 120} y={svgHeight - 18} width={10} height={10} rx={2} style={{ fill: 'var(--warning)', opacity: 0.4 }} />
        <text x={padding + 134} y={svgHeight - 9} style={{ fill: 'var(--muted-foreground)', fontSize: '9px' }}>Settlement Price Band</text>
        {hasOverlap && (
          <>
            <rect x={padding + 260} y={svgHeight - 18} width={10} height={10} rx={2} style={{ fill: 'var(--destructive)', opacity: 0.5 }} />
            <text x={padding + 274} y={svgHeight - 9} style={{ fill: 'var(--muted-foreground)', fontSize: '9px' }}>Overlap</text>
          </>
        )}
      </svg>
    </div>
  )
}
