'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'

import { useGlobalConfig, type GlobalConfigData } from '@/hooks/use-global-config'
import { useUpdateConfig } from '@/hooks/use-update-config'
import type { UpdateConfigParams } from '@/lib/transactions/update-config'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ── Helpers ──────────────────────────────────────────────────────────────

const bpsToPercent = (bps: number) => (bps / 100).toFixed(2)

function formatSeconds(s: number): string {
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60 ? `${s % 60}s` : ''}`
  return `${s}s`
}

function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`
}

// ── Form State ───────────────────────────────────────────────────────────

interface FormState {
  tradingFeeBps: string
  lpFeeShareBps: string
  treasuryFeeShareBps: string
  insuranceFeeShareBps: string
  perWalletCapBps: string
  perSideCapBps: string
  oracleConfidenceThresholdStartBps: string
  oracleConfidenceThresholdSettleBps: string
  oracleStalenessThresholdStart: string
  oracleStalenessThresholdSettle: string
  epochDurationSeconds: string
  freezeWindowSeconds: string
  maxTradeAmount: string
  settlementTimeoutSeconds: string
  treasury: string
  insurance: string
  allowHedging: boolean
}

interface ValidationErrors {
  tradingFeeBps?: string
  lpFeeShareBps?: string
  treasuryFeeShareBps?: string
  insuranceFeeShareBps?: string
  perWalletCapBps?: string
  perSideCapBps?: string
  oracleConfidenceThresholdStartBps?: string
  oracleConfidenceThresholdSettleBps?: string
  oracleStalenessThresholdStart?: string
  oracleStalenessThresholdSettle?: string
  epochDurationSeconds?: string
  freezeWindowSeconds?: string
  maxTradeAmount?: string
  settlementTimeoutSeconds?: string
  treasury?: string
  insurance?: string
  feeShareSum?: string
}

interface ChangeEntry {
  label: string
  currentValue: string
  newValue: string
}

// ── Validation ───────────────────────────────────────────────────────────

function validateInt(value: string, min: number, max: number): string | undefined {
  if (value === '') return 'Required'
  const n = Number(value)
  if (!Number.isInteger(n)) return 'Must be an integer'
  if (n < min) return `Minimum is ${min}`
  if (n > max) return `Maximum is ${max}`
  return undefined
}

function validatePositiveInt(value: string, max?: number): string | undefined {
  if (value === '') return 'Required'
  const n = Number(value)
  if (!Number.isInteger(n)) return 'Must be an integer'
  if (n <= 0) return 'Must be greater than 0'
  if (max !== undefined && n > max) return `Maximum is ${max}`
  return undefined
}

function validatePubkey(value: string): string | undefined {
  if (!value.trim()) return 'Required'
  try {
    new PublicKey(value.trim())
    return undefined
  } catch {
    return 'Invalid Solana public key'
  }
}

