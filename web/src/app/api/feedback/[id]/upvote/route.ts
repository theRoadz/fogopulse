import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/firebase'
import { PublicKey } from '@solana/web3.js'
import { FieldValue } from 'firebase-admin/firestore'
import { isAdminWallet } from '@/lib/admin'

function isValidWallet(address: string): boolean {
  try {
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}

/**
 * POST /api/feedback/[id]/upvote — Toggle upvote on an issue.
 * Body: { walletAddress }
 * No signature required (low-stakes, idempotent toggle).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { walletAddress } = body

    if (!walletAddress || !isValidWallet(walletAddress)) {
      return NextResponse.json({ error: 'Valid wallet address required' }, { status: 400 })
    }

    const db = getDb()
    const docRef = db.collection('feedback').doc(id)

    const result = await db.runTransaction(async (tx) => {
      const doc = await tx.get(docRef)
      if (!doc.exists) {
        throw new Error('NOT_FOUND')
      }

      const data = doc.data()!

      // Hidden issues (critical + unresolved) are invisible to non-admins
      if (data.category === 'critical' && data.status !== 'resolved' && !isAdminWallet(walletAddress)) {
        throw new Error('NOT_FOUND')
      }

      const upvoters: string[] = data.upvoters || []
      const alreadyUpvoted = upvoters.includes(walletAddress)

      if (alreadyUpvoted) {
        tx.update(docRef, {
          upvoters: FieldValue.arrayRemove(walletAddress),
          upvoteCount: FieldValue.increment(-1),
        })
        return { upvoted: false, upvoteCount: (data.upvoteCount || 0) - 1 }
      } else {
        tx.update(docRef, {
          upvoters: FieldValue.arrayUnion(walletAddress),
          upvoteCount: FieldValue.increment(1),
        })
        return { upvoted: true, upvoteCount: (data.upvoteCount || 0) + 1 }
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }
    console.error('Upvote error:', err)
    return NextResponse.json({ error: 'Failed to toggle upvote' }, { status: 500 })
  }
}
