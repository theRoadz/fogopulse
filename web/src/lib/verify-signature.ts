import nacl from 'tweetnacl'
import { PublicKey } from '@solana/web3.js'

/**
 * Verify an Ed25519 wallet signature.
 * Used server-side to authenticate feedback submissions.
 */
export function verifyWalletSignature(
  message: string,
  signatureBase64: string,
  walletAddress: string
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message)
    const signatureBytes = Buffer.from(signatureBase64, 'base64')
    const publicKeyBytes = new PublicKey(walletAddress).toBytes()
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)
  } catch {
    return false
  }
}

/**
 * Validate that the message format is correct and the timestamp is within
 * a 5-minute window (replay prevention).
 */
export function validateSignedMessage(
  message: string,
  type: 'feedback' | 'reply' | 'delete'
): { valid: boolean; error?: string } {
  const prefixes: Record<string, string> = {
    feedback: 'FogoPulse Feedback: ',
    reply: 'FogoPulse Reply: ',
    delete: 'FogoPulse Delete: ',
  }
  const prefix = prefixes[type]

  if (!message.startsWith(prefix)) {
    return { valid: false, error: 'Invalid message format' }
  }

  // Extract timestamp — last segment after " at "
  const atIndex = message.lastIndexOf(' at ')
  if (atIndex === -1) {
    return { valid: false, error: 'Missing timestamp in message' }
  }

  const timestamp = message.slice(atIndex + 4)
  const messageTime = new Date(timestamp).getTime()

  if (isNaN(messageTime)) {
    return { valid: false, error: 'Invalid timestamp' }
  }

  const now = Date.now()
  const fiveMinutes = 5 * 60 * 1000

  if (Math.abs(now - messageTime) > fiveMinutes) {
    return { valid: false, error: 'Message has expired. Please try again.' }
  }

  return { valid: true }
}
