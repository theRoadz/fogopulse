'use client'

import { useState } from 'react'

import { useUIStore } from '@/stores/ui-store'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AssetTabs } from '@/components/trading/asset-tabs'
import { SettlementHistoryList } from '@/components/trading/settlement-history-list'
import { TradingHistoryList } from '@/components/trading/trading-history-list'
import { ASSETS, type Asset } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'
import { cn } from '@/lib/utils'

export function HistoryFeature() {
  const activeAsset = useUIStore((s) => s.activeAsset)
  const setActiveAsset = useUIStore((s) => s.setActiveAsset)

  const [tradingFilter, setTradingFilter] = useState<Asset | 'ALL'>('ALL')

  const handleAssetChange = (asset: Asset) => {
    setActiveAsset(asset)
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">History</h1>

      <Tabs defaultValue="settlement" data-testid="history-tabs">
        <TabsList>
          <TabsTrigger value="settlement" data-testid="settlement-tab">
            Settlement History
          </TabsTrigger>
          <TabsTrigger value="trades" data-testid="trades-tab">
            My Trades
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settlement" className="space-y-4">
          <AssetTabs onAssetChange={handleAssetChange} />
          <SettlementHistoryList asset={activeAsset} />
        </TabsContent>

        <TabsContent value="trades" className="space-y-4">
          {/* Asset filter for trading history with "All" option */}
          <Tabs
            value={tradingFilter}
            onValueChange={(v) => setTradingFilter(v as Asset | 'ALL')}
            data-testid="trading-asset-filter"
          >
            <TabsList variant="line" className="grid grid-cols-5 w-full max-w-md">
              <TabsTrigger
                value="ALL"
                className={cn('font-semibold', tradingFilter === 'ALL' && 'text-foreground')}
              >
                All
              </TabsTrigger>
              {ASSETS.map((asset) => (
                <TabsTrigger
                  key={asset}
                  value={asset}
                  className={cn(
                    'font-semibold',
                    tradingFilter === asset && ASSET_METADATA[asset].color
                  )}
                >
                  {ASSET_METADATA[asset].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <TradingHistoryList assetFilter={tradingFilter} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
