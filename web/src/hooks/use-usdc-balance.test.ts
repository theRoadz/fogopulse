import { renderHook } from '@testing-library/react'
import { useUsdcBalance } from './use-usdc-balance'

// Mock PublicKey
const mockPublicKey = {
  toBase58: () => 'D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5',
}

const mockConnection = {
  getAccountInfo: jest.fn(),
}

// Mock wallet state
let mockWalletState = {
  publicKey: mockPublicKey,
  connected: true,
}

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => mockWalletState,
  useConnection: () => ({
    connection: mockConnection,
  }),
}))

// Mock @solana/spl-token
jest.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddress: jest.fn().mockResolvedValue({
    toBase58: () => 'MockATAAddress',
  }),
  getAccount: jest.fn().mockResolvedValue({
    amount: BigInt(100_000_000), // 100 USDC (6 decimals)
  }),
  TokenAccountNotFoundError: class TokenAccountNotFoundError extends Error {},
}))

// Mock TanStack Query
const mockQueryResult = {
  data: null as { balance: number; rawBalance: bigint } | null,
  isLoading: false,
  error: null as Error | null,
  refetch: jest.fn(),
}

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ enabled }: { enabled: boolean }) => {
    // Simulate the query based on enabled state
    if (enabled && mockWalletState.connected && mockWalletState.publicKey) {
      mockQueryResult.data = { balance: 100, rawBalance: BigInt(100_000_000) }
    } else {
      mockQueryResult.data = null
    }
    return mockQueryResult
  },
}))

describe('useUsdcBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWalletState = {
      publicKey: mockPublicKey,
      connected: true,
    }
    mockQueryResult.data = null
    mockQueryResult.isLoading = false
    mockQueryResult.error = null
  })

  describe('when wallet is connected', () => {
    it('should return balance when connected', () => {
      const { result } = renderHook(() => useUsdcBalance())

      expect(result.current.balance).toBe(100)
      expect(result.current.rawBalance).toBe(BigInt(100_000_000))
    })

    it('should return formatted balance with 2 decimal places', () => {
      const { result } = renderHook(() => useUsdcBalance())

      expect(result.current.formattedBalance).toBe('100.00')
    })
  })

  describe('when wallet is disconnected', () => {
    beforeEach(() => {
      mockWalletState = {
        publicKey: null as unknown as typeof mockPublicKey,
        connected: false,
      }
      mockQueryResult.data = null
    })

    it('should return null balance when disconnected', () => {
      const { result } = renderHook(() => useUsdcBalance())

      expect(result.current.balance).toBeNull()
      expect(result.current.rawBalance).toBeNull()
      expect(result.current.formattedBalance).toBeNull()
    })
  })

  describe('loading state', () => {
    it('should indicate loading state', () => {
      mockQueryResult.isLoading = true

      const { result } = renderHook(() => useUsdcBalance())

      expect(result.current.isLoading).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should return error when query fails', () => {
      mockQueryResult.error = new Error('Network error')

      const { result } = renderHook(() => useUsdcBalance())

      expect(result.current.error).toBeTruthy()
    })
  })
})
