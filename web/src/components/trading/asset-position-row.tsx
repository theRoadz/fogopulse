'use client'

import type { Asset } from '@/types/assets'
import type { AssetPositionInfo } from '@/hooks/use-multi-asset-positions'
import { ASSET_METADATA } from '@/lib/constants'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'

interface AssetPositionRowProps {
  assetPosition: AssetPositionInfo
  onNavigateToAsset: (asset: Asset) => void
}

export function AssetPositionRow({
  assetPosition,
  onNavigateToAsset,
}: AssetPositionRowProps) {
  const { asset, position, pnl } = assetPosition
  const metadata = ASSET_METADATA[asset]

  if (!position || position.shares === 0n) return null

  const isUp = position.direction === 'up'
  const directionLabel = isUp ? 'UP' : 'DOWN'
  const directionColor = isUp ? 'text-green-500' : 'text-red-500'

  const pnlAmount = pnl?.pnlAmount ?? 0n
  const absPnl = pnlAmount < 0n ? -pnlAmount : pnlAmount
  const sign = pnlAmount > 0n ? '+' : pnlAmount < 0n ? '-' : ''
  const pnlColor =
    pnlAmount > 0n
      ? 'text-green-500'
      : pnlAmount < 0n
        ? 'text-red-500'
        : 'text-muted-foreground'

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-3">
          <span className={`font-semibold ${metadata.color}`}>
            {metadata.label}
          </span>
          <span className={`font-medium ${directionColor}`}>
            {isUp ? '▲' : '▼'} {directionLabel}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            Entry: {formatUsdcAmount(position.amount)} USDC
          </span>
          {pnl && (
            <span className={pnlColor}>
              {sign}{formatUsdcAmount(absPnl)} ({sign}{Math.abs(pnl.pnlPercent).toFixed(1)}%)
            </span>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border border-t-0 rounded-b-md px-4 py-3 space-y-3">
          {/* Position details */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Shares</span>
              <p className="font-medium">{position.shares.toString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Avg Price</span>
              <p className="font-medium">
                {formatUsdcAmount(position.entryPrice)} USDC
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Current Value</span>
              <p className="font-medium">
                {pnl ? `${formatUsdcAmount(pnl.currentValue)} USDC` : '—'}
              </p>
            </div>
          </div>

          {/* Navigate button */}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigateToAsset(asset)}
            >
              Trade {metadata.label}
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
