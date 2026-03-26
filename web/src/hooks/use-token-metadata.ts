'use client'

import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { USDC_MINT } from '@/lib/constants'

const TOKEN_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

export interface TokenMeta {
  name: string
  symbol: string
}

// Hardcoded fallbacks for tokens without Metaplex metadata
const FALLBACK_METADATA: Record<string, TokenMeta> = {
  [USDC_MINT.toBase58()]: { name: 'USD Coin', symbol: 'USDC' },
}

function parseMetaplexMetadata(raw: Buffer | Uint8Array): TokenMeta | null {
  try {
    // Ensure we have a real Buffer with readUInt32LE etc., not just a Uint8Array
    const data = Buffer.from(raw)

    // Layout: key(1) + updateAuthority(32) + mint(32) = offset 65
    // Then: nameLen(4) + name(nameLen) + symbolLen(4) + symbol(symbolLen)
    if (data.length < 69) return null

    const nameLen = data.readUInt32LE(65)
    if (nameLen > 200 || 69 + nameLen + 4 > data.length) return null

    const name = data
      .slice(69, 69 + nameLen)
      .toString('utf8')
      .replace(/\0/g, '')
      .trim()

    const symbolOffset = 69 + nameLen
    const symbolLen = data.readUInt32LE(symbolOffset)
    if (symbolLen > 50 || symbolOffset + 4 + symbolLen > data.length) return null

    const symbol = data
      .slice(symbolOffset + 4, symbolOffset + 4 + symbolLen)
      .toString('utf8')
      .replace(/\0/g, '')
      .trim()

    if (!name && !symbol) return null
    return { name, symbol }
  } catch {
    return null
  }
}

/**
 * Hook to fetch Metaplex Token Metadata for a list of mint addresses.
 * Uses a single batch RPC call (getMultipleAccountsInfo) for efficiency.
 * Returns a map of mint address → { name, symbol }.
 */
export function useTokenMetadata(mints: string[]): Record<string, TokenMeta> {
  const { connection } = useConnection()

  // Stable key: sort mints to avoid refetches on reorder
  const sortedKey = [...mints].sort().join(',')

  const { data } = useQuery({
    queryKey: ['token-metadata', sortedKey],
    queryFn: async (): Promise<Record<string, TokenMeta>> => {
      const result: Record<string, TokenMeta> = {}

      // Add fallbacks first
      for (const mint of mints) {
        if (FALLBACK_METADATA[mint]) {
          result[mint] = FALLBACK_METADATA[mint]
        }
      }

      // Derive metadata PDAs for mints that need on-chain lookup
      const mintsToFetch = mints.filter((m) => !FALLBACK_METADATA[m])
      if (mintsToFetch.length === 0) return result

      const pdas = mintsToFetch.map((mint) => {
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM.toBuffer(), new PublicKey(mint).toBuffer()],
          TOKEN_METADATA_PROGRAM
        )
        return pda
      })

      // Batch fetch — getMultipleAccountsInfo supports up to 100 accounts
      const batchSize = 100
      for (let i = 0; i < pdas.length; i += batchSize) {
        const batch = pdas.slice(i, i + batchSize)
        const batchMints = mintsToFetch.slice(i, i + batchSize)

        const accounts = await connection.getMultipleAccountsInfo(batch)

        for (let j = 0; j < accounts.length; j++) {
          const accountInfo = accounts[j]
          if (accountInfo?.data) {
            const meta = parseMetaplexMetadata(accountInfo.data as Buffer | Uint8Array)
            if (meta) {
              result[batchMints[j]] = meta
            }
          }
        }
      }

      return result
    },
    enabled: mints.length > 0,
    staleTime: 5 * 60 * 1000, // Metadata rarely changes — 5 min stale
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 min
  })

  return data ?? {}
}
