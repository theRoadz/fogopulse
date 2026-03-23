'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import { QUERY_KEYS } from '@/lib/constants'

interface UpvoteInput {
  issueId: string
}

export function useUpvote() {
  const { publicKey } = useWallet()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpvoteInput) => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      const res = await fetch(`/api/feedback/${input.issueId}/upvote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to toggle upvote')
      }

      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.feedbackDetail(variables.issueId),
      })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
