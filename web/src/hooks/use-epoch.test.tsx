/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEpoch } from './use-epoch'
import { EpochState } from '@/types/epoch'
import type { Asset } from '@/types/assets'

// Mock the wallet adapter
jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn().mockReturnValue({
    publicKey: null,
    connected: false,
  }),
  useConnection: jest.fn().mockReturnValue({
    connection: {
      onAccountChange: jest.fn().mockReturnValue(1),
      removeAccountChangeListener: jest.fn(),
    },
  }),
}))

// Mock Anchor Program
const mockFetchPool = jest.fn()
const mockFetchEpoch = jest.fn()

jest.mock('@coral-xyz/anchor', () => ({
  Program: jest.fn().mockImplementation(() => ({
    account: {
      pool: {
        fetch: mockFetchPool,
      },
      epoch: {
        fetch: mockFetchEpoch,
      },
    },
  })),
  AnchorProvider: jest.fn().mockImplementation(() => ({})),
  BN: jest.fn().mockImplementation((value: string | number) => ({
    toNumber: () => Number(value),
    toString: () => String(value),
  })),
}))

// Mock @solana/web3.js
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    onAccountChange: jest.fn().mockReturnValue(1),
    removeAccountChangeListener: jest.fn(),
  })),
  PublicKey: {
    default: { toBase58: () => '11111111111111111111111111111111' },
    findProgramAddressSync: jest.fn().mockReturnValue([
      { toBuffer: () => Buffer.alloc(32) },
      255,
    ]),
  },
}))

// Mock constants
jest.mock('@/lib/constants', () => ({
  PROGRAM_ID: { toBase58: () => 'D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5' },
  POOL_PDAS: {
    BTC: { toBuffer: () => Buffer.alloc(32) },
    ETH: { toBuffer: () => Buffer.alloc(32) },
    SOL: { toBuffer: () => Buffer.alloc(32) },
    FOGO: { toBuffer: () => Buffer.alloc(32) },
  },
  SEEDS: {
    EPOCH: Buffer.from('epoch'),
  },
  FOGO_TESTNET_RPC: 'https://testnet.fogo.io',
}))

