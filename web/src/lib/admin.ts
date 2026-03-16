/**
 * Check if a wallet address is in the ADMIN_WALLETS env var.
 * Server-side only — never import in 'use client' components.
 */
export function isAdminWallet(address: string): boolean {
  const adminWallets = process.env.ADMIN_WALLETS || ''
  return adminWallets
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
    .includes(address)
}
