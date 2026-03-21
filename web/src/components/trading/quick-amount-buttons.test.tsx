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

    it('should display fixed dollar labels', () => {
      render(<QuickAmountButtons {...defaultProps} balance={100} />)
      expect(screen.getByText('$5')).toBeInTheDocument()
      expect(screen.getByText('$10')).toBeInTheDocument()
      expect(screen.getByText('$20')).toBeInTheDocument()
      expect(screen.getByText('Max')).toBeInTheDocument()
    })

    it('should display same labels when no balance', () => {
      render(<QuickAmountButtons {...defaultProps} balance={null} />)
      expect(screen.getByText('$5')).toBeInTheDocument()
      expect(screen.getByText('$10')).toBeInTheDocument()
      expect(screen.getByText('$20')).toBeInTheDocument()
      expect(screen.getByText('Max')).toBeInTheDocument()
    })
  })

  describe('selection', () => {
    it('should select $5 correctly', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('$5'))
      expect(onSelect).toHaveBeenCalledWith('5.00')
    })

    it('should select $10 correctly', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('$10'))
      expect(onSelect).toHaveBeenCalledWith('10.00')
    })

    it('should select $20 correctly', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('$20'))
      expect(onSelect).toHaveBeenCalledWith('20.00')
    })

    it('should select Max using full balance', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('Max'))
      expect(onSelect).toHaveBeenCalledWith('100.00')
    })

    it('should round Max down to 2 decimal places', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={33.337} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('Max'))
      expect(onSelect).toHaveBeenCalledWith('33.33')
    })
  })

  describe('disabled state', () => {
    it('should disable all buttons when balance is null', () => {
      render(<QuickAmountButtons {...defaultProps} balance={null} />)
      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).toBeDisabled()
      })
    })

    it('should disable all buttons when balance is 0', () => {
      render(<QuickAmountButtons {...defaultProps} balance={0} />)
      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).toBeDisabled()
      })
    })

    it('should disable all buttons when disabled prop is true', () => {
      render(<QuickAmountButtons {...defaultProps} disabled />)
      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).toBeDisabled()
      })
    })

    it('should disable $10 and $20 when balance is $8', () => {
      render(<QuickAmountButtons {...defaultProps} balance={8} />)
      expect(screen.getByText('$5')).not.toBeDisabled()
      expect(screen.getByText('$10')).toBeDisabled()
      expect(screen.getByText('$20')).toBeDisabled()
      expect(screen.getByText('Max')).not.toBeDisabled()
    })

    it('should disable $20 when balance is $15', () => {
      render(<QuickAmountButtons {...defaultProps} balance={15} />)
      expect(screen.getByText('$5')).not.toBeDisabled()
      expect(screen.getByText('$10')).not.toBeDisabled()
      expect(screen.getByText('$20')).toBeDisabled()
      expect(screen.getByText('Max')).not.toBeDisabled()
    })

    it('should enable all buttons when balance is sufficient', () => {
      render(<QuickAmountButtons {...defaultProps} balance={100} />)
      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).not.toBeDisabled()
      })
    })
  })

  describe('maxTradeAmount', () => {
    it('should cap Max button at maxTradeAmount when balance exceeds it', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={500} maxTradeAmount={100} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('Max'))
      expect(onSelect).toHaveBeenCalledWith('100.00')
    })

    it('should use balance when balance is less than maxTradeAmount', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={50} maxTradeAmount={100} onSelect={onSelect} />)

      fireEvent.click(screen.getByText('Max'))
      expect(onSelect).toHaveBeenCalledWith('50.00')
    })

    it('should disable fixed buttons that exceed maxTradeAmount', () => {
      render(<QuickAmountButtons balance={500} maxTradeAmount={15} onSelect={jest.fn()} />)
      expect(screen.getByText('$5')).not.toBeDisabled()
      expect(screen.getByText('$10')).not.toBeDisabled()
      expect(screen.getByText('$20')).toBeDisabled()
      expect(screen.getByText('Max')).not.toBeDisabled()
    })
  })

  describe('accessibility', () => {
    it('should have appropriate aria-labels for fixed amounts', () => {
      render(<QuickAmountButtons {...defaultProps} balance={100} />)
      expect(screen.getByLabelText('Set amount to $5')).toBeInTheDocument()
      expect(screen.getByLabelText('Set amount to $10')).toBeInTheDocument()
      expect(screen.getByLabelText('Set amount to $20')).toBeInTheDocument()
    })

    it('should have appropriate aria-label for Max with balance', () => {
      render(<QuickAmountButtons {...defaultProps} balance={100} />)
      expect(
        screen.getByLabelText('Set amount to max balance ($100.00)')
      ).toBeInTheDocument()
    })
  })
})
