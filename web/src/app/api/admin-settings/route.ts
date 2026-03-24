import { NextRequest, NextResponse } from 'next/server'

import { isAdminWallet } from '@/lib/admin'
import { getDb } from '@/lib/firebase'

const SETTINGS_COLLECTION = 'settings'
const ADMIN_DOC = 'admin'

const DEFAULTS = { allowEpochCreation: true }

export async function GET() {
  try {
    const db = getDb()
    const doc = await db.collection(SETTINGS_COLLECTION).doc(ADMIN_DOC).get()

    const headers = { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' }

    if (!doc.exists) {
      return NextResponse.json(DEFAULTS, { headers })
    }

    const data = doc.data()!
    return NextResponse.json({
      allowEpochCreation: data.allowEpochCreation ?? DEFAULTS.allowEpochCreation,
    }, { headers })
  } catch (error) {
    console.error('Failed to fetch admin settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get('wallet')

    if (!wallet || !isAdminWallet(wallet)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    if (typeof body.allowEpochCreation !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid body: allowEpochCreation must be a boolean' },
        { status: 400 },
      )
    }

    const db = getDb()
    await db.collection(SETTINGS_COLLECTION).doc(ADMIN_DOC).set(
      { allowEpochCreation: body.allowEpochCreation },
      { merge: true },
    )

    return NextResponse.json({ allowEpochCreation: body.allowEpochCreation })
  } catch (error) {
    console.error('Failed to update admin settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
