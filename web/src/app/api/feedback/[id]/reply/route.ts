import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase'
import { isAdminWallet } from '@/lib/admin'
import { verifyWalletSignature, validateSignedMessage } from '@/lib/verify-signature'
import { sanitizeInput } from '@/lib/feedback-utils'
import { FEEDBACK_REPLY_RATE_LIMIT } from '@/lib/feedback-constants'

/**
 * POST /api/feedback/[id]/reply — Create a reply on an issue.
 * Body: { content, walletAddress, signature, message }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { content, walletAddress, signature, message } = body

    // Validate required fields
    if (!content || !walletAddress || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (content.length > 2000) {
      return NextResponse.json({ error: 'Reply too long' }, { status: 400 })
    }

    // Validate message format and timestamp
    const messageValidation = validateSignedMessage(message, 'reply')
    if (!messageValidation.valid) {
      return NextResponse.json({ error: messageValidation.error }, { status: 400 })
    }

    // Verify Ed25519 signature
    if (!verifyWalletSignature(message, signature, walletAddress)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Check issue exists
    const db = getDb()
    const issueRef = db.collection('feedback').doc(id)
    const issueDoc = await issueRef.get()

    if (!issueDoc.exists) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    // Block replies on closed issues
    const issueData = issueDoc.data()!
    if (issueData.status === 'closed') {
      return NextResponse.json(
        { error: 'This issue is closed and no longer accepts replies.' },
        { status: 403 }
      )
    }

    // Rate limiting: count replies from this wallet in the last hour
    // Query across all reply subcollections for this wallet using a collection group query
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentReplies = await db
      .collectionGroup('replies')
      .where('walletAddress', '==', walletAddress)
      .where('createdAt', '>=', oneHourAgo)
      .count()
      .get()

    if (recentReplies.data().count >= FEEDBACK_REPLY_RATE_LIMIT) {
      return NextResponse.json(
        { error: 'Please slow down and try again later.' },
        { status: 429 }
      )
    }

    const now = new Date().toISOString()
    const isAdmin = isAdminWallet(walletAddress)

    const replyData = {
      walletAddress,
      content: sanitizeInput(content),
      isAdmin,
      createdAt: now,
      signature,
    }

    const replyRef = await issueRef.collection('replies').add(replyData)

    // Atomically increment reply count to avoid race conditions
    await issueRef.update({
      replyCount: FieldValue.increment(1),
      updatedAt: now,
    })

    return NextResponse.json({
      id: replyRef.id,
      issueId: id,
      ...replyData,
    })
  } catch (err) {
    console.error('Reply create error:', err)
    return NextResponse.json({ error: 'Failed to create reply' }, { status: 500 })
  }
}
