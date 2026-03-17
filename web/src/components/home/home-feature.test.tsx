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
    expect(screen.getByText('Prediction Markets on FOGO Chain')).toBeInTheDocument()
  })

  it('renders all 4 market cards', () => {
    render(<HomeFeature />)
    expect(screen.getByTestId('market-card-BTC')).toBeInTheDocument()
    expect(screen.getByTestId('market-card-ETH')).toBeInTheDocument()
    expect(screen.getByTestId('market-card-SOL')).toBeInTheDocument()
    expect(screen.getByTestId('market-card-FOGO')).toBeInTheDocument()
  })

  it('has responsive grid classes', () => {
    render(<HomeFeature />)
    const grid = screen.getByTestId('market-grid')
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toContain('md:grid-cols-2')
  })

  it('renders footer text about epochs and Pyth', () => {
    render(<HomeFeature />)
    expect(screen.getByText('All markets use 5-minute epochs. Prices powered by Pyth Oracle.')).toBeInTheDocument()
  })
})
