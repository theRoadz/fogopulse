'use client'

import { useQuery } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { QUERY_KEYS } from '@/lib/constants'

export function useIsAdmin() {
  const { publicKey } = useWallet()
  const wallet = publicKey?.toBase58()

  const { data } = useQuery({
    queryKey: QUERY_KEYS.feedbackAdminCheck(wallet),
    queryFn: async (): Promise<{ isAdmin: boolean }> => {
      const res = await fetch(`/api/feedback/admin-check?wallet=${wallet}`)
      if (!res.ok) return { isAdmin: false }
      return res.json()
    },
    enabled: !!wallet,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  return {
    isAdmin: data?.isAdmin ?? false,
  }
}
