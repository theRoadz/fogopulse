import { NextRequest, NextResponse } from 'next/server'
import { isAdminWallet } from '@/lib/admin'

/**
 * GET /api/feedback/admin-check?wallet=<address>
 * Returns { isAdmin: boolean }
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json({ isAdmin: false })
  }

  return NextResponse.json({ isAdmin: isAdminWallet(wallet) })
}
