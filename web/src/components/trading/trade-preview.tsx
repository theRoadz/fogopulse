'use client'

import { useMemo } from 'react'
import { AlertTriangle, Check, TrendingUp, TrendingDown, Info } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTradePreview } from '@/hooks/use-trade-preview'
import type { Asset } from '@/types/assets'

interface TradePreviewProps {
  asset: Asset
  className?: string
}

/**
 * Format a number as currency (USD).
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Format a number as a percentage with sign.
 */
function formatPercent(value: number, showSign = true): string {
  const sign = showSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/**
 * Format a number with specified decimal places.
 */
function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals)
}

/**
 * Trade preview component showing calculated outcomes before execution.
 *
 * Displays:
 * - Entry price per share
 * - Shares to receive
 * - Fee amount (informational - collected at settlement)
 * - Estimated settlement payout if prediction wins
 * - Market probability impact
 * - Slippage estimate with warning
 */
export function TradePreview({ asset, className }: TradePreviewProps) {
  const preview = useTradePreview(asset)

  // Memoize rendered content to avoid unnecessary re-renders
  const content = useMemo(() => {
    if (!preview) {
      return null
    }

    const {
      direction,
      amount,
      netAmount,
      entryPrice,
      sharesDisplay,
      fee,
      feePercent,
      feeSplit,
      potentialPayout,
      profitPercent,
      currentProbabilities,
      newProbabilities,
      probabilityChange,
      slippage,
      hasHighSlippage,
    } = preview

    const isUp = direction === 'up'

    return (
      <div
        className={cn(
          'rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm',
          className
        )}
        data-testid="trade-preview"
      >
        {/* Header */}
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Trade Preview
        </div>

        {/* Entry Price and Shares */}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Entry Price</span>
          <span className="font-medium">{formatCurrency(entryPrice)} / share</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Shares</span>
          <span className="font-medium">{formatNumber(sharesDisplay, 2)} shares</span>
        </div>

        {/* Fee with breakdown tooltip */}
        <div className="flex justify-between items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                  Fee ({feePercent}%)
                  <Info className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                <div className="space-y-1">
                  <div className="font-medium mb-1">Fee Breakdown</div>
                  <div className="flex justify-between gap-4">
                    <span>LP (70%)</span>
                    <span>{formatCurrency(feeSplit.lpFee)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Treasury (20%)</span>
                    <span>{formatCurrency(feeSplit.treasuryFee)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Insurance (10%)</span>
                    <span>{formatCurrency(feeSplit.insuranceFee)}</span>
                  </div>
                  <div className="border-t border-border mt-1 pt-1 flex justify-between gap-4 font-medium">
                    <span>Net Trade</span>
                    <span>{formatCurrency(netAmount)}</span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="font-medium text-muted-foreground">{formatCurrency(fee)}</span>
        </div>

        <Separator className="my-2" />

        {/* Potential Outcomes */}
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">
            If {isUp ? 'UP' : 'DOWN'} Wins
          </span>
          <span className="font-semibold text-green-500">
            ~{formatCurrency(potentialPayout)}{' '}
            <span className="text-xs opacity-80">({formatPercent(profitPercent)})</span>
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">
            If {isUp ? 'DOWN' : 'UP'} Wins
          </span>
          <span className="font-semibold text-muted-foreground">{formatCurrency(0)}</span>
        </div>

        <Separator className="my-2" />

        {/* Market Impact */}
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
          Market Impact
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            <span className="text-muted-foreground">UP</span>
          </div>
          <span className="font-medium">
            {formatNumber(currentProbabilities.pUp, 0)}% {'→'} {formatNumber(newProbabilities.pUp, 0)}%
            <span className={cn(
              'ml-1.5 text-xs',
              newProbabilities.pUp > currentProbabilities.pUp ? 'text-green-500' : 'text-red-500'
            )}>
              ({formatPercent(newProbabilities.pUp - currentProbabilities.pUp)})
            </span>
          </span>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            <span className="text-muted-foreground">DOWN</span>
          </div>
          <span className="font-medium">
            {formatNumber(currentProbabilities.pDown, 0)}% {'→'} {formatNumber(newProbabilities.pDown, 0)}%
            <span className={cn(
              'ml-1.5 text-xs',
              newProbabilities.pDown > currentProbabilities.pDown ? 'text-red-500' : 'text-green-500'
            )}>
              ({formatPercent(newProbabilities.pDown - currentProbabilities.pDown)})
            </span>
          </span>
        </div>

        <Separator className="my-2" />

        {/* Price Impact (labeled clearly to avoid confusion with traditional slippage) */}
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Price Impact</span>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'font-medium',
                hasHighSlippage ? 'text-yellow-500' : 'text-muted-foreground'
              )}
            >
              {formatNumber(slippage, 2)}%
            </span>
            {hasHighSlippage ? (
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
            ) : (
              <Check className="h-3.5 w-3.5 text-green-500" />
            )}
          </div>
        </div>

        {/* High price impact warning */}
        {hasHighSlippage && (
          <div className="flex items-start gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-500">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              High price impact detected. Consider trading a smaller amount for better pricing.
            </span>
          </div>
        )}
      </div>
    )
  }, [preview, className])

  // content is null when preview is null (handled in useMemo)
  return content
}
