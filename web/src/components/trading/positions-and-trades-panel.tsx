'use client'

import { useUIStore } from '@/stores/ui-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MultiAssetPositionsPanel } from './multi-asset-positions-panel'
import { TradingHistoryList } from './trading-history-list'

export function PositionsAndTradesPanel() {
  const activeAsset = useUIStore((s) => s.activeAsset)

  return (
    <Tabs defaultValue="positions">
      <TabsList variant="line">
        <TabsTrigger value="positions">Positions</TabsTrigger>
        <TabsTrigger value="trades">My Trades</TabsTrigger>
      </TabsList>
      <TabsContent value="positions">
        <MultiAssetPositionsPanel />
      </TabsContent>
      <TabsContent value="trades">
        <TradingHistoryList assetFilter={activeAsset} />
      </TabsContent>
    </Tabs>
  )
}
