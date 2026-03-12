'use client'

import { useEffect, useRef, useState } from 'react'
import type { LineData, UTCTimestamp } from 'lightweight-charts'
import type { PriceData } from './use-pyth-price'
import type { Asset } from '@/types/assets'

const MAX_HISTORY_POINTS = 300 // ~5 minutes at 1 point/second

/**
 * Hook that accumulates price data into a history array for charting.
 * Clears history on asset change and limits size to prevent memory growth.
 *
 * Optimizes array operations by mutating in place and only creating new
 * array references when necessary for React to detect changes.
 *
 * @param asset - The current asset being displayed
 * @param priceData - The latest price data from usePythPrice
 * @returns Object containing accumulated history and latest price
 */
export function usePriceHistory(asset: Asset, priceData: PriceData | null) {
  const [history, setHistory] = useState<LineData<UTCTimestamp>[]>([])
  const prevAssetRef = useRef<Asset>(asset)
  // Track last timestamp to detect duplicates without array scan
  const lastTimestampRef = useRef<number | null>(null)

  // Clear history on asset change
  useEffect(() => {
    if (prevAssetRef.current !== asset) {
      setHistory([])
      lastTimestampRef.current = null
      prevAssetRef.current = asset
    }
  }, [asset])

  // Accumulate price data
  useEffect(() => {
    if (!priceData) return

    const timestamp = Math.floor(priceData.timestamp / 1000) as UTCTimestamp

    const point: LineData<UTCTimestamp> = {
      time: timestamp,
      value: priceData.price,
    }

    // Check for duplicate using ref (O(1) instead of O(n))
    const isDuplicate = lastTimestampRef.current === timestamp

    setHistory((prev) => {
      if (isDuplicate) {
        // Update last point - only copy last element
        if (prev.length === 0) return [point]
        const updated = prev.slice() // Shallow copy
        updated[updated.length - 1] = point
        return updated
      }

      // New point - check if we need to trim
      if (prev.length >= MAX_HISTORY_POINTS) {
        // Trim oldest and add new - single array operation
        const trimmed = prev.slice(1)
        trimmed.push(point)
        return trimmed
      }

      // Just append - spread is fine for growing arrays
      return [...prev, point]
    })

    lastTimestampRef.current = timestamp
  }, [priceData])

  return { history, latestPrice: priceData }
}
