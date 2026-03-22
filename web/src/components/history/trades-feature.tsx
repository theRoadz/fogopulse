'use client'

import { useUIStore } from '@/stores/ui-store'
import { AssetTabs } from '@/components/trading/asset-tabs'
import { TradingHistoryList } from '@/components/trading/trading-history-list'

export function TradesFeature() {
  const activeAsset = useUIStore((s) => s.activeAsset)
  const setActiveAsset = useUIStore((s) => s.setActiveAsset)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">Trade History</h1>
      <AssetTabs onAssetChange={setActiveAsset} />
      <TradingHistoryList assetFilter={activeAsset} />
    </div>
  )
}
