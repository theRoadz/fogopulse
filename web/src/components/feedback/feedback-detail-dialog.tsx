'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, ArrowBigUp, Trash2 } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { formatRelativeTime, truncateWallet } from '@/lib/feedback-utils'
import { useFeedbackDetail } from '@/hooks/use-feedback-detail'
import { useUpdateStatus } from '@/hooks/use-update-status'
import { useUpvote } from '@/hooks/use-upvote'
import { useDeleteIssue } from '@/hooks/use-delete-issue'
import { ReplyThread } from './reply-thread'
import { ReplyForm } from './reply-form'
import { CATEGORY_CONFIG, STATUS_CONFIG } from './feedback-card'
import { cn } from '@/lib/utils'
import type { IssueStatus } from '@/types/feedback'

const ALL_STATUSES: IssueStatus[] = ['open', 'in-progress', 'resolved', 'wont-fix', 'closed']

interface FeedbackDetailDialogProps {
  issueId: string | null
  isAdmin: boolean
  onClose: () => void
}

export function FeedbackDetailDialog({ issueId, isAdmin, onClose }: FeedbackDetailDialogProps) {
  const { data, isLoading } = useFeedbackDetail(issueId)
  const { mutate: updateStatus, isPending: isUpdating } = useUpdateStatus()
  const { mutate: upvote, isPending: isUpvoting } = useUpvote()
  const { mutate: deleteIssue, isPending: isDeleting } = useDeleteIssue()
  const { publicKey } = useWallet()

  const issue = data?.issue
  const replies = data?.replies ?? []

  const walletAddress = publicKey?.toBase58()
  const hasUpvoted = walletAddress && issue?.upvoters?.includes(walletAddress)
  const canDelete = issue && walletAddress && (issue.walletAddress === walletAddress || isAdmin)

  const handleDelete = () => {
    if (!issue) return
    const confirmed = window.confirm(
      'Are you sure you want to delete this issue? This action cannot be undone. All replies will also be deleted.'
    )
    if (confirmed) {
      deleteIssue({ issueId: issue.id }, { onSuccess: onClose })
    }
  }

  return (
    <Dialog open={!!issueId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="pr-8">
              {isLoading ? <Skeleton className="h-6 w-48" /> : issue?.title}
            </DialogTitle>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                onClick={handleDelete}
                disabled={isDeleting}
                title="Delete issue"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : issue ? (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Issue metadata */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={CATEGORY_CONFIG[issue.category]?.className}
              >
                {CATEGORY_CONFIG[issue.category]?.label}
              </Badge>
              <Badge
                variant="outline"
                className={STATUS_CONFIG[issue.status]?.className}
              >
                {STATUS_CONFIG[issue.status]?.label}
              </Badge>
              {issue.isAdmin && (
                <Badge variant="outline" className="bg-primary/10 text-primary">
                  Admin
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                <span className="font-mono">{truncateWallet(issue.walletAddress)}</span>
                {' · '}
                {formatRelativeTime(issue.createdAt)}
              </span>
            </div>

            {/* Upvote + Admin controls row */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'gap-1.5',
                  hasUpvoted && 'bg-primary/10 text-primary border-primary/30'
                )}
                onClick={() => issue && upvote({ issueId: issue.id })}
                disabled={!walletAddress || isUpvoting}
                title={walletAddress ? (hasUpvoted ? 'Remove upvote' : 'Upvote') : 'Connect wallet to upvote'}
              >
                <ArrowBigUp className={cn('h-4 w-4', hasUpvoted && 'fill-current')} />
                {issue.upvoteCount || 0}
              </Button>

              {/* Admin status controls */}
              {isAdmin && (
                <>
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={isUpdating} className="gap-1">
                        {STATUS_CONFIG[issue.status]?.label}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {ALL_STATUSES.map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onClick={() => updateStatus({ issueId: issue.id, status: s })}
                          disabled={s === issue.status}
                        >
                          {STATUS_CONFIG[s].label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>

            {/* Description */}
            <div className="rounded-lg border p-4">
              <p className="text-sm whitespace-pre-wrap">{issue.description}</p>
            </div>

            <Separator />

            {/* Replies */}
            <div>
              <h4 className="text-sm font-medium mb-3">
                Replies ({replies.length})
              </h4>
              <ReplyThread replies={replies} />
            </div>

            <Separator />

            {/* Reply form */}
            <ReplyForm issueId={issue.id} isClosed={issue.status === 'closed'} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
