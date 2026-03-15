/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'
import { toast } from 'sonner'

import { VerificationLinks } from './verification-links'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
  getExplorerUrl: (address: string, type: 'address' | 'tx' = 'address') => {
    const rpcParam = encodeURIComponent('https://testnet.fogo.io')
    return `https://explorer.solana.com/${type}/${address}?cluster=custom&customUrl=${rpcParam}`
  },
}))

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

// Mock shadcn Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    asChild,
    className,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    asChild?: boolean
    className?: string
  }) => {
    if (asChild) {
      return <>{children}</>
    }
    return (
      <button data-testid="button" onClick={onClick} className={className} {...props}>
        {children}
      </button>
    )
  },
}))

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Copy: () => <span data-testid="copy-icon" />,
  ExternalLink: () => <span data-testid="external-link-icon" />,
}))

// Mock clipboard API
const mockClipboard = {
  writeText: jest.fn(),
}
Object.assign(navigator, {
  clipboard: mockClipboard,
})

describe('VerificationLinks', () => {
  const epochPda = new PublicKey('11111111111111111111111111111111')

  beforeEach(() => {
    jest.clearAllMocks()
    mockClipboard.writeText.mockResolvedValue(undefined)
  })

  describe('rendering', () => {
    it('should render copy button', () => {
      render(<VerificationLinks epochPda={epochPda} />)
      expect(screen.getByText('Copy Epoch Address')).toBeInTheDocument()
    })

    it('should render explorer link', () => {
      render(<VerificationLinks epochPda={epochPda} />)
      expect(screen.getByText('View on Explorer')).toBeInTheDocument()
    })

    it('should render copy icon', () => {
      render(<VerificationLinks epochPda={epochPda} />)
      expect(screen.getByTestId('copy-icon')).toBeInTheDocument()
    })

    it('should render external link icon', () => {
      render(<VerificationLinks epochPda={epochPda} />)
      expect(screen.getByTestId('external-link-icon')).toBeInTheDocument()
    })
  })

  describe('copy functionality', () => {
    it('should copy epoch address to clipboard when copy button clicked', async () => {
      render(<VerificationLinks epochPda={epochPda} />)

      const copyButton = screen.getByText('Copy Epoch Address').closest('button')
      fireEvent.click(copyButton!)

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith(epochPda.toBase58())
      })
    })

    it('should show success toast after copying', async () => {
      render(<VerificationLinks epochPda={epochPda} />)

      const copyButton = screen.getByText('Copy Epoch Address').closest('button')
      fireEvent.click(copyButton!)

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Epoch address copied to clipboard')
      })
    })

    it('should show error toast if clipboard fails', async () => {
      mockClipboard.writeText.mockRejectedValue(new Error('Clipboard error'))

      render(<VerificationLinks epochPda={epochPda} />)

      const copyButton = screen.getByText('Copy Epoch Address').closest('button')
      fireEvent.click(copyButton!)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to copy address')
      })
    })
  })

  describe('explorer link', () => {
    it('should have correct href with FOGO testnet custom cluster', () => {
      render(<VerificationLinks epochPda={epochPda} />)

      const link = screen.getByText('View on Explorer').closest('a')
      expect(link).toHaveAttribute(
        'href',
        expect.stringContaining('https://explorer.solana.com/address/')
      )
      expect(link).toHaveAttribute('href', expect.stringContaining(epochPda.toBase58()))
      expect(link).toHaveAttribute('href', expect.stringContaining('cluster=custom'))
      expect(link).toHaveAttribute(
        'href',
        expect.stringContaining(encodeURIComponent('https://testnet.fogo.io'))
      )
    })

    it('should open link in new tab', () => {
      render(<VerificationLinks epochPda={epochPda} />)

      const link = screen.getByText('View on Explorer').closest('a')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  describe('responsive labels', () => {
    it('should have short labels for mobile (sm:hidden)', () => {
      render(<VerificationLinks epochPda={epochPda} />)

      expect(screen.getByText('Copy')).toBeInTheDocument()
      expect(screen.getByText('Explorer')).toBeInTheDocument()
    })

    it('should have full labels for desktop (hidden sm:inline)', () => {
      render(<VerificationLinks epochPda={epochPda} />)

      expect(screen.getByText('Copy Epoch Address')).toBeInTheDocument()
      expect(screen.getByText('View on Explorer')).toBeInTheDocument()
    })
  })

  describe('custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <VerificationLinks epochPda={epochPda} className="custom-class" />
      )
      expect(container.firstChild).toHaveClass('custom-class')
    })
  })
})
