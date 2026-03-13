'use client'

import { useMemo } from 'react'
import { PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { useConnection } from '@solana/wallet-adapter-react'

import idl from '@/lib/fogopulse.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = Program<any>

/**
 * Dummy wallet for read-only Anchor operations
 * Used when we need to decode accounts but don't need to sign transactions
 */
const DUMMY_WALLET = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error('Read-only provider')
  },
  signAllTransactions: async () => {
    throw new Error('Read-only provider')
  },
}

/**
 * Hook for accessing the Anchor Program instance.
 *
 * Returns a read-only program instance suitable for fetching and decoding accounts.
 * For write operations, use the wallet's sendTransaction directly with built instructions.
 *
 * Pattern reused from use-epoch.ts for consistency across the codebase.
 *
 * NOTE: This hook requires ConnectionProvider to be set up. The connection from
 * useConnection() should never be null if the provider is properly configured.
 * If connection issues occur, check that WalletProvider wraps the component tree.
 */
export function useProgram(): AnchorProgram {
  const { connection } = useConnection()

  // Create Anchor program instance with dummy provider for reads
  // Connection is guaranteed by wallet adapter provider - no fallback needed
  const program: AnchorProgram = useMemo(() => {
    const dummyProvider = new AnchorProvider(connection, DUMMY_WALLET, {
      commitment: 'confirmed',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Program(idl as any, dummyProvider)
  }, [connection])

  return program
}
