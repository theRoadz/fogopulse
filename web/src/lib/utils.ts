import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { FOGO_TESTNET_RPC } from './constants'

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

/**
 * Pyth price exponent for USD pairs (typically -8).
 */
export const PYTH_PRICE_EXPONENT = -8

/**
 * Convert a scaled u64 Pyth price to a human-readable number.
 * @param price - Scaled bigint price from on-chain
 * @param exponent - Pyth exponent (defaults to -8)
 */
export function scalePrice(price: bigint, exponent: number = PYTH_PRICE_EXPONENT): number {
  return Number(price) * Math.pow(10, exponent)
}

/**
 * Format oracle confidence as a percentage of price.
 * @param confidence - Oracle confidence (bigint, scaled)
 * @param price - Price (bigint, scaled)
 * @returns Percentage string (e.g., "0.0500%")
 */
export function formatConfidencePercent(confidence: bigint, price: bigint): string {
  if (price === BigInt(0)) return '0.0000%'
  const pct = (Number(confidence) / Number(price)) * 100
  return `${pct.toFixed(4)}%`
}

/**
 * Format a Unix timestamp as a localized date/time string.
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted date string (e.g., "Mar 15, 10:05:00 AM EST")
 */
export function formatSettlementTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
}

/**
 * Get Solana Explorer URL for an address or transaction.
 * Uses FOGO testnet custom cluster configuration.
 * @param address - The address or transaction signature
 * @param type - 'address' for account view, 'tx' for transaction view
 * @returns Full explorer URL
 */
export function getExplorerUrl(address: string, type: 'address' | 'tx' = 'address'): string {
  const baseUrl = 'https://explorer.solana.com'
  const rpcParam = encodeURIComponent(FOGO_TESTNET_RPC)
  return `${baseUrl}/${type}/${address}?cluster=custom&customUrl=${rpcParam}`
}
