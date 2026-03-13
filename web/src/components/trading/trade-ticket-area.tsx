'use client'

import type { Asset } from '@/types/assets'
import { PoolStateDisplay } from './pool-state-display'
import { TradeTicket } from './trade-ticket'

interface TradeTicketAreaProps {
  asset: Asset
}

/**
 * Container for the trade ticket area (right 35% of trading layout).
 * Combines:
 * - PoolStateDisplay: Shows market sentiment (UP/DOWN probabilities)
 * - TradeTicket: Direction selection, amount input, and trade placement
 */
export function TradeTicketArea({ asset }: TradeTicketAreaProps) {
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Pool State Display - shows market sentiment */}
      <PoolStateDisplay asset={asset} />

      {/* Trade Ticket */}
      <TradeTicket asset={asset} className="flex-1" />
    </div>
  )
}
