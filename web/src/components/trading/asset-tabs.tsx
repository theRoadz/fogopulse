'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUIStore } from '@/stores/ui-store'
import { ASSETS, type Asset } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface AssetTabsProps {
  onAssetChange?: (asset: Asset) => void
}

export function AssetTabs({ onAssetChange }: AssetTabsProps) {
  const activeAsset = useUIStore((s) => s.activeAsset)

  const handleChange = (value: string) => {
    onAssetChange?.(value as Asset)
  }

  return (
    <Tabs value={activeAsset} onValueChange={handleChange}>
      <TabsList variant="line" className="grid grid-cols-4 w-full max-w-md">
        {ASSETS.map((asset) => (
          <TabsTrigger
            key={asset}
            value={asset}
            className={cn(
              'font-semibold',
              activeAsset === asset && ASSET_METADATA[asset].color
            )}
          >
            {ASSET_METADATA[asset].label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
