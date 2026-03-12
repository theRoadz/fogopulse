'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Asset } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'

interface TradeTicketAreaProps {
  asset: Asset
}

export function TradeTicketArea({ asset }: TradeTicketAreaProps) {
  const metadata = ASSET_METADATA[asset]

  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <CardTitle className="text-center">
          Trade {metadata.label}
        </CardTitle>
        <p className="text-sm text-muted-foreground text-center">
          Trade Ticket Coming Soon
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Direction Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-16 text-lg font-semibold border-green-500/50 text-green-500 hover:bg-green-500/10"
            disabled
          >
            UP
          </Button>
          <Button
            variant="outline"
            className="h-16 text-lg font-semibold border-red-500/50 text-red-500 hover:bg-red-500/10"
            disabled
          >
            DOWN
          </Button>
        </div>

        {/* Amount Input Placeholder */}
        <div className="space-y-2">
          <label htmlFor="trade-amount" className="text-sm text-muted-foreground">Amount (USDC)</label>
          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
            <span className="text-muted-foreground">$</span>
            <input
              id="trade-amount"
              type="text"
              placeholder="0.00"
              disabled
              className="flex-1 bg-transparent text-right text-lg font-mono outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        {/* Quick Amount Buttons */}
        <div className="grid grid-cols-4 gap-2">
          {['$10', '$25', '$50', '$100'].map((amount) => (
            <Button
              key={amount}
              variant="outline"
              size="sm"
              disabled
              className="text-xs"
            >
              {amount}
            </Button>
          ))}
        </div>

        {/* Submit Button */}
        <Button className="w-full mt-4" size="lg" disabled>
          Connect Wallet to Trade
        </Button>

        {/* Info */}
        <p className="text-xs text-center text-muted-foreground">
          Predict if {metadata.label} will be above or below the price at epoch end
        </p>
      </CardContent>
    </Card>
  )
}
