'use client'

import { useMemo } from 'react'

import { calculatePositionPnL } from '@/lib/trade-preview'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'

interface PnLDisplayProps {
  shares: bigint
  entryAmount: bigint
  direction: 'up' | 'down'
  yesReserves: bigint
  noReserves: bigint
  className?: string
}

export function PnLDisplay({
  shares,
  entryAmount,
  direction,
  yesReserves,
  noReserves,
  className,
}: PnLDisplayProps) {
  const pnl = useMemo(
    () =>
      calculatePositionPnL(shares, entryAmount, direction, yesReserves, noReserves),
    [shares, entryAmount, direction, yesReserves, noReserves]
  )

  // Don't render for fully sold positions
  if (shares === 0n) return null

  const { pnlAmount, pnlPercent } = pnl
  const absPnl = pnlAmount < 0n ? -pnlAmount : pnlAmount
  const sign = pnlAmount > 0n ? '+' : pnlAmount < 0n ? '-' : ''

  const colorClass =
    pnlAmount > 0n
      ? 'text-green-500'
      : pnlAmount < 0n
        ? 'text-red-500'
        : 'text-muted-foreground'

  return (
    <div className={`text-sm ${colorClass}${className ? ` ${className}` : ''}`}>
      PnL: {sign}{formatUsdcAmount(absPnl)} USDC ({sign}{Math.abs(pnlPercent).toFixed(1)}%)
    </div>
  )
}
