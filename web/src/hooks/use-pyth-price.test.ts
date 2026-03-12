/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePythPrice } from './use-pyth-price'
import type { Asset } from '@/types/assets'

// Mock the HermesClient
const mockEventSource = {
  onopen: null as ((event: Event) => void) | null,
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: Event) => void) | null,
  close: jest.fn(),
}

const mockGetPriceUpdatesStream = jest.fn().mockResolvedValue(mockEventSource)

jest.mock('@pythnetwork/hermes-client', () => ({
  HermesClient: jest.fn().mockImplementation(() => ({
    getPriceUpdatesStream: mockGetPriceUpdatesStream,
  })),
}))

// Mock constants
jest.mock('@/lib/constants', () => ({
  ASSET_METADATA: {
    BTC: {
      label: 'BTC',
      color: 'text-orange-500',
      feedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    },
    ETH: {
      label: 'ETH',
      color: 'text-blue-500',
      feedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    },
    SOL: {
      label: 'SOL',
      color: 'text-purple-500',
      feedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    },
    FOGO: {
      label: 'FOGO',
      color: 'text-primary',
      feedId: '', // Empty - no price feed
    },
  },
}))

describe('usePythPrice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEventSource.onopen = null
    mockEventSource.onmessage = null
    mockEventSource.onerror = null
    mockEventSource.close.mockClear()
  })

  describe('initial connection', () => {
    it('should start with disconnected state and null price', () => {
      const { result } = renderHook(() => usePythPrice('BTC' as Asset))

      expect(result.current.price).toBeNull()
      // Initially disconnected, then connecting when effect runs
      expect(['disconnected', 'connecting']).toContain(result.current.connectionState)
    })

    it('should transition to connecting state when establishing SSE connection', async () => {
      const { result } = renderHook(() => usePythPrice('BTC' as Asset))

      await waitFor(() => {
        expect(result.current.connectionState).toBe('connecting')
      })
    })

    it('should call HermesClient.getPriceUpdatesStream with correct feedId', async () => {
      renderHook(() => usePythPrice('BTC' as Asset))

      await waitFor(() => {
        expect(mockGetPriceUpdatesStream).toHaveBeenCalledWith(
          ['0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43'],
          expect.objectContaining({
            parsed: true,
            allowUnordered: true,
            benchmarksOnly: false,
          })
        )
      })
    })
  })

  describe('connection state transitions', () => {
    it('should transition to connected state on SSE open', async () => {
      const { result } = renderHook(() => usePythPrice('BTC' as Asset))

      await waitFor(() => {
        expect(mockEventSource.onopen).not.toBeNull()
      })

      act(() => {
        mockEventSource.onopen?.(new Event('open'))
      })

      expect(result.current.connectionState).toBe('connected')
    })

    it('should transition to reconnecting state on SSE error', async () => {
      const { result } = renderHook(() => usePythPrice('BTC' as Asset))

      await waitFor(() => {
        expect(mockEventSource.onopen).not.toBeNull()
      })

      act(() => {
        mockEventSource.onopen?.(new Event('open'))
      })

      expect(result.current.connectionState).toBe('connected')

      act(() => {
        mockEventSource.onerror?.(new Event('error'))
      })

      expect(result.current.connectionState).toBe('reconnecting')
    })
  })

  describe('price parsing', () => {
    it('should parse Pyth price data correctly with exponent', async () => {
      const { result } = renderHook(() => usePythPrice('BTC' as Asset))

      await waitFor(() => {
        expect(mockEventSource.onmessage).not.toBeNull()
      })

      act(() => {
        mockEventSource.onopen?.(new Event('open'))
      })

      const mockPriceData = {
        parsed: [
          {
            id: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
            price: {
              price: '9543218000000', // 95432.18 with expo -8
              conf: '1500000',
              expo: -8,
              publish_time: 1710000000,
            },
          },
        ],
      }

      act(() => {
        mockEventSource.onmessage?.(
          new MessageEvent('message', { data: JSON.stringify(mockPriceData) })
        )
      })

      expect(result.current.price).not.toBeNull()
      expect(result.current.price?.price).toBeCloseTo(95432.18, 2)
      expect(result.current.price?.confidence).toBeCloseTo(0.015, 3)
      expect(result.current.price?.timestamp).toBe(1710000000000) // Converted to ms
    })

    it('should handle malformed price data gracefully', async () => {
      const { result } = renderHook(() => usePythPrice('BTC' as Asset))

      await waitFor(() => {
        expect(mockEventSource.onmessage).not.toBeNull()
      })

      act(() => {
        mockEventSource.onopen?.(new Event('open'))
      })

      // Send malformed data
      act(() => {
        mockEventSource.onmessage?.(
          new MessageEvent('message', { data: 'invalid json' })
        )
      })

      // Should not crash, price stays null
      expect(result.current.price).toBeNull()
      expect(result.current.connectionState).toBe('connected')
    })
  })

  describe('FOGO asset (no feed)', () => {
    it('should handle empty feedId gracefully', () => {
      const { result } = renderHook(() => usePythPrice('FOGO' as Asset))

      expect(result.current.price).toBeNull()
      expect(result.current.connectionState).toBe('disconnected')
      expect(mockGetPriceUpdatesStream).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should close EventSource on unmount', async () => {
      const { unmount } = renderHook(() => usePythPrice('BTC' as Asset))

      await waitFor(() => {
        expect(mockEventSource.onopen).not.toBeNull()
      })

      unmount()

      expect(mockEventSource.close).toHaveBeenCalled()
    })

    it('should close EventSource when asset changes', async () => {
      const { rerender } = renderHook(
        ({ asset }: { asset: Asset }) => usePythPrice(asset),
        { initialProps: { asset: 'BTC' as Asset } }
      )

      await waitFor(() => {
        expect(mockEventSource.onopen).not.toBeNull()
      })

      // Reset mock to track new calls
      mockEventSource.close.mockClear()

      rerender({ asset: 'ETH' as Asset })

      expect(mockEventSource.close).toHaveBeenCalled()
    })
  })

  describe('exponential backoff reconnection', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should attempt reconnection with exponential backoff', async () => {
      renderHook(() => usePythPrice('BTC' as Asset))

      await waitFor(() => {
        expect(mockEventSource.onerror).not.toBeNull()
      })

      // Initial call
      expect(mockGetPriceUpdatesStream).toHaveBeenCalledTimes(1)

      // Trigger error
      act(() => {
        mockEventSource.onerror?.(new Event('error'))
      })

      // First retry after 1 second
      act(() => {
        jest.advanceTimersByTime(1000)
      })

      expect(mockGetPriceUpdatesStream).toHaveBeenCalledTimes(2)
    })

    it('should stop retrying after MAX_RETRIES', async () => {
      const { result } = renderHook(() => usePythPrice('BTC' as Asset))

      await waitFor(() => {
        expect(mockEventSource.onerror).not.toBeNull()
      })

      // Trigger 5 errors (MAX_RETRIES = 5)
      for (let i = 0; i < 5; i++) {
        act(() => {
          mockEventSource.onerror?.(new Event('error'))
        })
        act(() => {
          jest.advanceTimersByTime(30000) // Max delay
        })
      }

      // Trigger 6th error - should not retry
      mockGetPriceUpdatesStream.mockClear()
      act(() => {
        mockEventSource.onerror?.(new Event('error'))
      })

      expect(result.current.connectionState).toBe('disconnected')
    })
  })
})
