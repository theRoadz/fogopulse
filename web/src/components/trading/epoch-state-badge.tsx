'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { EpochState } from '@/types/epoch'

interface EpochStateBadgeProps {
  /** Current epoch state */
  state: EpochState
  /** Additional CSS classes */
  className?: string
}

/**
 * Color-coded badge showing the current epoch state.
 *
 * Colors:
 * - Open: Green (trading active)
 * - Frozen: Amber (no new trades, approaching settlement)
 * - Settling: Blue (settlement in progress)
 * - Settled: Gray (epoch complete)
 * - Refunded: Gray (oracle failed, positions refunded)
 */
export function EpochStateBadge({ state, className }: EpochStateBadgeProps) {
  // Map state to display configuration
  const stateConfig = {
    [EpochState.Open]: {
      label: 'Open',
      className: 'bg-green-500/20 text-green-500 border-green-500/30',
    },
    [EpochState.Frozen]: {
      label: 'Frozen',
      className: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
    },
    [EpochState.Settling]: {
      label: 'Settling',
      className: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
    },
    [EpochState.Settled]: {
      label: 'Settled',
      className: 'bg-muted text-muted-foreground border-border',
    },
    [EpochState.Refunded]: {
      label: 'Refunded',
      className: 'bg-muted text-muted-foreground border-border',
    },
  }

  const config = stateConfig[state]

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  )
}
