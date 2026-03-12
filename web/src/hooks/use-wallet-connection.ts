'use client'

import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL, Transaction, VersionedTransaction } from '@solana/web3.js'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

export interface WalletConnectionState {
  // Connection state
  connected: boolean
  connecting: boolean
  disconnecting: boolean

  // Wallet info
  publicKey: string | null
  walletName: string | null
  walletIcon: string | null

  // Balance (SOL)
  balance: number | null
  balanceLoading: boolean

  // Actions
  connect: () => void
  disconnect: () => Promise<void>
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>
  signMessage: (message: Uint8Array) => Promise<Uint8Array>

  // Refresh balance manually
  refreshBalance: () => Promise<void>
}

export function useWalletConnection(): WalletConnectionState {
  const {
    publicKey,
    wallet,
    connected,
    connecting,
    disconnecting,
    connect,
    disconnect,
    signTransaction,
    signAllTransactions,
    signMessage,
  } = useWallet()
  const { connection } = useConnection()

  const [balance, setBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connection) {
      setBalance(null)
      return
    }

    setBalanceLoading(true)
    try {
      const lamports = await connection.getBalance(publicKey)
      setBalance(lamports / LAMPORTS_PER_SOL)
    } catch (error) {
      console.error('Failed to fetch balance:', error)
      setBalance(null)
    } finally {
      setBalanceLoading(false)
    }
  }, [publicKey, connection])

  // Fetch balance on connect and set up refresh interval
  useEffect(() => {
    if (!connected || !publicKey) {
      setBalance(null)
      return
    }

    fetchBalance()

    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000)

    return () => clearInterval(interval)
  }, [connected, publicKey, fetchBalance])

  const handleConnect = useCallback(() => {
    // This opens the wallet modal - actual connection happens via WalletProvider
    // The component using this hook should handle showing a wallet selection modal
    try {
      connect()
    } catch (error) {
      console.error('Failed to connect:', error)
      toast.error('Failed to connect wallet')
    }
  }, [connect])

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect()
      setBalance(null)
      toast.success('Wallet disconnected')
    } catch (error) {
      console.error('Failed to disconnect:', error)
      toast.error('Failed to disconnect wallet')
    }
  }, [disconnect])

  const handleSignTransaction = useCallback(
    async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (!signTransaction) {
        throw new Error('Wallet does not support signing transactions')
      }
      return signTransaction(tx)
    },
    [signTransaction]
  )

  const handleSignAllTransactions = useCallback(
    async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      if (!signAllTransactions) {
        throw new Error('Wallet does not support signing multiple transactions')
      }
      return signAllTransactions(txs)
    },
    [signAllTransactions]
  )

  const handleSignMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      if (!signMessage) {
        throw new Error('Wallet does not support signing messages')
      }
      return signMessage(message)
    },
    [signMessage]
  )

  return {
    // State
    connected,
    connecting,
    disconnecting,

    // Wallet info
    publicKey: publicKey?.toBase58() ?? null,
    walletName: wallet?.adapter.name ?? null,
    walletIcon: wallet?.adapter.icon ?? null,

    // Balance
    balance,
    balanceLoading,

    // Actions
    connect: handleConnect,
    disconnect: handleDisconnect,
    signTransaction: handleSignTransaction,
    signAllTransactions: handleSignAllTransactions,
    signMessage: handleSignMessage,
    refreshBalance: fetchBalance,
  }
}
