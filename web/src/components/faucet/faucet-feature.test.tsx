/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { FaucetFeature } from './faucet-feature'

// Mock wallet adapter
const mockUseWallet = jest.fn()
jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => mockUseWallet(),
}))

// Mock hooks
const mockUseUsdcBalance = jest.fn()
jest.mock('@/hooks/use-usdc-balance', () => ({
  useUsdcBalance: () => mockUseUsdcBalance(),
}))

const mockMutate = jest.fn()
const mockUseFaucetMint = jest.fn()
jest.mock('@/hooks/use-faucet-mint', () => ({
  useFaucetMint: () => mockUseFaucetMint(),
}))

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-header" className={className}>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h3 data-testid="card-title">{children}</h3>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>{children}</div>
  ),
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: React.ComponentProps<'button'>) => (
    <button data-testid="mint-button" onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/wallet', () => ({
  WalletButton: () => <button data-testid="wallet-button">Connect Wallet</button>,
}))

jest.mock('lucide-react', () => ({
  Droplets: ({ className }: { className?: string }) => (
    <svg data-testid="droplets-icon" className={className} />
  ),
}))

describe('FaucetFeature', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseFaucetMint.mockReturnValue({ mutate: mockMutate, isPending: false, isOverCap: false })
  })

  describe('when wallet is not connected', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ connected: false })
      mockUseUsdcBalance.mockReturnValue({
        formattedBalance: null,
        balance: null,
        isLoading: false,
      })
    })

    it('should show the faucet title', () => {
      render(<FaucetFeature />)
      expect(screen.getByText('USDC Testnet Faucet')).toBeInTheDocument()
    })

    it('should show connect wallet button', () => {
      render(<FaucetFeature />)
      expect(screen.getByTestId('wallet-button')).toBeInTheDocument()
    })

    it('should not show mint button', () => {
      render(<FaucetFeature />)
      expect(screen.queryByTestId('mint-button')).not.toBeInTheDocument()
    })

    it('should show dash for balance', () => {
      render(<FaucetFeature />)
      expect(screen.getByText('—')).toBeInTheDocument()
    })
  })

  describe('when wallet is connected with low balance', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ connected: true })
      mockUseUsdcBalance.mockReturnValue({
        formattedBalance: '50.00',
        balance: 50,
        isLoading: false,
      })
    })

    it('should show USDC balance', () => {
      render(<FaucetFeature />)
      expect(screen.getByText('50.00 USDC')).toBeInTheDocument()
    })

    it('should show mint button enabled with generic label', () => {
      render(<FaucetFeature />)
      const button = screen.getByTestId('mint-button')
      expect(button).not.toBeDisabled()
      expect(button).toHaveTextContent('Mint Test USDC')
    })

    it('should not reveal mint amount in button text', () => {
      render(<FaucetFeature />)
      const button = screen.getByTestId('mint-button')
      expect(button.textContent).not.toMatch(/\d{3,}/)
    })

    it('should call mutate when mint button is clicked', () => {
      render(<FaucetFeature />)
      fireEvent.click(screen.getByTestId('mint-button'))
      expect(mockMutate).toHaveBeenCalledTimes(1)
    })

    it('should not show over-cap warning', () => {
      render(<FaucetFeature />)
      expect(screen.queryByText(/already have enough/i)).not.toBeInTheDocument()
    })
  })

  describe('when server flagged over-cap (isOverCap from hook)', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ connected: true })
      mockUseUsdcBalance.mockReturnValue({
        formattedBalance: '500.00',
        balance: 500,
        isLoading: false,
      })
      mockUseFaucetMint.mockReturnValue({ mutate: mockMutate, isPending: false, isOverCap: true })
    })

    it('should disable mint button', () => {
      render(<FaucetFeature />)
      const button = screen.getByTestId('mint-button')
      expect(button).toBeDisabled()
    })

    it('should show over-cap warning', () => {
      render(<FaucetFeature />)
      expect(screen.getByText(/already have enough USDC to trade/i)).toBeInTheDocument()
    })

    it('should not reveal cap value in the warning', () => {
      render(<FaucetFeature />)
      const warning = screen.getByText(/already have enough/i)
      expect(warning.textContent).not.toMatch(/\d{3,}/)
    })
  })

  describe('when minting is in progress', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ connected: true })
      mockUseUsdcBalance.mockReturnValue({
        formattedBalance: '50.00',
        balance: 50,
        isLoading: false,
      })
      mockUseFaucetMint.mockReturnValue({ mutate: mockMutate, isPending: true, isOverCap: false })
    })

    it('should show "Minting..." text', () => {
      render(<FaucetFeature />)
      expect(screen.getByText('Minting...')).toBeInTheDocument()
    })

    it('should disable button while pending', () => {
      render(<FaucetFeature />)
      expect(screen.getByTestId('mint-button')).toBeDisabled()
    })
  })

  describe('when balance is loading', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ connected: true })
      mockUseUsdcBalance.mockReturnValue({
        formattedBalance: null,
        balance: null,
        isLoading: true,
      })
    })

    it('should show loading indicator', () => {
      render(<FaucetFeature />)
      expect(screen.getByText('...')).toBeInTheDocument()
    })

    it('should disable mint button while loading', () => {
      render(<FaucetFeature />)
      expect(screen.getByTestId('mint-button')).toBeDisabled()
    })
  })

  describe('no cap/amount values leaked to client', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ connected: true })
      mockUseUsdcBalance.mockReturnValue({
        formattedBalance: '0.00',
        balance: 0,
        isLoading: false,
      })
    })

    it('should not display balance cap anywhere', () => {
      render(<FaucetFeature />)
      expect(screen.queryByText('500')).not.toBeInTheDocument()
      expect(screen.queryByText('Balance cap')).not.toBeInTheDocument()
    })

    it('should not display amount per request label', () => {
      render(<FaucetFeature />)
      expect(screen.queryByText('Amount per request')).not.toBeInTheDocument()
      expect(screen.queryByText('1000')).not.toBeInTheDocument()
    })
  })
})
