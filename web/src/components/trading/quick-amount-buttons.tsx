'use client'

import { Button } from '@/components/ui/button'

interface QuickAmountButtonsProps {
  balance: number | null
  onSelect: (amount: string) => void
  disabled?: boolean
}

const QUICK_AMOUNTS = [
  { label: '25%', percentage: 0.25 },
  { label: '50%', percentage: 0.5 },
  { label: '75%', percentage: 0.75 },
  { label: 'Max', percentage: 1 },
] as const

/**
 * Calculate quick amount based on balance and percentage.
 * Rounds down to 2 decimal places.
 */
function calculateQuickAmount(percentage: number, balance: number | null): number | null {
  if (balance === null || balance <= 0) return null
  return Math.floor(balance * percentage * 100) / 100 // Round down to 2 decimals
}

/**
 * Format amount for display.
 */
function formatAmount(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`
  }
  return `$${amount.toFixed(0)}`
}

/**
 * Quick amount selection buttons (25%, 50%, 75%, Max).
 * Shows actual dollar amounts when balance is available.
 * Disabled when wallet not connected or balance is 0.
 */
export function QuickAmountButtons({
  balance,
  onSelect,
  disabled = false,
}: QuickAmountButtonsProps) {
  const isDisabled = disabled || balance === null || balance <= 0

  return (
    <div className="grid grid-cols-4 gap-2">
      {QUICK_AMOUNTS.map(({ label, percentage }) => {
        const amount = calculateQuickAmount(percentage, balance)
        const displayLabel = amount !== null ? formatAmount(amount) : label

        return (
          <Button
            key={label}
            variant="outline"
            size="sm"
            disabled={isDisabled}
            onClick={() => {
              if (amount !== null) {
                onSelect(amount.toFixed(2))
              }
            }}
            aria-label={`Set amount to ${label} of balance${amount !== null ? ` ($${amount.toFixed(2)})` : ''}`}
            className="text-xs"
          >
            {displayLabel}
          </Button>
        )
      })}
    </div>
  )
}
