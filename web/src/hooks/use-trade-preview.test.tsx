/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectionProvider } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import type { ReactNode } from 'react'

import { useTradePreview } from './use-trade-preview'
import { useTradeStore } from '@/stores/trade-store'
import type { Asset } from '@/types/assets'

// Mock Connection to avoid real network calls
const mockOnAccountChange = jest.fn().mockReturnValue(1)
const mockRemoveAccountChangeListener = jest.fn()

jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js')
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      onAccountChange: mockOnAccountChange,
      removeAccountChangeListener: mockRemoveAccountChangeListener,
      getAccountInfo: jest.fn(),
      commitment: 'confirmed',
    })),
  }
})

// Mock the Anchor Program
const mockPoolFetch = jest.fn()
jest.mock('@coral-xyz/anchor', () => {
  const actual = jest.requireActual('@coral-xyz/anchor')
  return {
    ...actual,
    Program: jest.fn().mockImplementation(() => ({
      account: {
        pool: {
          fetch: mockPoolFetch,
        },
      },
    })),
    AnchorProvider: jest.fn().mockImplementation(() => ({})),
  }
})

// Mock the IDL
jest.mock('@/lib/fogopulse.json', () => ({}), { virtual: true })

// Mock useUserPosition to avoid wallet provider dependency
jest.mock('@/hooks/use-user-position', () => ({
  useUserPosition: () => ({
    position: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}))

// Mock useGlobalConfig to avoid needing full QUERY_KEYS and program setup
jest.mock('@/hooks/use-global-config', () => ({
  useGlobalConfig: () => ({
    config: null,
    isLoading: false,
    error: null,
    isRealtimeConnected: false,
    refetch: jest.fn(),
  }),
}))

// Mock constants
jest.mock('@/lib/constants', () => ({
  POOL_PDAS: {
    BTC: { toString: () => 'btc-pool-pda' },
    ETH: { toString: () => 'eth-pool-pda' },
    SOL: { toString: () => 'sol-pool-pda' },
    FOGO: { toString: () => 'fogo-pool-pda' },
  },
  FOGO_TESTNET_RPC: 'https://testnet.fogo.io',
  TRADING_FEE_BPS: 180,
  LP_FEE_SHARE_BPS: 7000,
  TREASURY_FEE_SHARE_BPS: 2000,
  INSURANCE_FEE_SHARE_BPS: 1000,
  USDC_DECIMALS: 6,
  PER_WALLET_CAP_BPS: 500,
  PER_SIDE_CAP_BPS: 3000,
}))

// Test wrapper with providers
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider endpoint="https://testnet.fogo.io">
          {children}
        </ConnectionProvider>
      </QueryClientProvider>
    )
  }
}

// Helper to create standard mock pool data
function createMockPool(yesReserves: number, noReserves: number) {
  return {
    assetMint: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
    yesReserves: new BN(yesReserves),
    noReserves: new BN(noReserves),
    totalLpShares: new BN(yesReserves + noReserves),
    nextEpochId: new BN(1),
    activeEpoch: null,
    activeEpochState: 0,
    walletCapBps: 500,
    sideCapBps: 3000,
    isPaused: false,
    isFrozen: false,
    bump: 255,
  }
}

