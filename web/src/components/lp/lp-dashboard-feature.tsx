'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

import type { Asset } from '@/types/assets'
import { useMultiPoolLp } from '@/hooks/use-multi-pool-lp'
import { LpConnectPrompt } from '@/components/lp/lp-connect-prompt'
import { LpEmptyState } from '@/components/lp/lp-empty-state'
import { LpSummaryCard } from '@/components/lp/lp-summary-card'
import { LpPoolCard } from '@/components/lp/lp-pool-card'
import { LpDepositDialog } from '@/components/lp/lp-deposit-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function LpDashboardFeature() {
  const { publicKey } = useWallet()
  const { pools, activePools, totalValue, totalEarnings, isLoading, hasError } = useMultiPoolLp()
  const [depositDialogOpen, setDepositDialogOpen] = useState(false)
  const [depositAsset, setDepositAsset] = useState<Asset>('BTC')

  function openDeposit(asset: Asset) {
    setDepositAsset(asset)
    setDepositDialogOpen(true)
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">LP Dashboard</h1>

      {!publicKey ? (
        <LpConnectPrompt />
      ) : isLoading ? (
        <>
          <Card>
            <CardContent className="py-6 space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
          <h2 className="text-lg font-semibold mt-8 mb-4">Your Pools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pools.map((info) => (
              <LpPoolCard key={info.asset} info={info} />
            ))}
          </div>
        </>
      ) : hasError ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Failed to load LP data. Please check your connection and try again.
            </p>
          </CardContent>
        </Card>
      ) : activePools.length === 0 ? (
        <>
          <LpEmptyState onDeposit={() => openDeposit('BTC')} />
          <h2 className="text-lg font-semibold mt-8 mb-4">Pool Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pools.map((info) => (
              <LpPoolCard key={info.asset} info={info} onDeposit={() => openDeposit(info.asset)} />
            ))}
          </div>
        </>
      ) : (
        <>
          <LpSummaryCard
            totalValue={totalValue}
            totalEarnings={totalEarnings}
            poolCount={activePools.length}
          />
          <h2 className="text-lg font-semibold mt-8 mb-4">Your Pools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pools.map((info) => (
              <LpPoolCard key={info.asset} info={info} onDeposit={() => openDeposit(info.asset)} />
            ))}
          </div>
        </>
      )}

      {publicKey && (
        <LpDepositDialog
          asset={depositAsset}
          open={depositDialogOpen}
          onOpenChange={setDepositDialogOpen}
        />
      )}
    </div>
  )
}
