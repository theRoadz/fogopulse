'use client'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatRelativeTime, truncateWallet } from '@/lib/feedback-utils'
import type { FeedbackReply } from '@/types/feedback'

interface ReplyThreadProps {
  replies: FeedbackReply[]
}

export function ReplyThread({ replies }: ReplyThreadProps) {
  if (replies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No replies yet. Be the first to respond.
      </p>
    )
  }

  return (
    <div className="space-y-0">
      {replies.map((reply, index) => (
        <div key={reply.id}>
          {index > 0 && <Separator />}
          <div className="py-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{truncateWallet(reply.walletAddress)}</span>
              {reply.isAdmin && (
                <Badge variant="outline" className="bg-primary/10 text-primary text-[10px] px-1.5 py-0">
                  Admin
                </Badge>
              )}
              <span>·</span>
              <span>{formatRelativeTime(reply.createdAt)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
