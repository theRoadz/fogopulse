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
import WebSocket from 'ws'

import { PYTH_LAZER_WS } from '@/lib/constants'

// Valid feed IDs (BTC=1, ETH=2, SOL=5)
const VALID_FEED_IDS = new Set([1, 2, 5])

// Timeout for WebSocket connection (30 seconds)
const TIMEOUT_MS = 30000

interface PythStreamMessage {
  type: string
  subscriptionId?: number
  solana?: {
    encoding: string
    data: string
  }
  error?: string
  message?: string
}

/**
 * Fetch signed Pyth message from WebSocket
 */
async function fetchPythMessage(feedId: number, accessToken: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let resolved = false
    let ws: WebSocket | null = null

    const cleanup = () => {
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close()
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
      // Connect with auth token in URL (standard Pyth Lazer pattern)
      ws = new WebSocket(`${PYTH_LAZER_WS}?token=${encodeURIComponent(accessToken)}`)

      ws.on('open', () => {
        // Subscribe to price feed with Ed25519 format (required for FOGO)
        const subscribeMsg = {
          type: 'subscribe',
          subscriptionId: Date.now(),
          priceFeedIds: [feedId],
          properties: ['price', 'confidence'],
          formats: ['solana'], // Ed25519 format, NOT 'leEcdsa'
          deliveryFormat: 'json',
          channel: 'fixed_rate@200ms',
          jsonBinaryEncoding: 'hex',
        }
        ws?.send(JSON.stringify(subscribeMsg))
      })

      ws.on('message', (data: WebSocket.Data) => {
        if (resolved) return

        try {
          const msg = JSON.parse(data.toString()) as PythStreamMessage

          if (msg.type === 'error') {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            reject(new Error(`Pyth API error: ${msg.message || msg.error}`))
            return
          }

          if (msg.type === 'streamUpdated' && msg.solana?.data) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            resolve(msg.solana.data)
          }
        } catch {
          // Ignore parse errors
        }
      })

      ws.on('error', () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          cleanup()
          reject(new Error('WebSocket connection error'))
        }
      })

      ws.on('close', (code: number, reason: Buffer) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          if (code !== 1000) {
            reject(new Error(`WebSocket closed: ${reason.toString() || 'Unknown reason'}`))
          }
        }
      })
    } catch (err) {
      clearTimeout(timeout)
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
