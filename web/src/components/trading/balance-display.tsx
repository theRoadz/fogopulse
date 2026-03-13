'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { CircleDollarSign } from 'lucide-react'

interface BalanceDisplayProps {
  /** Formatted balance string for display (e.g., "123.45") */
  formattedBalance: string | null
  /** Whether the balance is currently loading */
  isLoading: boolean
  /** Whether the wallet is connected */
  isConnected: boolean
}

/**
 * Display component for USDC balance.
 * Shows:
 * - "Balance: $X.XX USDC" with icon when connected with balance
 * - Loading skeleton during fetch
 * - "Connect wallet" when disconnected
 */
export function BalanceDisplay({
  formattedBalance,
  isLoading,
  isConnected,
}: BalanceDisplayProps) {
  if (!isConnected) {
    return (
      <div className="text-sm text-muted-foreground">
        Connect wallet to see balance
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Balance:</span>
        <Skeleton className="h-4 w-20" />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">Balance:</span>
      <span className="font-mono flex items-center gap-1">
        ${formattedBalance ?? '0.00'}
        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
          <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
          <span>USDC</span>
        </span>
      </span>
    </div>
  )
}
