'use client'

import { useMemo, useState, useEffect } from 'react'
import type { Asset } from '@/types/assets'
import { ASSETS } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'
import { usePythPrice } from '@/hooks/use-pyth-price'
import type { ConnectionState } from '@/hooks/use-pyth-price'
import { useGlobalConfig } from '@/hooks/use-global-config'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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

interface OracleAssetRowProps {
  asset: Asset
  stalenessThresholdStart: number
  stalenessThresholdSettle: number
  confidenceThresholdStart: number
  confidenceThresholdSettle: number
}

function OracleAssetRow({
  asset,
  stalenessThresholdStart,
  stalenessThresholdSettle,
  confidenceThresholdStart,
  confidenceThresholdSettle,
}: OracleAssetRowProps) {
  const { price: priceData, connectionState } = usePythPrice(asset)
  const meta = ASSET_METADATA[asset]

  // Live staleness counter
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

  // Color coding based on dynamic thresholds
  const stalenessColor =
    staleness > stalenessThresholdSettle
      ? 'text-red-500'
      : staleness > stalenessThresholdStart
        ? 'text-amber-500'
        : 'text-green-500'

  const confidenceColor =
    confidenceRatio > confidenceThresholdSettle
      ? 'text-red-500'
      : confidenceRatio > confidenceThresholdStart
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

export function OracleHealthCard() {
  const { config, isLoading } = useGlobalConfig()

  if (!config) {
    return (
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Oracle Health</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading config thresholds...' : 'Unable to load config thresholds.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  const stalenessThresholdStart = config.oracleStalenessThresholdStart.toNumber()
  const stalenessThresholdSettle = config.oracleStalenessThresholdSettle.toNumber()
  const confidenceThresholdStart = config.oracleConfidenceThresholdStartBps / 10000
  const confidenceThresholdSettle = config.oracleConfidenceThresholdSettleBps / 10000

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Oracle Health</CardTitle>
      </CardHeader>
      <CardContent>
        {ASSETS.map((asset) => (
          <OracleAssetRow
            key={asset}
            asset={asset}
            stalenessThresholdStart={stalenessThresholdStart}
            stalenessThresholdSettle={stalenessThresholdSettle}
            confidenceThresholdStart={confidenceThresholdStart}
            confidenceThresholdSettle={confidenceThresholdSettle}
          />
        ))}
        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
          Thresholds — Start: {stalenessThresholdStart}s / {(confidenceThresholdStart * 100).toFixed(2)}% | Settle: {stalenessThresholdSettle}s / {(confidenceThresholdSettle * 100).toFixed(2)}%
        </div>
      </CardContent>
    </Card>
  )
}
