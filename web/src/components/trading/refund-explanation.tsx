'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn, scalePrice, formatUsdPrice, formatConfidencePercent } from '@/lib/utils'

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
 * - Explanation text about confidence bands overlapping
 * - Actual start and settlement price with confidence ranges
 * - Placeholder link for Story 3.7 (confidence band visualization)
 */
export function RefundExplanation({
  startPrice,
  startConfidence,
  settlementPrice,
  settlementConfidence,
  className,
}: RefundExplanationProps) {
  const [isOpen, setIsOpen] = useState(false)

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
            The settlement price was too close to the start price. Oracle confidence bands
            overlapped, meaning the outcome cannot be reliably determined.
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

          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-1.5 text-xs opacity-60"
            >
              <ExternalLink className="h-3 w-3" />
              View Confidence Bands
              <span className="text-muted-foreground">(Coming in Story 3.7)</span>
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
