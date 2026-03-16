/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'

import { useMultiAssetPositions } from './use-multi-asset-positions'
import type { PositionPnL } from '@/lib/trade-preview'

// Mock usePool — returns pool data with activeEpoch PDA
const mockPubkey1 = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const mockPubkey2 = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS')

const mockPoolResults: Record<string, ReturnType<typeof createMockPoolResult>> = {}

function createMockPoolResult(activeEpoch: PublicKey | null = null, isLoading = false) {
  return {
    pool: activeEpoch
      ? { activeEpoch, yesReserves: 100_000_000n, noReserves: 80_000_000n, activeEpochState: 1 }
      : null,
    poolState: { upProbability: 50, downProbability: 50, totalLiquidity: '0' },
    isLoading,
    error: null,
    isRealtimeConnected: false,
    refetch: jest.fn(),
  }
}

jest.mock('@/hooks/use-pool', () => ({
  usePool: (asset: string) =>
    mockPoolResults[asset] ?? createMockPoolResult(),
}))

// Mock useUserPositionsBatch
let mockPositionsMap = new Map<string, unknown>()
let mockPositionsLoading = false

jest.mock('@/hooks/use-user-positions-batch', () => ({
  useUserPositionsBatch: () => ({
    positions: mockPositionsMap,
    isLoading: mockPositionsLoading,
    error: null,
  }),
}))

// Mock calculatePositionPnL
const mockPnlResult: PositionPnL = {
  currentValue: 12_000_000n,
  pnlAmount: 2_000_000n,
  pnlPercent: 20,
}

jest.mock('@/lib/trade-preview', () => ({
  calculatePositionPnL: () => mockPnlResult,
}))

function createMockPosition(direction: 'up' | 'down' = 'up', shares = 10_000_000n) {
  return {
    user: mockPubkey1,
    epoch: mockPubkey1,
    direction,
    amount: 10_000_000n,
    shares,
    entryPrice: 1_000_000n,
    claimed: false,
    bump: 255,
  }
}

describe('useMultiAssetPositions', () => {
  beforeEach(() => {
    // Default: all pools return null (no active epochs)
    mockPoolResults['BTC'] = createMockPoolResult()
    mockPoolResults['ETH'] = createMockPoolResult()
    mockPoolResults['SOL'] = createMockPoolResult()
    mockPoolResults['FOGO'] = createMockPoolResult()
    mockPositionsMap = new Map()
    mockPositionsLoading = false
  })

  it('returns zero counts when no positions in any asset', () => {
    const { result } = renderHook(() => useMultiAssetPositions())

    expect(result.current.positionCount).toBe(0)
    expect(result.current.totalValue).toBe(0n)
    expect(result.current.totalPnl).toBe(0n)
    expect(result.current.totalPnlPercent).toBe(0)
    expect(result.current.positions).toHaveLength(4)
    expect(result.current.activePositions).toHaveLength(0)
  })

  it('correctly identifies active positions in 2 of 4 assets', () => {
    // BTC and ETH have active epochs with positions
    mockPoolResults['BTC'] = createMockPoolResult(mockPubkey1)
    mockPoolResults['ETH'] = createMockPoolResult(mockPubkey2)

    mockPositionsMap = new Map([
      [mockPubkey1.toBase58(), createMockPosition('up')],
      [mockPubkey2.toBase58(), createMockPosition('down')],
    ])

    const { result } = renderHook(() => useMultiAssetPositions())

    expect(result.current.positionCount).toBe(2)
    expect(result.current.activePositions).toHaveLength(2)
    expect(result.current.positions).toHaveLength(4)
    // Both have mocked PnL with currentValue=12M each
    expect(result.current.totalValue).toBe(24_000_000n)
    // Both have mocked PnL with pnlAmount=2M each
    expect(result.current.totalPnl).toBe(4_000_000n)
  })

  it('handles totalEntryAmount === 0n edge case (totalPnlPercent = 0)', () => {
    // No active positions means totalEntryAmount is 0n
    const { result } = renderHook(() => useMultiAssetPositions())
    expect(result.current.totalPnlPercent).toBe(0)
  })

  it('skips positions with zero shares', () => {
    mockPoolResults['BTC'] = createMockPoolResult(mockPubkey1)
    mockPositionsMap = new Map([
      [mockPubkey1.toBase58(), createMockPosition('up', 0n)],
    ])

    const { result } = renderHook(() => useMultiAssetPositions())

    expect(result.current.positionCount).toBe(0)
    expect(result.current.activePositions).toHaveLength(0)
  })

  it('reports isLoading when any pool is loading', () => {
    mockPoolResults['BTC'] = createMockPoolResult(null, true)

    const { result } = renderHook(() => useMultiAssetPositions())
    expect(result.current.isLoading).toBe(true)
  })

  it('reports isLoading when positions batch is loading', () => {
    mockPositionsLoading = true

    const { result } = renderHook(() => useMultiAssetPositions())
    expect(result.current.isLoading).toBe(true)
  })
})
