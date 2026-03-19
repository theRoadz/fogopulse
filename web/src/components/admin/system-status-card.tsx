'use client'

import { useGlobalConfig } from '@/hooks/use-global-config'
import { useEpoch } from '@/hooks/use-epoch'
import { ASSETS } from '@/types/assets'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function useActiveEpochCount(): number {
  const btc = useEpoch('BTC')
  const eth = useEpoch('ETH')
  const sol = useEpoch('SOL')
  const fogo = useEpoch('FOGO')

  return [btc, eth, sol, fogo].filter((e) => e.epochState.epoch !== null).length
}

export function SystemStatusCard() {
  const { config } = useGlobalConfig()
  const activeEpochs = useActiveEpochCount()

  if (!config) return null

  const protocolState = config.frozen
    ? 'Frozen'
    : config.paused
      ? 'Paused'
      : 'Active'

  const stateColor = config.frozen
    ? 'bg-red-500/20 text-red-500 border-red-500/30'
    : config.paused
      ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
      : 'bg-green-500/20 text-green-500 border-green-500/30'

  const epochDuration = config.epochDurationSeconds.toNumber()
  const freezeWindow = config.freezeWindowSeconds.toNumber()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          System Status
          <Badge className={stateColor}>{protocolState}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Active Epochs</p>
            <p className="text-lg font-semibold">{activeEpochs} / {ASSETS.length}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Trading Fee</p>
            <p className="text-lg font-semibold">{(config.tradingFeeBps / 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Epoch Duration</p>
            <p className="text-lg font-semibold">{epochDuration >= 60 ? `${Math.floor(epochDuration / 60)}m` : `${epochDuration}s`}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Freeze Window</p>
            <p className="text-lg font-semibold">{freezeWindow}s</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4 pt-4 border-t">
          <div>
            <p className="text-muted-foreground">Wallet Cap</p>
            <p className="font-medium">{(config.perWalletCapBps / 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Side Cap</p>
            <p className="font-medium">{(config.perSideCapBps / 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fee Split (LP/Trs/Ins)</p>
            <p className="font-medium">{config.lpFeeShareBps / 100}/{config.treasuryFeeShareBps / 100}/{config.insuranceFeeShareBps / 100}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Hedging</p>
            <p className="font-medium">{config.allowHedging ? 'Enabled' : 'Disabled'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
