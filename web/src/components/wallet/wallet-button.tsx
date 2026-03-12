'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Wallet2, Copy, ExternalLink, LogOut, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { WalletModal } from './wallet-modal'
import { useCluster } from '../cluster/cluster-data-access'
import { useWalletConnection } from '@/hooks/use-wallet-connection'
import { ellipsify } from '@/lib/utils'

export function WalletButton() {
  const { publicKey, wallet, connecting } = useWallet()
  const { cluster, getExplorerUrl } = useCluster()
  const { balance, disconnect } = useWalletConnection()
  const [showModal, setShowModal] = useState(false)

  const truncatedAddress = publicKey
    ? ellipsify(publicKey.toBase58(), 4)
    : null

  const copyAddress = async () => {
    if (publicKey) {
      await navigator.clipboard.writeText(publicKey.toBase58())
      toast.success('Address copied to clipboard')
    }
  }

  const viewOnExplorer = () => {
    if (publicKey) {
      const url = getExplorerUrl(`address/${publicKey.toBase58()}`)
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleDisconnect = async () => {
    await disconnect()
  }

  // Determine network display name
  const getNetworkDisplay = () => {
    if (cluster.name === 'fogo-testnet') {
      return { name: 'FOGO Testnet', className: 'text-yellow-500' }
    }
    if (cluster.name === 'fogo-mainnet' || cluster.name === 'mainnet-beta') {
      return { name: 'FOGO Mainnet', className: 'text-green-500' }
    }
    if (cluster.name === 'devnet') {
      return { name: 'Devnet', className: 'text-blue-500' }
    }
    if (cluster.name === 'local') {
      return { name: 'Localhost', className: 'text-gray-500' }
    }
    return { name: cluster.name, className: 'text-muted-foreground' }
  }

  const networkDisplay = getNetworkDisplay()

  // Disconnected state - show connect button
  if (!publicKey) {
    return (
      <>
        <Button
          onClick={() => setShowModal(true)}
          disabled={connecting}
          className="gap-2"
        >
          <Wallet2 className="h-4 w-4" />
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </Button>
        <WalletModal open={showModal} onOpenChange={setShowModal} />
      </>
    )
  }

  // Connected state - show dropdown
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            {wallet?.adapter.icon && (
              <img
                src={wallet.adapter.icon}
                alt={wallet.adapter.name}
                className="h-4 w-4"
              />
            )}
            {truncatedAddress}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Network indicator */}
          <div className="px-2 py-1.5 text-sm">
            <span className="text-muted-foreground">Connected to </span>
            <span className={networkDisplay.className}>{networkDisplay.name}</span>
          </div>

          {/* Balance display */}
          {balance !== null && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Balance: {balance.toFixed(4)} SOL
            </div>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={copyAddress}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Address
          </DropdownMenuItem>

          <DropdownMenuItem onClick={viewOnExplorer}>
            <ExternalLink className="mr-2 h-4 w-4" />
            View on Explorer
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setShowModal(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Change Wallet
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleDisconnect}
            className="text-red-600 focus:text-red-600"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WalletModal open={showModal} onOpenChange={setShowModal} />
    </>
  )
}
