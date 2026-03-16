/**
 * @jest-environment node
 */

import nacl from 'tweetnacl'
import { Keypair } from '@solana/web3.js'
import { verifyWalletSignature, validateSignedMessage } from './verify-signature'

// Generate a real keypair for testing
const keypair = Keypair.generate()
const walletAddress = keypair.publicKey.toBase58()

function signMessage(message: string): string {
  const messageBytes = new TextEncoder().encode(message)
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey)
  return Buffer.from(signatureBytes).toString('base64')
}

describe('verifyWalletSignature', () => {
  it('should return true for a valid signature', () => {
    const message = 'FogoPulse Feedback: test at 2026-01-01T00:00:00.000Z'
    const signature = signMessage(message)

    expect(verifyWalletSignature(message, signature, walletAddress)).toBe(true)
  })

  it('should return false for wrong wallet address', () => {
    const message = 'FogoPulse Feedback: test at 2026-01-01T00:00:00.000Z'
    const signature = signMessage(message)
    const otherWallet = Keypair.generate().publicKey.toBase58()

    expect(verifyWalletSignature(message, signature, otherWallet)).toBe(false)
  })

  it('should return false for tampered message', () => {
    const message = 'FogoPulse Feedback: test at 2026-01-01T00:00:00.000Z'
    const signature = signMessage(message)

    expect(verifyWalletSignature('tampered message', signature, walletAddress)).toBe(false)
  })

  it('should return false for invalid signature', () => {
    expect(verifyWalletSignature('test', 'invalid-base64!', walletAddress)).toBe(false)
  })

  it('should return false for invalid wallet address', () => {
    const message = 'test'
    const signature = signMessage(message)

    expect(verifyWalletSignature(message, signature, 'not-a-wallet')).toBe(false)
  })
})

describe('validateSignedMessage', () => {
  it('should accept valid feedback message with recent timestamp', () => {
    const now = new Date().toISOString()
    const message = `FogoPulse Feedback: Bug report at ${now}`
    const result = validateSignedMessage(message, 'feedback')

    expect(result.valid).toBe(true)
  })

  it('should accept valid reply message with recent timestamp', () => {
    const now = new Date().toISOString()
    const message = `FogoPulse Reply: Some reply content at ${now}`
    const result = validateSignedMessage(message, 'reply')

    expect(result.valid).toBe(true)
  })

  it('should reject message with wrong prefix', () => {
    const now = new Date().toISOString()
    const result = validateSignedMessage(`Wrong prefix at ${now}`, 'feedback')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid message format')
  })

  it('should reject message with no timestamp', () => {
    const result = validateSignedMessage('FogoPulse Feedback: no timestamp here', 'feedback')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('timestamp')
  })

  it('should reject message with expired timestamp (>5 minutes)', () => {
    const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const message = `FogoPulse Feedback: test at ${oldTime}`
    const result = validateSignedMessage(message, 'feedback')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('expired')
  })

  it('should reject message with invalid timestamp', () => {
    const message = 'FogoPulse Feedback: test at not-a-date'
    const result = validateSignedMessage(message, 'feedback')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid timestamp')
  })
})
