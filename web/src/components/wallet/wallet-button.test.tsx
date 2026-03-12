import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { WalletButton } from './wallet-button'

// Mock dependencies
const mockPublicKey = {
  toBase58: () => 'D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5',
}

const mockConnection = {
  getBalance: jest.fn().mockResolvedValue(2500000000), // 2.5 SOL
}

const mockWallet = {
  adapter: {
    name: 'Phantom',
    icon: 'https://phantom.app/icon.png',
  },
}

const mockDisconnect = jest.fn()

let mockConnected = false
let mockConnecting = false

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    publicKey: mockConnected ? mockPublicKey : null,
    wallet: mockConnected ? mockWallet : null,
    connected: mockConnected,
    connecting: mockConnecting,
    disconnect: mockDisconnect,
  }),
  useConnection: () => ({
    connection: mockConnection,
  }),
}))

jest.mock('../cluster/cluster-data-access', () => ({
  useCluster: () => ({
    cluster: { name: 'fogo-testnet', endpoint: 'https://testnet.fogo.io' },
    getExplorerUrl: (path: string) => `https://explorer.solana.com/${path}`,
  }),
}))

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

// Mock the WalletModal to avoid complexity
jest.mock('./wallet-modal', () => ({
  WalletModal: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
    open ? <div data-testid="wallet-modal">Mock Wallet Modal</div> : null,
}))

describe('WalletButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConnected = false
    mockConnecting = false
  })

  describe('disconnected state', () => {
    it('should render "Connect Wallet" button when disconnected', () => {
      mockConnected = false
      render(<WalletButton />)

      expect(screen.getByText('Connect Wallet')).toBeInTheDocument()
    })

    it('should render "Connecting..." when connecting', () => {
      mockConnected = false
      mockConnecting = true
      render(<WalletButton />)

      expect(screen.getByText('Connecting...')).toBeInTheDocument()
    })

    it('should open wallet modal when clicking connect button', () => {
      mockConnected = false
      render(<WalletButton />)

      const connectButton = screen.getByText('Connect Wallet')
      fireEvent.click(connectButton)

      expect(screen.getByTestId('wallet-modal')).toBeInTheDocument()
    })
  })

  describe('connected state', () => {
    beforeEach(() => {
      mockConnected = true
    })

    it('should display truncated address when connected', () => {
      render(<WalletButton />)

      // Address should be truncated: D8ht...DsX5
      expect(screen.getByText('D8ht..DsX5')).toBeInTheDocument()
    })

    it('should display wallet icon when connected', () => {
      render(<WalletButton />)

      const walletIcon = screen.getByAltText('Phantom')
      expect(walletIcon).toBeInTheDocument()
      expect(walletIcon).toHaveAttribute('src', 'https://phantom.app/icon.png')
    })

    it('should show dropdown menu with options when clicking connected button', async () => {
      render(<WalletButton />)

      const connectedButton = screen.getByText('D8ht..DsX5')
      fireEvent.click(connectedButton)

      await waitFor(() => {
        expect(screen.getByText('Copy Address')).toBeInTheDocument()
        expect(screen.getByText('View on Explorer')).toBeInTheDocument()
        expect(screen.getByText('Change Wallet')).toBeInTheDocument()
        expect(screen.getByText('Disconnect')).toBeInTheDocument()
      })
    })

    it('should show FOGO Testnet network indicator', async () => {
      render(<WalletButton />)

      const connectedButton = screen.getByText('D8ht..DsX5')
      fireEvent.click(connectedButton)

      await waitFor(() => {
        expect(screen.getByText('FOGO Testnet')).toBeInTheDocument()
      })
    })

    it('should show SOL balance in dropdown', async () => {
      render(<WalletButton />)

      const connectedButton = screen.getByText('D8ht..DsX5')
      fireEvent.click(connectedButton)

      await waitFor(() => {
        expect(screen.getByText(/Balance:/)).toBeInTheDocument()
      })
    })

    it('should call disconnect when clicking Disconnect menu item', async () => {
      mockDisconnect.mockResolvedValue(undefined)
      render(<WalletButton />)

      const connectedButton = screen.getByText('D8ht..DsX5')
      fireEvent.click(connectedButton)

      await waitFor(() => {
        const disconnectItem = screen.getByText('Disconnect')
        fireEvent.click(disconnectItem)
      })

      expect(mockDisconnect).toHaveBeenCalled()
    })

    it('should copy address to clipboard when clicking Copy Address', async () => {
      const mockClipboard = {
        writeText: jest.fn().mockResolvedValue(undefined),
      }
      Object.assign(navigator, { clipboard: mockClipboard })

      render(<WalletButton />)

      const connectedButton = screen.getByText('D8ht..DsX5')
      fireEvent.click(connectedButton)

      await waitFor(() => {
        const copyItem = screen.getByText('Copy Address')
        fireEvent.click(copyItem)
      })

      expect(mockClipboard.writeText).toHaveBeenCalledWith('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
    })
  })
})