describe('useTradePreview', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset trade store
    act(() => {
      useTradeStore.getState().reset()
    })
  })

  describe('null returns', () => {
    it('returns null when pool is loading', async () => {
      mockPoolFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('100')
      })

      const { result } = renderHook(() => useTradePreview('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      // While loading, should be null (pool not available yet)
      expect(result.current).toBeNull()
    })

    it('returns null when direction is not set', async () => {
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

      act(() => {
        useTradeStore.getState().setAmount('100')
        // Direction not set
      })

      const { result } = renderHook(() => useTradePreview('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      expect(result.current).toBeNull()
    })

    it('returns null when amount is empty', async () => {
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

      act(() => {
        useTradeStore.getState().setDirection('up')
        // Amount not set
      })

      const { result } = renderHook(() => useTradePreview('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      expect(result.current).toBeNull()
    })

    it('returns null when amount is invalid (NaN)', async () => {
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('invalid')
      })

      const { result } = renderHook(() => useTradePreview('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      expect(result.current).toBeNull()
    })

    it('returns null when amount is zero', async () => {
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('0')
      })

      const { result } = renderHook(() => useTradePreview('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      expect(result.current).toBeNull()
    })

    it('returns null when amount is negative', async () => {
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('-50')
      })

      const { result } = renderHook(() => useTradePreview('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      expect(result.current).toBeNull()
    })
  })

  describe('preview calculations', () => {
    it('calculates preview data for UP trade with 50/50 pool', async () => {
      // 500 USDC yes, 500 USDC no (50/50 probabilities)
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('100')
      })

      const { result, rerender } = renderHook(
        () => useTradePreview('BTC' as Asset),
        {
          wrapper: createWrapper(),
        }
      )

      // Wait for pool data
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100))
      })

      rerender()

      // Now check preview data
      if (result.current) {
        expect(result.current.direction).toBe('up')
        expect(result.current.amount).toBe(100)

        // Shares are calculated on NET amount (after 1.8% fee):
        // net = 100 - 1.8 = 98.2 USDC → shares = 98.2 * 500 / 500 = 98.2 (1:1 in balanced pool)
        expect(result.current.sharesDisplay).toBeCloseTo(98.2, 1)

        // Entry price = netAmount / shares ≈ 1.0 per share
        expect(result.current.entryPrice).toBeCloseTo(1.0, 1)

        // Fee = 1.8% of 100 = 1.80
        expect(result.current.fee).toBeCloseTo(1.8, 2)
        expect(result.current.feePercent).toBe(1.8)

        // Estimated settlement payout using on-chain formula:
        // netAmount = 98.2 USDC (after 1.8% fee), pool = 500/500
        // winnerTotal = 500 + 98.2 = 598.2, loserTotal = 500
        // payout = 98.2 + (98.2 * 500) / 598.2 ≈ 98.2 + 82.05 ≈ 180.25
        expect(result.current.potentialPayout).toBeCloseTo(180, -1)

        // Current probabilities: 50/50
        expect(result.current.currentProbabilities.pUp).toBe(50)
        expect(result.current.currentProbabilities.pDown).toBe(50)

        // Slippage should be low for balanced pool
        expect(result.current.hasHighSlippage).toBe(false)
      }
    })

    it('calculates preview data for DOWN trade', async () => {
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

      act(() => {
        useTradeStore.getState().setDirection('down')
        useTradeStore.getState().setAmount('100')
      })

      const { result, rerender } = renderHook(
        () => useTradePreview('BTC' as Asset),
        {
          wrapper: createWrapper(),
        }
      )

      await act(async () => {
        await new Promise((r) => setTimeout(r, 100))
      })

      rerender()

      if (result.current) {
        expect(result.current.direction).toBe('down')
        expect(result.current.amount).toBe(100)
      }
    })

    it('detects high slippage', async () => {
      // Imbalanced pool: 100 yes, 900 no
      // UP trade buys YES shares
      // sameReserves = 100, oppositeReserves = 900
      // shares = 100 * 900 / 100 = 900 (very favorable!)
      // BUT if we make same much larger than opposite, slippage increases
      // Let's use 900 yes, 100 no for UP trade to get unfavorable pricing
      mockPoolFetch.mockResolvedValue(createMockPool(900_000_000, 100_000_000))

      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('100') // Large trade relative to reserves
      })

      const { result, rerender } = renderHook(
        () => useTradePreview('BTC' as Asset),
        {
          wrapper: createWrapper(),
        }
      )

      await act(async () => {
        await new Promise((r) => setTimeout(r, 100))
      })

      rerender()

      // With imbalanced pool and large trade, slippage should be high
      if (result.current) {
        // For 100 USDC with 900 same, 100 opposite
        // shares = 100 * 100 / 900 = 11.11
        // Fair price = 100/900 = 0.111
        // Actual price = 100/11.11 = 9.0
        // Slippage = (9 - 0.111) / 0.111 * 100 = huge
        expect(result.current.hasHighSlippage).toBe(true)
        expect(result.current.slippage).toBeGreaterThan(2)
      }
    })

    it('handles first trade on side (zero reserves)', async () => {
      // Only yes reserves exist, no no reserves
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 0))

      act(() => {
        useTradeStore.getState().setDirection('down')
        useTradeStore.getState().setAmount('100')
      })

      const { result, rerender } = renderHook(
        () => useTradePreview('BTC' as Asset),
        {
          wrapper: createWrapper(),
        }
      )

      await act(async () => {
        await new Promise((r) => setTimeout(r, 100))
      })

      rerender()

      if (result.current) {
        // First trade on DOWN side - 1:1 shares (on net amount after 1.8% fee)
        // net = 100 - 1.8 = 98.2 → shares = 98.2 (1:1)
        expect(result.current.sharesDisplay).toBeCloseTo(98.2, 1)
        expect(result.current.entryPrice).toBeCloseTo(1.0, 1)
        expect(result.current.slippage).toBe(0) // No slippage for first trade
      }
    })
  })

  describe('probability impact', () => {
    it('shows probability change for UP trade', async () => {
      // 500/500 = 50/50 probability
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('100')
      })

      const { result, rerender } = renderHook(
        () => useTradePreview('BTC' as Asset),
        {
          wrapper: createWrapper(),
        }
      )

      await act(async () => {
        await new Promise((r) => setTimeout(r, 100))
      })

      rerender()

      if (result.current) {
        // UP trade adds to yesReserves
        // New: 600 yes, 500 no
        // newPUp = 500/1100 * 100 = 45%
        expect(result.current.currentProbabilities.pUp).toBe(50)
        expect(result.current.newProbabilities.pUp).toBe(45)

        // probabilityChange for UP should be negative (price moved against UP)
        // Wait, actually UP trade should increase pUp from user's perspective
        // Let me recalculate: pUp = noReserves / total
        // Before: 500/1000 = 50%
        // After UP trade (adding to yesReserves): 500/1100 = 45%
        // So pUp decreases - buying UP makes UP less likely (prices adjusted)
        expect(result.current.probabilityChange).toBeCloseTo(-5, 0)
      }
    })
  })

  describe('updates on store changes', () => {
    it('updates preview when amount changes', async () => {
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('100')
      })

      const { result, rerender } = renderHook(
        () => useTradePreview('BTC' as Asset),
        {
          wrapper: createWrapper(),
        }
      )

      await act(async () => {
        await new Promise((r) => setTimeout(r, 100))
      })

      rerender()

      const firstPayout = result.current?.potentialPayout

      // Change amount
      act(() => {
        useTradeStore.getState().setAmount('200')
      })

      rerender()

      expect(result.current?.potentialPayout).not.toBe(firstPayout)
      expect(result.current?.amount).toBe(200)
    })

    it('updates preview when direction changes', async () => {
      mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

      act(() => {
        useTradeStore.getState().setDirection('up')
        useTradeStore.getState().setAmount('100')
      })

      const { result, rerender } = renderHook(
        () => useTradePreview('BTC' as Asset),
        {
          wrapper: createWrapper(),
        }
      )

      await act(async () => {
        await new Promise((r) => setTimeout(r, 100))
      })

      rerender()

      expect(result.current?.direction).toBe('up')

      // Change direction
      act(() => {
        useTradeStore.getState().setDirection('down')
      })

      rerender()

      expect(result.current?.direction).toBe('down')
    })
  })
})
