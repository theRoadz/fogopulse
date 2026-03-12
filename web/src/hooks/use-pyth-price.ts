'use client'

import { useState, useEffect } from 'react'
import { HermesClient } from '@pythnetwork/hermes-client'
import { ASSET_METADATA } from '@/lib/constants'
import type { Asset } from '@/types/assets'

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting'

export interface PriceData {
  price: number
  confidence: number
  timestamp: number
}

const MAX_RETRIES = 5
const HERMES_ENDPOINT = 'https://hermes.pyth.network'

/**
 * Hook for streaming real-time price data from Pyth Hermes.
 * Uses Server-Sent Events (SSE) for efficient real-time updates.
 *
 * @param asset - The asset to get price data for (BTC, ETH, SOL, or FOGO)
 * @returns Object containing price data and connection state
 */
export function usePythPrice(asset: Asset) {
  const [price, setPrice] = useState<PriceData | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')

  useEffect(() => {
    const feedId = ASSET_METADATA[asset].feedId

    // Handle FOGO placeholder - no price feed available yet
    if (!feedId) {
      setConnectionState('disconnected')
      setPrice(null)
      return
    }

    let eventSource: EventSource | null = null
    let retryTimeout: NodeJS.Timeout | null = null
    let retryCount = 0
    let isMounted = true

    const cleanup = () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout)
        retryTimeout = null
      }
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
    }

    const connect = async (isRetry = false) => {
      if (!isMounted) return

      try {
        cleanup()
        // Show appropriate state: 'connecting' for initial, 'reconnecting' for retries
        setConnectionState(isRetry ? 'reconnecting' : 'connecting')

        const client = new HermesClient(HERMES_ENDPOINT, {})
        const source = await client.getPriceUpdatesStream([feedId], {
          parsed: true,
          allowUnordered: true,
          benchmarksOnly: false,
        })

        if (!isMounted) {
          source.close()
          return
        }

        source.onopen = () => {
          if (!isMounted) return
          setConnectionState('connected')
          retryCount = 0
        }

        source.onmessage = (event: MessageEvent) => {
          if (!isMounted) return
          try {
            const data = JSON.parse(event.data)
            // Parse Pyth price format from streaming response
            const priceInfo = data.parsed?.[0]?.price
            if (priceInfo) {
              const expo = Number(priceInfo.expo)
              setPrice({
                price: Number(priceInfo.price) * Math.pow(10, expo),
                confidence: Number(priceInfo.conf) * Math.pow(10, expo),
                timestamp: Number(data.parsed[0].price.publish_time) * 1000, // Convert to ms
              })
            }
          } catch {
            // Silently handle parse errors for malformed messages
          }
        }

        source.onerror = () => {
          if (!isMounted) return
          setConnectionState('reconnecting')
          cleanup()

          // Exponential backoff reconnection
          if (retryCount < MAX_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
            retryCount++
            retryTimeout = setTimeout(() => connect(true), delay)
          } else {
            setConnectionState('disconnected')
          }
        }

        eventSource = source
      } catch {
        if (!isMounted) return
        setConnectionState('disconnected')
      }
    }

    connect()

    return () => {
      isMounted = false
      cleanup()
    }
  }, [asset])

  return { price, connectionState }
}
