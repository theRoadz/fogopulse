'use client'

import { AlertTriangle, XCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import type { CapStatus, CapInfo } from '@/lib/cap-utils'
import { formatUsdcAmount } from '@/hooks/use-claimable-amount'

interface CapWarningBannerProps {
  capStatus: CapStatus
  className?: string
}

function formatCapLabel(cap: CapInfo): string {
  return cap.label === 'wallet' ? 'per-wallet' : 'per-side'
}

function CapBanner({ cap, isHighlighted }: { cap: CapInfo; isHighlighted: boolean }) {
  if (cap.level === 'ok') return null

  const isExceeded = cap.level === 'exceeded'
  const label = formatCapLabel(cap)

  return (
    <Alert
      variant={isExceeded ? 'destructive' : 'warning'}
      className={cn(
        isHighlighted && 'ring-1',
        isHighlighted && isExceeded && 'ring-red-500/50',
        isHighlighted && !isExceeded && 'ring-amber-500/50'
      )}
    >
      {isExceeded ? (
        <XCircle className="h-4 w-4" />
      ) : (
        <AlertTriangle className="h-4 w-4" />
      )}
      <AlertDescription>
        {isExceeded
          ? `Trade exceeds ${label} cap. Reduce trade amount to stay within limit.`
          : `Approaching ${label} cap — ${formatUsdcAmount(cap.remainingLamports)} USDC remaining`}
      </AlertDescription>
    </Alert>
  )
}

/**
 * Displays warning/error banners when trade approaches or exceeds cap limits.
 * Shows per-wallet and/or per-side cap warnings with the most restrictive highlighted.
 */
export function CapWarningBanner({ capStatus, className }: CapWarningBannerProps) {
  const { walletCap, sideCap, mostRestrictive } = capStatus

  // Nothing to show if no warnings
  if (!capStatus.hasWarning) return null

  const showBoth = walletCap.level !== 'ok' && sideCap.level !== 'ok'

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <CapBanner
        cap={walletCap}
        isHighlighted={showBoth && mostRestrictive === 'wallet'}
      />
      <CapBanner
        cap={sideCap}
        isHighlighted={showBoth && mostRestrictive === 'side'}
      />
    </div>
  )
}
