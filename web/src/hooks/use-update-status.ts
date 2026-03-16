'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import { QUERY_KEYS } from '@/lib/constants'
import type { IssueStatus } from '@/types/feedback'

interface UpdateStatusInput {
  issueId: string
  status: IssueStatus
}

export function useUpdateStatus() {
  const { publicKey, signMessage } = useWallet()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateStatusInput) => {
      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected')
      }

      // Sign message to prove admin wallet ownership
      const timestamp = new Date().toISOString()
      const message = `FogoPulse Feedback: status ${input.status} at ${timestamp}`
      const messageBytes = new TextEncoder().encode(message)
      const signatureBytes = await signMessage(messageBytes)
      const signatureBase64 = Buffer.from(signatureBytes).toString('base64')

      const res = await fetch(`/api/feedback/${input.issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: input.status,
          walletAddress: publicKey.toBase58(),
          signature: signatureBase64,
          message,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update status')
      }

      return res.json()
    },
    onSuccess: (_data, variables) => {
      toast.success(`Status updated to ${variables.status}`)
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.feedbackDetail(variables.issueId),
      })
      queryClient.invalidateQueries({ queryKey: ['feedback'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
