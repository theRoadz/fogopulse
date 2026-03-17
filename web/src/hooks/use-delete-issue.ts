'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'

interface DeleteIssueInput {
  issueId: string
}

export function useDeleteIssue() {
  const { publicKey, signMessage } = useWallet()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: DeleteIssueInput) => {
      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected')
      }

      const timestamp = new Date().toISOString()
      const message = `FogoPulse Delete: ${input.issueId} at ${timestamp}`
      const messageBytes = new TextEncoder().encode(message)
      const signatureBytes = await signMessage(messageBytes)
      const signatureBase64 = Buffer.from(signatureBytes).toString('base64')

      const res = await fetch(`/api/feedback/${input.issueId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          signature: signatureBase64,
          message,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete issue')
      }

      return res.json()
    },
    onSuccess: () => {
      toast.success('Issue deleted')
      queryClient.invalidateQueries({ queryKey: ['feedback'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
