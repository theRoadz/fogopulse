/**
 * @jest-environment node
 */

const mockDoc = {
  exists: false,
  data: jest.fn(),
}

const mockDocRef = {
  get: jest.fn().mockResolvedValue(mockDoc),
  set: jest.fn().mockResolvedValue(undefined),
}

jest.mock('@/lib/firebase', () => ({
  getDb: () => ({
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue(mockDocRef),
    }),
  }),
}))

jest.mock('@/lib/admin', () => ({
  isAdminWallet: jest.fn(),
}))

import { GET, PATCH } from './route'
import { NextRequest } from 'next/server'
import { isAdminWallet } from '@/lib/admin'

describe('GET /api/admin-settings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDoc.exists = false
    mockDoc.data.mockReturnValue(undefined)
    mockDocRef.get.mockResolvedValue(mockDoc)
  })

  it('should return defaults when doc does not exist', async () => {
    const res = await GET()
    const json = await res.json()

    expect(json).toEqual({ allowEpochCreation: true })
  })

  it('should return stored value when doc exists', async () => {
    mockDoc.exists = true
    mockDoc.data.mockReturnValue({ allowEpochCreation: false })

    const res = await GET()
    const json = await res.json()

    expect(json).toEqual({ allowEpochCreation: false })
  })

  it('should default allowEpochCreation to true when field is missing', async () => {
    mockDoc.exists = true
    mockDoc.data.mockReturnValue({})

    const res = await GET()
    const json = await res.json()

    expect(json).toEqual({ allowEpochCreation: true })
  })

  it('should return 500 when Firestore throws', async () => {
    mockDocRef.get.mockRejectedValue(new Error('Firestore unavailable'))

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'Internal server error' })
  })
})

describe('PATCH /api/admin-settings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDocRef.set.mockResolvedValue(undefined)
  })

  it('should reject non-admin wallet with 403', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(false)
    const req = new NextRequest('http://localhost/api/admin-settings?wallet=user123', {
      method: 'PATCH',
      body: JSON.stringify({ allowEpochCreation: false }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(403)
  })

  it('should reject missing wallet with 403', async () => {
    const req = new NextRequest('http://localhost/api/admin-settings', {
      method: 'PATCH',
      body: JSON.stringify({ allowEpochCreation: false }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(403)
  })

  it('should reject invalid body with 400', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(true)
    const req = new NextRequest('http://localhost/api/admin-settings?wallet=admin123', {
      method: 'PATCH',
      body: JSON.stringify({ allowEpochCreation: 'not-a-boolean' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('should update setting for admin wallet', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(true)
    const req = new NextRequest('http://localhost/api/admin-settings?wallet=admin123', {
      method: 'PATCH',
      body: JSON.stringify({ allowEpochCreation: false }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ allowEpochCreation: false })
    expect(mockDocRef.set).toHaveBeenCalledWith(
      { allowEpochCreation: false },
      { merge: true },
    )
  })

  it('should return 500 when Firestore write throws', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(true)
    mockDocRef.set.mockRejectedValue(new Error('Firestore write failed'))
    const req = new NextRequest('http://localhost/api/admin-settings?wallet=admin123', {
      method: 'PATCH',
      body: JSON.stringify({ allowEpochCreation: false }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'Internal server error' })
  })
})
