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

// Mock shadcn ButtonGroup component
jest.mock('@/components/ui/button-group', () => ({
  ButtonGroup: ({ children, ...props }: { children: React.ReactNode }) => (
    <div role="group" {...props}>{children}</div>
  ),
}))

describe('QuickAmountButtons', () => {
  const defaultProps = {
    balance: 100,
    currentAmount: '',
    onSelect: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render preset labels and +/- buttons plus Max', () => {
      render(<QuickAmountButtons {...defaultProps} />)
      // 3 presets × (- label +) = 9 buttons + 1 Max = 10
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(10)
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

  describe('preset label selection (absolute set)', () => {
    it('should select $5 correctly', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} currentAmount="" onSelect={onSelect} />)

      fireEvent.click(screen.getByText('$5'))
      expect(onSelect).toHaveBeenCalledWith('5.00')
    })

    it('should select $10 correctly', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} currentAmount="" onSelect={onSelect} />)

      fireEvent.click(screen.getByText('$10'))
      expect(onSelect).toHaveBeenCalledWith('10.00')
    })

    it('should select $20 correctly', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} currentAmount="" onSelect={onSelect} />)

      fireEvent.click(screen.getByText('$20'))
      expect(onSelect).toHaveBeenCalledWith('20.00')
    })

    it('should select Max using full balance', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} currentAmount="" onSelect={onSelect} />)

      fireEvent.click(screen.getByText('Max'))
      expect(onSelect).toHaveBeenCalledWith('100.00')
    })

    it('should round Max down to 2 decimal places', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={33.337} currentAmount="" onSelect={onSelect} />)

      fireEvent.click(screen.getByText('Max'))
      expect(onSelect).toHaveBeenCalledWith('33.33')
    })
  })

  describe('increment (+) buttons', () => {
    it('should add $5 to current amount', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} currentAmount="15" onSelect={onSelect} />)

      fireEvent.click(screen.getByLabelText('Add $5'))
      expect(onSelect).toHaveBeenCalledWith('20.00')
    })

    it('should add $10 to current amount', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} currentAmount="5" onSelect={onSelect} />)

      fireEvent.click(screen.getByLabelText('Add $10'))
      expect(onSelect).toHaveBeenCalledWith('15.00')
    })

    it('should treat empty input as 0 and set to preset value', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} currentAmount="" onSelect={onSelect} />)

      fireEvent.click(screen.getByLabelText('Add $10'))
      expect(onSelect).toHaveBeenCalledWith('10.00')
    })

    it('should disable + when adding would exceed effectiveMax', () => {
      render(<QuickAmountButtons balance={22} currentAmount="18" onSelect={jest.fn()} />)

      // 18 + 5 = 23 > 22 balance → disabled
      expect(screen.getByLabelText('Add $5')).toBeDisabled()
    })

    it('should disable all + buttons when near effectiveMax', () => {
      render(<QuickAmountButtons balance={100} currentAmount="96" onSelect={jest.fn()} />)

      expect(screen.getByLabelText('Add $5')).toBeDisabled()
      expect(screen.getByLabelText('Add $10')).toBeDisabled()
      expect(screen.getByLabelText('Add $20')).toBeDisabled()
    })

    it('should enable + when adding is within effectiveMax', () => {
      render(<QuickAmountButtons balance={100} currentAmount="90" onSelect={jest.fn()} />)

      expect(screen.getByLabelText('Add $5')).not.toBeDisabled()
      expect(screen.getByLabelText('Add $10')).not.toBeDisabled()
      expect(screen.getByLabelText('Add $20')).toBeDisabled()
    })
  })

  describe('decrement (-) buttons', () => {
    it('should subtract $5 from current amount', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} currentAmount="20" onSelect={onSelect} />)

      fireEvent.click(screen.getByLabelText('Subtract $5'))
      expect(onSelect).toHaveBeenCalledWith('15.00')
    })

    it('should subtract $10 from current amount', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={100} currentAmount="25" onSelect={onSelect} />)

      fireEvent.click(screen.getByLabelText('Subtract $10'))
      expect(onSelect).toHaveBeenCalledWith('15.00')
    })

    it('should disable - when current is 0', () => {
      render(<QuickAmountButtons balance={100} currentAmount="" onSelect={jest.fn()} />)

      expect(screen.getByLabelText('Subtract $5')).toBeDisabled()
      expect(screen.getByLabelText('Subtract $10')).toBeDisabled()
      expect(screen.getByLabelText('Subtract $20')).toBeDisabled()
    })

    it('should disable - when result would be below MIN_TRADE_AMOUNT', () => {
      render(<QuickAmountButtons balance={100} currentAmount="3" onSelect={jest.fn()} />)

      // $3 - $5 = -$2 < $0.10 → disabled
      expect(screen.getByLabelText('Subtract $5')).toBeDisabled()
      expect(screen.getByLabelText('Subtract $10')).toBeDisabled()
      expect(screen.getByLabelText('Subtract $20')).toBeDisabled()
    })

    it('should enable - when result stays above MIN_TRADE_AMOUNT', () => {
      render(<QuickAmountButtons balance={100} currentAmount="30" onSelect={jest.fn()} />)

      expect(screen.getByLabelText('Subtract $5')).not.toBeDisabled()
      expect(screen.getByLabelText('Subtract $10')).not.toBeDisabled()
      expect(screen.getByLabelText('Subtract $20')).not.toBeDisabled()
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

    it('should disable $10 and $20 preset labels when balance is $8', () => {
      render(<QuickAmountButtons {...defaultProps} balance={8} />)
      expect(screen.getByText('$5')).not.toBeDisabled()
      expect(screen.getByText('$10')).toBeDisabled()
      expect(screen.getByText('$20')).toBeDisabled()
      expect(screen.getByText('Max')).not.toBeDisabled()
    })

    it('should disable $20 preset label when balance is $15', () => {
      render(<QuickAmountButtons {...defaultProps} balance={15} />)
      expect(screen.getByText('$5')).not.toBeDisabled()
      expect(screen.getByText('$10')).not.toBeDisabled()
      expect(screen.getByText('$20')).toBeDisabled()
      expect(screen.getByText('Max')).not.toBeDisabled()
    })
  })

  describe('maxTradeAmount', () => {
    it('should cap Max button at maxTradeAmount when balance exceeds it', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={500} maxTradeAmount={100} currentAmount="" onSelect={onSelect} />)

      fireEvent.click(screen.getByText('Max'))
      expect(onSelect).toHaveBeenCalledWith('100.00')
    })

    it('should use balance when balance is less than maxTradeAmount', () => {
      const onSelect = jest.fn()
      render(<QuickAmountButtons balance={50} maxTradeAmount={100} currentAmount="" onSelect={onSelect} />)

      fireEvent.click(screen.getByText('Max'))
      expect(onSelect).toHaveBeenCalledWith('50.00')
    })

    it('should disable fixed buttons that exceed maxTradeAmount', () => {
      render(<QuickAmountButtons balance={500} maxTradeAmount={15} currentAmount="" onSelect={jest.fn()} />)
      expect(screen.getByText('$5')).not.toBeDisabled()
      expect(screen.getByText('$10')).not.toBeDisabled()
      expect(screen.getByText('$20')).toBeDisabled()
      expect(screen.getByText('Max')).not.toBeDisabled()
    })
  })

  describe('walletCapMax', () => {
    it('should disable + buttons when adding would exceed walletCapMax', () => {
      render(
        <QuickAmountButtons balance={500} walletCapMax={25} currentAmount="22" onSelect={jest.fn()} />
      )

      // 22 + 5 = 27 > 25 → disabled
      expect(screen.getByLabelText('Add $5')).toBeDisabled()
      expect(screen.getByLabelText('Add $10')).toBeDisabled()
      expect(screen.getByLabelText('Add $20')).toBeDisabled()
    })

    it('should enable + buttons when adding is within walletCapMax', () => {
      render(
        <QuickAmountButtons balance={500} walletCapMax={50} currentAmount="10" onSelect={jest.fn()} />
      )

      // 10 + 5 = 15 ≤ 50 → enabled
      expect(screen.getByLabelText('Add $5')).not.toBeDisabled()
      expect(screen.getByLabelText('Add $10')).not.toBeDisabled()
      expect(screen.getByLabelText('Add $20')).not.toBeDisabled()
    })

    it('should cap Max button at walletCapMax when it is lowest', () => {
      const onSelect = jest.fn()
      render(
        <QuickAmountButtons balance={500} maxTradeAmount={200} walletCapMax={30} currentAmount="" onSelect={onSelect} />
      )

      fireEvent.click(screen.getByText('Max'))
      expect(onSelect).toHaveBeenCalledWith('30.00')
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

    it('should have aria-labels for +/- buttons', () => {
      render(<QuickAmountButtons {...defaultProps} balance={100} />)
      expect(screen.getByLabelText('Add $5')).toBeInTheDocument()
      expect(screen.getByLabelText('Subtract $5')).toBeInTheDocument()
      expect(screen.getByLabelText('Add $10')).toBeInTheDocument()
      expect(screen.getByLabelText('Subtract $10')).toBeInTheDocument()
      expect(screen.getByLabelText('Add $20')).toBeInTheDocument()
      expect(screen.getByLabelText('Subtract $20')).toBeInTheDocument()
    })
  })
})
