'use client'

import { useFogopulseProgram } from './fogopulse-data-access'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { ExplorerLink } from '../cluster/cluster-ui'
import { ellipsify } from '@/lib/utils'

/**
 * FogoPulse Trading UI Components
 *
 * Note: The original scaffolding used a counter example.
 * This file will be expanded with:
 * - Asset selector
 * - Price chart
 * - Trade ticket
 * - Position list
 * - Epoch status
 *
 * These will be built in subsequent stories (2.3 - 2.10)
 */

export function FogopulseDashboard() {
  const { programId, getProgramAccount } = useFogopulseProgram()

  if (getProgramAccount.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    )
  }

  if (!getProgramAccount.data?.value) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <p>Program account not found.</p>
            <p className="text-sm mt-2">
              Make sure you have deployed the program and are connected to FOGO Testnet.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>FogoPulse Program</CardTitle>
          <CardDescription>
            Program ID: <ExplorerLink path={`account/${programId}`} label={ellipsify(programId.toString())} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Trading UI components will be added in upcoming stories.
          </p>
          <ul className="list-disc list-inside mt-4 text-sm text-muted-foreground space-y-1">
            <li>Story 2.3: Asset Selector & Market Layout</li>
            <li>Story 2.4: Pyth Price Feed Integration</li>
            <li>Story 2.5: Price Chart Component</li>
            <li>Story 2.6: Epoch Status Display</li>
            <li>Story 2.7: Pool State Display</li>
            <li>Story 2.8: Trade Ticket Component</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
