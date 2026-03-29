'use client'

import { Toaster } from './ui/sonner'
import { AppHeader } from '@/components/app-header'
import React from 'react'
import { AppFooter } from '@/components/app-footer'
import { MaintenanceBanner } from '@/components/maintenance-banner'
import { ClusterChecker } from '@/components/cluster/cluster-ui'
import { AccountChecker } from '@/components/account/account-ui'

export function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div className="flex flex-col min-h-screen">
        <AppHeader />
        <MaintenanceBanner />
        <main className="flex-1 container mx-auto p-4">
          <ClusterChecker>
            <AccountChecker />
          </ClusterChecker>
          {children}
        </main>
        <AppFooter />
      </div>
      <Toaster />
    </>
  )
}
