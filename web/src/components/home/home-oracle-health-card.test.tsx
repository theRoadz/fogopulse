/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { HomeOracleHealthCard } from './home-oracle-health-card'

// Mock hooks
const mockUsePythPrice = jest.fn()
jest.mock('@/hooks/use-pyth-price', () => ({
  usePythPrice: () => mockUsePythPrice(),
}))

// Mock constants
jest.mock('@/lib/constants', () => ({
  ASSET_METADATA: {
    BTC: { label: 'BTC', color: 'text-orange-500', feedId: '0xabc' },
    ETH: { label: 'ETH', color: 'text-blue-500', feedId: '0xdef' },
    SOL: { label: 'SOL', color: 'text-purple-500', feedId: '0xghi' },
    FOGO: { label: 'FOGO', color: 'text-primary', feedId: '' },
  },
}))

jest.mock('@/types/assets', () => ({
  ASSETS: ['BTC', 'ETH', 'SOL', 'FOGO'] as const,
}))

// Mock utils
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
}))

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}))

describe('HomeOracleHealthCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsePythPrice.mockReturnValue({
      price: { price: 67543.21, confidence: 10, timestamp: Date.now() },
      connectionState: 'connected' as const,
    })
  })

  it('renders the Oracle Health title', () => {
    render(<HomeOracleHealthCard />)
    expect(screen.getByText('Oracle Health')).toBeInTheDocument()
  })

  it('displays Pyth Hermes branding', () => {
    render(<HomeOracleHealthCard />)
    expect(screen.getByText('Pyth Hermes')).toBeInTheDocument()
  })

  it('renders all 4 asset rows', () => {
    render(<HomeOracleHealthCard />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('SOL')).toBeInTheDocument()
    expect(screen.getByText('FOGO')).toBeInTheDocument()
  })

  it('shows connection badges', () => {
    render(<HomeOracleHealthCard />)
    const badges = screen.getAllByTestId('badge')
    const connectedBadges = badges.filter(b => b.textContent === 'Connected')
    expect(connectedBadges.length).toBeGreaterThan(0)
  })

  it('shows threshold info in footer', () => {
    render(<HomeOracleHealthCard />)
    expect(screen.getByText(/Thresholds/)).toBeInTheDocument()
  })

  it('shows "No data" when price is null', () => {
    mockUsePythPrice.mockReturnValue({
      price: null,
      connectionState: 'disconnected' as const,
    })
    render(<HomeOracleHealthCard />)
    const noDataElements = screen.getAllByText('No data')
    expect(noDataElements.length).toBe(4)
  })
})
