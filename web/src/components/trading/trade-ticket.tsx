'use client'

import { useEffect, useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEpoch, useUsdcBalance, useBuyPosition } from '@/hooks'
import { useGlobalConfig } from '@/hooks/use-global-config'
import { usePool } from '@/hooks/use-pool'
import { useUserPosition } from '@/hooks/use-user-position'
import { USDC_DECIMALS } from '@/lib/constants'
import { calculateWalletCapMaxGross } from '@/lib/cap-utils'
import { useAdminSettings } from '@/hooks/use-admin-settings'
import { useTradeStore } from '@/stores/trade-store'
import { EpochState } from '@/types/epoch'
import type { Asset } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'

import { useTradePreview } from '@/hooks/use-trade-preview'

import { DirectionButton } from './direction-button'
import { AmountInput } from './amount-input'
import { QuickAmountButtons } from './quick-amount-buttons'
import { BalanceDisplay } from './balance-display'
import { TradePreview } from './trade-preview'
import { CapWarningBanner } from './cap-warning-banner'

interface TradeTicketProps {
  asset: Asset
  className?: string
}

interface TradeButtonState {
  disabled: boolean
  text: string
}

/**
 * Compute trade button state (disabled status and text) based on current state
 * Centralizes logic that was previously split between isTradeReady and button text
 */
function getTradeButtonState(params: {
  isPending: boolean
  isEpochOpen: boolean
  direction: 'up' | 'down' | null
  amount: string
  error: string | null
  isValid: boolean
  connected: boolean
  capExceeded: boolean
  hedgingBlocked: boolean
  maintenanceMode: boolean
}): TradeButtonState {
  const { isPending, isEpochOpen, direction, amount, error, isValid, connected, capExceeded, hedgingBlocked, maintenanceMode } = params

  if (isPending) {
    return { disabled: true, text: 'Confirming...' }
  }

  if (maintenanceMode) {
    return { disabled: true, text: 'Under Maintenance' }
  }

  if (!connected || !isEpochOpen) {
    return { disabled: true, text: 'Trading Unavailable' }
  }

  if (direction === null) {
    return { disabled: true, text: 'Select Direction' }
  }

  if (hedgingBlocked) {
    return { disabled: true, text: 'Hedging Disabled' }
  }

  if (!amount || parseFloat(amount) <= 0) {
    return { disabled: true, text: 'Enter Amount' }
  }

  if (capExceeded) {
    return { disabled: true, text: 'Cap Exceeded' }
  }

  if (error || !isValid) {
    return { disabled: true, text: 'Fix Errors to Continue' }
  }

  return { disabled: false, text: 'Place Trade' }
}

/**
 * Trade ticket container component combining all trade sub-components.
 * Layout: DirectionButtons (grid 2-col), BalanceDisplay, AmountInput, QuickAmountButtons
 *
 * Features:
 * - Disabled state when epoch not Open
 * - "Connect Wallet to Trade" when wallet not connected
 * - State management via Zustand trade-store
 * - Placeholder for future trade preview (Story 2.10) and execution (Story 2.9)
 */