// Create a wrapper with QueryClient for tests
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useEpoch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('initial state', () => {
    it('should start with loading state', async () => {
      mockFetchPool.mockImplementation(() => new Promise(() => {})) // Never resolves

      const { result } = renderHook(() => useEpoch('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.epochState.epoch).toBeNull()
    })
  })

  describe('no active epoch', () => {
    it('should handle no active epoch gracefully', async () => {
      mockFetchPool.mockResolvedValue({
        activeEpoch: null,
        activeEpochState: 0,
      })

      const { result } = renderHook(() => useEpoch('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.epochState.epoch).toBeNull()
      expect(result.current.noEpochStatus).toBe('no-epoch')
    })
  })

  describe('active epoch', () => {
    const mockPoolPda = { toBuffer: () => Buffer.alloc(32) }
    const mockEpochPda = { toBuffer: () => Buffer.alloc(32) }

    const now = Math.floor(Date.now() / 1000)
    const mockEpochData = {
      pool: mockPoolPda,
      epochId: { toString: () => '1', toNumber: () => 1 },
      state: { open: {} }, // Anchor enum format
      startTime: { toNumber: () => now - 60 },
      endTime: { toNumber: () => now + 240 },
      freezeTime: { toNumber: () => now + 225 },
      startPrice: { toString: () => '9500000000000', toNumber: () => 9500000000000 },
      startConfidence: { toString: () => '1000000', toNumber: () => 1000000 },
      startPublishTime: { toNumber: () => now - 65 },
      settlementPrice: null,
      settlementConfidence: null,
      settlementPublishTime: null,
      outcome: null,
      bump: 255,
    }

    it('should fetch and return epoch data', async () => {
      mockFetchPool.mockResolvedValue({
        activeEpoch: mockEpochPda,
        activeEpochState: 1, // Open
      })
      mockFetchEpoch.mockResolvedValue(mockEpochData)

      const { result } = renderHook(() => useEpoch('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.epochState.epoch).not.toBeNull()
      expect(result.current.epochState.epoch?.state).toBe(EpochState.Open)
      expect(result.current.noEpochStatus).toBeNull()
    })

    it('should calculate time remaining correctly', async () => {
      mockFetchPool.mockResolvedValue({
        activeEpoch: mockEpochPda,
        activeEpochState: 1,
      })
      mockFetchEpoch.mockResolvedValue(mockEpochData)

      const { result } = renderHook(() => useEpoch('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Time remaining should be approximately 240 seconds
      expect(result.current.epochState.timeRemaining).toBeGreaterThan(200)
      expect(result.current.epochState.timeRemaining).toBeLessThanOrEqual(240)
    })

    it('should update countdown every second', async () => {
      mockFetchPool.mockResolvedValue({
        activeEpoch: mockEpochPda,
        activeEpochState: 1,
      })
      mockFetchEpoch.mockResolvedValue(mockEpochData)

      const { result } = renderHook(() => useEpoch('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const initialRemaining = result.current.epochState.timeRemaining

      // Advance time by 5 seconds
      act(() => {
        jest.advanceTimersByTime(5000)
      })

      // Time remaining should have decreased
      expect(result.current.epochState.timeRemaining).toBeLessThan(initialRemaining)
    })

    it('should detect frozen state', async () => {
      const frozenEpoch = {
        ...mockEpochData,
        state: { frozen: {} },
      }

      mockFetchPool.mockResolvedValue({
        activeEpoch: mockEpochPda,
        activeEpochState: 2, // Frozen
      })
      mockFetchEpoch.mockResolvedValue(frozenEpoch)

      const { result } = renderHook(() => useEpoch('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.epochState.isFrozen).toBe(true)
    })

    it('should convert start price to human-readable format', async () => {
      mockFetchPool.mockResolvedValue({
        activeEpoch: mockEpochPda,
        activeEpochState: 1,
      })
      mockFetchEpoch.mockResolvedValue(mockEpochData)

      const { result } = renderHook(() => useEpoch('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // 9500000000000 * 10^-8 = 95000
      expect(result.current.epochState.startPriceDisplay).toBeCloseTo(95000, 0)
    })
  })

  describe('error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      mockFetchPool.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useEpoch('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should return null epoch state on error
      expect(result.current.epochState.epoch).toBeNull()
    })
  })

  describe('asset changes', () => {
    it('should refetch when asset changes', async () => {
      mockFetchPool.mockResolvedValue({
        activeEpoch: null,
        activeEpochState: 0,
      })

      const { result, rerender } = renderHook(
        ({ asset }: { asset: Asset }) => useEpoch(asset),
        {
          wrapper: createWrapper(),
          initialProps: { asset: 'BTC' as Asset },
        }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Clear and track new calls
      mockFetchPool.mockClear()

      rerender({ asset: 'ETH' as Asset })

      await waitFor(() => {
        expect(mockFetchPool).toHaveBeenCalled()
      })
    })
  })

  describe('epoch state parsing', () => {
    const mockEpochPda = { toBuffer: () => Buffer.alloc(32) }
    const now = Math.floor(Date.now() / 1000)

    const baseEpochData = {
      pool: { toBuffer: () => Buffer.alloc(32) },
      epochId: { toString: () => '1', toNumber: () => 1 },
      startTime: { toNumber: () => now - 60 },
      endTime: { toNumber: () => now + 240 },
      freezeTime: { toNumber: () => now + 225 },
      startPrice: { toString: () => '9500000000000', toNumber: () => 9500000000000 },
      startConfidence: { toString: () => '1000000', toNumber: () => 1000000 },
      startPublishTime: { toNumber: () => now - 65 },
      settlementPrice: null,
      settlementConfidence: null,
      settlementPublishTime: null,
      outcome: null,
      bump: 255,
    }

    it.each([
      [{ open: {} }, EpochState.Open],
      [{ frozen: {} }, EpochState.Frozen],
      [{ settling: {} }, EpochState.Settling],
      [{ settled: {} }, EpochState.Settled],
      [{ refunded: {} }, EpochState.Refunded],
    ])('should parse epoch state %p as %s', async (anchorState, expectedState) => {
      mockFetchPool.mockResolvedValue({
        activeEpoch: mockEpochPda,
        activeEpochState: 1,
      })
      mockFetchEpoch.mockResolvedValue({
        ...baseEpochData,
        state: anchorState,
      })

      const { result } = renderHook(() => useEpoch('BTC' as Asset), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.epochState.epoch?.state).toBe(expectedState)
    })
  })
})
