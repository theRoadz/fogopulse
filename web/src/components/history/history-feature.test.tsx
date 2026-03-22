/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

import { HistoryFeature } from './history-feature'

// Mock next/navigation
const mockSearchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

// Mock utils
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock stores
jest.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (s: { activeAsset: string; setActiveAsset: () => void }) => unknown) =>
    selector({ activeAsset: 'BTC', setActiveAsset: jest.fn() }),
}))

// Mock UI components
jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue, ...props }: React.ComponentProps<'div'> & { defaultValue?: string }) => (
    <div data-default-tab={defaultValue} {...props}>{children}</div>
  ),
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
  beforeEach(() => {
    mockSearchParams.delete('tab')
  })

  it('renders the History heading', () => {
    render(<HistoryFeature />)
    expect(screen.getByText('History')).toBeInTheDocument()
  })

  it('renders Settlement History and My Trades tabs', () => {
    render(<HistoryFeature />)
    expect(screen.getByTestId('settlement-tab')).toHaveTextContent('Settlement History')
    expect(screen.getByTestId('trades-tab')).toHaveTextContent('My Trades')
  })

  it('renders AssetTabs for asset selection', () => {
    render(<HistoryFeature />)
    expect(screen.getByTestId('asset-tabs')).toBeInTheDocument()
  })

  it('renders Settlement History tab content with list', () => {
    render(<HistoryFeature />)
    const settlementContent = screen.getByTestId('tab-content-settlement')
    expect(settlementContent).toBeInTheDocument()
    expect(screen.getByTestId('settlement-history-list')).toBeInTheDocument()
  })

  it('renders My Trades tab content with trading history list', () => {
    render(<HistoryFeature />)
    const tradesContent = screen.getByTestId('tab-content-trades')
    expect(tradesContent).toBeInTheDocument()
    expect(screen.getByTestId('trading-history-list')).toBeInTheDocument()
  })

  it('renders trading history list with active asset filter', () => {
    render(<HistoryFeature />)
    const list = screen.getByTestId('trading-history-list')
    expect(list).toHaveAttribute('data-filter', 'BTC')
  })

  it('defaults to settlement tab when no query param', () => {
    mockSearchParams.delete('tab')
    render(<HistoryFeature />)
    const tabs = screen.getByTestId('history-tabs')
    expect(tabs).toHaveAttribute('data-default-tab', 'settlement')
  })

  it('defaults to trades tab when ?tab=trades', () => {
    mockSearchParams.set('tab', 'trades')
    render(<HistoryFeature />)
    const tabs = screen.getByTestId('history-tabs')
    expect(tabs).toHaveAttribute('data-default-tab', 'trades')
  })

  it('defaults to settlement tab for unknown tab param', () => {
    mockSearchParams.set('tab', 'unknown')
    render(<HistoryFeature />)
    const tabs = screen.getByTestId('history-tabs')
    expect(tabs).toHaveAttribute('data-default-tab', 'settlement')
  })
})
