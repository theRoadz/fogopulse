'use client'

import { useWallet } from '@solana/wallet-adapter-react'

import type { Asset } from '@/types/assets'
import { useMultiAssetPositions } from '@/hooks/use-multi-asset-positions'
import { useUIStore } from '@/stores/ui-store'
import { PortfolioSummary } from '@/components/trading/portfolio-summary'
import { AssetPositionRow } from '@/components/trading/asset-position-row'
import { Skeleton } from '@/components/ui/skeleton'

export function MultiAssetPositionsPanel() {
  const { publicKey } = useWallet()
  const {
    activePositions,
    totalValue,
    totalPnl,
    totalPnlPercent,
    isLoading,
    positionCount,
  } = useMultiAssetPositions()

  const handleNavigateToAsset = (asset: Asset) => {
    useUIStore.setState({ activeAsset: asset })
  }

  // Don't render if wallet not connected
  if (!publicKey) return null

  // Loading state
  if (isLoading && positionCount === 0) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  // Empty state
  if (positionCount === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No active positions. Start trading to see your portfolio.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <PortfolioSummary
        totalValue={totalValue}
        totalPnl={totalPnl}
        totalPnlPercent={totalPnlPercent}
        positionCount={positionCount}
      />
      {activePositions.map((ap) => (
        <AssetPositionRow
          key={ap.asset}
          assetPosition={ap}
          onNavigateToAsset={handleNavigateToAsset}
        />
      ))}
    </div>
  )
}
