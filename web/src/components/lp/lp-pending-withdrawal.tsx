'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Loader2, Clock } from 'lucide-react'

import type { Asset } from '@/types/assets'
import type { LpShareData } from '@/types/lp'
import type { PoolData } from '@/types/pool'
import { Button } from '@/components/ui/button'
import { useProcessWithdrawal } from '@/hooks/use-process-withdrawal'
import { calculateShareValue } from '@/types/lp'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'
import { WITHDRAWAL_COOLDOWN_SECONDS } from '@/lib/constants'

interface LpPendingWithdrawalProps {
  asset: Asset
  lpShare: LpShareData
  pool: PoolData
}

export function LpPendingWithdrawal({ asset, lpShare, pool }: LpPendingWithdrawalProps) {
  const { publicKey } = useWallet()
  const processWithdrawalMutation = useProcessWithdrawal()

  const [remaining, setRemaining] = useState(() => {
    if (!lpShare.withdrawalRequestedAt) return 0
    const elapsed = Math.floor(Date.now() / 1000) - Number(lpShare.withdrawalRequestedAt)
    return Math.max(0, WITHDRAWAL_COOLDOWN_SECONDS - elapsed)
  })

  useEffect(() => {
    if (!lpShare.withdrawalRequestedAt) return

    function updateRemaining() {
      const elapsed = Math.floor(Date.now() / 1000) - Number(lpShare.withdrawalRequestedAt)
      const r = Math.max(0, WITHDRAWAL_COOLDOWN_SECONDS - elapsed)
      setRemaining(r)
      return r
    }

    const r = updateRemaining()
    if (r === 0) return

    const id = setInterval(() => {
      const newRemaining = updateRemaining()
      if (newRemaining === 0) {
        clearInterval(id)
      }
    }, 1000)

    return () => clearInterval(id)
  }, [lpShare.withdrawalRequestedAt])

  const cooldownElapsed = remaining === 0
  const isPoolPaused = pool.isPaused || pool.isFrozen
  const isEpochActive = pool.activeEpoch !== null

  const pendingShares = BigInt(lpShare.pendingWithdrawal)
  const usdcValue = calculateShareValue(
    pendingShares,
    pool.totalLpShares,
    pool.yesReserves,
    pool.noReserves
  )

  function handleComplete() {
    if (!publicKey || !cooldownElapsed) return
    processWithdrawalMutation.mutate({
      asset,
      userPubkey: publicKey.toString(),
      estimatedUsdc: formatUsdcAmount(usdcValue),
    })
  }

  return (
    <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
        <Clock className="h-4 w-4" />
        Pending Withdrawal
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Shares</span>
        <span className="font-medium">{Number(pendingShares).toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Est. Value</span>
        <span className="font-medium">${formatUsdcAmount(usdcValue)}</span>
      </div>
      {!cooldownElapsed && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cooldown</span>
          <span className="font-medium">{remaining}s remaining</span>
        </div>
      )}
      {isPoolPaused && cooldownElapsed && (
        <p className="text-xs text-destructive">Pool is currently paused. Withdrawal processing unavailable.</p>
      )}
      {isEpochActive && cooldownElapsed && !isPoolPaused && (
        <p className="text-xs text-muted-foreground">Waiting for epoch settlement... Your withdrawal will be auto-processed.</p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={!cooldownElapsed || isPoolPaused || isEpochActive || processWithdrawalMutation.isPending}
        onClick={handleComplete}
      >
        {processWithdrawalMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : !cooldownElapsed ? (
          `Cooldown: ${remaining}s`
        ) : isEpochActive ? (
          'Waiting for settlement...'
        ) : (
          'Complete Withdrawal'
        )}
      </Button>
    </div>
  )
}
