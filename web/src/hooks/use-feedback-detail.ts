'use client'

import { useQuery } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { QUERY_KEYS } from '@/lib/constants'
import type { FeedbackDetailResponse } from '@/types/feedback'
import { useIsAdmin } from './use-is-admin'

export function useFeedbackDetail(id: string | null) {
  const { publicKey } = useWallet()
  const { isAdmin } = useIsAdmin()
  const wallet = publicKey?.toBase58()

  return useQuery({
    queryKey: QUERY_KEYS.feedbackDetail(id || ''),
    queryFn: async (): Promise<FeedbackDetailResponse> => {
      const params = new URLSearchParams()
      if (wallet && isAdmin) params.set('wallet', wallet)
      const res = await fetch(`/api/feedback/${id}?${params}`)
      if (!res.ok) throw new Error('Failed to fetch issue')
      return res.json()
    },
    enabled: !!id,
  })
}
