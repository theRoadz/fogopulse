'use client'

import { cn } from '@/lib/utils'
import type { ConnectionState } from '@/hooks/use-pyth-price'

interface ConnectionStatusProps {
  state: ConnectionState
  className?: string
  /** When true, positions absolutely in top-right corner of parent */
  absolute?: boolean
}

/**
 * Subtle connection status indicator displayed in the chart corner.
 * Shows the current SSE connection state with appropriate visual feedback.
 */
export function ConnectionStatus({ state, className, absolute = false }: ConnectionStatusProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
        'bg-background/80 backdrop-blur-sm border border-border/50',
        absolute && 'absolute top-2 right-2',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={`Price feed ${state}`}
    >
      <span
        className={cn(
          'w-2 h-2 rounded-full',
          state === 'connected' && 'bg-primary',
          state === 'connecting' && 'bg-blue-500 animate-pulse motion-reduce:animate-none',
          state === 'reconnecting' && 'bg-yellow-500 animate-pulse motion-reduce:animate-none',
          state === 'disconnected' && 'bg-destructive'
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          'text-muted-foreground',
          state === 'connected' && 'text-primary',
          state === 'connecting' && 'text-blue-500',
          state === 'reconnecting' && 'text-yellow-500',
          state === 'disconnected' && 'text-destructive'
        )}
      >
        {state === 'connected' && 'Live'}
        {state === 'connecting' && 'Connecting...'}
        {state === 'reconnecting' && 'Reconnecting...'}
        {state === 'disconnected' && 'Offline'}
      </span>
    </div>
  )
}
