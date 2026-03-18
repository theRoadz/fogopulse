'use client'

import { useState, useMemo, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Loader2 } from 'lucide-react'

import type { Asset } from '@/types/assets'
import type { PoolLpInfo } from '@/hooks/use-multi-pool-lp'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useRequestWithdrawal } from '@/hooks/use-request-withdrawal'
import { calculateShareValue } from '@/types/lp'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'
import { ASSET_METADATA } from '@/lib/constants'

interface LpWithdrawDialogProps {
  asset: Asset
  info: PoolLpInfo
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LpWithdrawDialog({ asset, info, open, onOpenChange }: LpWithdrawDialogProps) {
  const { publicKey } = useWallet()
  const requestWithdrawalMutation = useRequestWithdrawal()

  const [shares, setShares] = useState('')

  const meta = ASSET_METADATA[asset]

  const { pool, lpShare } = info

  const hasPending = lpShare !== null && BigInt(lpShare.pendingWithdrawal) > 0n
  const availableShares = lpShare
    ? BigInt(lpShare.shares) - BigInt(lpShare.pendingWithdrawal)
    : 0n

  const isPoolPaused = pool?.isPaused || pool?.isFrozen

  // Reset form state when dialog closes
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setShares('')
    }
    onOpenChange(nextOpen)
  }, [onOpenChange])

  // Parse shares input safely — integer strings only, no precision loss
  const parsedShares = useMemo(() => {
    if (!shares || shares.trim() === '') return null
    // Strip decimals: take only the integer part
    const intPart = shares.split('.')[0]
    if (!intPart || !/^\d+$/.test(intPart)) return null
    try {
      return BigInt(intPart)
    } catch {
      return null
    }
  }, [shares])

  // Validation
  const validation = useMemo(() => {
    if (hasPending) return { valid: false, error: 'You already have a pending withdrawal.' }
    if (isPoolPaused) return { valid: false, error: 'Pool is currently paused.' }
    if (parsedShares === null) return { valid: false, error: null }
    if (parsedShares <= 0n) return { valid: false, error: 'Enter a valid number of shares' }
    if (parsedShares > availableShares) return { valid: false, error: 'Exceeds your available shares' }
    return { valid: true, error: null }
  }, [parsedShares, availableShares, hasPending, isPoolPaused])

  // USDC value preview
  const usdcPreview = useMemo(() => {
    if (!validation.valid || !pool || parsedShares === null) return null
    return calculateShareValue(
      parsedShares,
      pool.totalLpShares,
      pool.yesReserves,
      pool.noReserves
    )
  }, [parsedShares, validation.valid, pool])

  const canWithdraw = validation.valid && !requestWithdrawalMutation.isPending

  function handleWithdraw() {
    if (!publicKey || !canWithdraw || parsedShares === null) return
    requestWithdrawalMutation.mutate(
      {
        asset,
        sharesAmount: parsedShares.toString(),
        userPubkey: publicKey.toString(),
      },
      {
        onSuccess: () => {
          handleOpenChange(false)
        },
      }
    )
  }

  function handleMax() {
    if (availableShares > 0n) {
      setShares(availableShares.toString())
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw Liquidity — {meta.label} Pool</DialogTitle>
          <DialogDescription>
            Request a withdrawal of your LP shares. A 60-second cooldown applies.
          </DialogDescription>
        </DialogHeader>

        {hasPending && (
          <Alert variant="destructive">
            <AlertDescription>
              You already have a pending withdrawal. Complete or wait for it before requesting another.
            </AlertDescription>
          </Alert>
        )}

        {isPoolPaused && (
          <Alert variant="destructive">
            <AlertDescription>
              Pool is currently paused. Withdrawals are temporarily unavailable.
            </AlertDescription>
          </Alert>
        )}

        {/* Share Balance Info */}
        <div className="flex justify-between text-sm rounded-md bg-muted p-3">
          <span className="text-muted-foreground">Available Shares</span>
          <span className="font-medium">{Number(availableShares).toLocaleString()}</span>
        </div>

        {/* Share Amount Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="withdraw-shares">Shares to Withdraw</Label>
          </div>
          <div className="flex gap-2">
            <Input
              id="withdraw-shares"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              value={shares}
              onChange={(e) => {
                // Allow only digits
                const val = e.target.value.replace(/[^0-9]/g, '')
                setShares(val)
              }}
              disabled={hasPending || isPoolPaused}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleMax}
              className="shrink-0"
              disabled={hasPending || isPoolPaused}
            >
              Max
            </Button>
          </div>
          {validation.error && (
            <p className="text-xs text-destructive">{validation.error}</p>
          )}
        </div>

        {/* USDC Value Preview */}
        {usdcPreview !== null && (
          <div className="flex justify-between text-sm rounded-md bg-muted p-3">
            <span className="text-muted-foreground">Estimated USDC Value</span>
            <span className="font-medium">${formatUsdcAmount(usdcPreview)}</span>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={handleWithdraw}
            disabled={!canWithdraw}
            className="w-full"
          >
            {requestWithdrawalMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Requesting...
              </>
            ) : (
              'Request Withdrawal'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
