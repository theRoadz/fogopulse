'use client'

import { useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEpoch, useUsdcBalance } from '@/hooks'
import { useTradeStore } from '@/stores/trade-store'
import { EpochState } from '@/types/epoch'
import type { Asset } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'

import { DirectionButton } from './direction-button'
import { AmountInput } from './amount-input'
import { QuickAmountButtons } from './quick-amount-buttons'
import { BalanceDisplay } from './balance-display'

interface TradeTicketProps {
  asset: Asset
  className?: string
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
  const { connected } = useWallet()
  const { setVisible: setWalletModalVisible } = useWalletModal()

  // Epoch state to determine if trading is enabled
  const { epochState, isLoading: epochLoading, noEpochStatus } = useEpoch(asset)

  // USDC balance for the connected wallet
  const { balance, formattedBalance, isLoading: balanceLoading } = useUsdcBalance()

  // Trade store state and actions
  const { direction, amount, error, setDirection, setAmount, validate, reset } =
    useTradeStore()

  // Determine if trading is enabled
  const hasActiveEpoch = epochState.epoch !== null && !noEpochStatus
  const isEpochOpen = hasActiveEpoch && epochState.epoch?.state === EpochState.Open
  const isTradeEnabled = connected && isEpochOpen

  // Trade readiness state for AC #7 (FR6, FR7 foundation)
  // This computed state validates all prerequisites for trade execution
  const { isValid } = useTradeStore()
  const isTradeReady = isTradeEnabled && direction !== null && isValid

  // Re-validate when balance changes
  useEffect(() => {
    if (amount) {
      validate(balance)
    }
  }, [balance, amount, validate])

  // Reset trade state when asset changes
  useEffect(() => {
    reset()
  }, [asset, reset])

  // Handle direction selection
  const handleDirectionSelect = (dir: 'up' | 'down') => {
    setDirection(dir)
    // Validate with current balance
    if (amount) {
      validate(balance)
    }
  }

  // Handle amount change
  const handleAmountChange = (value: string) => {
    setAmount(value)
    validate(balance)
  }

  // Handle quick amount selection
  const handleQuickAmountSelect = (value: string) => {
    setAmount(value)
    validate(balance)
  }

  // Handle connect wallet button
  const handleConnectWallet = () => {
    setWalletModalVisible(true)
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
          onSelect={handleQuickAmountSelect}
          disabled={isInputDisabled}
        />

        {/* Trade Preview Placeholder - Story 2.10 */}
        {/* TODO: Add trade preview calculations here */}

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
            disabled={!isTradeReady} // Ready for Story 2.9 execution
            data-trade-ready={isTradeReady}
          >
            {!isEpochOpen
              ? 'Trading Unavailable'
              : direction === null
              ? 'Select Direction'
              : !amount || parseFloat(amount) <= 0
              ? 'Enter Amount'
              : error
              ? 'Fix Errors to Continue'
              : 'Place Trade'}
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
