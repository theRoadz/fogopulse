'use client'

import { useUIStore } from '@/stores/ui-store'
import { ChartArea } from './chart-area'
import { TradeTicketArea } from './trade-ticket-area'
import { PositionsAndTradesPanel } from './positions-and-trades-panel'

export function TradingLayout() {
  const activeAsset = useUIStore((s) => s.activeAsset)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Main trading area: 70% chart / 30% trade ticket on desktop */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        {/* Chart Area - 70% on desktop, full width on mobile/tablet */}
        <div className="w-full lg:w-[70%] flex flex-col gap-4">
          <ChartArea
            asset={activeAsset}
            className="h-[400px] md:h-[450px] lg:h-[500px]"
          />
          <PositionsAndTradesPanel />
        </div>

        {/* Trade Ticket Area - 30% on desktop, full width on mobile/tablet */}
        <div className="w-full lg:w-[30%]">
          <TradeTicketArea asset={activeAsset} />
        </div>
      </div>
    </div>
  )
}
