'use client'

import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatUsdPrice, formatSettlementTime } from '@/lib/utils'
import { useSettlementDisplay } from '@/hooks/use-settlement-display'
import type { SettlementDisplayData } from '@/hooks/use-settlement-display'
import type { LastSettledEpochData } from '@/hooks/use-last-settled-epoch'
import type { Asset } from '@/types/assets'
import type { EpochData } from '@/types/epoch'
import { Outcome } from '@/types/epoch'

import { useEpoch } from '@/hooks/use-epoch'
import { usePool } from '@/hooks/use-pool'

import { OutcomeBadge } from './outcome-badge'
import { RefundExplanation } from './refund-explanation'
import { VerificationLinks } from './verification-links'
import { ClaimButton } from './claim-button'

/**
 * Common settlement data shape used by both hooks
 */
type SettlementData = SettlementDisplayData | LastSettledEpochData

/**
 * Type guard to check if data is from SettlementDisplayData
 */
function isSettlementDisplayData(data: SettlementData): data is SettlementDisplayData {
  return 'isSettled' in data
}

/**
 * Type guard to check if data is from LastSettledEpochData (has rawEpochData)
 */
function isLastSettledEpochData(data: SettlementData): data is LastSettledEpochData {
  return 'rawEpochData' in data
}

/**
 * Check if settlement data represents a settled epoch
 */
function isDataSettled(data: SettlementData): boolean {
  if (isSettlementDisplayData(data)) {
    return data.isSettled
  }
  // LastSettledEpochData is only returned when epoch is already settled
  return true
}

/**
 * Extract raw start price bigint from either data shape.
 * SettlementDisplayData has startPriceRaw; LastSettledEpochData doesn't,
 * so we fall back to re-scaling the float (unavoidable for that shape).
 */
function getStartPriceRaw(data: SettlementData): bigint {
  if (isSettlementDisplayData(data) && data.startPriceRaw !== undefined) {
    return data.startPriceRaw
  }
  return BigInt(Math.round(data.startPrice * 1e8))
}

/**
 * Extract raw settlement price bigint from either data shape.
 */
function getSettlementPriceRaw(data: SettlementData): bigint {
  if (isSettlementDisplayData(data) && data.settlementPriceRaw !== undefined) {
    return data.settlementPriceRaw ?? BigInt(0)
  }
  return BigInt(Math.round((data.settlementPrice ?? 0) * 1e8))
}

interface SettlementStatusPanelProps {
  /** The asset to display settlement for (required if not providing settlementData) */
  asset?: Asset
  /** Pre-fetched settlement data (if provided, asset is not used for fetching) */
  settlementData?: SettlementData | null
  /** Custom title (defaults to "Settlement Details") */
  title?: string
  /** Optional close handler */
  onClose?: () => void
  /** Additional CSS classes */
  className?: string
}

/**
 * Price section displaying price, confidence, and publish time
 */
interface PriceSectionProps {
  title: string
  price: number
  confidencePercent: string
  publishTime: number
}

function PriceSection({ title, price, confidencePercent, publishTime }: PriceSectionProps) {
  return (
    <div className="flex flex-col space-y-1.5 rounded-lg border border-border bg-muted/30 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      <span className="text-xl font-bold text-foreground">
        {formatUsdPrice(price)}
      </span>
      <span className="text-xs text-muted-foreground">
        Confidence: {confidencePercent}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatSettlementTime(publishTime)}
      </span>
    </div>
  )
}

/**
 * Loading skeleton for the settlement panel
 */
function SettlementPanelSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-4">
        <Skeleton className="h-5 w-36" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="flex justify-center">
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="flex justify-center gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-28" />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Settlement status panel showing comprehensive settlement details.
 *
 * Displays:
 * - Start price with confidence % and publish time
 * - Settlement price with confidence % and publish time
 * - Outcome badge (UP WON / DOWN WON / REFUNDED)
 * - Price delta for UP/DOWN outcomes
 * - Expandable "Why?" explanation for refunded epochs
 * - Verification links (copy address, explorer)
 *
 * Uses the useSettlementDisplay hook to derive display data from useEpoch.
 * Does NOT duplicate on-chain fetching.
 */
