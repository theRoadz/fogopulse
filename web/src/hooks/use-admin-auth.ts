'use client'

import { useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

import { useGlobalConfig } from '@/hooks/use-global-config'

interface UseAdminAuthResult {
  isAdmin: boolean
  isLoading: boolean
  isConnected: boolean
}

/**
 * On-chain admin auth hook. Compares connected wallet against GlobalConfig.admin.
 * Use ONLY inside /admin page — NOT in AppHeader (use useIsAdmin for nav visibility).
 */
export function useAdminAuth(): UseAdminAuthResult {
  const { publicKey } = useWallet()
  const { config, isLoading: configLoading } = useGlobalConfig()

  const isAdmin = useMemo(() => {
    if (!publicKey || !config) return false
    return publicKey.equals(config.admin)
  }, [publicKey, config])

  return {
    isAdmin,
    isLoading: configLoading,
    isConnected: !!publicKey,
  }
}
