'use client'

import { Button } from '@/components/ui/button'

interface QuickAmountButtonsProps {
  balance: number | null
  maxTradeAmount?: number
  walletCapMax?: number
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
  walletCapMax,
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
          (value !== null && maxTradeAmount !== undefined && value > maxTradeAmount) ||
          (value !== null && walletCapMax !== undefined && value > walletCapMax)

        // Compute effective max for Max button (lesser of balance, max trade amount, wallet cap)
        const effectiveMax = balance !== null && balance > 0
          ? Math.floor(Math.min(
              balance,
              ...(maxTradeAmount !== undefined ? [maxTradeAmount] : []),
              ...(walletCapMax !== undefined ? [walletCapMax] : []),
            ) * 100) / 100
          : 0

        return (
          <Button
            key={label}
            variant="outline"
            size="sm"
            disabled={isButtonDisabled}
            onClick={() => {
              if (value !== null) {
                onSelect(value.toFixed(2))
              } else if (effectiveMax > 0) {
                onSelect(effectiveMax.toFixed(2))
              }
            }}
            aria-label={
              value !== null
                ? `Set amount to ${label}`
                : `Set amount to max balance${effectiveMax > 0 ? ` ($${effectiveMax.toFixed(2)})` : ''}`
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
