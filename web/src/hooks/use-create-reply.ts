'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import { QUERY_KEYS } from '@/lib/constants'
import type { FeedbackReply } from '@/types/feedback'

interface CreateReplyInput {
  issueId: string
  content: string
}

export function useCreateReply() {
  const { publicKey, signMessage } = useWallet()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateReplyInput): Promise<FeedbackReply> => {
      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected')
      }

      const timestamp = new Date().toISOString()
      const message = `FogoPulse Reply: ${input.content.slice(0, 50)} at ${timestamp}`
      const messageBytes = new TextEncoder().encode(message)
      const signatureBytes = await signMessage(messageBytes)
      const signatureBase64 = Buffer.from(signatureBytes).toString('base64')

      const res = await fetch(`/api/feedback/${input.issueId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: input.content,
          walletAddress: publicKey.toBase58(),
          signature: signatureBase64,
          message,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create reply')
      }

      return res.json()
    },
    onSuccess: (_data, variables) => {
      toast.success('Reply posted')
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.feedbackDetail(variables.issueId),
      })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
