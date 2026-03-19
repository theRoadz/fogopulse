'use client'

import { useWallet } from '@solana/wallet-adapter-react'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { ASSETS } from '@/types/assets'
import { SystemStatusCard } from '@/components/admin/system-status-card'
import { ConfigurationPanel } from '@/components/admin/configuration-panel'
import { PoolOverviewCard } from '@/components/admin/pool-overview-card'
import { OracleHealthCard } from '@/components/admin/oracle-health-card'
import { AlertsSection } from '@/components/admin/alerts-section'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminDashboardFeature() {
  const { publicKey } = useWallet()
  const { isAdmin, isLoading: adminLoading } = useAdminAuth()

  if (!publicKey) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Connect your wallet to access the admin dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (adminLoading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
        <Card>
          <CardContent className="py-6 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-24" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-lg font-semibold text-destructive">Not Authorized</p>
            <p className="text-sm text-muted-foreground mt-2">
              Your wallet does not have admin access to this dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <AlertsSection />
      <SystemStatusCard />
      <ConfigurationPanel />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {ASSETS.map((asset) => (
          <PoolOverviewCard key={asset} asset={asset} />
        ))}
      </div>
      <OracleHealthCard />
    </div>
  )
}
