/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { AmountInput } from './amount-input'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

describe('AmountInput', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
    error: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render with label', () => {
      render(<AmountInput {...defaultProps} />)
      expect(screen.getByText('Amount (USDC)')).toBeInTheDocument()
    })

    it('should render dollar sign prefix', () => {
      render(<AmountInput {...defaultProps} />)
      expect(screen.getByText('$')).toBeInTheDocument()
    })

    it('should render placeholder', () => {
      render(<AmountInput {...defaultProps} />)
      expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()
    })

    it('should display value', () => {
      render(<AmountInput {...defaultProps} value="100.50" />)
      expect(screen.getByDisplayValue('100.50')).toBeInTheDocument()
    })
  })

  describe('input validation', () => {
    it('should accept valid numeric input', async () => {
      const onChange = jest.fn()
      render(<AmountInput {...defaultProps} onChange={onChange} />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: '123' } })

      expect(onChange).toHaveBeenCalledWith('123')
    })

    it('should accept decimal input with up to 2 decimal places', async () => {
      const onChange = jest.fn()
      render(<AmountInput {...defaultProps} onChange={onChange} />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: '10.50' } })

      expect(onChange).toHaveBeenCalledWith('10.50')
    })

    it('should reject more than 2 decimal places', async () => {
      const onChange = jest.fn()
      render(<AmountInput {...defaultProps} onChange={onChange} value="10.50" />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: '10.505' } })

      // onChange should not be called with invalid value
      expect(onChange).not.toHaveBeenCalledWith('10.505')
    })

    it('should reject non-numeric characters', async () => {
      const onChange = jest.fn()
      render(<AmountInput {...defaultProps} onChange={onChange} />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'abc' } })

      expect(onChange).not.toHaveBeenCalledWith('abc')
    })

    it('should allow empty input', async () => {
      const onChange = jest.fn()
      render(<AmountInput {...defaultProps} onChange={onChange} value="100" />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: '' } })

      expect(onChange).toHaveBeenCalledWith('')
    })
  })

  describe('error display', () => {
    it('should not display error when none provided', () => {
      render(<AmountInput {...defaultProps} />)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('should display error message', () => {
      render(<AmountInput {...defaultProps} error="Exceeds balance" />)
      expect(screen.getByRole('alert')).toHaveTextContent('Exceeds balance')
    })

    it('should apply error styling to input container', () => {
      render(<AmountInput {...defaultProps} error="Error" />)
      const container = screen.getByRole('textbox').parentElement
      expect(container?.className).toContain('border-red-500')
    })
  })

  describe('disabled state', () => {
    it('should disable input when disabled prop is true', () => {
      render(<AmountInput {...defaultProps} disabled />)
      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('should apply disabled styling', () => {
      render(<AmountInput {...defaultProps} disabled />)
      const container = screen.getByRole('textbox').parentElement
      expect(container?.className).toContain('opacity-50')
    })
  })

  describe('accessibility', () => {
    it('should have aria-invalid when error exists', () => {
      render(<AmountInput {...defaultProps} error="Error" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    })

    it('should have aria-describedby linking to error message', () => {
      render(<AmountInput {...defaultProps} error="Error" />)
      const input = screen.getByRole('textbox')
      const errorId = input.getAttribute('aria-describedby')
      expect(errorId).toBeTruthy()
      expect(screen.getByRole('alert')).toHaveAttribute('id', errorId)
    })

    it('should have decimal input mode for mobile keyboards', () => {
      render(<AmountInput {...defaultProps} />)
      expect(screen.getByRole('textbox')).toHaveAttribute('inputMode', 'decimal')
    })
  })
})
