'use client'

import { useUIStore } from '@/stores/ui-store'
import { ChartArea } from './chart-area'
import { TradeTicketArea } from './trade-ticket-area'
import { PositionsAndTradesPanel } from './positions-and-trades-panel'

export function TradingLayout() {
  const activeAsset = useUIStore((s) => s.activeAsset)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Main trading area: 70/30 on desktop, stacked on mobile (Chart → Trade → Positions) */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        {/* On mobile: `contents` dissolves this wrapper so children can be reordered with siblings.
            On desktop: restored as flex column (70% width) so positions sits tight under chart. */}
        <div role="group" className="contents lg:flex lg:flex-col lg:gap-4 lg:w-[70%]">
          <ChartArea
            asset={activeAsset}
            className="order-1 lg:order-none w-full min-h-[425px] md:min-h-[475px] lg:min-h-[525px]"
          />
          <div className="order-3 lg:order-none w-full">
            <PositionsAndTradesPanel />
          </div>
        </div>

        {/* Trade Ticket — between chart and positions on mobile, right column on desktop */}
        <div className="w-full lg:w-[30%] order-2 lg:order-none">
          <TradeTicketArea asset={activeAsset} />
        </div>
      </div>
    </div>
  )
}
