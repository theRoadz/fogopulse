'use client'

import { cn } from '@/lib/utils'
import type { Probabilities } from '@/types/pool'

interface ProbabilityBarProps {
  /** Probabilities to display (pUp, pDown) */
  probabilities: Probabilities
  /** Additional CSS classes */
  className?: string
}

/**
 * Horizontal progress bar showing UP vs DOWN probability split.
 * Uses green for UP side and red for DOWN side with smooth transitions.
 *
 * Note: Probabilities are normalized to ensure they sum to 100%.
 * If input values don't sum to 100, they are proportionally adjusted.
 */
export function ProbabilityBar({ probabilities, className }: ProbabilityBarProps) {
  // Normalize probabilities to ensure they sum to 100%
  const total = probabilities.pUp + probabilities.pDown
  const pUp = total > 0 ? Math.round((probabilities.pUp / total) * 100) : 50
  const pDown = 100 - pUp // Ensure exact sum of 100

  return (
    <div className={cn('space-y-2', className)}>
      {/* Labels */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            UP
          </span>
          <span className="text-lg font-bold font-mono text-green-500">
            {pUp}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold font-mono text-red-500">
            {pDown}%
          </span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            DOWN
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        {/* UP (green) side - grows from left */}
        <div
          className="absolute left-0 top-0 h-full bg-green-500/80 transition-all duration-300 ease-out"
          style={{ width: `${pUp}%` }}
        />
        {/* DOWN (red) side - fills remaining space from right */}
        <div
          className="absolute right-0 top-0 h-full bg-red-500/80 transition-all duration-300 ease-out"
          style={{ width: `${pDown}%` }}
        />
      </div>
    </div>
  )
}
