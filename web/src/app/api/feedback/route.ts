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

    // For non-admins, exclude unresolved critical issues at the query level
    // to avoid pagination gaps and data leaks.
    // Firestore doesn't support OR/!= natively, so we run two queries:
    //   1. All non-critical issues (with filters)
    //   2. Resolved critical issues (with filters)
    // For admins, a single query suffices.
    if (!isAdmin) {
      let nonCriticalQuery = db
        .collection('feedback')
        .where('category', '!=', 'critical')
        .orderBy('category')
        .orderBy('createdAt', 'desc') as FirebaseFirestore.Query

      let resolvedCriticalQuery = db
        .collection('feedback')
        .where('category', '==', 'critical')
        .where('status', '==', 'resolved')
        .orderBy('createdAt', 'desc') as FirebaseFirestore.Query

      if (category && VALID_CATEGORIES.includes(category as IssueCategory)) {
        if (category === 'critical') {
          // Non-admin filtering critical: only show resolved
          nonCriticalQuery = null as unknown as FirebaseFirestore.Query
          resolvedCriticalQuery = resolvedCriticalQuery // already filtered
        } else {
          // Non-critical category selected: no resolved-critical results needed
          nonCriticalQuery = db
            .collection('feedback')
            .where('category', '==', category)
            .orderBy('createdAt', 'desc') as FirebaseFirestore.Query
          resolvedCriticalQuery = null as unknown as FirebaseFirestore.Query
        }
      }

      if (status) {
        if (nonCriticalQuery) nonCriticalQuery = nonCriticalQuery.where('status', '==', status)
        if (resolvedCriticalQuery) {
          // resolved-critical already has status=='resolved', skip if conflicting
          if (status !== 'resolved') resolvedCriticalQuery = null as unknown as FirebaseFirestore.Query
        }
      }

      // Count totals
      const [nonCritCount, resolvedCritCount] = await Promise.all([
        nonCriticalQuery ? nonCriticalQuery.count().get() : Promise.resolve(null),
        resolvedCriticalQuery ? resolvedCriticalQuery.count().get() : Promise.resolve(null),
      ])
      const total =
        (nonCritCount?.data().count ?? 0) + (resolvedCritCount?.data().count ?? 0)

      // Fetch paginated results from both queries and merge by createdAt desc
      const [nonCritSnap, resolvedCritSnap] = await Promise.all([
        nonCriticalQuery
          ? nonCriticalQuery.offset(offset).limit(limit).get()
          : Promise.resolve(null),
        resolvedCriticalQuery
          ? resolvedCriticalQuery.offset(offset).limit(limit).get()
          : Promise.resolve(null),
      ])

      const allDocs = [
        ...(nonCritSnap?.docs ?? []),
        ...(resolvedCritSnap?.docs ?? []),
      ]
      // Sort merged results by createdAt descending, then take `limit` items
      const issues: FeedbackIssue[] = allDocs
        .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<FeedbackIssue, 'id'>) }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit)

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

    const issues: FeedbackIssue[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<FeedbackIssue, 'id'>),
    }))

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
