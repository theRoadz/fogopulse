import { NextRequest, NextResponse } from 'next/server'

import { isAdminWallet } from '@/lib/admin'
import { getDb } from '@/lib/firebase'

const SETTINGS_COLLECTION = 'settings'
const ADMIN_DOC = 'admin'

const DEFAULTS = { allowEpochCreation: true, maintenanceMode: false }

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
      maintenanceMode: data.maintenanceMode ?? DEFAULTS.maintenanceMode,
      ...(data.maintenanceMessage ? { maintenanceMessage: data.maintenanceMessage } : {}),
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

    // Build update object from recognized fields with type validation
    const update: Record<string, unknown> = {}

    if ('allowEpochCreation' in body) {
      if (typeof body.allowEpochCreation !== 'boolean') {
        return NextResponse.json({ error: 'allowEpochCreation must be a boolean' }, { status: 400 })
      }
      update.allowEpochCreation = body.allowEpochCreation
    }

    if ('maintenanceMode' in body) {
      if (typeof body.maintenanceMode !== 'boolean') {
        return NextResponse.json({ error: 'maintenanceMode must be a boolean' }, { status: 400 })
      }
      update.maintenanceMode = body.maintenanceMode
    }

    if ('maintenanceMessage' in body) {
      if (body.maintenanceMessage !== null && typeof body.maintenanceMessage !== 'string') {
        return NextResponse.json({ error: 'maintenanceMessage must be a string or null' }, { status: 400 })
      }
      const msg = typeof body.maintenanceMessage === 'string' ? body.maintenanceMessage.trim() : ''
      if (msg.length > 500) {
        return NextResponse.json({ error: 'maintenanceMessage must be 500 characters or fewer' }, { status: 400 })
      }
      update.maintenanceMessage = msg
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
    }

    const db = getDb()
    await db.collection(SETTINGS_COLLECTION).doc(ADMIN_DOC).set(update, { merge: true })

    return NextResponse.json(update)
  } catch (error) {
    console.error('Failed to update admin settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
