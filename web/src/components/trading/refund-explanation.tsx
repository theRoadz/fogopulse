'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn, scalePrice, formatUsdPrice, formatConfidencePercent } from '@/lib/utils'
import { ConfidenceBandChart } from './confidence-band-chart'

interface RefundExplanationProps {
  /** Start price (bigint, scaled) */
  startPrice: bigint
  /** Start confidence (bigint, scaled) */
  startConfidence: bigint
  /** Settlement price (bigint, scaled) */
  settlementPrice: bigint
  /** Settlement confidence (bigint, scaled) */
  settlementConfidence: bigint
  /** Additional CSS classes */
  className?: string
}

/**
 * Collapsible "Why?" section explaining why an epoch was refunded.
 *
 * Displays:
 * - Explanation text about why the epoch was refunded (exact tie or oracle uncertainty)
 * - Actual start and settlement price with confidence ranges
 * - Confidence band visualization (inline SVG chart)
 */
export function RefundExplanation({
  startPrice,
  startConfidence,
  settlementPrice,
  settlementConfidence,
  className,
}: RefundExplanationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showBands, setShowBands] = useState(false)

  // Calculate display values
  const startPriceUsd = scalePrice(startPrice)
  const startConfidenceUsd = scalePrice(startConfidence)
  const startConfidencePct = formatConfidencePercent(startConfidence, startPrice)

  const settlementPriceUsd = scalePrice(settlementPrice)
  const settlementConfidenceUsd = scalePrice(settlementConfidence)
  const settlementConfidencePct = formatConfidencePercent(settlementConfidence, settlementPrice)

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('w-full', className)}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-warning hover:text-warning hover:bg-warning/10"
          aria-expanded={isOpen}
        >
          Why?
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 space-y-3">
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            The settlement price exactly matched the start price, resulting in a tie.
            Since there is no clear winner, your funds have been returned.
          </p>

          <div className="mt-4 space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start:</span>
              <span className="text-foreground">
                {formatUsdPrice(startPriceUsd)} ± {formatUsdPrice(startConfidenceUsd)} ({startConfidencePct})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End:</span>
              <span className="text-foreground">
                {formatUsdPrice(settlementPriceUsd)} ± {formatUsdPrice(settlementConfidenceUsd)} ({settlementConfidencePct})
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setShowBands(!showBands)}
              aria-expanded={showBands}
            >
              {showBands ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              {showBands ? 'Hide' : 'View'} Confidence Bands
            </Button>

            {showBands && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Because the confidence ranges overlap, we couldn&apos;t determine a fair winner.
                  Your funds have been returned. This protects you from unfair outcomes.
                </p>

                <ConfidenceBandChart
                  startPrice={startPrice}
                  startConfidence={startConfidence}
                  settlementPrice={settlementPrice}
                  settlementConfidence={settlementConfidence}
                />

                <div className="space-y-1 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start range:</span>
                    <span className="text-foreground">
                      {formatUsdPrice(startPriceUsd - startConfidenceUsd)} – {formatUsdPrice(startPriceUsd + startConfidenceUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Settlement range:</span>
                    <span className="text-foreground">
                      {formatUsdPrice(settlementPriceUsd - settlementConfidenceUsd)} – {formatUsdPrice(settlementPriceUsd + settlementConfidenceUsd)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
