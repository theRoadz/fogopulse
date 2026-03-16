/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react'
import { useFaucetMint } from './use-faucet-mint'
import { FOGO_EXPLORER_TX_URL } from '@/lib/constants'

// ── Mock wallet ────────────────────────────────────────────────────────
const mockPublicKey = { toBase58: () => '11111111111111111111111111111111' }
let mockWalletState: { publicKey: typeof mockPublicKey | null } = {
  publicKey: mockPublicKey,
}

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => mockWalletState,
}))

// ── Mock TanStack Query ────────────────────────────────────────────────
const mockInvalidateQueries = jest.fn()
let capturedMutationConfig: Record<string, unknown> = {}
let mockQueryData: { canMint: boolean } | undefined = undefined

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ enabled }: { enabled: boolean }) => ({
    data: enabled ? mockQueryData : undefined,
    isLoading: false,
  }),
  useMutation: (config: Record<string, unknown>) => {
    capturedMutationConfig = config
    return {
      mutate: jest.fn(async () => {
        try {
          const result = await (config.mutationFn as () => Promise<unknown>)()
          if (config.onSuccess) (config.onSuccess as (r: unknown) => void)(result)
        } catch (err) {
          if (config.onError) (config.onError as (e: unknown) => void)(err)
        }
      }),
      isPending: false,
    }
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

// ── Mock toast ─────────────────────────────────────────────────────────
const mockToastSuccess = jest.fn()
const mockToastError = jest.fn()
jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

// ── Mock fetch ─────────────────────────────────────────────────────────
const mockFetch = jest.fn()
global.fetch = mockFetch

// ── Mock window.open ───────────────────────────────────────────────────
const mockWindowOpen = jest.fn()
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true })

// ── Tests ──────────────────────────────────────────────────────────────
describe('useFaucetMint', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWalletState = { publicKey: mockPublicKey }
    capturedMutationConfig = {}
    mockQueryData = { canMint: true }
  })

  describe('isOverCap from server query', () => {
    it('should return isOverCap false when server says canMint: true', () => {
      mockQueryData = { canMint: true }
      const { result } = renderHook(() => useFaucetMint())
      expect(result.current.isOverCap).toBe(false)
    })

    it('should return isOverCap true when server says canMint: false', () => {
      mockQueryData = { canMint: false }
      const { result } = renderHook(() => useFaucetMint())
      expect(result.current.isOverCap).toBe(true)
    })

    it('should return isOverCap false when query data is not yet loaded', () => {
      mockQueryData = undefined
      const { result } = renderHook(() => useFaucetMint())
      expect(result.current.isOverCap).toBe(false)
    })
  })

  describe('mutationFn', () => {
    it('should POST wallet address to /api/faucet', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ signature: 'txSig123' }),
      })

      renderHook(() => useFaucetMint())
      const result = await (capturedMutationConfig.mutationFn as () => Promise<{ signature: string }>)()

      expect(mockFetch).toHaveBeenCalledWith('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: '11111111111111111111111111111111' }),
      })
      expect(result.signature).toBe('txSig123')
    })

    it('should throw when wallet is not connected', async () => {
      mockWalletState = { publicKey: null }

      renderHook(() => useFaucetMint())

      await expect(
        (capturedMutationConfig.mutationFn as () => Promise<unknown>)()
      ).rejects.toThrow('Wallet not connected')
    })

    it('should throw with API error message on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid wallet address' }),
      })

      renderHook(() => useFaucetMint())

      await expect(
        (capturedMutationConfig.mutationFn as () => Promise<unknown>)()
      ).rejects.toThrow('Invalid wallet address')
    })
  })

  describe('onSuccess', () => {
    it('should show toast with explorer link', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ signature: 'txSig456' }),
      })

      const { result } = renderHook(() => useFaucetMint())

      await act(async () => {
        await result.current.mutate()
      })

      expect(mockToastSuccess).toHaveBeenCalledWith(
        'USDC minted successfully',
        expect.objectContaining({
          description: 'Test USDC has been sent to your wallet.',
          action: expect.objectContaining({ label: 'View' }),
        })
      )
    })

    it('should invalidate usdc-balance and faucet-status queries on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ signature: 'txSig789' }),
      })

      const { result } = renderHook(() => useFaucetMint())

      await act(async () => {
        await result.current.mutate()
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['usdc-balance'] })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['faucet-status'] })
    })

    it('should open explorer URL when toast action is clicked', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ signature: 'txSig456' }),
      })

      const { result } = renderHook(() => useFaucetMint())
      await act(async () => {
        await result.current.mutate()
      })

      const toastCall = mockToastSuccess.mock.calls[0]
      const action = toastCall[1].action
      action.onClick()

      expect(mockWindowOpen).toHaveBeenCalledWith(
        `${FOGO_EXPLORER_TX_URL}/txSig456`,
        '_blank'
      )
    })
  })

  describe('onError', () => {
    it('should show error toast and re-check eligibility on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to mint USDC' }),
      })

      const { result } = renderHook(() => useFaucetMint())

      await act(async () => {
        await result.current.mutate()
      })

      expect(mockToastError).toHaveBeenCalledWith(
        'Faucet request failed',
        expect.objectContaining({
          description: expect.stringContaining('Failed to mint USDC'),
        })
      )
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['faucet-status'] })
    })
  })
})
