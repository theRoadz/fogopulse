'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { useUIStore } from '@/stores/ui-store'
import { ASSETS, type Asset } from '@/types/assets'
import { TradingLayout } from '@/components/trading'

function isValidAsset(value: string): value is Asset {
  return ASSETS.includes(value as Asset)
}

export default function AssetTradePage() {
  const params = useParams()
  const router = useRouter()
  const setActiveAsset = useUIStore((s) => s.setActiveAsset)

  const rawAssetParam = (params.asset as string)?.toUpperCase() ?? ''

  // Single effect: URL → Store sync
  useEffect(() => {
    if (isValidAsset(rawAssetParam)) {
      setActiveAsset(rawAssetParam)
    } else {
      router.replace('/trade/btc')
    }
  }, [rawAssetParam, setActiveAsset, router])

  // Tab clicks trigger router.push() directly (no Store→URL sync needed)
  const handleAssetChange = (asset: Asset) => {
    router.push(`/trade/${asset.toLowerCase()}`)
  }

  // Don't render until we have a valid asset
  if (!isValidAsset(rawAssetParam)) {
    return null
  }

  return <TradingLayout onAssetChange={handleAssetChange} />
}
