'use client'

import { useSearchParams } from 'next/navigation'

import { useUIStore } from '@/stores/ui-store'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AssetTabs } from '@/components/trading/asset-tabs'
import { SettlementHistoryList } from '@/components/trading/settlement-history-list'
import { TradingHistoryList } from '@/components/trading/trading-history-list'

export function HistoryFeature() {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get('tab') === 'trades' ? 'trades' : 'settlement'

  const activeAsset = useUIStore((s) => s.activeAsset)
  const setActiveAsset = useUIStore((s) => s.setActiveAsset)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">History</h1>

      <AssetTabs onAssetChange={setActiveAsset} />

      <Tabs defaultValue={defaultTab} data-testid="history-tabs">
        <TabsList>
          <TabsTrigger value="settlement" data-testid="settlement-tab">
            Settlement History
          </TabsTrigger>
          <TabsTrigger value="trades" data-testid="trades-tab">
            My Trades
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settlement" className="space-y-4">
          <SettlementHistoryList asset={activeAsset} />
        </TabsContent>

        <TabsContent value="trades" className="space-y-4">
          <TradingHistoryList assetFilter={activeAsset} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
