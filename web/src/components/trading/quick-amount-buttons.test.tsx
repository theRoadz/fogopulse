/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { QuickAmountButtons } from './quick-amount-buttons'

// Mock shadcn Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

describe('QuickAmountButtons', () => {
  const defaultProps = {
    balance: 100,
    onSelect: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render 4 buttons', () => {
      render(<QuickAmountButtons {...defaultProps} />)
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(4)
    })

    it('should display dollar amounts when balance available', () => {
      render(<QuickAmountButtons {...defaultProps} balance={100} />)
      // With $100 balance: 25%=$25, 50%=$50, 75%=$75, Max=$100
      expect(screen.getByText('$25')).toBeInTheDocument()
      expect(screen.getByText('$50')).toBeInTheDocument()
      expect(screen.getByText('$75')).toBeInTheDocument()
      expect(screen.getByText('$100')).toBeInTheDocument()
    })

    it('should display percentages when no balance', () => {
      render(<QuickAmountButtons {...defaultProps} balance={null} />)
      expect(screen.getByText('25%')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()
      expect(screen.getByText('75%')).toBeInTheDocument()
      expect(screen.getByText('Max')).toBeInTheDocument()
    })

    it('should format large amounts with k suffix', () => {
      render(<QuickAmountButtons {...defaultProps} balance={10000} />)
      // 25% of 10000 = 2500 -> $2.5k
      expect(screen.getByText('$2.5k')).toBeInTheDocument()
    })
  })

  describe('calculations', () => {
    it('should calculate 25% correctly', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('$25'))
      expect(onSelect).toHaveBeenCalledWith('25.00')
    })

    it('should calculate 50% correctly', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('$50'))
      expect(onSelect).toHaveBeenCalledWith('50.00')
    })

    it('should calculate 75% correctly', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('$75'))
      expect(onSelect).toHaveBeenCalledWith('75.00')
    })

    it('should calculate Max (100%) correctly', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('$100'))
      expect(onSelect).toHaveBeenCalledWith('100.00')
    })

    it('should round down to 2 decimal places', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={33.33} onSelect={onSelect} />)

      // 25% of 33.33 = 8.3325, rounded down = 8.33
      fireEvent.click(screen.getByText('$8'))
      expect(onSelect).toHaveBeenCalledWith('8.33')
    })
  })

  describe('disabled state', () => {
    it('should disable buttons when balance is null', () => {
      render(<QuickAmountButtons {...defaultProps} balance={null} />)
      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).toBeDisabled()
      })
    })

    it('should disable buttons when balance is 0', () => {
      render(<QuickAmountButtons {...defaultProps} balance={0} />)
      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).toBeDisabled()
      })
    })

    it('should disable buttons when disabled prop is true', () => {
      render(<QuickAmountButtons {...defaultProps} disabled />)
      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).toBeDisabled()
      })
    })

    it('should enable buttons when balance is positive', () => {
      render(<QuickAmountButtons {...defaultProps} balance={100} />)
      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).not.toBeDisabled()
      })
    })
  })

  describe('accessibility', () => {
    it('should have appropriate aria-labels', () => {
      render(<QuickAmountButtons {...defaultProps} balance={100} />)
      expect(
        screen.getByLabelText('Set amount to 25% of balance ($25.00)')
      ).toBeInTheDocument()
      expect(
        screen.getByLabelText('Set amount to Max of balance ($100.00)')
      ).toBeInTheDocument()
    })
  })
})
