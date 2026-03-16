'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { WalletButton } from '@/components/wallet'
import { useCreateReply } from '@/hooks/use-create-reply'

interface ReplyFormProps {
  issueId: string
}

export function ReplyForm({ issueId }: ReplyFormProps) {
  const { connected } = useWallet()
  const { mutate: createReply, isPending } = useCreateReply()
  const [content, setContent] = useState('')

  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-4">
        <p className="text-sm text-muted-foreground">Connect your wallet to reply</p>
        <WalletButton />
      </div>
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return

    createReply(
      { issueId, content: content.trim() },
      { onSuccess: () => setContent('') }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        placeholder="Write a reply..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={2000}
        rows={3}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isPending || !content.trim()}>
          {isPending ? 'Signing...' : 'Reply'}
        </Button>
      </div>
    </form>
  )
}
