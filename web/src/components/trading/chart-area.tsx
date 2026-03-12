'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Asset } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface ChartAreaProps {
  asset: Asset
  className?: string
}

export function ChartArea({ asset, className }: ChartAreaProps) {
  const metadata = ASSET_METADATA[asset]

  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center justify-between">
          <span className={metadata.color}>{metadata.label}/USD</span>
          <span className="text-sm text-muted-foreground">Price to Beat</span>
        </CardTitle>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Chart Coming Soon</span>
          <span className="font-mono text-lg">$--,---.--</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
            <svg
              className="h-12 w-12 text-muted-foreground/50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
              />
            </svg>
          </div>
          <span className="text-sm">Price chart will appear here</span>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-muted">Epoch ends in:</span>
            <span className="font-mono">--:--</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
