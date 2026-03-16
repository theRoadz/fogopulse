'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import type { IssueCategory, FeedbackIssue } from '@/types/feedback'

interface CreateFeedbackInput {
  title: string
  category: IssueCategory
  description: string
}

export function useCreateFeedback() {
  const { publicKey, signMessage } = useWallet()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateFeedbackInput): Promise<FeedbackIssue> => {
      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected')
      }

      const timestamp = new Date().toISOString()
      const message = `FogoPulse Feedback: ${input.title} at ${timestamp}`
      const messageBytes = new TextEncoder().encode(message)
      const signatureBytes = await signMessage(messageBytes)
      const signatureBase64 = Buffer.from(signatureBytes).toString('base64')

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          walletAddress: publicKey.toBase58(),
          signature: signatureBase64,
          message,
          timestamp,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create feedback')
      }

      return res.json()
    },
    onSuccess: () => {
      toast.success('Feedback submitted successfully')
      queryClient.invalidateQueries({ queryKey: ['feedback'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
