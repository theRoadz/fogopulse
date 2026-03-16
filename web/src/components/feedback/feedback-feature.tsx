'use client'

import { useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronDown } from 'lucide-react'
import { useFeedbackList, type FeedbackFilters } from '@/hooks/use-feedback-list'
import { useIsAdmin } from '@/hooks/use-is-admin'
import { FeedbackCard } from './feedback-card'
import { CreateFeedbackDialog } from './create-feedback-dialog'
import { FeedbackDetailDialog } from './feedback-detail-dialog'
import type { IssueCategory, IssueStatus } from '@/types/feedback'

const CATEGORY_TABS: { value: IssueCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'bug', label: 'Bug' },
  { value: 'critical', label: 'Critical' },
  { value: 'feature-request', label: 'Feature' },
]

const STATUS_OPTIONS: { value: IssueStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont-fix', label: "Won't Fix" },
]

export function FeedbackFeature() {
  const [filters, setFilters] = useState<FeedbackFilters>({
    category: 'all',
    status: 'all',
  })
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useFeedbackList(filters)
  const { isAdmin } = useIsAdmin()

  const statusLabel = STATUS_OPTIONS.find((s) => s.value === (filters.status || 'all'))?.label || 'All Statuses'

  // Flatten all pages into a single list
  const issues = data?.pages.flatMap((page) => page.issues) ?? []

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <MessageSquareText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Community Feedback</h1>
            <p className="text-sm text-muted-foreground">
              Report bugs, suggest features, and track issues
            </p>
          </div>
        </div>
        <CreateFeedbackDialog />
      </div>

      {/* Category tabs */}
      <Tabs
        value={filters.category || 'all'}
        onValueChange={(value) =>
          setFilters({ ...filters, category: value as IssueCategory | 'all' })
        }
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            {CATEGORY_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Status filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                {statusLabel}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() =>
                    setFilters({ ...filters, status: opt.value as IssueStatus | 'all' })
                  }
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Tabs>

      {/* Issue list */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))
        ) : !issues.length ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <MessageSquareText className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No feedback yet. Be the first to share!
            </p>
          </div>
        ) : (
          <>
            {issues.map((issue) => (
              <FeedbackCard
                key={issue.id}
                issue={issue}
                isAdmin={isAdmin}
                onClick={() => setSelectedIssueId(issue.id)}
              />
            ))}

            {/* Load more */}
            {hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail dialog */}
      <FeedbackDetailDialog
        issueId={selectedIssueId}
        isAdmin={isAdmin}
        onClose={() => setSelectedIssueId(null)}
      />
    </div>
  )
}
