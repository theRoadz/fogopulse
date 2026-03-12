import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function ellipsify(str = '', len = 4, delimiter = '..') {
  const strLen = str.length
  const limit = len * 2 + delimiter.length

  return strLen >= limit ? str.substring(0, len) + delimiter + str.substring(strLen - len, strLen) : str
}

/**
 * Format a price as USD currency string.
 * Handles large numbers (BTC) and small numbers (fractional tokens).
 */
export function formatUsdPrice(price: number | null): string {
  if (price === null) return '$--,---.--'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: price < 1 ? 6 : 2,
  }).format(price)
}

/**
 * Format a price change as a percentage with + or - prefix.
 */
export function formatPriceChange(change: number | null): string {
  if (change === null) return '--'
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

/**
 * Format a timestamp as a relative "time ago" string.
 * @param publishTime - Timestamp in milliseconds (from usePythPrice)
 */
export function formatLastUpdated(publishTime: number | null): string {
  if (!publishTime) return '--'
  const now = Date.now()
  const diff = Math.floor((now - publishTime) / 1000) // Convert to seconds
  if (diff < 1) return 'Just now'
  if (diff < 60) return `${diff}s ago`
  return `${Math.floor(diff / 60)}m ago`
}
