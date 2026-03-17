export type IssueCategory = 'feedback' | 'bug' | 'critical' | 'feature-request'
export type IssueStatus = 'open' | 'in-progress' | 'resolved' | 'wont-fix' | 'closed'

export interface FeedbackIssue {
  id: string
  walletAddress: string
  category: IssueCategory
  title: string
  description: string
  status: IssueStatus
  visibility: 'public' | 'hidden'
  replyCount: number
  upvoteCount: number
  upvoters?: string[] // wallet addresses; only present in detail response
  createdAt: string // ISO 8601
  updatedAt: string
  isAdmin: boolean // Whether poster is an admin wallet
}

export interface FeedbackReply {
  id: string
  issueId: string
  walletAddress: string
  content: string
  isAdmin: boolean
  createdAt: string
}

export interface FeedbackListResponse {
  issues: FeedbackIssue[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface FeedbackDetailResponse {
  issue: FeedbackIssue
  replies: FeedbackReply[]
}
