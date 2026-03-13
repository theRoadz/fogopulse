/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectionProvider } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import type { ReactNode } from 'react'

import { usePool } from './use-pool'
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

// Mock constants
jest.mock('@/lib/constants', () => ({
  POOL_PDAS: {
    BTC: { toString: () => 'btc-pool-pda' },
    ETH: { toString: () => 'eth-pool-pda' },
    SOL: { toString: () => 'sol-pool-pda' },
    FOGO: { toString: () => 'fogo-pool-pda' },
  },
  FOGO_TESTNET_RPC: 'https://testnet.fogo.io',
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

describe('usePool', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('probability calculations', () => {
    it('calculates probabilities correctly with 70/30 split', async () => {
      // Mock pool with 30k YES, 70k NO (in base units: multiply by 1e6)
      mockPoolFetch.mockResolvedValue({
        assetMint: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
        yesReserves: new BN(30_000_000_000), // 30,000 USDC
        noReserves: new BN(70_000_000_000), // 70,000 USDC
        totalLpShares: new BN(100_000_000_000),
        nextEpochId: new BN(1),
        activeEpoch: null,
        activeEpochState: 0,
        walletCapBps: 500,
        sideCapBps: 3000,
        isPaused: false,
        isFrozen: false,
        bump: 255,
      })

      const { result } = renderHook(() => usePool('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // pUp = noReserves / total = 70000 / 100000 = 70%
      expect(result.current.poolState.probabilities.pUp).toBe(70)
      expect(result.current.poolState.probabilities.pDown).toBe(30)
    })

    it('calculates probabilities correctly with 50/50 split', async () => {
      mockPoolFetch.mockResolvedValue({
        assetMint: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
        yesReserves: new BN(50_000_000_000), // 50,000 USDC
        noReserves: new BN(50_000_000_000), // 50,000 USDC
        totalLpShares: new BN(100_000_000_000),
        nextEpochId: new BN(1),
        activeEpoch: null,
        activeEpochState: 0,
        walletCapBps: 500,
        sideCapBps: 3000,
        isPaused: false,
        isFrozen: false,
        bump: 255,
      })

      const { result } = renderHook(() => usePool('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.poolState.probabilities.pUp).toBe(50)
      expect(result.current.poolState.probabilities.pDown).toBe(50)
    })

    it('returns 50/50 for zero reserves', async () => {
      mockPoolFetch.mockResolvedValue({
        assetMint: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
        yesReserves: new BN(0),
        noReserves: new BN(0),
        totalLpShares: new BN(0),
        nextEpochId: new BN(0),
        activeEpoch: null,
        activeEpochState: 0,
        walletCapBps: 500,
        sideCapBps: 3000,
        isPaused: false,
        isFrozen: false,
        bump: 255,
      })

      const { result } = renderHook(() => usePool('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.poolState.probabilities.pUp).toBe(50)
      expect(result.current.poolState.probabilities.pDown).toBe(50)
    })
  })

  describe('liquidity calculation', () => {
    it('calculates total liquidity correctly', async () => {
      mockPoolFetch.mockResolvedValue({
        assetMint: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
        yesReserves: new BN(30_000_000_000), // 30,000 USDC
        noReserves: new BN(70_000_000_000), // 70,000 USDC
        totalLpShares: new BN(100_000_000_000),
        nextEpochId: new BN(1),
        activeEpoch: null,
        activeEpochState: 0,
        walletCapBps: 500,
        sideCapBps: 3000,
        isPaused: false,
        isFrozen: false,
        bump: 255,
      })

      const { result } = renderHook(() => usePool('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Total = 30,000 + 70,000 = 100,000 USDC
      expect(result.current.poolState.totalLiquidity).toBe(100_000)
    })
  })

  describe('error handling', () => {
    it('handles pool not found gracefully', async () => {
      mockPoolFetch.mockRejectedValue(new Error('Account not found'))

      const { result } = renderHook(() => usePool('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.pool).toBeNull()
      expect(result.current.poolState.probabilities.pUp).toBe(50)
      expect(result.current.poolState.probabilities.pDown).toBe(50)
    })
  })

  describe('WebSocket subscription', () => {
    it('sets up WebSocket subscription on mount', async () => {
      mockPoolFetch.mockResolvedValue({
        assetMint: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
        yesReserves: new BN(50_000_000_000),
        noReserves: new BN(50_000_000_000),
        totalLpShares: new BN(100_000_000_000),
        nextEpochId: new BN(1),
        activeEpoch: null,
        activeEpochState: 0,
        walletCapBps: 500,
        sideCapBps: 3000,
        isPaused: false,
        isFrozen: false,
        bump: 255,
      })

      const { unmount } = renderHook(() => usePool('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(mockOnAccountChange).toHaveBeenCalled()
      })

      unmount()

      expect(mockRemoveAccountChangeListener).toHaveBeenCalled()
    })
  })
})
