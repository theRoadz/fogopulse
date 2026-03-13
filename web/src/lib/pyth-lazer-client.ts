/**
 * Pyth Lazer Client for Browser
 *
 * Fetches signed Pyth Lazer price messages via server-side API route.
 * The access token is kept secure on the server (not exposed to browser).
 *
 * @see https://docs.pyth.network/price-feeds/pythnet-price-feeds/pyth-lazer
 */

// Re-export PYTH_LAZER_FEED_IDS from constants for backward compatibility
export { PYTH_LAZER_FEED_IDS } from '@/lib/constants'

// Connection states for UI feedback
export type PythConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed'

// API response type
interface PythPriceResponse {
  data?: string
  error?: string
  message?: string
}

/**
 * Convert hex string to Uint8Array (browser-compatible)
 */
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Fetch a signed Pyth Lazer price message via API route
 *
 * Calls the server-side /api/pyth-price endpoint which handles
 * the WebSocket connection with the secure access token.
 *
 * @param feedId - Numeric Pyth Lazer feed ID (1=BTC, 2=ETH, 5=SOL)
 * @param onStateChange - Optional callback for connection state changes
 * @returns Signed Pyth message as Uint8Array
 * @throws Error if API call fails or returns an error
 */
export async function fetchPythLazerMessage(
  feedId: number,
  onStateChange?: (state: PythConnectionState) => void
): Promise<Uint8Array> {
  onStateChange?.('connecting')

  try {
    const response = await fetch('/api/pyth-price', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ feedId }),
    })

    const data: PythPriceResponse = await response.json()

    if (!response.ok || data.error) {
      onStateChange?.('error')
      throw new Error(data.message || data.error || 'Failed to fetch Pyth price')
    }

    if (!data.data) {
      onStateChange?.('error')
      throw new Error('No price data received from Pyth')
    }

    onStateChange?.('connected')

    // Convert hex string to Uint8Array
    return hexToUint8Array(data.data)
  } catch (err) {
    onStateChange?.('error')
    if (err instanceof Error) {
      throw err
    }
    throw new Error('Failed to fetch Pyth price message')
  }
}
