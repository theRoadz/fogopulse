'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { Droplets } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WalletButton } from '@/components/wallet'
import { useUsdcBalance } from '@/hooks/use-usdc-balance'
import { useFaucetMint } from '@/hooks/use-faucet-mint'

/**
 * Faucet page component.
 * Allows users to mint test USDC on FOGO testnet.
 * Cap enforcement is server-side only — no cap/amount values are shipped to the client.
 */
export function FaucetFeature() {
  const { connected } = useWallet()
  const { formattedBalance, isLoading: balanceLoading } = useUsdcBalance()
  const { mutate: requestMint, isPending, isOverCap } = useFaucetMint()

  const canMint = connected && !isPending && !isOverCap && !balanceLoading

  return (
    <div className="flex justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Droplets className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>USDC Testnet Faucet</CardTitle>
          <p className="text-sm text-muted-foreground">
            Get test USDC to try FOGO Pulse on testnet
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Balance display */}
          <div className="rounded-lg border p-4 text-center">
            <p className="text-sm text-muted-foreground">Your USDC Balance</p>
            <p className="mt-1 text-2xl font-mono font-semibold">
              {!connected
                ? '—'
                : balanceLoading
                  ? '...'
                  : `${formattedBalance ?? '0.00'} USDC`}
            </p>
          </div>

          {/* Status message — shown when server previously rejected with 429 */}
          {isOverCap && (
            <p className="text-sm text-center text-warning">
              You already have enough USDC to trade. Come back when you&apos;re running low.
            </p>
          )}

          {/* Action */}
          {!connected ? (
            <div className="flex justify-center">
              <WalletButton />
            </div>
          ) : (
            <Button
              className="w-full"
              disabled={!canMint}
              onClick={() => requestMint()}
            >
              {isPending ? 'Minting...' : 'Mint Test USDC'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
