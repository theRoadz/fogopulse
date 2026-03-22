/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

import { SettlementsFeature } from './settlements-feature'

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

jest.mock('@/components/trading/settlement-history-list', () => ({
  SettlementHistoryList: ({ asset }: { asset: string }) => (
    <div data-testid="settlement-history-list" data-asset={asset} />
  ),
}))

describe('SettlementsFeature', () => {
  it('renders the Settlement History heading', () => {
    render(<SettlementsFeature />)
    expect(screen.getByText('Settlement History')).toBeInTheDocument()
  })

  it('renders AssetTabs for asset selection', () => {
    render(<SettlementsFeature />)
    expect(screen.getByTestId('asset-tabs')).toBeInTheDocument()
  })

  it('renders SettlementHistoryList with active asset', () => {
    render(<SettlementsFeature />)
    const list = screen.getByTestId('settlement-history-list')
    expect(list).toBeInTheDocument()
    expect(list).toHaveAttribute('data-asset', 'BTC')
  })
})
