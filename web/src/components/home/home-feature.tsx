'use client'

import { ASSETS } from '@/types/assets'
import { MarketCard } from './market-card'
import { HomeOracleHealthCard } from './home-oracle-health-card'
import { PythTechSection } from './pyth-tech-section'

export function HomeFeature() {
  return (
    <div className="space-y-8 py-4 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold">
          <span className="text-primary">FOGO</span> Pulse
        </h1>
        <p className="text-lg text-muted-foreground">
          Binary Prediction Markets on FOGO Chain
        </p>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Trade 5-minute binary prediction epochs on crypto assets. Pick UP or DOWN, and win if
          the price moves your way. Powered by the Pyth Oracle Network.
        </p>
      </div>

      {/* Main Content: Two-column layout (50:50) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Market Cards */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Markets</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ASSETS.map((asset) => (
              <MarketCard key={asset} asset={asset} compact />
            ))}
          </div>
        </div>

        {/* RIGHT: Oracle Health */}
        <div className="space-y-4">
          <HomeOracleHealthCard />
        </div>
      </div>

      {/* Powered by Pyth — full width, side-by-side */}
      <PythTechSection />

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground">
        All markets use 5-minute epochs. Prices powered by Pyth Hermes (real-time streaming)
        and Pyth Lazer (on-chain settlement with Ed25519 verification).
      </p>
    </div>
  )
}
