'use client'

import { useState, useMemo, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { AlertTriangle, Loader2 } from 'lucide-react'

import type { Asset } from '@/types/assets'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { usePool } from '@/hooks/use-pool'
import { useUsdcBalance } from '@/hooks/use-usdc-balance'
import { useDepositLiquidity } from '@/hooks/use-deposit-liquidity'
import { ASSET_METADATA } from '@/lib/constants'

interface LpDepositDialogProps {
  asset: Asset
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MIN_DEPOSIT_AMOUNT = 0.20

/**
 * Estimate LP shares the user will receive for a given deposit amount.
 */
function estimateSharesForDeposit(
  amountLamports: bigint,
  totalLpShares: bigint,
  yesReserves: bigint,
  noReserves: bigint
): bigint {
  if (totalLpShares === 0n) return amountLamports // First deposit: 1:1
  const poolValue = yesReserves + noReserves
  if (poolValue === 0n) return 0n
  return (amountLamports * totalLpShares) / poolValue
}

export function LpDepositDialog({ asset, open, onOpenChange }: LpDepositDialogProps) {
  const { publicKey } = useWallet()
  const { pool } = usePool(asset)
  const { balance, rawBalance, formattedBalance } = useUsdcBalance()
  const depositMutation = useDepositLiquidity()

  const [amount, setAmount] = useState('')
  const [risksAcknowledged, setRisksAcknowledged] = useState(false)

  const meta = ASSET_METADATA[asset]

  // Reset form state when dialog closes (prevents stale state across reopens)
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setAmount('')
      setRisksAcknowledged(false)
    }
    onOpenChange(nextOpen)
  }, [onOpenChange])

  // Validation
  const validation = useMemo(() => {
    if (!amount || amount.trim() === '') return { valid: false, error: null }
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) return { valid: false, error: 'Enter a valid amount' }
    if (parsed < MIN_DEPOSIT_AMOUNT) return { valid: false, error: `Minimum deposit is $${MIN_DEPOSIT_AMOUNT.toFixed(2)}` }
    if (balance !== null && parsed > balance) return { valid: false, error: 'Exceeds your USDC balance' }
    return { valid: true, error: null }
  }, [amount, balance])

  // Share preview
  const estimatedShares = useMemo(() => {
    if (!validation.valid || !pool) return null
    const parsed = parseFloat(amount)
    const lamports = BigInt(Math.floor(parsed * 1_000_000))
    return estimateSharesForDeposit(
      lamports,
      pool.totalLpShares,
      pool.yesReserves,
      pool.noReserves
    )
  }, [amount, validation.valid, pool])

  const canDeposit = validation.valid && risksAcknowledged && !depositMutation.isPending

  function handleDeposit() {
    if (!publicKey || !canDeposit) return
    depositMutation.mutate(
      {
        asset,
        amount,
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
    if (rawBalance !== null && rawBalance > 0n) {
      // Use integer division from rawBalance to avoid floating-point precision artifacts
      // rawBalance is in lamports (6 decimals), convert to string with exact decimal placement
      const whole = rawBalance / 1_000_000n
      const frac = rawBalance % 1_000_000n
      const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '')
      setAmount(fracStr ? `${whole}.${fracStr}` : whole.toString())
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deposit Liquidity — {meta.label} Pool</DialogTitle>
          <DialogDescription>
            Provide USDC liquidity to earn trading fees.
          </DialogDescription>
        </DialogHeader>

        {/* Risk Disclosure */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-2 text-xs">
            <p><strong>Impermanent Loss:</strong> Your share value may decrease if the pool becomes imbalanced due to one-sided trading.</p>
            <p><strong>Withdrawal Cooldown:</strong> Withdrawals require a cooldown period before processing.</p>
            <p><strong>Fee Structure:</strong> Trading fees are split 70% LP / 20% Treasury / 10% Insurance.</p>
          </AlertDescription>
        </Alert>

        {/* Risk Acknowledgement */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="risk-ack"
            checked={risksAcknowledged}
            onCheckedChange={(checked) => setRisksAcknowledged(checked === true)}
          />
          <Label htmlFor="risk-ack" className="text-sm cursor-pointer">
            I understand the risks
          </Label>
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="deposit-amount">Amount (USDC)</Label>
            <span className="text-xs text-muted-foreground">
              Balance: {formattedBalance !== null ? `$${formattedBalance}` : '—'}
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              id="deposit-amount"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button variant="outline" size="sm" onClick={handleMax} className="shrink-0">
              Max
            </Button>
          </div>
          {validation.error && (
            <p className="text-xs text-destructive">{validation.error}</p>
          )}
        </div>

        {/* Share Preview */}
        {estimatedShares !== null && (
          <div className="flex justify-between text-sm rounded-md bg-muted p-3">
            <span className="text-muted-foreground">Expected LP Shares</span>
            <span className="font-medium">{Number(estimatedShares).toLocaleString()}</span>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={handleDeposit}
            disabled={!canDeposit}
            className="w-full"
          >
            {depositMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Depositing...
              </>
            ) : (
              'Deposit'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
