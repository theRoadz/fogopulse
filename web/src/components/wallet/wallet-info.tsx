'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletConnection } from '@/hooks/use-wallet-connection'
import { ellipsify } from '@/lib/utils'

interface WalletInfoProps {
  showBalance?: boolean
  addressLength?: number
}

export function WalletInfo({ showBalance = false, addressLength = 4 }: WalletInfoProps) {
  const { publicKey, wallet } = useWallet()
  const { balance } = useWalletConnection()

  if (!publicKey) {
    return null
  }

  const truncatedAddress = ellipsify(publicKey.toBase58(), addressLength)

  return (
    <div className="flex items-center gap-2">
      {wallet?.adapter.icon && (
        <img
          src={wallet.adapter.icon}
          alt={wallet.adapter.name}
          className="h-4 w-4"
        />
      )}
      <span className="font-mono text-sm">{truncatedAddress}</span>
      {showBalance && balance !== null && (
        <span className="text-sm text-muted-foreground">
          ({balance.toFixed(2)} FOGO)
        </span>
      )}
    </div>
  )
}
