'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Loader2 } from 'lucide-react'

import type { Asset } from '@/types/assets'
import { EpochState } from '@/types/epoch'
import { TRADING_FEE_BPS } from '@/lib/constants'
import { useEpoch } from '@/hooks/use-epoch'
import { usePool } from '@/hooks/use-pool'
import { useUserPosition } from '@/hooks/use-user-position'
import { useClaimableAmount, formatUsdcAmount } from '@/hooks/use-claimable-amount'
import { useSellPosition } from '@/hooks/use-sell-position'
import { useClaimPosition } from '@/hooks/use-claim-position'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface YourPositionProps {
  asset: Asset
  className?: string
}

/**
 * Estimate return from selling shares using CPMM inverse formula.
 * Uses BigInt arithmetic to match on-chain precision.
 */
function estimateSellReturn(
  shares: bigint,
  direction: 'up' | 'down',
  yesReserves: bigint,
  noReserves: bigint
): { gross: bigint; fee: bigint; net: bigint } {
  const sameReserves = direction === 'up' ? yesReserves : noReserves
  const oppositeReserves = direction === 'up' ? noReserves : yesReserves

  if (oppositeReserves === 0n) {
    return { gross: 0n, fee: 0n, net: 0n }
  }

  const gross = (shares * sameReserves) / oppositeReserves
  const fee = (gross * BigInt(TRADING_FEE_BPS)) / 10000n
  const net = gross - fee

  return { gross, fee, net }
}

export function YourPosition({ asset, className }: YourPositionProps) {
  const { publicKey } = useWallet()
  const { epochState } = useEpoch(asset)
  const { pool } = usePool(asset)
  const epochPda = epochState.epoch ? (pool?.activeEpoch ?? null) : null

  const { position, isLoading: positionLoading } = useUserPosition(epochPda)
  const { claimState, displayAmount } = useClaimableAmount(
    epochState.epoch,
    position
  )

  const sellMutation = useSellPosition()
  const claimMutation = useClaimPosition()

  const [showSellDialog, setShowSellDialog] = useState(false)

  // Don't render if wallet not connected
  if (!publicKey) return null

  // Don't render while loading (avoids flash)
  if (positionLoading) return null

  // Don't render if no position
  if (!position) return null

  const direction = position.direction
  const isUp = direction === 'up'

  // Determine epoch state for button logic
  const isEpochOpen =
    epochState.epoch?.state === EpochState.Open && !epochState.isFrozen

  // Check if position is fully sold (shares === 0)
  const isFullySold = position.shares === 0n

  // Calculate sell preview
  const sellPreview =
    pool && position.shares > 0n
      ? estimateSellReturn(
          position.shares,
          direction,
          pool.yesReserves,
          pool.noReserves
        )
      : null

  function handleSellClick() {
    setShowSellDialog(true)
  }

  async function handleSellConfirm() {
    if (!epochPda || !publicKey || !position) return
    setShowSellDialog(false)
    try {
      await sellMutation.mutateAsync({
        asset,
        epochPda,
        shares: position.shares,
        userPubkey: publicKey.toString(),
        isFullExit: true,
      })
    } catch {
      // Error handling (toast) is done inside the useSellPosition hook
    }
  }

  async function handleClaim(type: 'payout' | 'refund') {
    if (!epochPda || !publicKey || !displayAmount) return
    await claimMutation.mutateAsync({
      asset,
      type,
      epochPda,
      userPubkey: publicKey.toString(),
      displayAmount,
    })
  }

  // Determine what to render based on claim state
  function renderActions() {
    if (!position) return null

    // Fully sold position
    if (isFullySold) {
      return <Badge variant="secondary">Sold</Badge>
    }

    // Check claim state
    switch (claimState.type) {
      case 'claimed':
        return <Badge variant="secondary">Claimed</Badge>

      case 'lost':
        return (
          <span className="text-sm text-muted-foreground font-medium">
            Lost
          </span>
        )

      case 'winner':
        return (
          <Button
            size="sm"
            onClick={() => handleClaim('payout')}
            disabled={claimMutation.isPending}
          >
            {claimMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Claim Payout ({displayAmount} USDC)
          </Button>
        )

      case 'refund':
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleClaim('refund')}
            disabled={claimMutation.isPending}
          >
            {claimMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Claim Refund ({displayAmount} USDC)
          </Button>
        )

      case 'not-settled':
        // Epoch is open or frozen — show sell button if open
        if (isEpochOpen && position.shares > 0n) {
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSellClick}
              disabled={sellMutation.isPending}
            >
              {sellMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Sell Position
            </Button>
          )
        }
        return null

      default:
        return null
    }
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Your Position</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Direction and entry info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`text-lg font-bold ${isUp ? 'text-green-500' : 'text-red-500'}`}
              >
                {isUp ? '▲ UP' : '▼ DOWN'}
              </span>
            </div>
          </div>

          {/* Position details */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Entry</span>
              <p className="font-medium">
                {formatUsdcAmount(position.amount)} USDC
              </p>
            </div>
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
          </div>

          {/* Action buttons */}
          <div className="pt-1">{renderActions()}</div>
        </CardContent>
      </Card>

      {/* Sell confirmation dialog */}
      <Dialog open={showSellDialog} onOpenChange={setShowSellDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sell Position</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Sell all <strong>{position.shares.toString()}</strong> shares?
            </p>
            {sellPreview && (
              <p className="text-muted-foreground">
                Estimated return: ~
                {formatUsdcAmount(sellPreview.net)} USDC (after 1.8% fee)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSellDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSellConfirm}>Confirm Sell</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
