/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { DirectionButton } from './direction-button'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock shadcn Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    className,
    onClick,
    disabled,
    ...props
  }: {
    children: React.ReactNode
    className?: string
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button
      data-testid="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  ),
}))

describe('DirectionButton', () => {
  describe('UP button', () => {
    it('should display UP label with triangle icon', () => {
      render(
        <DirectionButton direction="up" selected={null} onSelect={jest.fn()} />
      )
      expect(screen.getByText('UP')).toBeInTheDocument()
      expect(screen.getByText('▲')).toBeInTheDocument()
    })

    it('should apply green styling for UP button', () => {
      render(
        <DirectionButton direction="up" selected={null} onSelect={jest.fn()} />
      )
      const button = screen.getByTestId('button')
      expect(button.className).toContain('text-green-500')
      expect(button.className).toContain('border-green-500/50')
    })

    it('should show selected state with filled background', () => {
      render(
        <DirectionButton direction="up" selected="up" onSelect={jest.fn()} />
      )
      const button = screen.getByTestId('button')
      expect(button.className).toContain('bg-green-500/20')
      expect(button.className).toContain('border-green-500')
    })

    it('should show hover state when not selected', () => {
      render(
        <DirectionButton direction="up" selected={null} onSelect={jest.fn()} />
      )
      const button = screen.getByTestId('button')
      expect(button.className).toContain('hover:bg-green-500/10')
    })
  })

  describe('DOWN button', () => {
    it('should display DOWN label with triangle icon', () => {
      render(
        <DirectionButton direction="down" selected={null} onSelect={jest.fn()} />
      )
      expect(screen.getByText('DOWN')).toBeInTheDocument()
      expect(screen.getByText('▼')).toBeInTheDocument()
    })

    it('should apply red styling for DOWN button', () => {
      render(
        <DirectionButton direction="down" selected={null} onSelect={jest.fn()} />
      )
      const button = screen.getByTestId('button')
      expect(button.className).toContain('text-red-500')
      expect(button.className).toContain('border-red-500/50')
    })

    it('should show selected state with filled background', () => {
      render(
        <DirectionButton direction="down" selected="down" onSelect={jest.fn()} />
      )
      const button = screen.getByTestId('button')
      expect(button.className).toContain('bg-red-500/20')
      expect(button.className).toContain('border-red-500')
    })
  })

  describe('interaction', () => {
    it('should call onSelect when clicked', () => {
      const onSelect = jest.fn()
      render(
        <DirectionButton direction="up" selected={null} onSelect={onSelect} />
      )
      fireEvent.click(screen.getByTestId('button'))
      expect(onSelect).toHaveBeenCalledWith('up')
    })

    it('should call onSelect with down direction', () => {
      const onSelect = jest.fn()
      render(
        <DirectionButton direction="down" selected={null} onSelect={onSelect} />
      )
      fireEvent.click(screen.getByTestId('button'))
      expect(onSelect).toHaveBeenCalledWith('down')
    })

    it('should not call onSelect when disabled', () => {
      const onSelect = jest.fn()
      render(
        <DirectionButton
          direction="up"
          selected={null}
          onSelect={onSelect}
          disabled
        />
      )
      fireEvent.click(screen.getByTestId('button'))
      expect(onSelect).not.toHaveBeenCalled()
    })
  })

  describe('accessibility', () => {
    it('should have aria-pressed for selected state', () => {
      render(
        <DirectionButton direction="up" selected="up" onSelect={jest.fn()} />
      )
      const button = screen.getByTestId('button')
      expect(button).toHaveAttribute('aria-pressed', 'true')
    })

    it('should have aria-pressed false when not selected', () => {
      render(
        <DirectionButton direction="up" selected={null} onSelect={jest.fn()} />
      )
      const button = screen.getByTestId('button')
      expect(button).toHaveAttribute('aria-pressed', 'false')
    })

    it('should have appropriate aria-label', () => {
      render(
        <DirectionButton direction="up" selected={null} onSelect={jest.fn()} />
      )
      const button = screen.getByTestId('button')
      expect(button).toHaveAttribute('aria-label', 'Predict price goes UP')
    })
  })
})
