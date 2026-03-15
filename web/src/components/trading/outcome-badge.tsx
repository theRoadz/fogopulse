'use client'

import { Check, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Outcome } from '@/types/epoch'

interface OutcomeBadgeProps {
  /** The epoch outcome */
  outcome: Outcome
  /** Optional price delta text (e.g., "+$6.14 / +0.01%") */
  priceDeltaText?: string
  /** Additional CSS classes */
  className?: string
}

/**
 * Badge component displaying epoch outcome with appropriate colors and icons.
 *
 * Variants:
 * - UP: Green with Check icon - "UP WON"
 * - DOWN: Red with Check icon - "DOWN WON"
 * - REFUNDED: Amber with RefreshCw icon - "REFUNDED - Oracle Uncertain"
 *
 * Designed for reuse by Story 3.8 (Claim Payout UI).
 */
export function OutcomeBadge({ outcome, priceDeltaText, className }: OutcomeBadgeProps) {
  const config = getOutcomeConfig(outcome)

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1',
        className
      )}
    >
      <Badge
        variant="outline"
        className={cn(
          'gap-1.5 px-3 py-1.5 text-sm font-semibold',
          config.bgClass,
          config.textClass,
          config.borderClass
        )}
      >
        <config.icon className="h-4 w-4" />
        {config.label}
      </Badge>
      {priceDeltaText && outcome !== Outcome.Refunded && (
        <span className={cn('text-xs font-medium', config.textClass)}>
          {priceDeltaText}
        </span>
      )}
    </div>
  )
}

interface OutcomeConfig {
  label: string
  icon: typeof Check | typeof RefreshCw
  bgClass: string
  textClass: string
  borderClass: string
}

function getOutcomeConfig(outcome: Outcome): OutcomeConfig {
  switch (outcome) {
    case Outcome.Up:
      return {
        label: 'UP WON',
        icon: Check,
        bgClass: 'bg-up/20',
        textClass: 'text-up',
        borderClass: 'border-up/30',
      }
    case Outcome.Down:
      return {
        label: 'DOWN WON',
        icon: Check,
        bgClass: 'bg-down/20',
        textClass: 'text-down',
        borderClass: 'border-down/30',
      }
    case Outcome.Refunded:
      return {
        label: 'REFUNDED - Oracle Uncertain',
        icon: RefreshCw,
        bgClass: 'bg-warning/20',
        textClass: 'text-warning',
        borderClass: 'border-warning/30',
      }
    default:
      return {
        label: 'UNKNOWN',
        icon: RefreshCw,
        bgClass: 'bg-muted',
        textClass: 'text-muted-foreground',
        borderClass: 'border-muted',
      }
  }
}
