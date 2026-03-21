/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { TradeTicket } from './trade-ticket'
import { EpochState } from '@/types/epoch'

// Mock hooks and stores
const mockUseWallet = {
  connected: true,
}

const mockUseWalletModal = {
  setVisible: jest.fn(),
}

const mockEpochState = {
  epochState: {
    epoch: {
      state: EpochState.Open,
      epochId: BigInt(1),
    },
    isFrozen: false,
    isSettling: false,
    isSettled: false,
  },
  isLoading: false,
  noEpochStatus: null,
}

const mockUsdcBalance = {
  balance: 100,
  formattedBalance: '100.00',
  isLoading: false,
}

const mockTradeStore = {
  direction: null as 'up' | 'down' | null,
  amount: '',
  error: null as string | null,
  isValid: false,
  setDirection: jest.fn(),
  setAmount: jest.fn(),
  validate: jest.fn(),
  reset: jest.fn(),
}

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => mockUseWallet,
}))

jest.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => mockUseWalletModal,
}))

const mockBuyPosition = {
  mutate: jest.fn(),
  isPending: false,
}

jest.mock('@/hooks', () => ({
  useEpoch: () => mockEpochState,
  useUsdcBalance: () => mockUsdcBalance,
  useBuyPosition: () => mockBuyPosition,
}))

jest.mock('@/stores/trade-store', () => ({
  useTradeStore: () => mockTradeStore,
}))

jest.mock('@/lib/constants', () => ({
  ASSET_METADATA: {
    BTC: { label: 'BTC', color: 'text-orange-500', feedId: 'mock' },
    ETH: { label: 'ETH', color: 'text-blue-500', feedId: 'mock' },
    SOL: { label: 'SOL', color: 'text-purple-500', feedId: 'mock' },
    FOGO: { label: 'FOGO', color: 'text-primary', feedId: '' },
  },
  USDC_DECIMALS: 6,
}))

jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock useTradePreview hook
const mockTradePreview = {
  capStatus: {
    walletCap: { level: 'ok', remainingLamports: 40_000_000n, maxAllowedLamports: 50_000_000n, usedPercent: 20, label: 'wallet' },
    sideCap: { level: 'ok', remainingLamports: 140_000_000n, maxAllowedLamports: 650_000_000n, usedPercent: 78, label: 'side' },
    mostRestrictive: 'wallet' as const,
    hasWarning: false,
    hasError: false,
  },
}

jest.mock('@/hooks/use-trade-preview', () => ({
  useTradePreview: () => mockTradePreview,
}))

// Mock useGlobalConfig
const mockGlobalConfig = {
  config: {
    allowHedging: false,
    maxTradeAmount: { toNumber: () => 100_000_000 },
  },
  isLoading: false,
}

jest.mock('@/hooks/use-global-config', () => ({
  useGlobalConfig: () => mockGlobalConfig,
}))

// Mock usePool
const mockPool = {
  pool: {
    activeEpoch: { toString: () => 'mock-epoch-pda' },
  },
  isLoading: false,
}

jest.mock('@/hooks/use-pool', () => ({
  usePool: () => mockPool,
}))

// Mock useUserPosition
const mockUpPosition = { position: null, isLoading: false }
const mockDownPosition = { position: null, isLoading: false }

jest.mock('@/hooks/use-user-position', () => ({
  useUserPosition: (_epochPda: unknown, direction: string) => {
    return direction === 'up' ? mockUpPosition : mockDownPosition
  },
}))

// Mock CapWarningBanner
jest.mock('./cap-warning-banner', () => ({
  CapWarningBanner: () => <div data-testid="cap-warning-banner">Cap Warning</div>,
}))

// Mock TradePreview
jest.mock('./trade-preview', () => ({
  TradePreview: () => <div data-testid="trade-preview">Trade Preview</div>,
}))

// Mock sub-components
jest.mock('./direction-button', () => ({
  DirectionButton: ({
    direction,
    onSelect,
    disabled,
  }: {
    direction: string
    selected: string | null
    onSelect: (dir: string) => void
    disabled: boolean
  }) => (
    <button
      data-testid={`direction-${direction}`}
      onClick={() => onSelect(direction)}
      disabled={disabled}
    >
      {direction.toUpperCase()}
    </button>
  ),
}))

