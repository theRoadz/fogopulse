'use client'

import { useQuery } from '@tanstack/react-query'
import { HermesClient } from '@pythnetwork/hermes-client'
import { USDC_MINT, MINT_FEED_IDS } from '@/lib/constants'

const HERMES_ENDPOINT = 'https://hermes.pyth.network'
const hermesClient = new HermesClient(HERMES_ENDPOINT, {})

// Stablecoins pegged to $1 (mint address → price)
const STABLECOIN_MINTS: Record<string, number> = {
  [USDC_MINT.toBase58()]: 1, // Testnet USDC
  ELNbJ1RtERV2fjtuZjbTscDekWhVzkQ1LjmiPsxp5uND: 1, // Original USDC on FOGO chain
  fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry: 1, // fUSD (Fogo USD)
}

/**
 * Hook to fetch current USD prices for all known tokens in a single batch call.
 * Returns a map of mint address → USD price.
 * USDC is hardcoded to $1. Unknown tokens are not included.
 */
export function useTokenPrices(): Record<string, number> {
  const { data } = useQuery({
    queryKey: ['token-prices'],
    queryFn: async (): Promise<Record<string, number>> => {
      const prices: Record<string, number> = { ...STABLECOIN_MINTS }

      const entries = Object.entries(MINT_FEED_IDS)
      const feedIds = entries.map(([, feedId]) => feedId)

      try {
        const response = await hermesClient.getLatestPriceUpdates(feedIds, { parsed: true })

        if (response?.parsed) {
          for (let i = 0; i < response.parsed.length; i++) {
            const priceData = response.parsed[i]?.price
            if (priceData) {
              const expo = Number(priceData.expo)
              const price = Number(priceData.price) * Math.pow(10, expo)
              // Match feed back to mint address
              const feedId = priceData.feed_id ?? response.parsed[i]?.id
              const matchedEntry = entries.find(
                ([, fid]) => fid === `0x${feedId}` || fid === feedId
              )
              if (matchedEntry) {
                prices[matchedEntry[0]] = price
              }
            }
          }
        }
      } catch (err) {
        console.warn('[useTokenPrices] Pyth price fetch failed:', err)
        // Re-throw so React Query triggers retry / isError state
        throw err
      }

      return prices
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  })

  return data ?? { ...STABLECOIN_MINTS }
}
