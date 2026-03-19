'use client'

import { useMemo, useState, useEffect } from 'react'
import type { Asset } from '@/types/assets'
import { ASSETS } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'
import { usePythPrice } from '@/hooks/use-pyth-price'
import type { ConnectionState } from '@/hooks/use-pyth-price'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// Hardcoded defaults — no admin GlobalConfig dependency
const STALENESS_THRESHOLD_START = 10 // seconds
const STALENESS_THRESHOLD_SETTLE = 30 // seconds
const CONFIDENCE_THRESHOLD_START = 0.005 // 0.5%
const CONFIDENCE_THRESHOLD_SETTLE = 0.01 // 1.0%

function connectionBadge(state: ConnectionState) {
  switch (state) {
    case 'connected':
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">Connected</Badge>
    case 'connecting':
      return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30 text-xs">Connecting</Badge>
    case 'reconnecting':
      return <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-xs">Reconnecting</Badge>
    case 'disconnected':
      return <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-xs">Disconnected</Badge>
  }
}

function OracleAssetRow({ asset }: { asset: Asset }) {
  const { price: priceData, connectionState } = usePythPrice(asset)
  const meta = ASSET_METADATA[asset]

  const [staleness, setStaleness] = useState(0)
  useEffect(() => {
    if (!priceData) return
    const update = () => setStaleness(Math.floor((Date.now() - priceData.timestamp) / 1000))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [priceData])

  const confidenceRatio = useMemo(() => {
    if (!priceData || priceData.price === 0) return 0
    return priceData.confidence / priceData.price
  }, [priceData])

  const stalenessColor =
    staleness > STALENESS_THRESHOLD_SETTLE
      ? 'text-red-500'
      : staleness > STALENESS_THRESHOLD_START
        ? 'text-amber-500'
        : 'text-green-500'

  const confidenceColor =
    confidenceRatio > CONFIDENCE_THRESHOLD_SETTLE
      ? 'text-red-500'
      : confidenceRatio > CONFIDENCE_THRESHOLD_START
        ? 'text-amber-500'
        : 'text-green-500'

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`font-medium ${meta.color} w-12`}>{meta.label}</span>
        {priceData ? (
          <span className="text-sm font-mono">
            ${priceData.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">No data</span>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        {priceData && (
          <>
            <div className="text-right">
              <span className="text-muted-foreground text-xs block">Staleness</span>
              <span className={`font-mono ${stalenessColor}`}>{staleness}s</span>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground text-xs block">Confidence</span>
              <span className={`font-mono ${confidenceColor}`}>
                {(confidenceRatio * 100).toFixed(3)}%
              </span>
            </div>
          </>
        )}
        <div className="w-24 text-right">
          {connectionBadge(connectionState)}
        </div>
      </div>
    </div>
  )
}

export function HomeOracleHealthCard() {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Oracle Health</CardTitle>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Live data from <span className="font-semibold text-foreground">Pyth Hermes</span> via Server-Sent Events
        </p>
      </CardHeader>
      <CardContent>
        {ASSETS.map((asset) => (
          <OracleAssetRow key={asset} asset={asset} />
        ))}
        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
          Thresholds — Start: {STALENESS_THRESHOLD_START}s / {(CONFIDENCE_THRESHOLD_START * 100).toFixed(2)}% | Settle: {STALENESS_THRESHOLD_SETTLE}s / {(CONFIDENCE_THRESHOLD_SETTLE * 100).toFixed(2)}%
        </div>
      </CardContent>
    </Card>
  )
}
