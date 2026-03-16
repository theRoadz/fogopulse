/**
 * @jest-environment node
 */

jest.mock('@/lib/admin', () => ({
  isAdminWallet: jest.fn(),
}))

import { GET } from './route'
import { NextRequest } from 'next/server'
import { isAdminWallet } from '@/lib/admin'

describe('GET /api/feedback/admin-check', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return isAdmin: true for admin wallet', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(true)
    const req = new NextRequest('http://localhost/api/feedback/admin-check?wallet=admin123')
    const res = await GET(req)
    const json = await res.json()

    expect(json.isAdmin).toBe(true)
  })

  it('should return isAdmin: false for non-admin wallet', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(false)
    const req = new NextRequest('http://localhost/api/feedback/admin-check?wallet=user123')
    const res = await GET(req)
    const json = await res.json()

    expect(json.isAdmin).toBe(false)
  })

  it('should return isAdmin: false when wallet param is missing', async () => {
    const req = new NextRequest('http://localhost/api/feedback/admin-check')
    const res = await GET(req)
    const json = await res.json()

    expect(json.isAdmin).toBe(false)
  })
})
