import { act } from '@testing-library/react'
import { useTradeStore } from './trade-store'
import { MIN_TRADE_AMOUNT } from '@/types/trade'

describe('useTradeStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    act(() => {
      useTradeStore.getState().reset()
    })
  })

  describe('initial state', () => {
    it('should have null direction initially', () => {
      expect(useTradeStore.getState().direction).toBeNull()
    })

    it('should have empty amount initially', () => {
      expect(useTradeStore.getState().amount).toBe('')
    })

    it('should have isValid as false initially', () => {
      expect(useTradeStore.getState().isValid).toBe(false)
    })

    it('should have no error initially', () => {
      expect(useTradeStore.getState().error).toBeNull()
    })
  })

  describe('setDirection', () => {
    it('should set direction to up', () => {
      act(() => {
        useTradeStore.getState().setDirection('up')
      })
      expect(useTradeStore.getState().direction).toBe('up')
    })

    it('should set direction to down', () => {
      act(() => {
        useTradeStore.getState().setDirection('down')
      })
      expect(useTradeStore.getState().direction).toBe('down')
    })

    it('should set direction to null', () => {
      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setDirection(null)
      })
      expect(useTradeStore.getState().direction).toBeNull()
    })
  })

  describe('setAmount', () => {
    it('should set valid amount', () => {
      act(() => {
        useTradeStore.getState().setAmount('100')
      })
      expect(useTradeStore.getState().amount).toBe('100')
      expect(useTradeStore.getState().error).toBeNull()
    })

    it('should clear error for empty amount', () => {
      act(() => {
        useTradeStore.getState().setAmount('')
      })
      expect(useTradeStore.getState().error).toBeNull()
    })

    it('should set error for negative amount', () => {
      act(() => {
        useTradeStore.getState().setAmount('-10')
      })
      expect(useTradeStore.getState().error).toBe('Amount cannot be negative')
      expect(useTradeStore.getState().isValid).toBe(false)
    })

    it('should set error for amount below minimum', () => {
      act(() => {
        useTradeStore.getState().setAmount('0.001')
      })
      expect(useTradeStore.getState().error).toBe(`Minimum amount is $${MIN_TRADE_AMOUNT.toFixed(2)}`)
      expect(useTradeStore.getState().isValid).toBe(false)
    })
  })

  describe('validate', () => {
    it('should be invalid for empty amount', () => {
      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().validate(100)
      })
      expect(useTradeStore.getState().isValid).toBe(false)
      expect(useTradeStore.getState().error).toBe('Enter an amount')
    })

    it('should be invalid for zero amount', () => {
      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('0')
        useTradeStore.getState().validate(100)
      })
      expect(useTradeStore.getState().isValid).toBe(false)
      expect(useTradeStore.getState().error).toBe('Enter a valid amount')
    })

    it('should be invalid when exceeding balance', () => {
      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('200')
        useTradeStore.getState().validate(100)
      })
      expect(useTradeStore.getState().isValid).toBe(false)
      expect(useTradeStore.getState().error).toBe('Exceeds balance')
    })

    it('should be invalid with no direction selected', () => {
      act(() => {
        useTradeStore.getState().setAmount('50')
        useTradeStore.getState().validate(100)
      })
      expect(useTradeStore.getState().isValid).toBe(false)
      expect(useTradeStore.getState().error).toBeNull() // No error, just incomplete
    })

    it('should be valid with direction, valid amount, and sufficient balance', () => {
      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('50')
        useTradeStore.getState().validate(100)
      })
      expect(useTradeStore.getState().isValid).toBe(true)
      expect(useTradeStore.getState().error).toBeNull()
    })

    it('should be invalid with null balance (disconnected wallet)', () => {
      act(() => {
        useTradeStore.getState().setDirection('down')
        useTradeStore.getState().setAmount('50')
        useTradeStore.getState().validate(null)
      })
      // With null balance, we can't validate - must connect wallet first
      expect(useTradeStore.getState().isValid).toBe(false)
      expect(useTradeStore.getState().error).toBe('Connect wallet to trade')
    })
  })

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('100')
        useTradeStore.getState().validate(100)
        useTradeStore.getState().reset()
      })

      const state = useTradeStore.getState()
      expect(state.direction).toBeNull()
      expect(state.amount).toBe('')
      expect(state.isValid).toBe(false)
      expect(state.error).toBeNull()
    })
  })
})
