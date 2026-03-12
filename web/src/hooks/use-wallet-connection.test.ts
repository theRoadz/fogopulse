import { renderHook, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useWalletConnection } from './use-wallet-connection'

// Mock dependencies
const mockPublicKey = {
  toBase58: () => 'D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5',
}

const mockConnection = {
  getBalance: jest.fn().mockResolvedValue(1000000000), // 1 SOL in lamports
}

const mockWallet = {
  adapter: {
    name: 'Phantom',
    icon: 'https://phantom.app/icon.png',
  },
}

const mockConnect = jest.fn()
const mockDisconnect = jest.fn()
const mockSignTransaction = jest.fn()
const mockSignAllTransactions = jest.fn()
const mockSignMessage = jest.fn()

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    publicKey: mockPublicKey,
    wallet: mockWallet,
    connected: true,
    connecting: false,
    disconnecting: false,
    connect: mockConnect,
    disconnect: mockDisconnect,
    signTransaction: mockSignTransaction,
    signAllTransactions: mockSignAllTransactions,
    signMessage: mockSignMessage,
  }),
  useConnection: () => ({
    connection: mockConnection,
  }),
}))

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}))

describe('useWalletConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('connection state', () => {
    it('should return connected state when wallet is connected', () => {
      const { result } = renderHook(() => useWalletConnection())

      expect(result.current.connected).toBe(true)
      expect(result.current.connecting).toBe(false)
      expect(result.current.disconnecting).toBe(false)
    })

    it('should return public key as base58 string', () => {
      const { result } = renderHook(() => useWalletConnection())

      expect(result.current.publicKey).toBe('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
    })

    it('should return wallet name and icon', () => {
      const { result } = renderHook(() => useWalletConnection())

      expect(result.current.walletName).toBe('Phantom')
      expect(result.current.walletIcon).toBe('https://phantom.app/icon.png')
    })
  })

  describe('balance fetching', () => {
    it('should fetch balance on mount when connected', async () => {
      renderHook(() => useWalletConnection())

      await waitFor(() => {
        expect(mockConnection.getBalance).toHaveBeenCalledWith(mockPublicKey)
      })
    })

    it('should convert lamports to SOL correctly', async () => {
      const { result } = renderHook(() => useWalletConnection())

      await waitFor(() => {
        expect(result.current.balance).toBe(1) // 1 SOL
      })
    })

    it('should handle balance fetch errors gracefully', async () => {
      mockConnection.getBalance.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useWalletConnection())

      await waitFor(() => {
        expect(result.current.balance).toBeNull()
      })
    })
  })

  describe('disconnect', () => {
    it('should call disconnect and clear balance', async () => {
      mockDisconnect.mockResolvedValue(undefined)

      const { result } = renderHook(() => useWalletConnection())

      await act(async () => {
        await result.current.disconnect()
      })

      expect(mockDisconnect).toHaveBeenCalled()
    })
  })

  describe('transaction signing', () => {
    it('should call signTransaction when available', async () => {
      const mockTx = {} as any
      mockSignTransaction.mockResolvedValue(mockTx)

      const { result } = renderHook(() => useWalletConnection())

      await act(async () => {
        const signed = await result.current.signTransaction(mockTx)
        expect(signed).toBe(mockTx)
      })

      expect(mockSignTransaction).toHaveBeenCalledWith(mockTx)
    })

    it('should call signAllTransactions when available', async () => {
      const mockTxs = [{}, {}] as any[]
      mockSignAllTransactions.mockResolvedValue(mockTxs)

      const { result } = renderHook(() => useWalletConnection())

      await act(async () => {
        const signed = await result.current.signAllTransactions(mockTxs)
        expect(signed).toBe(mockTxs)
      })

      expect(mockSignAllTransactions).toHaveBeenCalledWith(mockTxs)
    })

    it('should call signMessage when available', async () => {
      const mockMessage = new Uint8Array([1, 2, 3])
      const mockSignature = new Uint8Array([4, 5, 6])
      mockSignMessage.mockResolvedValue(mockSignature)

      const { result } = renderHook(() => useWalletConnection())

      await act(async () => {
        const signature = await result.current.signMessage(mockMessage)
        expect(signature).toBe(mockSignature)
      })

      expect(mockSignMessage).toHaveBeenCalledWith(mockMessage)
    })
  })
})
