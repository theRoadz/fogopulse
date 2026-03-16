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
import { ChevronDown } from 'lucide-react'
import { formatRelativeTime, truncateWallet } from '@/lib/feedback-utils'
import { useFeedbackDetail } from '@/hooks/use-feedback-detail'
import { useUpdateStatus } from '@/hooks/use-update-status'
import { ReplyThread } from './reply-thread'
import { ReplyForm } from './reply-form'
import { CATEGORY_CONFIG, STATUS_CONFIG } from './feedback-card'
import type { IssueStatus } from '@/types/feedback'

const ALL_STATUSES: IssueStatus[] = ['open', 'in-progress', 'resolved', 'wont-fix']

interface FeedbackDetailDialogProps {
  issueId: string | null
  isAdmin: boolean
  onClose: () => void
}

export function FeedbackDetailDialog({ issueId, isAdmin, onClose }: FeedbackDetailDialogProps) {
  const { data, isLoading } = useFeedbackDetail(issueId)
  const { mutate: updateStatus, isPending: isUpdating } = useUpdateStatus()

  const issue = data?.issue
  const replies = data?.replies ?? []

  return (
    <Dialog open={!!issueId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {isLoading ? <Skeleton className="h-6 w-48" /> : issue?.title}
          </DialogTitle>
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

            {/* Admin status controls */}
            {isAdmin && (
              <div className="flex items-center gap-2">
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
              </div>
            )}

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
            <ReplyForm issueId={issue.id} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
