import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/firebase'
import { isAdminWallet } from '@/lib/admin'
import { verifyWalletSignature, validateSignedMessage } from '@/lib/verify-signature'
import { sanitizeInput } from '@/lib/feedback-utils'
import { FEEDBACK_RATE_LIMIT } from '@/lib/feedback-constants'
import type { IssueCategory, FeedbackIssue } from '@/types/feedback'

const VALID_CATEGORIES: IssueCategory[] = ['feedback', 'bug', 'critical', 'feature-request']

/**
 * GET /api/feedback — List issues with filtering.
 * Query params: category, status, page, limit, wallet (for admin visibility)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const page = Math.max(1, Number(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || '20')))
    const wallet = searchParams.get('wallet')

    const isAdmin = wallet ? isAdminWallet(wallet) : false

    const db = getDb()
    const offset = (page - 1) * limit

    // For non-admins, use the visibility field to exclude hidden issues
    // (unresolved critical issues are auto-set to visibility='hidden' on creation
    // and auto-set to visibility='public' on resolution). A single query on
    // visibility=='public' gives correct results with straightforward pagination.
    if (!isAdmin) {
      let query = db
        .collection('feedback')
        .where('visibility', '==', 'public')
        .orderBy('createdAt', 'desc') as FirebaseFirestore.Query

      if (category && VALID_CATEGORIES.includes(category as IssueCategory)) {
        query = query.where('category', '==', category)
      }

      if (status) {
        query = query.where('status', '==', status)
      }

      const countSnapshot = await query.count().get()
      const total = countSnapshot.data().count
      const snapshot = await query.offset(offset).limit(limit).get()

      const issues: FeedbackIssue[] = snapshot.docs.map((doc) => {
        const { upvoters, ...rest } = doc.data() as Omit<FeedbackIssue, 'id'> & { upvoters?: string[] }
        return { id: doc.id, ...rest, upvoteCount: rest.upvoteCount || 0 }
      })

      return NextResponse.json({
        issues,
        total,
        page,
        limit,
        hasMore: offset + limit < total,
      })
    }

    // Admin path: single query, no filtering needed
    let query = db.collection('feedback').orderBy('createdAt', 'desc') as FirebaseFirestore.Query

    if (category && VALID_CATEGORIES.includes(category as IssueCategory)) {
      query = query.where('category', '==', category)
    }

    if (status) {
      query = query.where('status', '==', status)
    }

    const countSnapshot = await query.count().get()
    const total = countSnapshot.data().count
    const snapshot = await query.offset(offset).limit(limit).get()

    const issues: FeedbackIssue[] = snapshot.docs.map((doc) => {
      const { upvoters, ...rest } = doc.data() as Omit<FeedbackIssue, 'id'> & { upvoters?: string[] }
      return { id: doc.id, ...rest, upvoteCount: rest.upvoteCount || 0 }
    })

    return NextResponse.json({
      issues,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
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
