'use client'

import { ASSETS } from '@/types/assets'
import { MarketCard } from './market-card'

export function HomeFeature() {
  return (
    <div className="space-y-8 py-4 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold">
          <span className="text-primary">FOGO</span> Pulse
        </h1>
        <p className="text-lg text-muted-foreground">
          Prediction Markets on FOGO Chain
        </p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Trade 5-minute prediction epochs on crypto assets. Pick UP or DOWN, and win if
          the price moves your way.
        </p>
      </div>

      {/* Market Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4" data-testid="market-grid">
        {ASSETS.map((asset) => (
          <MarketCard key={asset} asset={asset} />
        ))}
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground">
        All markets use 5-minute epochs. Prices powered by Pyth Oracle.
      </p>
    </div>
  )
}
