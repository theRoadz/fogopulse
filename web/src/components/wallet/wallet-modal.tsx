'use client'

import { useWallet, Wallet } from '@solana/wallet-adapter-react'
import { WalletReadyState } from '@solana/wallet-adapter-base'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface WalletModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WalletModal({ open, onOpenChange }: WalletModalProps) {
  const { wallets, select, connecting } = useWallet()

  const handleSelect = async (wallet: Wallet) => {
    try {
      select(wallet.adapter.name)
      // Connection happens automatically via WalletProvider with autoConnect
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      toast.error('Failed to connect wallet')
    }
  }

  // Filter to detected/installed wallets (Installed or Loadable)
  const detectedWallets = wallets.filter(
    (w) =>
      w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Select a wallet to connect to FogoPulse
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          {detectedWallets.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">
                No wallets detected. Please install a FOGO-compatible wallet.
              </p>
              <div className="flex flex-col gap-2">
                <a
                  href="https://phantom.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  Install Phantom
                </a>
                <a
                  href="https://www.backpack.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  Install Backpack
                </a>
              </div>
            </div>
          ) : (
            detectedWallets.map((wallet) => (
              <Button
                key={wallet.adapter.name}
                variant="outline"
                className="w-full justify-start gap-3 h-14"
                onClick={() => handleSelect(wallet)}
                disabled={connecting}
              >
                {wallet.adapter.icon && (
                  <img
                    src={wallet.adapter.icon}
                    alt={wallet.adapter.name}
                    className="h-6 w-6"
                  />
                )}
                <span className="font-medium">{wallet.adapter.name}</span>
                {connecting && (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                )}
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
