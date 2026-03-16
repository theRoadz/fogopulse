export function formatRelativeTime(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function truncateWallet(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

/**
 * Strip HTML tags from user input to prevent XSS.
 */
export function sanitizeInput(input: string): string {
  return input.replace(/<[^>]*>/g, '')
}
