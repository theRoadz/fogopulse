'use client'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { MIN_TRADE_AMOUNT } from '@/types/trade'

interface QuickAmountButtonsProps {
  balance: number | null
  maxTradeAmount?: number
  walletCapMax?: number
  currentAmount: string
  onSelect: (amount: string) => void
  disabled?: boolean
}

const PRESET_AMOUNTS = [
  { label: '$5', value: 5 },
  { label: '$10', value: 10 },
  { label: '$20', value: 20 },
] as const

/**
 * Quick amount selection buttons with +/- increment/decrement.
 * Layout: Row 1 = [-]$5[+] [-]$10[+] [-]$20[+], Row 2 = [Max] full-width.
 * Preset label click sets absolute amount; +/- adjusts relative to current.
 * Disabled when wallet not connected or balance is 0.
 */
export function QuickAmountButtons({
  balance,
  maxTradeAmount,
  walletCapMax,
  currentAmount,
  onSelect,
  disabled = false,
}: QuickAmountButtonsProps) {
  const isDisabled = disabled || balance === null || balance <= 0

  const effectiveMax = balance !== null && balance > 0
    ? Math.floor(Math.min(
        balance,
        ...(maxTradeAmount !== undefined ? [maxTradeAmount] : []),
        ...(walletCapMax !== undefined ? [walletCapMax] : []),
      ) * 100) / 100
    : 0

  const currentValue = parseFloat(currentAmount) || 0

  return (
    <div className="space-y-2">
      {/* Preset amounts with +/- */}
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {PRESET_AMOUNTS.map(({ label, value }) => {
          const isPresetDisabled =
            isDisabled ||
            (balance === null || balance < value) ||
            (maxTradeAmount !== undefined && value > maxTradeAmount) ||
            (walletCapMax !== undefined && value > walletCapMax)

          const decrementDisabled = isDisabled || currentValue - value < MIN_TRADE_AMOUNT
          const incrementDisabled = isDisabled || currentValue + value > effectiveMax

          return (
            <ButtonGroup key={label} className="w-full">
              <Button
                variant="outline"
                size="icon"
                disabled={decrementDisabled}
                onClick={() => {
                  const result = Math.floor((currentValue - value) * 100) / 100
                  onSelect(result.toFixed(2))
                }}
                aria-label={`Subtract ${label}`}
                className="h-8 w-6 sm:w-8 shrink-0 text-xs"
              >
                −
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isPresetDisabled}
                onClick={() => onSelect(value.toFixed(2))}
                aria-label={`Set amount to ${label}`}
                className="flex-1 text-xs min-w-0 h-8"
              >
                {label}
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={incrementDisabled}
                onClick={() => {
                  const result = Math.floor((currentValue + value) * 100) / 100
                  const clamped = Math.min(result, effectiveMax)
                  onSelect(clamped.toFixed(2))
                }}
                aria-label={`Add ${label}`}
                className="h-8 w-6 sm:w-8 shrink-0 text-xs"
              >
                +
              </Button>
            </ButtonGroup>
          )
        })}
      </div>

      {/* Max button full width */}
      <Button
        variant="outline"
        size="sm"
        disabled={isDisabled}
        onClick={() => effectiveMax > 0 && onSelect(effectiveMax.toFixed(2))}
        aria-label={`Set amount to max balance${effectiveMax > 0 ? ` ($${effectiveMax.toFixed(2)})` : ''}`}
        className="w-full text-xs"
      >
        Max
      </Button>
    </div>
  )
}
