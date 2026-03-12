'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { WalletButton } from '@/components/wallet'
import { FogopulseDashboard } from './fogopulse-ui'
import { AppHero } from '../app-hero'

export default function FogopulseFeature() {
  const { publicKey } = useWallet()

  return publicKey ? (
    <div>
      <AppHero
        title="FOGO Pulse"
        subtitle="Prediction markets on FOGO chain. Trade on price movements with instant settlement."
      />
      <div className="max-w-6xl mx-auto px-4">
        <FogopulseDashboard />
      </div>
    </div>
  ) : (
    <div className="max-w-4xl mx-auto">
      <div className="hero py-[64px]">
        <div className="hero-content text-center flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Connect Your Wallet</h2>
          <p className="text-muted-foreground">Connect your wallet to start trading on FOGO.</p>
          <WalletButton />
        </div>
      </div>
    </div>
  )
}
