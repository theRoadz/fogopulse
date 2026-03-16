'use client'

import { useUIStore } from '@/stores/ui-store'
import type { Asset } from '@/types/assets'
import { AssetTabs } from './asset-tabs'
import { ChartArea } from './chart-area'
import { TradeTicketArea } from './trade-ticket-area'
import { MultiAssetPositionsPanel } from './multi-asset-positions-panel'

interface TradingLayoutProps {
  onAssetChange?: (asset: Asset) => void
}

export function TradingLayout({ onAssetChange }: TradingLayoutProps) {
  const activeAsset = useUIStore((s) => s.activeAsset)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header with Asset Tabs */}
      <div className="flex justify-center">
        <AssetTabs onAssetChange={onAssetChange} />
      </div>

      {/* Main trading area: 70% chart / 30% trade ticket on desktop */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        {/* Chart Area - 70% on desktop, full width on mobile/tablet */}
        <div className="w-full lg:w-[70%]">
          <ChartArea
            asset={activeAsset}
            className="h-[400px] md:h-[450px] lg:h-[500px]"
          />
        </div>

        {/* Trade Ticket Area - 30% on desktop, full width on mobile/tablet */}
        <div className="w-full lg:w-[30%]">
          <TradeTicketArea asset={activeAsset} />
        </div>
      </div>

      {/* Multi-Asset Positions Panel - below main trading area, full width */}
      <MultiAssetPositionsPanel />
    </div>
  )
}
