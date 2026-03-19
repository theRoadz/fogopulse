/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { HomeFeature } from './home-feature'

// Mock MarketCard
jest.mock('./market-card', () => ({
  MarketCard: ({ asset }: { asset: string }) => (
    <div data-testid={`market-card-${asset}`}>{asset}</div>
  ),
}))

// Mock HomeOracleHealthCard
jest.mock('./home-oracle-health-card', () => ({
  HomeOracleHealthCard: () => <div data-testid="oracle-health">Oracle Health</div>,
}))

// Mock PythTechSection
jest.mock('./pyth-tech-section', () => ({
  PythTechSection: () => <div data-testid="pyth-tech">Pyth Tech</div>,
}))

// Mock assets
jest.mock('@/types/assets', () => ({
  ASSETS: ['BTC', 'ETH', 'SOL', 'FOGO'],
}))

describe('HomeFeature', () => {
  it('renders the hero heading', () => {
    render(<HomeFeature />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('FOGO')
    expect(heading).toHaveTextContent('Pulse')
  })

  it('renders the subtitle', () => {
    render(<HomeFeature />)
    expect(screen.getByText('Binary Prediction Markets on FOGO Chain')).toBeInTheDocument()
  })

  it('renders all 4 market cards', () => {
    render(<HomeFeature />)
    expect(screen.getByTestId('market-card-BTC')).toBeInTheDocument()
    expect(screen.getByTestId('market-card-ETH')).toBeInTheDocument()
    expect(screen.getByTestId('market-card-SOL')).toBeInTheDocument()
    expect(screen.getByTestId('market-card-FOGO')).toBeInTheDocument()
  })

  it('renders the Oracle Health card', () => {
    render(<HomeFeature />)
    expect(screen.getByTestId('oracle-health')).toBeInTheDocument()
  })

  it('renders the Pyth Tech section', () => {
    render(<HomeFeature />)
    expect(screen.getByTestId('pyth-tech')).toBeInTheDocument()
  })

  it('renders footer text about epochs and Pyth', () => {
    render(<HomeFeature />)
    expect(screen.getByText(/Pyth Hermes.*real-time streaming/)).toBeInTheDocument()
    expect(screen.getByText(/Pyth Lazer.*on-chain settlement/)).toBeInTheDocument()
  })
})
