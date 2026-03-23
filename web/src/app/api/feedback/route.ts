import { NextRequest, NextResponse } from 'next/server'
import { getDb, getFieldPath } from '@/lib/firebase'
import { isAdminWallet } from '@/lib/admin'
import { verifyWalletSignature, validateSignedMessage } from '@/lib/verify-signature'
import { sanitizeInput } from '@/lib/feedback-utils'
import { FEEDBACK_RATE_LIMIT } from '@/lib/feedback-constants'
import type { IssueCategory, FeedbackIssue } from '@/types/feedback'

const VALID_CATEGORIES: IssueCategory[] = ['feedback', 'bug', 'critical', 'feature-request']

/**
 * GET /api/feedback — List issues with filtering.
 * Query params: category, status, cursor, cursorId, limit, wallet (for admin visibility)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const cursor = searchParams.get('cursor') // ISO timestamp for cursor-based pagination
    const cursorId = searchParams.get('cursorId') // document ID tiebreaker
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || '20')))
    const wallet = searchParams.get('wallet')

    const isAdmin = wallet ? isAdminWallet(wallet) : false

    const db = getDb()

    // Build base query — non-admins only see public issues
    // Use documentId as tiebreaker to prevent skipping docs with identical createdAt
    const FP = getFieldPath()
    let query = db.collection('feedback')
      .orderBy('createdAt', 'desc')
      .orderBy(FP.documentId(), 'desc') as FirebaseFirestore.Query

    if (!isAdmin) {
      query = query.where('visibility', '==', 'public')
    }

    if (category && VALID_CATEGORIES.includes(category as IssueCategory)) {
      query = query.where('category', '==', category)
    }

    if (status) {
      query = query.where('status', '==', status)
    }

    // Cursor-based pagination: use startAfter instead of offset
    let dataQuery = query
    if (cursor && cursorId) {
      dataQuery = dataQuery.startAfter(cursor, cursorId)
    } else if (cursor) {
      dataQuery = dataQuery.startAfter(cursor)
    }

    // Fetch limit+1 to determine hasMore without a separate count query
    const isFirstPage = !cursor
    const [snapshot, countSnapshot] = await Promise.all([
      dataQuery.limit(limit + 1).get(),
      // Only run count query on first page (for total display in UI)
      isFirstPage ? query.count().get() : Promise.resolve(null),
    ])

    const hasMore = snapshot.docs.length > limit
    const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs
    const total = countSnapshot ? countSnapshot.data().count : undefined

    const issues: FeedbackIssue[] = docs.map((doc) => {
      const { upvoters, ...rest } = doc.data() as Omit<FeedbackIssue, 'id'> & { upvoters?: string[] }
      return { id: doc.id, ...rest, upvoteCount: rest.upvoteCount || 0 }
    })

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null
    const nextCursor = lastDoc
      ? (lastDoc.data() as { createdAt: string }).createdAt
      : undefined
    const nextCursorId = lastDoc ? lastDoc.id : undefined

    return NextResponse.json({
      issues,
      ...(total !== undefined && { total }),
      limit,
      hasMore,
      nextCursor,
      nextCursorId,
    })
  } catch (err) {
    console.error('Feedback list error:', err)
    return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 })
  }
}

/**
 * POST /api/feedback — Create a new issue.
 * Body: { title, category, description, walletAddress, signature, message, timestamp }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, category, description, walletAddress, signature, message } = body

    // Validate required fields
    if (!title || !category || !description || !walletAddress || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    if (title.length > 200) {
      return NextResponse.json({ error: 'Title too long' }, { status: 400 })
    }

    if (description.length > 5000) {
      return NextResponse.json({ error: 'Description too long' }, { status: 400 })
    }

    // Validate message format and timestamp
    const messageValidation = validateSignedMessage(message, 'feedback')
    if (!messageValidation.valid) {
      return NextResponse.json({ error: messageValidation.error }, { status: 400 })
    }

    // Verify Ed25519 signature
    if (!verifyWalletSignature(message, signature, walletAddress)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Rate limiting: count issues from this wallet in the last hour
    const db = getDb()
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentIssues = await db
      .collection('feedback')
      .where('walletAddress', '==', walletAddress)
      .where('createdAt', '>=', oneHourAgo)
      .count()
      .get()

    if (recentIssues.data().count >= FEEDBACK_RATE_LIMIT) {
      return NextResponse.json(
        { error: 'Please slow down and try again later.' },
        { status: 429 }
      )
    }

    const now = new Date().toISOString()
    const isCritical = category === 'critical'
    const isAdmin = isAdminWallet(walletAddress)

    const issueData = {
      walletAddress,
      category,
      title: sanitizeInput(title),
      description: sanitizeInput(description),
      status: 'open' as const,
      visibility: isCritical ? ('hidden' as const) : ('public' as const),
      replyCount: 0,
      upvoteCount: 0,
      upvoters: [],
      createdAt: now,
      updatedAt: now,
      signature,
      isAdmin,
    }

    const docRef = await getDb().collection('feedback').add(issueData)

    return NextResponse.json({
      id: docRef.id,
      ...issueData,
    })
  } catch (err) {
    console.error('Feedback create error:', err)
    return NextResponse.json({ error: 'Failed to create feedback' }, { status: 500 })
  }
}
