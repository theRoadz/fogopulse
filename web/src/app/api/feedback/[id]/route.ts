import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/firebase'
import { isAdminWallet } from '@/lib/admin'
import { verifyWalletSignature, validateSignedMessage } from '@/lib/verify-signature'
import type { FeedbackIssue, FeedbackReply, IssueStatus } from '@/types/feedback'

const VALID_STATUSES: IssueStatus[] = ['open', 'in-progress', 'resolved', 'wont-fix', 'closed']

/**
 * GET /api/feedback/[id] — Get single issue with replies.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const wallet = request.nextUrl.searchParams.get('wallet')
    const isAdmin = wallet ? isAdminWallet(wallet) : false

    const db = getDb()
    const doc = await db.collection('feedback').doc(id).get()

    if (!doc.exists) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const issue: FeedbackIssue = { id: doc.id, ...(doc.data() as Omit<FeedbackIssue, 'id'>) }

    // Hide critical issues from non-admins unless resolved
    if (!isAdmin && issue.category === 'critical' && issue.status !== 'resolved') {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    // Fetch replies
    const repliesSnapshot = await db
      .collection('feedback')
      .doc(id)
      .collection('replies')
      .orderBy('createdAt', 'asc')
      .limit(100)
      .get()

    const replies: FeedbackReply[] = repliesSnapshot.docs.map((replyDoc) => ({
      id: replyDoc.id,
      issueId: id,
      ...(replyDoc.data() as Omit<FeedbackReply, 'id' | 'issueId'>),
    }))

    return NextResponse.json({ issue, replies })
  } catch (err) {
    console.error('Feedback detail error:', err)
    return NextResponse.json({ error: 'Failed to fetch issue' }, { status: 500 })
  }
}

/**
 * PATCH /api/feedback/[id] — Update issue status (admin only).
 * Body: { status, walletAddress, signature, message }
 * Requires wallet signature to prove admin identity (prevents spoofing).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, walletAddress, signature, message } = body

    if (!walletAddress || !status || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify wallet ownership via Ed25519 signature
    const messageValidation = validateSignedMessage(message, 'feedback')
    if (!messageValidation.valid) {
      return NextResponse.json({ error: messageValidation.error }, { status: 400 })
    }

    if (!verifyWalletSignature(message, signature, walletAddress)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    if (!isAdminWallet(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const docRef = getDb().collection('feedback').doc(id)
    const doc = await docRef.get()

    if (!doc.exists) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const updateData: Record<string, string> = {
      status,
      updatedAt: new Date().toISOString(),
    }

    // Auto-unhide critical issues when resolved
    const issueData = doc.data()
    if (issueData?.category === 'critical' && status === 'resolved') {
      updateData.visibility = 'public'
    }

    await docRef.update(updateData)

    return NextResponse.json({ id, ...updateData })
  } catch (err) {
    console.error('Feedback update error:', err)
    return NextResponse.json({ error: 'Failed to update issue' }, { status: 500 })
  }
}

/**
 * DELETE /api/feedback/[id] — Delete an issue and all its replies.
 * Body: { walletAddress, signature, message }
 * Only the issue author or an admin can delete.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { walletAddress, signature, message } = body

    if (!walletAddress || !signature || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify signature
    const messageValidation = validateSignedMessage(message, 'delete')
    if (!messageValidation.valid) {
      return NextResponse.json({ error: messageValidation.error }, { status: 400 })
    }

    if (!verifyWalletSignature(message, signature, walletAddress)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const db = getDb()
    const docRef = db.collection('feedback').doc(id)
    const doc = await docRef.get()

    if (!doc.exists) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const issueData = doc.data()!

    // Only author or admin can delete
    if (issueData.walletAddress !== walletAddress && !isAdminWallet(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete all replies in the subcollection (chunked to respect Firestore 500-op batch limit)
    const repliesSnapshot = await docRef.collection('replies').get()
    const replyDocs = repliesSnapshot.docs
    const BATCH_SIZE = 500
    for (let i = 0; i < replyDocs.length; i += BATCH_SIZE) {
      const chunk = replyDocs.slice(i, i + BATCH_SIZE)
      const batch = db.batch()
      chunk.forEach((replyDoc) => {
        batch.delete(replyDoc.ref)
      })
      await batch.commit()
    }

    // Delete the issue document
    await docRef.delete()

    return NextResponse.json({ deleted: true, id })
  } catch (err) {
    console.error('Feedback delete error:', err)
    return NextResponse.json({ error: 'Failed to delete issue' }, { status: 500 })
  }
}
