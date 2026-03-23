'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { QUERY_KEYS } from '@/lib/constants'
import type { FeedbackListResponse, IssueCategory, IssueStatus } from '@/types/feedback'
import { useIsAdmin } from './use-is-admin'

export interface FeedbackFilters {
  category?: IssueCategory | 'all'
  status?: IssueStatus | 'all'
  limit?: number
}

export function useFeedbackList(filters: FeedbackFilters = {}) {
  const { publicKey } = useWallet()
  const { isAdmin } = useIsAdmin()
  const wallet = publicKey?.toBase58()

  const baseFilters: Record<string, string> = {}
  if (filters.category && filters.category !== 'all') baseFilters.category = filters.category
  if (filters.status && filters.status !== 'all') baseFilters.status = filters.status
  if (filters.limit) baseFilters.limit = String(filters.limit)
  if (wallet && isAdmin) baseFilters.wallet = wallet

  return useInfiniteQuery({
    queryKey: QUERY_KEYS.feedback(baseFilters),
    queryFn: async ({ pageParam }): Promise<FeedbackListResponse> => {
      const params = new URLSearchParams(baseFilters)
      if (pageParam) {
        params.set('cursor', pageParam.cursor)
        params.set('cursorId', pageParam.cursorId)
      }
      const res = await fetch(`/api/feedback?${params}`)
      if (!res.ok) throw new Error('Failed to fetch feedback')
      return res.json()
    },
    initialPageParam: undefined as { cursor: string; cursorId: string } | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || !lastPage.nextCursor || !lastPage.nextCursorId) return undefined
      return { cursor: lastPage.nextCursor, cursorId: lastPage.nextCursorId }
    },
  })
}
