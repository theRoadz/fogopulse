/**
 * Pyth Lazer Price API Route
 *
 * Server-side proxy for fetching signed Pyth Lazer price messages.
 * Keeps the access token secure on the server (not exposed to browser).
 *
 * POST /api/pyth-price
 * Body: { feedId: number }
 * Returns: { data: string } (hex-encoded Pyth message)
 */

import { NextRequest, NextResponse } from 'next/server'
import { PythLazerClient } from '@pythnetwork/pyth-lazer-sdk'

// Valid feed IDs (BTC=1, ETH=2, SOL=5)
const VALID_FEED_IDS = new Set([1, 2, 5, 2923])

// Timeout for WebSocket connection (30 seconds)
const TIMEOUT_MS = 30000

// Pyth Lazer WebSocket endpoints
const PYTH_LAZER_WS_URLS = [
  'wss://pyth-lazer-0.dourolabs.app/v1/stream',
  'wss://pyth-lazer-1.dourolabs.app/v1/stream',
  'wss://pyth-lazer-2.dourolabs.app/v1/stream',
]

/**
 * Fetch signed Pyth message using official SDK
 */
async function fetchPythMessage(feedId: number, accessToken: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    let client: Awaited<ReturnType<typeof PythLazerClient.create>> | null = null
    let resolved = false

    const cleanup = () => {
      if (client) {
        try {
          client.shutdown()
        } catch {
          // Ignore shutdown errors
        }
      }
    }

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        cleanup()
        reject(new Error('Timeout waiting for Pyth price message'))
      }
    }, TIMEOUT_MS)

    try {
      // Create client with SDK v6.0.0 API
      client = await PythLazerClient.create({
        token: accessToken,
        webSocketPoolConfig: {
          urls: PYTH_LAZER_WS_URLS,
        },
      })

      const subscriptionId = Date.now()

      // Add message listener - SDK v6.0.0 wraps messages in { type, value }
      client.addMessageListener((response: unknown) => {
        if (resolved) return

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typedResponse = response as any
        const message = typedResponse?.value

        if (message?.type === 'error') {
          resolved = true
          clearTimeout(timeout)
          cleanup()
          reject(new Error(`Pyth API error: ${message.message || message.error}`))
          return
        }

        if (message?.type === 'streamUpdated' && message.subscriptionId === subscriptionId) {
          // Get the solana-encoded message (Ed25519 format for Solana verification)
          const solanaData = typedResponse?.value?.solana?.data

          if (!solanaData) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            reject(new Error('No solana-encoded data in response'))
            return
          }

          resolved = true
          clearTimeout(timeout)
          cleanup()
          resolve(solanaData) // Already hex string
        }
      })

      // Subscribe to the price feed with solana format (Ed25519 for FOGO)
      client.subscribe({
        type: 'subscribe',
        subscriptionId,
        priceFeedIds: [feedId],
        properties: ['price', 'confidence'],
        formats: ['solana'], // Ed25519 format for Solana/FOGO verification
        deliveryFormat: 'json',
        channel: 'fixed_rate@200ms',
        jsonBinaryEncoding: 'hex',
      })
    } catch (err) {
      clearTimeout(timeout)
      cleanup()
      reject(err instanceof Error ? err : new Error('Failed to connect to Pyth Lazer'))
    }
  })
}

export async function POST(request: NextRequest) {
  try {
    // Get access token from server environment (NOT exposed to client)
    const accessToken = process.env.PYTH_ACCESS_TOKEN

    if (!accessToken) {
      return NextResponse.json(
        {
          error: 'Pyth access token not configured',
          message: 'Set PYTH_ACCESS_TOKEN in server environment',
        },
        { status: 500 }
      )
    }

    // Parse request body
    const body = await request.json()
    const feedId = body.feedId

    // Validate feed ID
    if (typeof feedId !== 'number' || !VALID_FEED_IDS.has(feedId)) {
      return NextResponse.json(
        {
          error: 'Invalid feed ID',
          message: `feedId must be one of: ${Array.from(VALID_FEED_IDS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Fetch signed price message
    const hexData = await fetchPythMessage(feedId, accessToken)

    return NextResponse.json({ data: hexData })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to fetch price', message }, { status: 500 })
  }
}
