'use client'

import { Bug, Lightbulb, MessageSquare, AlertTriangle, EyeOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatRelativeTime, truncateWallet } from '@/lib/feedback-utils'
import type { FeedbackIssue, IssueCategory, IssueStatus } from '@/types/feedback'

const CATEGORY_CONFIG: Record<IssueCategory, { label: string; icon: typeof Bug; className: string }> = {
  feedback: { label: 'Feedback', icon: MessageSquare, className: 'bg-blue-500/10 text-blue-500' },
  bug: { label: 'Bug', icon: Bug, className: 'bg-orange-500/10 text-orange-500' },
  critical: { label: 'Critical', icon: AlertTriangle, className: 'bg-red-500/10 text-red-500' },
  'feature-request': { label: 'Feature', icon: Lightbulb, className: 'bg-purple-500/10 text-purple-500' },
}

const STATUS_CONFIG: Record<IssueStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-muted text-muted-foreground' },
  'in-progress': { label: 'In Progress', className: 'bg-yellow-500/10 text-yellow-500' },
  resolved: { label: 'Resolved', className: 'bg-green-500/10 text-green-500' },
  'wont-fix': { label: "Won't Fix", className: 'bg-muted text-muted-foreground' },
}

interface FeedbackCardProps {
  issue: FeedbackIssue
  isAdmin?: boolean
  onClick: () => void
}

export function FeedbackCard({ issue, isAdmin, onClick }: FeedbackCardProps) {
  const category = CATEGORY_CONFIG[issue.category]
  const status = STATUS_CONFIG[issue.status]
  const CategoryIcon = category.icon

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border p-4 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('gap-1', category.className)}>
              <CategoryIcon className="h-3 w-3" />
              {category.label}
            </Badge>
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
            {isAdmin && issue.visibility === 'hidden' && (
              <Badge variant="outline" className="bg-red-500/10 text-red-500 gap-1">
                <EyeOff className="h-3 w-3" />
                Hidden from public
              </Badge>
            )}
            {issue.isAdmin && (
              <Badge variant="outline" className="bg-primary/10 text-primary">
                Admin
              </Badge>
            )}
          </div>
          <h3 className="font-medium truncate">{issue.title}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{truncateWallet(issue.walletAddress)}</span>
            <span>·</span>
            <span>{formatRelativeTime(issue.createdAt)}</span>
            <span>·</span>
            <span>{issue.replyCount} {issue.replyCount === 1 ? 'reply' : 'replies'}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

export { CATEGORY_CONFIG, STATUS_CONFIG }
