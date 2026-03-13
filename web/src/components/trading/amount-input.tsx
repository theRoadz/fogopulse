'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

interface AmountInputProps {
  value: string
  onChange: (value: string) => void
  error: string | null
  disabled?: boolean
}

/**
 * Amount input component for entering USDC trade amounts.
 * Features:
 * - Dollar sign prefix
 * - Numeric-only input with max 2 decimal places
 * - Validation for negative numbers (prevented)
 * - Error display below input
 */
export function AmountInput({
  value,
  onChange,
  error,
  disabled = false,
}: AmountInputProps) {
  const inputId = useId()
  const errorId = useId()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value

    // Allow empty, numbers, and single decimal point with max 2 decimals
    if (inputValue === '' || /^\d*\.?\d{0,2}$/.test(inputValue)) {
      onChange(inputValue)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text')

    // Sanitize pasted input - only allow valid numeric format
    const sanitized = pastedText.replace(/[^0-9.]/g, '')

    // Ensure only one decimal point and max 2 decimal places
    const parts = sanitized.split('.')
    let result = parts[0]
    if (parts.length > 1) {
      result += '.' + parts[1].slice(0, 2)
    }

    if (result !== pastedText) {
      e.preventDefault()
      onChange(result)
    }
  }

  const hasError = !!error

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="text-xs uppercase tracking-wide text-muted-foreground"
      >
        Amount (USDC)
      </label>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border bg-background px-3 py-2',
          'transition-colors duration-200',
          hasError
            ? 'border-red-500 focus-within:border-red-500'
            : 'border-input focus-within:border-ring',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className="text-muted-foreground">$</span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          className={cn(
            'flex-1 bg-transparent text-right text-lg font-mono outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'placeholder:text-muted-foreground/50'
          )}
        />
      </div>
      {hasError && (
        <p
          id={errorId}
          className="text-sm text-red-500"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
