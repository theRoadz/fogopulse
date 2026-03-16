'use client'

import { AlertTriangle, Info } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { SellReturn } from '@/lib/trade-preview'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface SellPreviewProps {
  sellReturn: SellReturn
  shares: bigint
  entryAmount: bigint
}

export function SellPreview({
  sellReturn,
  shares,
  entryAmount,
}: SellPreviewProps) {
  const { gross, fee, net, feeSplit, realizedPnl, realizedPnlPercent, priceImpact } =
    sellReturn

  const absPnl = realizedPnl < 0n ? -realizedPnl : realizedPnl
  const pnlSign = realizedPnl > 0n ? '+' : realizedPnl < 0n ? '-' : ''
  const pnlColor =
    realizedPnl > 0n
      ? 'text-green-500'
      : realizedPnl < 0n
        ? 'text-red-500'
        : 'text-muted-foreground'

  const hasHighPriceImpact = priceImpact > 1

  return (
    <div
      className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm"
      data-testid="sell-preview"
    >
      {/* Header */}
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Exit Preview
      </div>

      {/* Shares to sell */}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Shares to sell</span>
        <span className="font-medium">{formatUsdcAmount(shares)}</span>
      </div>

      {/* Gross return */}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Gross return</span>
        <span className="font-medium">{formatUsdcAmount(gross)} USDC</span>
      </div>

      {/* Fee with tooltip */}
      <div className="flex justify-between items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                Fee (1.8%)
                <Info className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              <div className="space-y-1">
                <div className="font-medium mb-1">Fee Breakdown</div>
                <div className="flex justify-between gap-4">
                  <span>LP (70%)</span>
                  <span>{formatUsdcAmount(feeSplit.lpFee)} USDC</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Treasury (20%)</span>
                  <span>{formatUsdcAmount(feeSplit.treasuryFee)} USDC</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Insurance (10%)</span>
                  <span>{formatUsdcAmount(feeSplit.insuranceFee)} USDC</span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="font-medium text-muted-foreground">
          -{formatUsdcAmount(fee)} USDC
        </span>
      </div>

      <Separator className="my-2" />

      {/* Net return */}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Net return</span>
        <span className="font-semibold">{formatUsdcAmount(net)} USDC</span>
      </div>

      {/* Entry amount */}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Entry amount</span>
        <span className="font-medium">{formatUsdcAmount(entryAmount)} USDC</span>
      </div>

      {/* Realized PnL */}
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">Realized PnL</span>
        <span className={cn('font-semibold', pnlColor)} data-testid="realized-pnl">
          {pnlSign}{formatUsdcAmount(absPnl)} USDC ({pnlSign}{Math.abs(realizedPnlPercent).toFixed(1)}%)
        </span>
      </div>

      {/* Price impact */}
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">Price impact</span>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'font-medium',
              hasHighPriceImpact ? 'text-yellow-500' : 'text-muted-foreground'
            )}
          >
            {priceImpact.toFixed(1)}%
          </span>
          {hasHighPriceImpact && (
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" data-testid="price-impact-warning" />
          )}
        </div>
      </div>

      {/* High price impact warning */}
      {hasHighPriceImpact && (
        <div className="flex items-start gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-500">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            High price impact detected. This sell will significantly shift market probabilities.
          </span>
        </div>
      )}
    </div>
  )
}
