'use client'

import { WalletError } from '@solana/wallet-adapter-base'
import {
  AnchorWallet,
  ConnectionProvider,
  useConnection,
  useWallet,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { ReactNode, useCallback, useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { AnchorProvider } from '@coral-xyz/anchor'
import { toast } from 'sonner'

export function SolanaProvider({ children }: { children: ReactNode }) {
  const { cluster } = useCluster()
  const endpoint = useMemo(() => cluster.endpoint, [cluster])

  const onError = useCallback((error: WalletError) => {
    console.error('Wallet error:', error)

    // Show user-friendly error messages
    if (error.name === 'WalletNotReadyError') {
      toast.error('Wallet not ready. Please ensure your wallet extension is installed and unlocked.')
    } else if (error.name === 'WalletConnectionError') {
      toast.error('Failed to connect wallet. Please try again.')
    } else if (error.name === 'WalletDisconnectedError') {
      toast.info('Wallet disconnected')
    } else if (error.name === 'WalletSignTransactionError') {
      toast.error('Transaction signing failed. Please try again.')
    } else if (error.message?.includes('User rejected')) {
      toast.info('Connection request cancelled')
    } else {
      toast.error(`Wallet error: ${error.message || 'Unknown error'}`)
    }
  }, [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} onError={onError} autoConnect={true}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}

export function useAnchorProvider() {
  const { connection } = useConnection()
  const wallet = useWallet()

  return new AnchorProvider(connection, wallet as AnchorWallet, { commitment: 'confirmed' })
}
