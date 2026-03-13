'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { EpochUIState } from '@/types/epoch'

interface EpochCountdownProps {
  /** Epoch UI state from useEpoch hook */
  epochState: EpochUIState
  /** Additional CSS classes */
  className?: string
}

/**
 * Formats seconds into MM:SS countdown format
 */
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * EpochCountdown displays a MM:SS countdown timer for the current epoch.
 * Shows freeze window warning when approaching end of trading.
 *
 * Visual states:
 * - Normal: Default text color
 * - Freeze warning (30s before freeze): Amber color
 * - Frozen: Red color with "Trading Closed" message
 */
export function EpochCountdown({ epochState, className }: EpochCountdownProps) {
  const { epoch, timeRemaining, isFrozen } = epochState

  // Calculate time to freeze based on timeRemaining (which updates every second)
  // timeToFreeze = freezeTime - now, but we can derive it from:
  // timeRemaining = endTime - now, so now = endTime - timeRemaining
  // timeToFreeze = freezeTime - (endTime - timeRemaining) = freezeTime - endTime + timeRemaining
  const timeToFreeze = useMemo(() => {
    if (!epoch) return 0
    // freezeTime is typically endTime - 15 seconds
    const freezeOffset = epoch.endTime - epoch.freezeTime // Usually 15
    return Math.max(0, timeRemaining - freezeOffset)
  }, [epoch, timeRemaining])

  // Show freeze warning when within 30 seconds of freeze time
  const showFreezeWarning = useMemo(() => {
    if (!epoch || isFrozen) return false
    return timeToFreeze > 0 && timeToFreeze <= 30
  }, [epoch, isFrozen, timeToFreeze])

  // No epoch - show nothing
  if (!epoch) {
    return null
  }

  return (
    <div className={cn('flex flex-col items-end', className)}>
      {/* Main countdown */}
      <div
        className={cn(
          'font-mono text-2xl font-bold tabular-nums transition-colors',
          isFrozen && 'text-red-500',
          showFreezeWarning && !isFrozen && 'text-amber-500',
          !isFrozen && !showFreezeWarning && 'text-foreground'
        )}
      >
        {formatCountdown(timeRemaining)}
      </div>

      {/* Status message */}
      <div className="text-xs text-muted-foreground">
        {isFrozen ? (
          <span className="text-red-500">Trading Closed</span>
        ) : showFreezeWarning ? (
          <span className="text-amber-500">
            Trading closes in {timeToFreeze}s
          </span>
        ) : (
          <span>Time Remaining</span>
        )}
      </div>
    </div>
  )
}
