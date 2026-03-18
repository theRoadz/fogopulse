'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Wallet } from 'lucide-react'
import { WalletButton } from '@/components/wallet'

export function LpConnectPrompt() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12">
        <Wallet className="h-12 w-12 text-muted-foreground" />
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">Connect Your Wallet</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Connect your wallet to view your LP positions, track earnings, and monitor pool metrics.
          </p>
        </div>
        <WalletButton />
      </CardContent>
    </Card>
  )
}