function validateForm(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {}

  errors.tradingFeeBps = validateInt(form.tradingFeeBps, 0, 1000)
  errors.lpFeeShareBps = validateInt(form.lpFeeShareBps, 0, 10000)
  errors.treasuryFeeShareBps = validateInt(form.treasuryFeeShareBps, 0, 10000)
  errors.insuranceFeeShareBps = validateInt(form.insuranceFeeShareBps, 0, 10000)
  errors.perWalletCapBps = validateInt(form.perWalletCapBps, 0, 10000)
  errors.perSideCapBps = validateInt(form.perSideCapBps, 0, 10000)
  errors.oracleConfidenceThresholdStartBps = validateInt(form.oracleConfidenceThresholdStartBps, 1, 10000)
  errors.oracleConfidenceThresholdSettleBps = validateInt(form.oracleConfidenceThresholdSettleBps, 1, 10000)
  errors.oracleStalenessThresholdStart = validatePositiveInt(form.oracleStalenessThresholdStart, 86400)
  errors.oracleStalenessThresholdSettle = validatePositiveInt(form.oracleStalenessThresholdSettle, 86400)

  // Epoch duration: min 60 seconds
  if (form.epochDurationSeconds === '') {
    errors.epochDurationSeconds = 'Required'
  } else {
    const ed = Number(form.epochDurationSeconds)
    if (!Number.isInteger(ed)) errors.epochDurationSeconds = 'Must be an integer'
    else if (ed < 60) errors.epochDurationSeconds = 'Minimum is 60 seconds'
  }

  // Freeze window: > 0, < epochDuration
  if (form.freezeWindowSeconds === '') {
    errors.freezeWindowSeconds = 'Required'
  } else {
    const fw = Number(form.freezeWindowSeconds)
    const ed = Number(form.epochDurationSeconds)
    if (!Number.isInteger(fw)) errors.freezeWindowSeconds = 'Must be an integer'
    else if (fw <= 0) errors.freezeWindowSeconds = 'Must be greater than 0'
    else if (Number.isInteger(ed) && fw >= ed) errors.freezeWindowSeconds = 'Must be less than epoch duration'
  }

  // Fee share sum
  const lp = Number(form.lpFeeShareBps)
  const tr = Number(form.treasuryFeeShareBps)
  const ins = Number(form.insuranceFeeShareBps)
  if (Number.isInteger(lp) && Number.isInteger(tr) && Number.isInteger(ins)) {
    if (lp + tr + ins !== 10000) {
      errors.feeShareSum = `Fee shares must sum to 10000 BPS (currently ${lp + tr + ins})`
    }
  }

  errors.maxTradeAmount = validatePositiveInt(form.maxTradeAmount)
  if (!errors.maxTradeAmount) {
    const mta = Number(form.maxTradeAmount)
    if (mta < 100_000) errors.maxTradeAmount = 'Minimum is 100000 (0.10 USDC)'
  }

  errors.settlementTimeoutSeconds = validatePositiveInt(form.settlementTimeoutSeconds)

  errors.treasury = validatePubkey(form.treasury)
  errors.insurance = validatePubkey(form.insurance)

  // Remove undefined entries
  for (const key of Object.keys(errors) as (keyof ValidationErrors)[]) {
    if (errors[key] === undefined) delete errors[key]
  }

  return errors
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * Generates a stable key from config values to reset form state when config changes.
 * When the mutation succeeds, globalConfig query is invalidated, config changes,
 * this key changes, and React remounts ConfigurationPanelInner with fresh state.
 */
function configKey(config: GlobalConfigData): string {
  return [
    config.tradingFeeBps,
    config.lpFeeShareBps,
    config.treasuryFeeShareBps,
    config.insuranceFeeShareBps,
    config.perWalletCapBps,
    config.perSideCapBps,
    config.oracleConfidenceThresholdStartBps,
    config.oracleConfidenceThresholdSettleBps,
    config.oracleStalenessThresholdStart.toString(),
    config.oracleStalenessThresholdSettle.toString(),
    config.epochDurationSeconds.toString(),
    config.freezeWindowSeconds.toString(),
    config.treasury.toString(),
    config.insurance.toString(),
    String(config.allowHedging),
    config.maxTradeAmount.toString(),
    config.settlementTimeoutSeconds.toString(),
  ].join('-')
}

export function ConfigurationPanel() {
  const { config } = useGlobalConfig()
  if (!config) return null
  return <ConfigurationPanelInner key={configKey(config)} config={config} />
}

function ConfigurationPanelInner({ config }: { config: GlobalConfigData }) {
  const { publicKey } = useWallet()
  const updateConfig = useUpdateConfig()

  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const [form, setForm] = useState<FormState>(() => ({
    tradingFeeBps: String(config.tradingFeeBps),
    lpFeeShareBps: String(config.lpFeeShareBps),
    treasuryFeeShareBps: String(config.treasuryFeeShareBps),
    insuranceFeeShareBps: String(config.insuranceFeeShareBps),
    perWalletCapBps: String(config.perWalletCapBps),
    perSideCapBps: String(config.perSideCapBps),
    oracleConfidenceThresholdStartBps: String(config.oracleConfidenceThresholdStartBps),
    oracleConfidenceThresholdSettleBps: String(config.oracleConfidenceThresholdSettleBps),
    oracleStalenessThresholdStart: String(config.oracleStalenessThresholdStart.toNumber()),
    oracleStalenessThresholdSettle: String(config.oracleStalenessThresholdSettle.toNumber()),
    epochDurationSeconds: String(config.epochDurationSeconds.toNumber()),
    freezeWindowSeconds: String(config.freezeWindowSeconds.toNumber()),
    maxTradeAmount: String(config.maxTradeAmount.toNumber()),
    settlementTimeoutSeconds: String(config.settlementTimeoutSeconds.toNumber()),
    treasury: config.treasury.toString(),
    insurance: config.insurance.toString(),
    allowHedging: config.allowHedging,
  }))

  const errors = useMemo(() => validateForm(form), [form])
  const hasErrors = Object.keys(errors).length > 0

  // Detect changes between form and on-chain config
  const changes = useMemo((): ChangeEntry[] => {
    if (!config) return []
    const result: ChangeEntry[] = []

    const check = (label: string, formVal: string, configVal: number, unit: string) => {
      if (formVal !== '' && Number(formVal) !== configVal) {
        result.push({
          label,
          currentValue: `${configVal} ${unit}`,
          newValue: `${formVal} ${unit}`,
        })
      }
    }

    check('Trading Fee', form.tradingFeeBps, config.tradingFeeBps, 'BPS')
    check('LP Fee Share', form.lpFeeShareBps, config.lpFeeShareBps, 'BPS')
    check('Treasury Fee Share', form.treasuryFeeShareBps, config.treasuryFeeShareBps, 'BPS')
    check('Insurance Fee Share', form.insuranceFeeShareBps, config.insuranceFeeShareBps, 'BPS')
    check('Per-Wallet Cap', form.perWalletCapBps, config.perWalletCapBps, 'BPS')
    check('Per-Side Cap', form.perSideCapBps, config.perSideCapBps, 'BPS')
    check('Oracle Confidence (Start)', form.oracleConfidenceThresholdStartBps, config.oracleConfidenceThresholdStartBps, 'BPS')
    check('Oracle Confidence (Settle)', form.oracleConfidenceThresholdSettleBps, config.oracleConfidenceThresholdSettleBps, 'BPS')
    check('Oracle Staleness (Start)', form.oracleStalenessThresholdStart, config.oracleStalenessThresholdStart.toNumber(), 'seconds')
    check('Oracle Staleness (Settle)', form.oracleStalenessThresholdSettle, config.oracleStalenessThresholdSettle.toNumber(), 'seconds')
    check('Epoch Duration', form.epochDurationSeconds, config.epochDurationSeconds.toNumber(), 'seconds')
    check('Freeze Window', form.freezeWindowSeconds, config.freezeWindowSeconds.toNumber(), 'seconds')
    check('Max Trade Amount', form.maxTradeAmount, config.maxTradeAmount.toNumber(), 'lamports')
    check('Settlement Timeout', form.settlementTimeoutSeconds, config.settlementTimeoutSeconds.toNumber(), 'seconds')

    if (form.treasury.trim() && form.treasury.trim() !== config.treasury.toString()) {
      result.push({
        label: 'Treasury Wallet',
        currentValue: truncateAddress(config.treasury.toString()),
        newValue: truncateAddress(form.treasury.trim()),
      })
    }
    if (form.insurance.trim() && form.insurance.trim() !== config.insurance.toString()) {
      result.push({
        label: 'Insurance Wallet',
        currentValue: truncateAddress(config.insurance.toString()),
        newValue: truncateAddress(form.insurance.trim()),
      })
    }
    if (form.allowHedging !== config.allowHedging) {
      result.push({
        label: 'Allow Hedging',
        currentValue: config.allowHedging ? 'Enabled' : 'Disabled',
        newValue: form.allowHedging ? 'Enabled' : 'Disabled',
      })
    }

    return result
  }, [form, config])

  const hasChanges = changes.length > 0

  // Build UpdateConfigParams with null for unchanged fields
  function buildChangeParams(): UpdateConfigParams {
    const numOrNull = (formVal: string, configVal: number): number | null => {
      const n = Number(formVal)
      return n !== configVal ? n : null
    }

    return {
      tradingFeeBps: numOrNull(form.tradingFeeBps, config.tradingFeeBps),
      lpFeeShareBps: numOrNull(form.lpFeeShareBps, config.lpFeeShareBps),
      treasuryFeeShareBps: numOrNull(form.treasuryFeeShareBps, config.treasuryFeeShareBps),
      insuranceFeeShareBps: numOrNull(form.insuranceFeeShareBps, config.insuranceFeeShareBps),
      perWalletCapBps: numOrNull(form.perWalletCapBps, config.perWalletCapBps),
      perSideCapBps: numOrNull(form.perSideCapBps, config.perSideCapBps),
      oracleConfidenceThresholdStartBps: numOrNull(form.oracleConfidenceThresholdStartBps, config.oracleConfidenceThresholdStartBps),
      oracleConfidenceThresholdSettleBps: numOrNull(form.oracleConfidenceThresholdSettleBps, config.oracleConfidenceThresholdSettleBps),
      oracleStalenessThresholdStart: numOrNull(form.oracleStalenessThresholdStart, config.oracleStalenessThresholdStart.toNumber()),
      oracleStalenessThresholdSettle: numOrNull(form.oracleStalenessThresholdSettle, config.oracleStalenessThresholdSettle.toNumber()),
      epochDurationSeconds: numOrNull(form.epochDurationSeconds, config.epochDurationSeconds.toNumber()),
      freezeWindowSeconds: numOrNull(form.freezeWindowSeconds, config.freezeWindowSeconds.toNumber()),
      treasury: form.treasury.trim() !== config.treasury.toString() ? new PublicKey(form.treasury.trim()) : null,
      insurance: form.insurance.trim() !== config.insurance.toString() ? new PublicKey(form.insurance.trim()) : null,
      allowHedging: form.allowHedging !== config.allowHedging ? form.allowHedging : null,
      paused: null,
      frozen: null,
      maxTradeAmount: numOrNull(form.maxTradeAmount, config.maxTradeAmount.toNumber()),
      settlementTimeoutSeconds: numOrNull(form.settlementTimeoutSeconds, config.settlementTimeoutSeconds.toNumber()),
    }
  }

  function handleConfirm() {
    if (!publicKey) return
    const params = buildChangeParams()
    updateConfig.mutate(
      { params, userPubkey: publicKey.toString() },
      { onSettled: () => setShowConfirmDialog(false) }
    )
  }

  function handleCopy(value: string, field: string) {
    try {
      navigator.clipboard.writeText(value)
      setCopiedField(field)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopiedField(null), 1500)
    } catch {
      // Clipboard access denied — silently ignore
    }
  }

  const setField = (field: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const isPending = updateConfig.isPending
  const isChanged = (formVal: string, configVal: number) => formVal !== '' && Number(formVal) !== configVal
  const isChangedStr = (formVal: string, configVal: string) => formVal.trim() !== '' && formVal.trim() !== configVal
  const changedBorder = 'border-amber-500'

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Configuration Panel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Fees ───────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Fees</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tradingFeeBps">Trading Fee (BPS)</Label>
              <Input
                id="tradingFeeBps"
                type="number"
                step="1"
                value={form.tradingFeeBps}
                onChange={(e) => setField('tradingFeeBps', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.tradingFeeBps}
                aria-describedby={errors.tradingFeeBps ? 'tradingFeeBps-error' : undefined}
                className={isChanged(form.tradingFeeBps, config.tradingFeeBps) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.tradingFeeBps !== '' ? `${bpsToPercent(Number(form.tradingFeeBps))}%` : '—'}
              </p>
              {errors.tradingFeeBps && <p id="tradingFeeBps-error" className="text-destructive text-sm">{errors.tradingFeeBps}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            <div>
              <Label htmlFor="lpFeeShareBps">LP Fee Share (BPS)</Label>
              <Input
                id="lpFeeShareBps"
                type="number"
                step="1"
                value={form.lpFeeShareBps}
                onChange={(e) => setField('lpFeeShareBps', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.lpFeeShareBps}
                aria-describedby={errors.lpFeeShareBps ? 'lpFeeShareBps-error' : undefined}
                className={isChanged(form.lpFeeShareBps, config.lpFeeShareBps) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.lpFeeShareBps !== '' ? `${bpsToPercent(Number(form.lpFeeShareBps))}%` : '—'}
              </p>
              {errors.lpFeeShareBps && <p id="lpFeeShareBps-error" className="text-destructive text-sm">{errors.lpFeeShareBps}</p>}
            </div>
            <div>
              <Label htmlFor="treasuryFeeShareBps">Treasury Fee Share (BPS)</Label>
              <Input
                id="treasuryFeeShareBps"
                type="number"
                step="1"
                value={form.treasuryFeeShareBps}
                onChange={(e) => setField('treasuryFeeShareBps', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.treasuryFeeShareBps}
                aria-describedby={errors.treasuryFeeShareBps ? 'treasuryFeeShareBps-error' : undefined}
                className={isChanged(form.treasuryFeeShareBps, config.treasuryFeeShareBps) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.treasuryFeeShareBps !== '' ? `${bpsToPercent(Number(form.treasuryFeeShareBps))}%` : '—'}
              </p>
              {errors.treasuryFeeShareBps && <p id="treasuryFeeShareBps-error" className="text-destructive text-sm">{errors.treasuryFeeShareBps}</p>}
            </div>
            <div>
              <Label htmlFor="insuranceFeeShareBps">Insurance Fee Share (BPS)</Label>
              <Input
                id="insuranceFeeShareBps"
                type="number"
                step="1"
                value={form.insuranceFeeShareBps}
                onChange={(e) => setField('insuranceFeeShareBps', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.insuranceFeeShareBps}
                aria-describedby={errors.insuranceFeeShareBps ? 'insuranceFeeShareBps-error' : undefined}
                className={isChanged(form.insuranceFeeShareBps, config.insuranceFeeShareBps) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.insuranceFeeShareBps !== '' ? `${bpsToPercent(Number(form.insuranceFeeShareBps))}%` : '—'}
              </p>
              {errors.insuranceFeeShareBps && <p id="insuranceFeeShareBps-error" className="text-destructive text-sm">{errors.insuranceFeeShareBps}</p>}
            </div>
          </div>
          {errors.feeShareSum && <p id="feeShareSum-error" className="text-destructive text-sm mt-2">{errors.feeShareSum}</p>}
        </div>

        {/* ── Position Caps & Trade Limits ─────────────────────── */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Position Caps & Trade Limits</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="perWalletCapBps">Per-Wallet Cap (BPS)</Label>
              <Input
                id="perWalletCapBps"
                type="number"
                step="1"
                value={form.perWalletCapBps}
                onChange={(e) => setField('perWalletCapBps', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.perWalletCapBps}
                aria-describedby={errors.perWalletCapBps ? 'perWalletCapBps-error' : undefined}
                className={isChanged(form.perWalletCapBps, config.perWalletCapBps) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.perWalletCapBps !== '' ? `${bpsToPercent(Number(form.perWalletCapBps))}%` : '—'}
              </p>
              {errors.perWalletCapBps && <p id="perWalletCapBps-error" className="text-destructive text-sm">{errors.perWalletCapBps}</p>}
            </div>
            <div>
              <Label htmlFor="perSideCapBps">Per-Side Cap (BPS)</Label>
              <Input
                id="perSideCapBps"
                type="number"
                step="1"
                value={form.perSideCapBps}
                onChange={(e) => setField('perSideCapBps', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.perSideCapBps}
                aria-describedby={errors.perSideCapBps ? 'perSideCapBps-error' : undefined}
                className={isChanged(form.perSideCapBps, config.perSideCapBps) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.perSideCapBps !== '' ? `${bpsToPercent(Number(form.perSideCapBps))}%` : '—'}
              </p>
              {errors.perSideCapBps && <p id="perSideCapBps-error" className="text-destructive text-sm">{errors.perSideCapBps}</p>}
            </div>
            <div>
              <Label htmlFor="maxTradeAmount">Max Trade Amount (USDC lamports)</Label>
              <Input
                id="maxTradeAmount"
                type="number"
                step="1"
                value={form.maxTradeAmount}
                onChange={(e) => setField('maxTradeAmount', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.maxTradeAmount}
                aria-describedby={errors.maxTradeAmount ? 'maxTradeAmount-error' : undefined}
                className={isChanged(form.maxTradeAmount, config.maxTradeAmount.toNumber()) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.maxTradeAmount !== '' ? `$${(Number(form.maxTradeAmount) / 1_000_000).toFixed(2)} USDC` : '—'}
              </p>
              {errors.maxTradeAmount && <p id="maxTradeAmount-error" className="text-destructive text-sm">{errors.maxTradeAmount}</p>}
            </div>
          </div>
        </div>

        {/* ── Oracle Thresholds ───────────────────────────────────── */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Oracle Thresholds</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="oracleConfidenceThresholdStartBps">Confidence Start (BPS)</Label>
              <Input
                id="oracleConfidenceThresholdStartBps"
                type="number"
                step="1"
                value={form.oracleConfidenceThresholdStartBps}
                onChange={(e) => setField('oracleConfidenceThresholdStartBps', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.oracleConfidenceThresholdStartBps}
                aria-describedby={errors.oracleConfidenceThresholdStartBps ? 'oracleConfidenceThresholdStartBps-error' : undefined}
                className={isChanged(form.oracleConfidenceThresholdStartBps, config.oracleConfidenceThresholdStartBps) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.oracleConfidenceThresholdStartBps !== '' ? `${bpsToPercent(Number(form.oracleConfidenceThresholdStartBps))}%` : '—'}
              </p>
              {errors.oracleConfidenceThresholdStartBps && <p id="oracleConfidenceThresholdStartBps-error" className="text-destructive text-sm">{errors.oracleConfidenceThresholdStartBps}</p>}
            </div>
            <div>
              <Label htmlFor="oracleConfidenceThresholdSettleBps">Confidence Settle (BPS)</Label>
              <Input
                id="oracleConfidenceThresholdSettleBps"
                type="number"
                step="1"
                value={form.oracleConfidenceThresholdSettleBps}
                onChange={(e) => setField('oracleConfidenceThresholdSettleBps', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.oracleConfidenceThresholdSettleBps}
                aria-describedby={errors.oracleConfidenceThresholdSettleBps ? 'oracleConfidenceThresholdSettleBps-error' : undefined}
                className={isChanged(form.oracleConfidenceThresholdSettleBps, config.oracleConfidenceThresholdSettleBps) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.oracleConfidenceThresholdSettleBps !== '' ? `${bpsToPercent(Number(form.oracleConfidenceThresholdSettleBps))}%` : '—'}
              </p>
              {errors.oracleConfidenceThresholdSettleBps && <p id="oracleConfidenceThresholdSettleBps-error" className="text-destructive text-sm">{errors.oracleConfidenceThresholdSettleBps}</p>}
            </div>
            <div>
              <Label htmlFor="oracleStalenessThresholdStart">Staleness Start (seconds)</Label>
              <Input
                id="oracleStalenessThresholdStart"
                type="number"
                step="1"
                value={form.oracleStalenessThresholdStart}
                onChange={(e) => setField('oracleStalenessThresholdStart', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.oracleStalenessThresholdStart}
                aria-describedby={errors.oracleStalenessThresholdStart ? 'oracleStalenessThresholdStart-error' : undefined}
                className={isChanged(form.oracleStalenessThresholdStart, config.oracleStalenessThresholdStart.toNumber()) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.oracleStalenessThresholdStart !== '' ? formatSeconds(Number(form.oracleStalenessThresholdStart)) : '—'}
              </p>
              {errors.oracleStalenessThresholdStart && <p id="oracleStalenessThresholdStart-error" className="text-destructive text-sm">{errors.oracleStalenessThresholdStart}</p>}
            </div>
            <div>
              <Label htmlFor="oracleStalenessThresholdSettle">Staleness Settle (seconds)</Label>
              <Input
                id="oracleStalenessThresholdSettle"
                type="number"
                step="1"
                value={form.oracleStalenessThresholdSettle}
                onChange={(e) => setField('oracleStalenessThresholdSettle', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.oracleStalenessThresholdSettle}
                aria-describedby={errors.oracleStalenessThresholdSettle ? 'oracleStalenessThresholdSettle-error' : undefined}
                className={isChanged(form.oracleStalenessThresholdSettle, config.oracleStalenessThresholdSettle.toNumber()) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.oracleStalenessThresholdSettle !== '' ? formatSeconds(Number(form.oracleStalenessThresholdSettle)) : '—'}
              </p>
              {errors.oracleStalenessThresholdSettle && <p id="oracleStalenessThresholdSettle-error" className="text-destructive text-sm">{errors.oracleStalenessThresholdSettle}</p>}
            </div>
          </div>
        </div>

        {/* ── Epoch Timing ────────────────────────────────────────── */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Epoch Timing</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="epochDurationSeconds">Epoch Duration (seconds)</Label>
              <Input
                id="epochDurationSeconds"
                type="number"
                step="1"
                value={form.epochDurationSeconds}
                onChange={(e) => setField('epochDurationSeconds', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.epochDurationSeconds}
                aria-describedby={errors.epochDurationSeconds ? 'epochDurationSeconds-error' : undefined}
                className={isChanged(form.epochDurationSeconds, config.epochDurationSeconds.toNumber()) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.epochDurationSeconds !== '' ? formatSeconds(Number(form.epochDurationSeconds)) : '—'}
              </p>
              {errors.epochDurationSeconds && <p id="epochDurationSeconds-error" className="text-destructive text-sm">{errors.epochDurationSeconds}</p>}
            </div>
            <div>
              <Label htmlFor="freezeWindowSeconds">Freeze Window (seconds)</Label>
              <Input
                id="freezeWindowSeconds"
                type="number"
                step="1"
                value={form.freezeWindowSeconds}
                onChange={(e) => setField('freezeWindowSeconds', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.freezeWindowSeconds}
                aria-describedby={errors.freezeWindowSeconds ? 'freezeWindowSeconds-error' : undefined}
                className={isChanged(form.freezeWindowSeconds, config.freezeWindowSeconds.toNumber()) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.freezeWindowSeconds !== '' ? formatSeconds(Number(form.freezeWindowSeconds)) : '—'}
              </p>
              {errors.freezeWindowSeconds && <p id="freezeWindowSeconds-error" className="text-destructive text-sm">{errors.freezeWindowSeconds}</p>}
            </div>
            <div>
              <Label htmlFor="settlementTimeoutSeconds">Settlement Timeout (seconds)</Label>
              <Input
                id="settlementTimeoutSeconds"
                type="number"
                step="1"
                value={form.settlementTimeoutSeconds}
                onChange={(e) => setField('settlementTimeoutSeconds', e.target.value)}
                disabled={isPending}
                aria-invalid={!!errors.settlementTimeoutSeconds}
                aria-describedby={errors.settlementTimeoutSeconds ? 'settlementTimeoutSeconds-error' : undefined}
                className={isChanged(form.settlementTimeoutSeconds, config.settlementTimeoutSeconds.toNumber()) ? changedBorder : ''}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.settlementTimeoutSeconds !== '' ? formatSeconds(Number(form.settlementTimeoutSeconds)) : '—'}
              </p>
              {errors.settlementTimeoutSeconds && <p id="settlementTimeoutSeconds-error" className="text-destructive text-sm">{errors.settlementTimeoutSeconds}</p>}
            </div>
          </div>
        </div>

        {/* ── Wallet Addresses ────────────────────────────────────── */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Wallet Addresses</h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="treasury">Treasury Wallet</Label>
              <div className="flex gap-2">
                <Input
                  id="treasury"
                  type="text"
                  value={form.treasury}
                  onChange={(e) => setField('treasury', e.target.value)}
                  disabled={isPending}
                  aria-invalid={!!errors.treasury}
                  aria-describedby={errors.treasury ? 'treasury-error' : undefined}
                  className={`flex-1 font-mono text-xs ${isChangedStr(form.treasury, config.treasury.toString()) ? changedBorder : ''}`}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(form.treasury, 'treasury')}
                  className="shrink-0"
                >
                  {copiedField === 'treasury' ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              {errors.treasury && <p id="treasury-error" className="text-destructive text-sm">{errors.treasury}</p>}
            </div>
            <div>
              <Label htmlFor="insurance">Insurance Wallet</Label>
              <div className="flex gap-2">
                <Input
                  id="insurance"
                  type="text"
                  value={form.insurance}
                  onChange={(e) => setField('insurance', e.target.value)}
                  disabled={isPending}
                  aria-invalid={!!errors.insurance}
                  aria-describedby={errors.insurance ? 'insurance-error' : undefined}
                  className={`flex-1 font-mono text-xs ${isChangedStr(form.insurance, config.insurance.toString()) ? changedBorder : ''}`}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(form.insurance, 'insurance')}
                  className="shrink-0"
                >
                  {copiedField === 'insurance' ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              {errors.insurance && <p id="insurance-error" className="text-destructive text-sm">{errors.insurance}</p>}
            </div>
          </div>
        </div>

        {/* ── Toggles ─────────────────────────────────────────────── */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Toggles</h3>
          <div className="flex items-center gap-3">
            <Switch
              id="allowHedging"
              checked={form.allowHedging}
              onCheckedChange={(checked) => setField('allowHedging', checked)}
              disabled={isPending}
            />
            <Label htmlFor="allowHedging">Allow Hedging</Label>
            {form.allowHedging !== config.allowHedging && (
              <span className="text-xs text-amber-500">(changed)</span>
            )}
          </div>
        </div>

        {/* ── Submit ──────────────────────────────────────────────── */}
        <div className="border-t pt-4">
          <Button
            onClick={() => setShowConfirmDialog(true)}
            disabled={!hasChanges || hasErrors || updateConfig.isPending}
          >
            {updateConfig.isPending ? 'Updating...' : 'Update Config'}
          </Button>
          {!hasChanges && !hasErrors && (
            <p className="text-xs text-muted-foreground mt-2">No changes to submit</p>
          )}
        </div>

        {/* ── Confirmation Dialog ─────────────────────────────────── */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Configuration Update</DialogTitle>
              <DialogDescription>
                Review the following changes before submitting the transaction.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Parameter</th>
                    <th className="text-left py-2">Current</th>
                    <th className="text-left py-2">New</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.label} className="border-b">
                      <td className="py-2 font-medium">{change.label}</td>
                      <td className="py-2 text-muted-foreground">{change.currentValue}</td>
                      <td className="py-2 text-amber-500">{change.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={updateConfig.isPending}>
                {updateConfig.isPending ? 'Sending...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
