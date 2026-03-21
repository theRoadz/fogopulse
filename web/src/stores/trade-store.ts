import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import type { TradeDirection } from '@/types/trade'
import { MIN_TRADE_AMOUNT, MAX_TRADE_AMOUNT } from '@/types/trade'

interface TradeState {
  direction: TradeDirection
  amount: string // String for input handling
  isValid: boolean
  error: string | null

  // Actions
  setDirection: (direction: TradeDirection) => void
  setAmount: (amount: string, maxTradeAmount?: number) => void
  validate: (balance: number | null, maxTradeAmount?: number) => void
  reset: () => void
}

export const useTradeStore = create<TradeState>()(
  immer((set) => ({
    direction: null,
    amount: '',
    isValid: false,
    error: null,

    setDirection: (direction) =>
      set((state) => {
        state.direction = direction
        // Re-validate when direction changes
        const amount = parseFloat(state.amount)
        if (!isNaN(amount) && amount > 0 && direction !== null) {
          // Basic validation - full validation with balance happens via validate()
          state.isValid = true
        }
      }),

    setAmount: (amount, maxTradeAmount) =>
      set((state) => {
        state.amount = amount
        const max = maxTradeAmount ?? MAX_TRADE_AMOUNT
        // Clear validation state - will be re-validated
        const parsed = parseFloat(amount)
        if (amount === '' || isNaN(parsed)) {
          state.isValid = false
          state.error = null
        } else if (parsed < 0) {
          state.isValid = false
          state.error = 'Amount cannot be negative'
        } else if (parsed < MIN_TRADE_AMOUNT && parsed > 0) {
          state.isValid = false
          state.error = `Minimum amount is $${MIN_TRADE_AMOUNT.toFixed(2)}`
        } else if (parsed > max) {
          state.isValid = false
          state.error = `Maximum amount is $${max.toFixed(2)}`
        } else {
          state.error = null
          // Balance validation happens in component with balance context
        }
      }),

    validate: (balance, maxTradeAmount) =>
      set((state) => {
        const max = maxTradeAmount ?? MAX_TRADE_AMOUNT
        const parsed = parseFloat(state.amount)
        if (state.amount === '' || isNaN(parsed)) {
          state.isValid = false
          state.error = 'Enter an amount'
        } else if (parsed <= 0) {
          state.isValid = false
          state.error = 'Enter a valid amount'
        } else if (parsed < MIN_TRADE_AMOUNT) {
          state.isValid = false
          state.error = `Minimum amount is $${MIN_TRADE_AMOUNT.toFixed(2)}`
        } else if (parsed > max) {
          state.isValid = false
          state.error = `Maximum amount is $${max.toFixed(2)}`
        } else if (balance === null) {
          // Wallet disconnected - cannot validate balance, mark as invalid
          state.isValid = false
          state.error = 'Connect wallet to trade'
        } else if (parsed > balance) {
          state.isValid = false
          state.error = 'Exceeds balance'
        } else if (state.direction === null) {
          state.isValid = false
          state.error = null // No error, just not complete
        } else {
          state.isValid = true
          state.error = null
        }
      }),

    reset: () =>
      set((state) => {
        state.direction = null
        state.amount = ''
        state.isValid = false
        state.error = null
      }),
  }))
)
