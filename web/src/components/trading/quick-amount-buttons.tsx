'use client'

import { Button } from '@/components/ui/button'

interface QuickAmountButtonsProps {
  balance: number | null
  maxTradeAmount?: number
  onSelect: (amount: string) => void
  disabled?: boolean
}

const QUICK_AMOUNTS = [
  { label: '$5', value: 5 },
  { label: '$10', value: 10 },
  { label: '$20', value: 20 },
  { label: 'Max', value: null },
] as const

/**
 * Quick amount selection buttons ($5, $10, $20, Max).
 * Fixed dollar amounts for the first three; Max uses full balance.
 * Disabled when wallet not connected or balance is 0.
 */
export function QuickAmountButtons({
  balance,
  maxTradeAmount,
  onSelect,
  disabled = false,
}: QuickAmountButtonsProps) {
  const isDisabled = disabled || balance === null || balance <= 0

  return (
    <div className="grid grid-cols-4 gap-2">
      {QUICK_AMOUNTS.map(({ label, value }) => {
        // For fixed amounts, disable if balance is insufficient or exceeds max trade amount
        // For Max, always enabled if balance > 0
        const isButtonDisabled =
          isDisabled ||
          (value !== null && (balance === null || balance < value)) ||
          (value !== null && maxTradeAmount !== undefined && value > maxTradeAmount)

        return (
          <Button
            key={label}
            variant="outline"
            size="sm"
            disabled={isButtonDisabled}
            onClick={() => {
              if (value !== null) {
                onSelect(value.toFixed(2))
              } else if (balance !== null && balance > 0) {
                // Max: use lesser of balance and max trade amount, rounded down to 2 decimals
                const effectiveMax = maxTradeAmount !== undefined
                  ? Math.min(balance, maxTradeAmount)
                  : balance
                const maxAmount = Math.floor(effectiveMax * 100) / 100
                onSelect(maxAmount.toFixed(2))
              }
            }}
            aria-label={
              value !== null
                ? `Set amount to ${label}`
                : `Set amount to max balance${balance !== null && balance > 0 ? ` ($${(Math.floor((maxTradeAmount !== undefined ? Math.min(balance, maxTradeAmount) : balance) * 100) / 100).toFixed(2)})` : ''}`
            }
            className="text-xs"
          >
            {label}
          </Button>
        )
      })}
    </div>
  )
}
