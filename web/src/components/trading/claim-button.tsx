'use client'

import { CheckCircle, RefreshCw, Loader2, XCircle } from 'lucide-react'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Asset } from '@/types/assets'
import type { EpochData } from '@/types/epoch'
import type { PoolData } from '@/types/pool'
import { useUserPosition } from '@/hooks/use-user-position'
import { useClaimableAmount, formatUsdcAmount } from '@/hooks/use-claimable-amount'
import type { ClaimState } from '@/hooks/use-claimable-amount'
import { useClaimPosition } from '@/hooks/use-claim-position'

interface ClaimButtonProps {
  /** The asset */
  asset: Asset
  /** Epoch data (settled or refunded) */
  epoch: EpochData | null
  /** Epoch PDA for transaction building */
  epochPda: PublicKey | null
  /** Pool data for freeze check */
  pool: PoolData | null
  /** Additional CSS classes */
  className?: string
}

/**
 * Claim button component that displays the appropriate action based on position state.
 *
 * States:
 * - Winner: Green "Claim Payout: XX USDC" button
 * - Refund: Amber "Claim Refund: XX USDC" button
 * - Claimed: Muted "Claimed" badge
 * - Lost: "Position Lost" text
 * - No wallet/no position: nothing rendered
 * - Frozen: "Claims temporarily disabled" message
 */
export function ClaimButton({ asset, epoch, epochPda, pool, className }: ClaimButtonProps) {
  const { publicKey } = useWallet()
  const { position, isLoading: isPositionLoading } = useUserPosition(epochPda)
  const { claimState, displayAmount } = useClaimableAmount(epoch, position)
  const claimMutation = useClaimPosition()

  // No wallet connected — no claim section
  if (!publicKey) return null

  // Still loading position data
  if (isPositionLoading) return null

  // No position in this epoch
  if (claimState.type === 'no-position' || claimState.type === 'not-settled') return null

  // Check frozen state — claims blocked when frozen
  const isFrozen = pool?.isFrozen === true
  if (isFrozen && (claimState.type === 'winner' || claimState.type === 'refund')) {
    return (
      <div className={cn('flex justify-center', className)} data-testid="claim-frozen">
        <span className="text-sm text-muted-foreground">
          Claims temporarily disabled
        </span>
      </div>
    )
  }

  // Already claimed
  if (claimState.type === 'claimed') {
    return (
      <div className={cn('flex justify-center', className)} data-testid="claim-claimed">
        <Badge
          variant="outline"
          className="gap-1.5 border-muted-foreground/30 bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground"
        >
          <CheckCircle className="h-4 w-4" />
          Claimed
        </Badge>
      </div>
    )
  }

  // Lost position
  if (claimState.type === 'lost') {
    return (
      <div className={cn('flex justify-center', className)} data-testid="claim-lost">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <XCircle className="h-4 w-4" />
          Position Lost
        </span>
      </div>
    )
  }

  // Claimable — render button
  const isPayout = claimState.type === 'winner'
  const isSubmitting = claimMutation.isPending

  const handleClaim = () => {
    if (!epochPda || !publicKey || !displayAmount) return

    claimMutation.mutate({
      asset,
      type: isPayout ? 'payout' : 'refund',
      epochPda,
      userPubkey: publicKey.toString(),
      displayAmount,
    })
  }

  return (
    <div className={cn('flex justify-center', className)} data-testid="claim-action">
      <Button
        onClick={handleClaim}
        disabled={isSubmitting}
        className={cn(
          'gap-2',
          isPayout
            ? 'bg-up hover:bg-up/90 text-up-foreground'
            : 'bg-warning hover:bg-warning/90 text-warning-foreground'
        )}
        data-testid={isPayout ? 'claim-payout-button' : 'claim-refund-button'}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPayout ? (
          <CheckCircle className="h-4 w-4" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {isSubmitting
          ? 'Claiming...'
          : isPayout
            ? `Claim Payout: ${displayAmount} USDC`
            : `Claim Refund: ${displayAmount} USDC`
        }
      </Button>
    </div>
  )
}
