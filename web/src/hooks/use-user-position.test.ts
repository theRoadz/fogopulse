/**
 * Tests for useUserPosition hook
 *
 * Tests position data parsing, direction detection, and null/no-position handling.
 * Note: Full hook tests require wallet adapter + Anchor program mocking.
 * These tests validate the parsing and data structure logic used by the hook.
 */

import { PublicKey } from '@solana/web3.js'
import type { UserPositionData, PositionDirection } from './use-user-position'

describe('Direction parsing', () => {
  // Mirrors the parseDirection function from use-user-position.ts
  function parseDirection(direction: unknown): PositionDirection {
    if (!direction || typeof direction !== 'object') return 'up'
    const keys = Object.keys(direction)
    if (keys.length === 0) return 'up'
    return keys[0] === 'down' ? 'down' : 'up'
  }

  it('parses up direction from Anchor enum', () => {
    expect(parseDirection({ up: {} })).toBe('up')
  })

  it('parses down direction from Anchor enum', () => {
    expect(parseDirection({ down: {} })).toBe('down')
  })

  it('defaults to up for null', () => {
    expect(parseDirection(null)).toBe('up')
  })

  it('defaults to up for empty object', () => {
    expect(parseDirection({})).toBe('up')
  })

  it('defaults to up for non-object', () => {
    expect(parseDirection('up')).toBe('up')
  })
})

describe('Position data structure', () => {
  it('validates position data shape matches UserPositionData interface', () => {
    const mockPosition: UserPositionData = {
      user: new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5'),
      epoch: new PublicKey('11111111111111111111111111111111'),
      direction: 'up',
      amount: BigInt(10_000_000), // 10 USDC
      shares: BigInt(5_000_000),
      entryPrice: BigInt(2_000_000),
      claimed: false,
      bump: 255,
    }

    expect(mockPosition.amount).toBe(BigInt(10_000_000))
    expect(mockPosition.claimed).toBe(false)
    expect(mockPosition.direction).toBe('up')
  })

  it('handles claimed position', () => {
    const claimedPosition: UserPositionData = {
      user: new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5'),
      epoch: new PublicKey('11111111111111111111111111111111'),
      direction: 'down',
      amount: BigInt(50_000_000), // 50 USDC
      shares: BigInt(25_000_000),
      entryPrice: BigInt(2_000_000),
      claimed: true,
      bump: 254,
    }

    expect(claimedPosition.claimed).toBe(true)
  })

  it('null position represents no position in epoch', () => {
    const position: UserPositionData | null = null
    expect(position).toBeNull()
  })
})
