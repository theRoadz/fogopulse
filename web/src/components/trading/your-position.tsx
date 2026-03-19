'use client'

import { useState, useEffect, useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { Loader2 } from 'lucide-react'

import type { Asset } from '@/types/assets'
import { EpochState } from '@/types/epoch'
import type { EpochData } from '@/types/epoch'
import type { PoolData } from '@/types/pool'
import { ASSET_METADATA } from '@/lib/constants'
import { calculateSellReturn } from '@/lib/trade-preview'
import { useEpoch } from '@/hooks/use-epoch'
import { usePool } from '@/hooks/use-pool'
import { useUserPosition } from '@/hooks/use-user-position'
import type { UserPositionData } from '@/hooks/use-user-position'
import { useClaimableAmount, formatUsdcAmount } from '@/hooks/use-claimable-amount'
import { useSellPosition } from '@/hooks/use-sell-position'
import { useClaimPosition } from '@/hooks/use-claim-position'
import { useUIStore } from '@/stores/ui-store'

import { PnLDisplay } from '@/components/trading/pnl-display'
import { SellPreview } from '@/components/trading/sell-preview'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface YourPositionProps {
  asset: Asset
  className?: string
}

/** Inner component that renders a single position card with sell/claim actions */
function PositionCard({
  asset,
  position,
  epochPda,
  epoch,
  pool,
  isEpochOpen,
  isFrozen,
}: {
  asset: Asset
  position: UserPositionData
  epochPda: PublicKey | null
  epoch: EpochData | null
  pool: PoolData | null
  isEpochOpen: boolean
  isFrozen: boolean
}) {
  const { publicKey } = useWallet()
  const { claimState, displayAmount } = useClaimableAmount(epoch, position)
  const sellMutation = useSellPosition()
  const claimMutation = useClaimPosition()
  const [showSellDialog, setShowSellDialog] = useState(false)

  const direction = position.direction
  const isUp = direction === 'up'
  const isFullySold = position.shares === 0n

  const sellReturn = useMemo(
    () =>
      pool && position.shares > 0n
        ? calculateSellReturn(
            position.shares,
            position.amount,
            position.direction,
            pool.yesReserves,
            pool.noReserves
          )
        : null,
    [position.shares, position.amount, position.direction, pool?.yesReserves, pool?.noReserves]
  )

  async function handleSellConfirm() {
    if (!epochPda || !publicKey) return
    try {
      await sellMutation.mutateAsync({
        asset,
        epochPda,
        direction: position.direction,
        shares: position.shares,
        userPubkey: publicKey.toString(),
        isFullExit: true,
      })
      setShowSellDialog(false)
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
      direction: position.direction,
      userPubkey: publicKey.toString(),
      displayAmount,
    })
  }

  function renderActions() {
    if (isFullySold) {
      return <Badge variant="secondary">Sold</Badge>
    }

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
        if (isEpochOpen && position.shares > 0n) {
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSellDialog(true)}
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
      <div className="space-y-3">
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

        {/* Unrealized PnL */}
        {pool && position.shares > 0n && (
          <PnLDisplay
            shares={position.shares}
            entryAmount={position.amount}
            direction={direction}
            yesReserves={pool.yesReserves}
            noReserves={pool.noReserves}
          />
        )}

        {/* Action buttons */}
        <div className="pt-1">{renderActions()}</div>
      </div>

      {/* Sell confirmation dialog */}
      <Dialog open={showSellDialog} onOpenChange={(open) => { if (!sellMutation.isPending) setShowSellDialog(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sell {direction.toUpperCase()} Position</DialogTitle>
            <DialogDescription>
              Exit your {ASSET_METADATA[asset].label} position
            </DialogDescription>
          </DialogHeader>
          {sellReturn && (
            <SellPreview
              sellReturn={sellReturn}
              shares={position.shares}
              entryAmount={position.amount}
            />
          )}
          {isFrozen && (
            <p className="text-sm text-yellow-500 font-medium" data-testid="epoch-frozen-message">
              Epoch frozen — selling unavailable
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSellDialog(false)} disabled={sellMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSellConfirm}
              disabled={sellMutation.isPending || isFrozen}
            >
              {sellMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Selling...</>
              ) : (
                'Confirm Sell'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function YourPosition({ asset, className }: YourPositionProps) {
  const { publicKey } = useWallet()
  const { epochState } = useEpoch(asset)
  const { pool } = usePool(asset)
  const epochPda = epochState.epoch ? (pool?.activeEpoch ?? null) : null

  const { position: upPosition, isLoading: upLoading } = useUserPosition(epochPda, 'up')
  const { position: downPosition, isLoading: downLoading } = useUserPosition(epochPda, 'down')
  const positionLoading = upLoading || downLoading

  // Collect all active positions (may have both Up and Down when hedging)
  const activePositions = useMemo(() => {
    const positions: Array<UserPositionData> = []
    if (upPosition && upPosition.shares > 0n) positions.push(upPosition)
    if (downPosition && downPosition.shares > 0n) positions.push(downPosition)
    return positions
  }, [upPosition, downPosition])

  // Listen for sell trigger from multi-asset panel (open sell for first position)
  const pendingSellAsset = useUIStore((s) => s.pendingSellAsset)
  useEffect(() => {
    if (pendingSellAsset === asset && activePositions.length > 0) {
      useUIStore.setState({ pendingSellAsset: null })
    }
  }, [pendingSellAsset, asset, activePositions])

  // Determine epoch state for button logic
  const isEpochOpen =
    epochState.epoch?.state === EpochState.Open && !epochState.isFrozen

  // Don't render if wallet not connected
  if (!publicKey) return null

  // Don't render while loading (avoids flash)
  if (positionLoading) return null

  // Don't render if no active positions
  if (activePositions.length === 0) return null

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {activePositions.length > 1 ? 'Your Positions' : 'Your Position'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activePositions.map((pos) => (
          <PositionCard
            key={pos.direction}
            asset={asset}
            position={pos}
            epochPda={epochPda}
            epoch={epochState.epoch}
            pool={pool}
            isEpochOpen={isEpochOpen}
            isFrozen={epochState.isFrozen}
          />
        ))}
      </CardContent>
    </Card>
  )
}
