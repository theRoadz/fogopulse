/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'

import { MultiAssetPositionsPanel } from './multi-asset-positions-panel'
import type { MultiAssetPositionsResult } from '@/hooks/use-multi-asset-positions'

// Mock useWallet
const mockPublicKey = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
let mockWalletPublicKey: PublicKey | null = mockPublicKey

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({ publicKey: mockWalletPublicKey }),
}))

// Mock the multi-asset positions hook
let mockHookResult: MultiAssetPositionsResult

jest.mock('@/hooks/use-multi-asset-positions', () => ({
  useMultiAssetPositions: () => mockHookResult,
}))

// Mock the UI store
jest.mock('@/stores/ui-store', () => ({
  useUIStore: Object.assign(
    jest.fn(() => 'BTC'),
    { setState: jest.fn() }
  ),
}))

function createEmptyResult(): MultiAssetPositionsResult {
  return {
    positions: [],
    activePositions: [],
    totalValue: 0n,
    totalPnl: 0n,
    totalEntryAmount: 0n,
    totalPnlPercent: 0,
    isLoading: false,
    positionCount: 0,
  }
}

describe('MultiAssetPositionsPanel', () => {
  beforeEach(() => {
    mockWalletPublicKey = mockPublicKey
    mockHookResult = createEmptyResult()
  })

  it('renders nothing when wallet not connected', () => {
    mockWalletPublicKey = null
    const { container } = render(<MultiAssetPositionsPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('renders empty state when no positions', () => {
    render(<MultiAssetPositionsPanel />)
    expect(
      screen.getByText('No active positions. Start trading to see your portfolio.')
    ).toBeInTheDocument()
  })

  it('renders portfolio summary and position rows when positions exist', () => {
    mockHookResult = {
      ...createEmptyResult(),
      activePositions: [
        {
          asset: 'BTC',
          position: {
            user: mockPublicKey,
            epoch: mockPublicKey,
            direction: 'up',
            amount: 10_000_000n,
            shares: 10_000_000n,
            entryPrice: 1_000_000n,
            claimed: false,
            bump: 255,
          },
          pool: null,
          epochPda: mockPublicKey,
          pnl: { currentValue: 12_000_000n, pnlAmount: 2_000_000n, pnlPercent: 20 },
          isLoading: false,
        },
      ],
      totalValue: 12_000_000n,
      totalPnl: 2_000_000n,
      totalEntryAmount: 10_000_000n,
      totalPnlPercent: 20,
      positionCount: 1,
    }

    render(<MultiAssetPositionsPanel />)

    // Portfolio summary should be visible
    expect(screen.getByText(/active position/)).toBeInTheDocument()
    expect(screen.getByText(/Total Value/)).toBeInTheDocument()
    expect(screen.getByText(/12\.00/)).toBeInTheDocument()

    // Asset row should be visible
    expect(screen.getByText('BTC')).toBeInTheDocument()
  })

  it('renders loading skeleton when loading with no positions yet', () => {
    mockHookResult = {
      ...createEmptyResult(),
      isLoading: true,
    }
    const { container } = render(<MultiAssetPositionsPanel />)
    // Skeleton elements should be present
    const skeletons = container.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })
})