export function TradeTicket({ asset, className }: TradeTicketProps) {
  const metadata = ASSET_METADATA[asset]
  const { connected, publicKey } = useWallet()
  const { setVisible: setWalletModalVisible } = useWalletModal()

  // Epoch state to determine if trading is enabled
  const { epochState, isLoading: epochLoading, noEpochStatus } = useEpoch(asset)

  // USDC balance for the connected wallet
  const { balance, formattedBalance, isLoading: balanceLoading } = useUsdcBalance()

  // Trade store state and actions
  const { direction, amount, error, setDirection, setAmount, validate, reset } =
    useTradeStore()

  // Global config for on-chain max trade amount
  const { config } = useGlobalConfig()
  const maxTradeAmount = config
    ? config.maxTradeAmount.toNumber() / 10 ** USDC_DECIMALS
    : undefined

  // Fetch both direction positions to check hedging
  const { pool } = usePool(asset)
  const epochPda = epochState.epoch ? (pool?.activeEpoch ?? null) : null
  const { position: upPosition } = useUserPosition(epochPda, 'up')
  const { position: downPosition } = useUserPosition(epochPda, 'down')

  // Hedging check: block opposite-direction trade when hedging is disabled
  const hedgingBlocked = (() => {
    if (!direction || config?.allowHedging !== false) return false
    const oppositePosition = direction === 'up' ? downPosition : upPosition
    return oppositePosition !== null && oppositePosition.shares > 0n
  })()

  // Compute max allowed by wallet cap (gross amount, USDC display units)
  const walletCapMax = useMemo(() => {
    if (!pool) return undefined
    const poolTotal = pool.yesReserves + pool.noReserves
    if (poolTotal === 0n) return undefined

    // Subtract existing position if user has one in the selected direction
    const existingLamports = direction
      ? (direction === 'up' ? upPosition : downPosition)?.amount ?? 0n
      : 0n

    const grossLamports = calculateWalletCapMaxGross(
      poolTotal,
      existingLamports,
      pool.walletCapBps,
      config?.tradingFeeBps,
    )
    if (grossLamports === 0n) return 0

    return Number(grossLamports) / 10 ** USDC_DECIMALS
  }, [pool, direction, upPosition, downPosition, config])

  // Admin settings for maintenance mode
  const { data: adminSettings } = useAdminSettings()
  const maintenanceMode = adminSettings?.maintenanceMode ?? false

  // Buy position mutation hook
  const { mutate: buyPosition, isPending } = useBuyPosition()

  // Determine if trading is enabled
  const hasActiveEpoch = epochState.epoch !== null && !noEpochStatus
  const isEpochOpen = hasActiveEpoch && epochState.epoch?.state === EpochState.Open
  const isTradeEnabled = connected && isEpochOpen

  // Trade readiness state for AC #7 (FR6, FR7 foundation)
  const { isValid } = useTradeStore()

  // Trade preview for cap status
  const tradePreview = useTradePreview(asset)
  const capExceeded = tradePreview?.capStatus.hasError ?? false

  // Compute button state using helper
  const tradeButtonState = getTradeButtonState({
    isPending,
    isEpochOpen,
    direction,
    amount,
    error,
    isValid,
    connected,
    capExceeded,
    hedgingBlocked,
    maintenanceMode,
  })

  // Re-validate when balance or max trade amount changes
  useEffect(() => {
    if (amount) {
      validate(balance, maxTradeAmount)
    }
  }, [balance, amount, validate, maxTradeAmount])

  // Reset trade state when asset changes
  useEffect(() => {
    reset()
  }, [asset, reset])

  // Handle direction selection
  const handleDirectionSelect = (dir: 'up' | 'down') => {
    setDirection(dir)
    // Validate with current balance
    if (amount) {
      validate(balance, maxTradeAmount)
    }
  }

  // Handle amount change
  const handleAmountChange = (value: string) => {
    setAmount(value, maxTradeAmount)
    validate(balance, maxTradeAmount)
  }

  // Handle quick amount selection
  const handleQuickAmountSelect = (value: string) => {
    setAmount(value, maxTradeAmount)
    validate(balance, maxTradeAmount)
  }

  // Handle connect wallet button
  const handleConnectWallet = () => {
    setWalletModalVisible(true)
  }

  // Handle trade execution
  const handleTrade = () => {
    if (!direction || !amount || epochState.epoch?.epochId == null || !publicKey || hedgingBlocked || maintenanceMode) {
      return
    }

    buyPosition(
      {
        asset,
        direction,
        amount,
        epochId: epochState.epoch.epochId,
        userPubkey: publicKey.toString(), // Pass pubkey string to avoid stale closure
      },
      {
        onSuccess: () => {
          // Reset trade store state on successful trade
          reset()
        },
      }
    )
  }

  // Get epoch state message
  const getEpochStateMessage = (): string | null => {
    if (epochLoading) return null
    if (!hasActiveEpoch) return 'No active epoch'
    if (epochState.isFrozen) return 'Epoch frozen - trading paused'
    if (epochState.isSettling) return 'Epoch settling'
    if (epochState.isSettled) return 'Epoch settled'
    return null
  }

  const epochStateMessage = getEpochStateMessage()
  const isInputDisabled = !isTradeEnabled

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-center">Trade {metadata.label}</CardTitle>
        {epochStateMessage && (
          <p className="text-sm text-muted-foreground text-center">
            {epochStateMessage}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-4">
        {/* Direction Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <DirectionButton
            direction="up"
            selected={direction}
            onSelect={handleDirectionSelect}
            disabled={isInputDisabled}
          />
          <DirectionButton
            direction="down"
            selected={direction}
            onSelect={handleDirectionSelect}
            disabled={isInputDisabled}
          />
        </div>

        {/* Direction prompt when no selection */}
        {connected && isEpochOpen && direction === null && (
          <p className="text-sm text-center text-muted-foreground">
            Select a direction to continue
          </p>
        )}

        {/* Hedging blocked warning */}
        {hedgingBlocked && direction && (
          <p className="text-sm text-center text-destructive">
            Hedging disabled — you have {direction === 'up' ? 'a Down' : 'an Up'} position on this epoch
          </p>
        )}

        {/* Balance Display */}
        <BalanceDisplay
          formattedBalance={formattedBalance}
          isLoading={balanceLoading}
          isConnected={connected}
        />

        {/* Amount Input */}
        <AmountInput
          value={amount}
          onChange={handleAmountChange}
          error={error}
          disabled={isInputDisabled}
        />

        {/* Quick Amount Buttons */}
        <QuickAmountButtons
          balance={balance}
          maxTradeAmount={maxTradeAmount}
          walletCapMax={walletCapMax}
          currentAmount={amount}
          onSelect={handleQuickAmountSelect}
          disabled={isInputDisabled}
        />

        {/* Trade Preview - Show when amount > 0 and direction selected */}
        {direction && amount && parseFloat(amount) > 0 && (
          <TradePreview asset={asset} />
        )}

        {/* Cap Warning Banner - Show between preview and button */}
        {tradePreview?.capStatus.hasWarning && (
          <CapWarningBanner capStatus={tradePreview.capStatus} />
        )}

        {/* Action Button */}
        {!connected ? (
          <Button
            className="w-full mt-2"
            size="lg"
            onClick={handleConnectWallet}
          >
            Connect Wallet to Trade
          </Button>
        ) : (
          <Button
            className="w-full mt-2"
            size="lg"
            disabled={tradeButtonState.disabled}
            onClick={handleTrade}
            data-trade-ready={!tradeButtonState.disabled}
          >
            {tradeButtonState.text}
          </Button>
        )}

        {/* Info text */}
        <p className="text-xs text-center text-muted-foreground">
          Predict if {metadata.label} will be above or below the price at epoch end
        </p>
      </CardContent>
    </Card>
  )
}
