/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'

import { HistoryFeature } from './history-feature'

// Mock utils
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

jest.mock('@/lib/constants', () => ({
  ASSETS: ['BTC', 'ETH', 'SOL', 'FOGO'],
  ASSET_METADATA: {
    BTC: { label: 'BTC', color: 'text-orange-500' },
    ETH: { label: 'ETH', color: 'text-blue-500' },
    SOL: { label: 'SOL', color: 'text-purple-500' },
    FOGO: { label: 'FOGO', color: 'text-primary' },
  },
}))

// Mock stores
jest.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (s: { activeAsset: string; setActiveAsset: () => void }) => unknown) =>
    selector({ activeAsset: 'BTC', setActiveAsset: jest.fn() }),
}))

// Mock UI components
jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  TabsList: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  TabsTrigger: ({ children, value, ...props }: React.ComponentProps<'button'> & { value: string }) => (
    <button data-value={value} {...props}>{children}</button>
  ),
  TabsContent: ({ children, value, ...props }: React.ComponentProps<'div'> & { value: string }) => (
    <div data-testid={`tab-content-${value}`} {...props}>{children}</div>
  ),
}))

// Mock child components
jest.mock('@/components/trading/asset-tabs', () => ({
  AssetTabs: () => <div data-testid="asset-tabs" />,
}))

jest.mock('@/components/trading/settlement-history-list', () => ({
  SettlementHistoryList: () => <div data-testid="settlement-history-list" />,
}))

jest.mock('@/components/trading/trading-history-list', () => ({
  TradingHistoryList: ({ assetFilter }: { assetFilter: string }) => (
    <div data-testid="trading-history-list" data-filter={assetFilter} />
  ),
}))

describe('HistoryFeature', () => {
  it('renders the History heading', () => {
    render(<HistoryFeature />)
    expect(screen.getByText('History')).toBeInTheDocument()
  })

  it('renders Settlement History and My Trades tabs', () => {
    render(<HistoryFeature />)
    expect(screen.getByTestId('settlement-tab')).toHaveTextContent('Settlement History')
    expect(screen.getByTestId('trades-tab')).toHaveTextContent('My Trades')
  })

  it('renders Settlement History tab content with AssetTabs and list', () => {
    render(<HistoryFeature />)
    const settlementContent = screen.getByTestId('tab-content-settlement')
    expect(settlementContent).toBeInTheDocument()
    expect(screen.getByTestId('asset-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('settlement-history-list')).toBeInTheDocument()
  })

  it('renders My Trades tab content with trading history list', () => {
    render(<HistoryFeature />)
    const tradesContent = screen.getByTestId('tab-content-trades')
    expect(tradesContent).toBeInTheDocument()
    expect(screen.getByTestId('trading-history-list')).toBeInTheDocument()
  })

  it('renders All asset filter tab for trading history', () => {
    render(<HistoryFeature />)
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('renders trading history list with default ALL filter', () => {
    render(<HistoryFeature />)
    const list = screen.getByTestId('trading-history-list')
    expect(list).toHaveAttribute('data-filter', 'ALL')
  })
})
