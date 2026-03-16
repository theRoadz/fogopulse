/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'

import { AssetPositionRow } from './asset-position-row'
import type { AssetPositionInfo } from '@/hooks/use-multi-asset-positions'

const mockPubkey = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')

function createAssetPosition(
  overrides: Partial<AssetPositionInfo> = {}
): AssetPositionInfo {
  return {
    asset: 'BTC',
    position: {
      user: mockPubkey,
      epoch: mockPubkey,
      direction: 'up',
      amount: 10_000_000n,
      shares: 10_000_000n,
      entryPrice: 1_000_000n,
      claimed: false,
      bump: 255,
    },
    pool: null,
    epochPda: mockPubkey,
    pnl: {
      currentValue: 12_000_000n,
      pnlAmount: 2_000_000n,
      pnlPercent: 20,
    },
    isLoading: false,
    ...overrides,
  }
}

describe('AssetPositionRow', () => {
  it('renders collapsed header with asset, direction, and PnL', () => {
    const ap = createAssetPosition()
    render(<AssetPositionRow assetPosition={ap} onNavigateToAsset={jest.fn()} />)

    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText(/UP/)).toBeInTheDocument()
    // PnL should show +2.00 (20%)
    expect(screen.getByText(/2\.00/)).toBeInTheDocument()
  })

  it('expands on click to show full details', () => {
    const ap = createAssetPosition()
    render(<AssetPositionRow assetPosition={ap} onNavigateToAsset={jest.fn()} />)

    // Click the collapsible trigger (header)
    const trigger = screen.getByRole('button', { name: /BTC/i })
    fireEvent.click(trigger)

    // Expanded content should show shares and avg price
    expect(screen.getByText('Shares')).toBeInTheDocument()
    expect(screen.getByText('Avg Price')).toBeInTheDocument()
    expect(screen.getByText('Current Value')).toBeInTheDocument()
  })

  it('"Trade" button triggers navigation callback', () => {
    const onNavigate = jest.fn()
    const ap = createAssetPosition()
    render(<AssetPositionRow assetPosition={ap} onNavigateToAsset={onNavigate} />)

    // Expand to reveal the Trade button
    const trigger = screen.getByRole('button', { name: /BTC/i })
    fireEvent.click(trigger)

    const tradeButton = screen.getByRole('button', { name: /Trade BTC/ })
    fireEvent.click(tradeButton)

    expect(onNavigate).toHaveBeenCalledWith('BTC')
  })

  it('renders nothing when position has zero shares', () => {
    const ap = createAssetPosition({
      position: {
        user: mockPubkey,
        epoch: mockPubkey,
        direction: 'up',
        amount: 10_000_000n,
        shares: 0n,
        entryPrice: 1_000_000n,
        claimed: false,
        bump: 255,
      },
    })
    const { container } = render(
      <AssetPositionRow assetPosition={ap} onNavigateToAsset={jest.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders DOWN direction with red color', () => {
    const ap = createAssetPosition({
      position: {
        user: mockPubkey,
        epoch: mockPubkey,
        direction: 'down',
        amount: 10_000_000n,
        shares: 10_000_000n,
        entryPrice: 1_000_000n,
        claimed: false,
        bump: 255,
      },
    })
    render(<AssetPositionRow assetPosition={ap} onNavigateToAsset={jest.fn()} />)

    const directionEl = screen.getByText(/DOWN/)
    expect(directionEl.className).toContain('text-red-500')
  })
})
