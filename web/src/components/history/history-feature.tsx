'use client'

import { useUIStore } from '@/stores/ui-store'
import { AssetTabs } from '@/components/trading/asset-tabs'
import { SettlementHistoryList } from '@/components/trading/settlement-history-list'
import type { Asset } from '@/types/assets'

export function HistoryFeature() {
  const activeAsset = useUIStore((s) => s.activeAsset)
  const setActiveAsset = useUIStore((s) => s.setActiveAsset)

  const handleAssetChange = (asset: Asset) => {
    setActiveAsset(asset)
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">Settlement History</h1>
      <AssetTabs onAssetChange={handleAssetChange} />
      <SettlementHistoryList asset={activeAsset} />
    </div>
  )
}
