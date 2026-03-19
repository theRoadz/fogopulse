'use client'

import { useMemo, useState, useEffect } from 'react'
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react'

import { ASSET_METADATA } from '@/lib/constants'
import { useGlobalConfig } from '@/hooks/use-global-config'
import { usePool } from '@/hooks/use-pool'
import { usePythPrice } from '@/hooks/use-pyth-price'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

interface AlertItem {
  severity: 'error' | 'warning' | 'info'
  title: string
  description: string
}

function useAlerts(): AlertItem[] {
  const { config } = useGlobalConfig()

  const btcPool = usePool('BTC')
  const ethPool = usePool('ETH')
  const solPool = usePool('SOL')
  const fogoPool = usePool('FOGO')

  const btcPrice = usePythPrice('BTC')
  const ethPrice = usePythPrice('ETH')
  const solPrice = usePythPrice('SOL')
  const fogoPrice = usePythPrice('FOGO')

  // Track current time in state to avoid impure Date.now() in render
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  const pools = useMemo(
    () => [
      { asset: 'BTC' as const, pool: btcPool.pool },
      { asset: 'ETH' as const, pool: ethPool.pool },
      { asset: 'SOL' as const, pool: solPool.pool },
      { asset: 'FOGO' as const, pool: fogoPool.pool },
    ],
    [btcPool.pool, ethPool.pool, solPool.pool, fogoPool.pool]
  )

  const prices = useMemo(
    () => [
      { asset: 'BTC' as const, data: btcPrice },
      { asset: 'ETH' as const, data: ethPrice },
      { asset: 'SOL' as const, data: solPrice },
      { asset: 'FOGO' as const, data: fogoPrice },
    ],
    [btcPrice, ethPrice, solPrice, fogoPrice]
  )

  return useMemo(() => {
    const alerts: AlertItem[] = []

    if (!config) return alerts

    // Protocol-level alerts
    if (config.frozen) {
      alerts.push({
        severity: 'error',
        title: 'Protocol Frozen',
        description: 'Emergency freeze is active. All trading is halted across all pools.',
      })
    } else if (config.paused) {
      alerts.push({
        severity: 'warning',
        title: 'Protocol Paused',
        description: 'Protocol is paused. New epoch creation is blocked.',
      })
    }

    // Pool-level alerts
    for (const { asset, pool } of pools) {
      if (!pool) continue
      if (pool.isFrozen) {
        alerts.push({
          severity: 'error',
          title: `${ASSET_METADATA[asset].label} Pool Frozen`,
          description: `The ${ASSET_METADATA[asset].label} pool is frozen. Trading is halted for this pool.`,
        })
      } else if (pool.isPaused) {
        alerts.push({
          severity: 'warning',
          title: `${ASSET_METADATA[asset].label} Pool Paused`,
          description: `The ${ASSET_METADATA[asset].label} pool is paused. New epochs cannot be created.`,
        })
      }
    }

    // Oracle alerts
    const stalenessThreshold = config.oracleStalenessThresholdSettle.toNumber()
    const confidenceThreshold = config.oracleConfidenceThresholdSettleBps / 10000

    for (const { asset, data } of prices) {
      if (data.connectionState === 'disconnected') {
        alerts.push({
          severity: 'warning',
          title: `${ASSET_METADATA[asset].label} Oracle Disconnected`,
          description: `Price feed for ${ASSET_METADATA[asset].label} is disconnected.`,
        })
        continue
      }

      if (!data.price) continue

      const staleness = Math.floor((now - data.price.timestamp) / 1000)
      if (staleness > stalenessThreshold) {
        alerts.push({
          severity: 'warning',
          title: `${ASSET_METADATA[asset].label} Oracle Stale`,
          description: `Last update ${staleness}s ago (threshold: ${stalenessThreshold}s).`,
        })
      }

      if (data.price.price > 0) {
        const ratio = data.price.confidence / data.price.price
        if (ratio > confidenceThreshold) {
          alerts.push({
            severity: 'warning',
            title: `${ASSET_METADATA[asset].label} High Confidence Interval`,
            description: `Confidence ratio ${(ratio * 100).toFixed(3)}% exceeds threshold ${(confidenceThreshold * 100).toFixed(2)}%.`,
          })
        }
      }
    }

    return alerts
  }, [config, pools, prices, now])
}

export function AlertsSection() {
  const alerts = useAlerts()

  if (alerts.length === 0) return null

  return (
    <div className="space-y-3 mb-4">
      {alerts.map((alert, i) => {
        const variant = alert.severity === 'error' ? 'destructive' : alert.severity === 'warning' ? 'warning' : 'default'
        const Icon = alert.severity === 'error' ? ShieldAlert : alert.severity === 'warning' ? AlertTriangle : Info

        return (
          <Alert key={i} variant={variant}>
            <Icon className="h-4 w-4" />
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription>{alert.description}</AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}
