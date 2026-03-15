'use client'

import { Copy, ExternalLink } from 'lucide-react'
import { PublicKey } from '@solana/web3.js'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn, getExplorerUrl } from '@/lib/utils'

interface VerificationLinksProps {
  /** Epoch PDA address */
  epochPda: PublicKey
  /** Additional CSS classes */
  className?: string
}

/**
 * Verification links component for settlement transparency.
 *
 * Provides:
 * - Copy Epoch Address button (copies to clipboard with toast feedback)
 * - View on Explorer link (opens Solana Explorer with FOGO testnet RPC)
 */
export function VerificationLinks({ epochPda, className }: VerificationLinksProps) {
  const epochAddress = epochPda.toBase58()

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(epochAddress)
      toast.success('Epoch address copied to clipboard')
    } catch (err) {
      console.error('Failed to copy address:', err)
      toast.error('Failed to copy address')
    }
  }

  const explorerUrl = getExplorerUrl(epochAddress)

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyAddress}
        className="gap-1.5 text-xs"
      >
        <Copy className="h-3 w-3" />
        <span className="hidden sm:inline">Copy Epoch Address</span>
        <span className="sm:hidden">Copy</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        asChild
        className="gap-1.5 text-xs"
      >
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink className="h-3 w-3" />
          <span className="hidden sm:inline">View on Explorer</span>
          <span className="sm:hidden">Explorer</span>
        </a>
      </Button>
    </div>
  )
}