jest.mock('./amount-input', () => ({
  AmountInput: ({
    value,
    onChange,
    disabled,
  }: {
    value: string
    onChange: (v: string) => void
    error: string | null
    disabled: boolean
  }) => (
    <input
      data-testid="amount-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  ),
}))

jest.mock('./quick-amount-buttons', () => ({
  QuickAmountButtons: ({
    onSelect,
    disabled,
  }: {
    onSelect: (v: string) => void
    disabled: boolean
  }) => (
    <button data-testid="quick-amounts" onClick={() => onSelect('50.00')} disabled={disabled}>
      Quick Amounts
    </button>
  ),
}))

jest.mock('./balance-display', () => ({
  BalanceDisplay: ({ formattedBalance, isConnected }: { formattedBalance: string | null; isConnected: boolean }) => (
    <div data-testid="balance-display">
      {isConnected ? `Balance: $${formattedBalance ?? '0.00'}` : 'Connect wallet'}
    </div>
  ),
}))

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

describe('TradeTicket', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseWallet.connected = true
    mockEpochState.epochState.epoch = { state: EpochState.Open, epochId: BigInt(1) }
    mockEpochState.epochState.isFrozen = false
    mockEpochState.noEpochStatus = null
    mockTradeStore.direction = null
    mockTradeStore.amount = ''
    mockTradeStore.error = null
    mockTradeStore.isValid = false
    mockBuyPosition.isPending = false
    mockTradePreview.capStatus.hasWarning = false
    mockTradePreview.capStatus.hasError = false
    mockGlobalConfig.config = {
      allowHedging: false,
      maxTradeAmount: { toNumber: () => 100_000_000 },
    }
    mockUpPosition.position = null
    mockDownPosition.position = null
  })

  describe('rendering', () => {
    it('should render trade ticket with asset label', () => {
      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Trade BTC')).toBeInTheDocument()
    })

    it('should render direction buttons', () => {
      render(<TradeTicket asset="BTC" />)
      expect(screen.getByTestId('direction-up')).toBeInTheDocument()
      expect(screen.getByTestId('direction-down')).toBeInTheDocument()
    })

    it('should render balance display', () => {
      render(<TradeTicket asset="BTC" />)
      expect(screen.getByTestId('balance-display')).toBeInTheDocument()
    })

    it('should render amount input', () => {
      render(<TradeTicket asset="BTC" />)
      expect(screen.getByTestId('amount-input')).toBeInTheDocument()
    })

    it('should render quick amount buttons', () => {
      render(<TradeTicket asset="BTC" />)
      expect(screen.getByTestId('quick-amounts')).toBeInTheDocument()
    })
  })

  describe('wallet not connected', () => {
    beforeEach(() => {
      mockUseWallet.connected = false
    })

    it('should show Connect Wallet button', () => {
      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Connect Wallet to Trade')).toBeInTheDocument()
    })

    it('should open wallet modal when Connect Wallet clicked', () => {
      render(<TradeTicket asset="BTC" />)
      fireEvent.click(screen.getByText('Connect Wallet to Trade'))
      expect(mockUseWalletModal.setVisible).toHaveBeenCalledWith(true)
    })
  })

  describe('epoch states', () => {
    it('should disable inputs when no active epoch', () => {
      mockEpochState.epochState.epoch = null
      mockEpochState.noEpochStatus = 'no-epoch'

      render(<TradeTicket asset="BTC" />)

      expect(screen.getByTestId('direction-up')).toBeDisabled()
      expect(screen.getByTestId('direction-down')).toBeDisabled()
      expect(screen.getByTestId('amount-input')).toBeDisabled()
    })

    it('should show message when epoch is frozen', () => {
      mockEpochState.epochState.epoch = { state: EpochState.Frozen }
      mockEpochState.epochState.isFrozen = true

      render(<TradeTicket asset="BTC" />)

      expect(screen.getByText('Epoch frozen - trading paused')).toBeInTheDocument()
    })

    it('should disable inputs when epoch is frozen', () => {
      mockEpochState.epochState.epoch = { state: EpochState.Frozen }
      mockEpochState.epochState.isFrozen = true

      render(<TradeTicket asset="BTC" />)

      expect(screen.getByTestId('direction-up')).toBeDisabled()
      expect(screen.getByTestId('direction-down')).toBeDisabled()
    })
  })

  describe('direction selection', () => {
    it('should call setDirection when direction button clicked', () => {
      render(<TradeTicket asset="BTC" />)
      fireEvent.click(screen.getByTestId('direction-up'))
      expect(mockTradeStore.setDirection).toHaveBeenCalledWith('up')
    })

    it('should show prompt when no direction selected', () => {
      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Select a direction to continue')).toBeInTheDocument()
    })
  })

  describe('amount input', () => {
    it('should call setAmount when amount changes', () => {
      render(<TradeTicket asset="BTC" />)
      fireEvent.change(screen.getByTestId('amount-input'), { target: { value: '50' } })
      expect(mockTradeStore.setAmount).toHaveBeenCalledWith('50', 100)
    })
  })

  describe('action button states', () => {
    it('should show Select Direction when no direction', () => {
      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Select Direction')).toBeInTheDocument()
    })

    it('should show Enter Amount when direction selected but no amount', () => {
      mockTradeStore.direction = 'up'
      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Enter Amount')).toBeInTheDocument()
    })

    it('should show Trading Unavailable when epoch not open', () => {
      mockEpochState.epochState.epoch = { state: EpochState.Frozen }
      mockEpochState.epochState.isFrozen = true
      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Trading Unavailable')).toBeInTheDocument()
    })
  })

  describe('cap exceeded', () => {
    it('should show Cap Exceeded and disable button when cap is exceeded', () => {
      mockTradeStore.direction = 'up'
      mockTradeStore.amount = '500'
      mockTradeStore.isValid = true
      mockTradePreview.capStatus.hasError = true

      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Cap Exceeded')).toBeInTheDocument()
      expect(screen.getByText('Cap Exceeded').closest('button')).toBeDisabled()
    })

    it('should show cap warning banner when cap has warning', () => {
      mockTradeStore.direction = 'up'
      mockTradeStore.amount = '45'
      mockTradeStore.isValid = true
      mockTradePreview.capStatus.hasWarning = true

      render(<TradeTicket asset="BTC" />)
      expect(screen.getByTestId('cap-warning-banner')).toBeInTheDocument()
    })
  })

  describe('hedging enforcement', () => {
    it('should show Hedging Disabled when user selects opposite direction with existing position', () => {
      mockTradeStore.direction = 'up'
      mockDownPosition.position = { shares: 1000n, direction: 'down' }
      mockGlobalConfig.config = {
        allowHedging: false,
        maxTradeAmount: { toNumber: () => 100_000_000 },
      }

      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Hedging Disabled')).toBeInTheDocument()
      expect(screen.getByText(/Hedging disabled — you have a Down position/i)).toBeInTheDocument()
    })

    it('should show Hedging Disabled when selecting down with existing up position', () => {
      mockTradeStore.direction = 'down'
      mockUpPosition.position = { shares: 500n, direction: 'up' }
      mockGlobalConfig.config = {
        allowHedging: false,
        maxTradeAmount: { toNumber: () => 100_000_000 },
      }

      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Hedging Disabled')).toBeInTheDocument()
      expect(screen.getByText(/Hedging disabled — you have an Up position/)).toBeInTheDocument()
    })

    it('should allow same-direction trade when hedging is disabled', () => {
      mockTradeStore.direction = 'up'
      mockTradeStore.amount = '10'
      mockTradeStore.isValid = true
      mockUpPosition.position = { shares: 500n, direction: 'up' }
      mockDownPosition.position = null
      mockGlobalConfig.config = {
        allowHedging: false,
        maxTradeAmount: { toNumber: () => 100_000_000 },
      }

      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Place Trade')).toBeInTheDocument()
    })

    it('should allow opposite-direction trade when hedging is enabled', () => {
      mockTradeStore.direction = 'up'
      mockTradeStore.amount = '10'
      mockTradeStore.isValid = true
      mockDownPosition.position = { shares: 1000n, direction: 'down' }
      mockGlobalConfig.config = {
        allowHedging: true,
        maxTradeAmount: { toNumber: () => 100_000_000 },
      }

      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Place Trade')).toBeInTheDocument()
    })

    it('should allow trade when opposite position exists with zero shares', () => {
      mockTradeStore.direction = 'up'
      mockTradeStore.amount = '10'
      mockTradeStore.isValid = true
      mockDownPosition.position = { shares: 0n, direction: 'down' }
      mockGlobalConfig.config = {
        allowHedging: false,
        maxTradeAmount: { toNumber: () => 100_000_000 },
      }

      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Place Trade')).toBeInTheDocument()
    })

    it('should allow trading when no existing position regardless of hedging flag', () => {
      mockTradeStore.direction = 'up'
      mockTradeStore.amount = '10'
      mockTradeStore.isValid = true
      mockUpPosition.position = null
      mockDownPosition.position = null

      render(<TradeTicket asset="BTC" />)
      expect(screen.getByText('Place Trade')).toBeInTheDocument()
    })
  })

  describe('asset change', () => {
    it('should call reset when asset changes', () => {
      const { rerender } = render(<TradeTicket asset="BTC" />)
      rerender(<TradeTicket asset="ETH" />)
      // Reset is called in useEffect, check it was called
      expect(mockTradeStore.reset).toHaveBeenCalled()
    })
  })
})
