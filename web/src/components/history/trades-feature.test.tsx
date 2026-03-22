/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

import { TradesFeature } from './trades-feature'

// Mock utils
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock stores
jest.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (s: { activeAsset: string; setActiveAsset: () => void }) => unknown) =>
    selector({ activeAsset: 'BTC', setActiveAsset: jest.fn() }),
}))

// Mock child components
jest.mock('@/components/trading/asset-tabs', () => ({
  AssetTabs: () => <div data-testid="asset-tabs" />,
}))

jest.mock('@/components/trading/trading-history-list', () => ({
  TradingHistoryList: ({ assetFilter }: { assetFilter: string }) => (
    <div data-testid="trading-history-list" data-filter={assetFilter} />
  ),
}))

describe('TradesFeature', () => {
  it('renders the Trade History heading', () => {
    render(<TradesFeature />)
    expect(screen.getByText('Trade History')).toBeInTheDocument()
  })

  it('renders AssetTabs for asset selection', () => {
    render(<TradesFeature />)
    expect(screen.getByTestId('asset-tabs')).toBeInTheDocument()
  })

  it('renders TradingHistoryList with active asset filter', () => {
    render(<TradesFeature />)
    const list = screen.getByTestId('trading-history-list')
    expect(list).toBeInTheDocument()
    expect(list).toHaveAttribute('data-filter', 'BTC')
  })
})
