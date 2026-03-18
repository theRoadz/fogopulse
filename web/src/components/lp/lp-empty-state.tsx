'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Coins } from 'lucide-react'

export function LpEmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12">
        <Coins className="h-12 w-12 text-muted-foreground" />
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">No LP Positions</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Earn fees by providing liquidity to prediction market pools.
          </p>
        </div>
        <Button disabled>
          Deposit — Coming Soon
        </Button>
      </CardContent>
    </Card>
  )
}