export function SettlementStatusPanel({
  asset,
  settlementData: providedData,
  title = 'Settlement Details',
  onClose,
  className,
}: SettlementStatusPanelProps) {
  // Only call hook if asset is provided and no data was passed in
  const fetchedData = useSettlementDisplay(asset)

  // Use provided data if available, otherwise use fetched data
  const settlementData = providedData !== undefined ? providedData : fetchedData

  // Fetch raw epoch data and pool data for ClaimButton (hooks must be called unconditionally)
  // When providedData has rawEpochData (Last Settlement path), we use that instead of useEpoch
  // because useEpoch fetches the *active* epoch, not the settled one we're displaying.
  const { epochState } = useEpoch(asset ?? 'BTC')
  const { pool } = usePool(asset ?? 'BTC')

  // Determine the correct epoch data for ClaimButton
  const epochDataForClaim: EpochData | null =
    providedData && isLastSettledEpochData(providedData)
      ? providedData.rawEpochData
      : epochState.epoch

  // Loading state - show skeleton
  if (!settlementData) {
    return <SettlementPanelSkeleton />
  }

  // Not settled yet - don't render
  if (!isDataSettled(settlementData) || !settlementData.outcome) {
    return null
  }

  // Build price delta text for badge
  const priceDeltaText =
    settlementData.priceDelta !== null && settlementData.priceDeltaPercent
      ? `${settlementData.priceDelta >= 0 ? '+' : ''}${formatUsdPrice(Math.abs(settlementData.priceDelta))} / ${settlementData.priceDeltaPercent}`
      : undefined

  return (
    <Card
      role="region"
      aria-label="Settlement Details"
      className={cn('relative', className)}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6"
            aria-label="Close settlement details"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Price sections - side by side on desktop, stacked on mobile */}
        <div className="grid gap-4 sm:grid-cols-2">
          <PriceSection
            title="Start Price"
            price={settlementData.startPrice}
            confidencePercent={settlementData.startConfidencePercent}
            publishTime={settlementData.startPublishTime}
          />

          {settlementData.settlementPrice !== null &&
            settlementData.settlementConfidencePercent !== null &&
            settlementData.settlementPublishTime !== null && (
              <PriceSection
                title="Settlement Price"
                price={settlementData.settlementPrice}
                confidencePercent={settlementData.settlementConfidencePercent}
                publishTime={settlementData.settlementPublishTime}
              />
            )}
        </div>

        {/* Outcome badge with price delta */}
        <div
          className="flex flex-col items-center"
          aria-live="polite"
        >
          <OutcomeBadge
            outcome={settlementData.outcome}
            priceDeltaText={priceDeltaText}
          />

          {/* Refund explanation for refunded epochs */}
          {settlementData.outcome === Outcome.Refunded &&
            settlementData.settlementConfidenceRaw !== null && (
              <RefundExplanation
                startPrice={getStartPriceRaw(settlementData)}
                startConfidence={settlementData.startConfidenceRaw}
                settlementPrice={getSettlementPriceRaw(settlementData)}
                settlementConfidence={settlementData.settlementConfidenceRaw}
                className="mt-3"
              />
            )}
        </div>

        {/* Claim button - only when asset is provided */}
        {asset && settlementData.epochPda && (
          <ClaimButton
            asset={asset}
            epoch={epochDataForClaim}
            epochPda={settlementData.epochPda}
            pool={pool}
          />
        )}

        {/* Verification links */}
        {settlementData.epochPda && (
          <VerificationLinks
            epochPda={settlementData.epochPda}
            className="justify-center"
          />
        )}
      </CardContent>
    </Card>
  )
}
