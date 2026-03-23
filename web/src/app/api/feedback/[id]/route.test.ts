/**
 * @jest-environment node
 */

// ── Mocks ──────────────────────────────────────────────────────────────

const mockDoc = {
  exists: true,
  id: 'issue-1',
  data: jest.fn().mockReturnValue({
    title: 'Test issue',
    category: 'bug',
    status: 'open',
    walletAddress: 'HkSz5Avhwn29eeK1fkBGeCtfo1L7uTwct4Wgu5bbfy9U',
    visibility: 'public',
    replyCount: 0,
    upvoteCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isAdmin: false,
  }),
}

const mockRepliesSnapshot = { docs: [] }

const mockDocRef = {
  get: jest.fn().mockResolvedValue(mockDoc),
  update: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  collection: jest.fn().mockReturnValue({
    orderBy: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockRepliesSnapshot),
      }),
    }),
    get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
  }),
}

jest.mock('@/lib/firebase', () => ({
  getDb: () => ({
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue(mockDocRef),
    }),
    batch: jest.fn().mockReturnValue({
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    }),
  }),
}))

jest.mock('@/lib/verify-signature', () => ({
  verifyWalletSignature: jest.fn().mockReturnValue(true),
  validateSignedMessage: jest.fn().mockReturnValue({ valid: true }),
}))

jest.mock('@/lib/admin', () => ({
  isAdminWallet: jest.fn().mockReturnValue(false),
}))

import { GET, PATCH, DELETE } from './route'
import { NextRequest } from 'next/server'
import { isAdminWallet } from '@/lib/admin'
import { verifyWalletSignature } from '@/lib/verify-signature'

const VALID_WALLET = 'HkSz5Avhwn29eeK1fkBGeCtfo1L7uTwct4Wgu5bbfy9U'
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/feedback/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDoc.exists = true
    mockDoc.data.mockReturnValue({
      title: 'Test issue',
      category: 'bug',
      status: 'open',
      walletAddress: VALID_WALLET,
      visibility: 'public',
      replyCount: 0,
      upvoteCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      isAdmin: false,
    })
  })

  it('should return issue with replies', async () => {
    const req = new NextRequest('http://localhost/api/feedback/issue-1')
    const res = await GET(req, makeParams('issue-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.issue.id).toBe('issue-1')
    expect(json.replies).toEqual([])
  })

  it('should return 404 for non-existent issue', async () => {
    mockDoc.exists = false
    const req = new NextRequest('http://localhost/api/feedback/missing')
    const res = await GET(req, makeParams('missing'))

    expect(res.status).toBe(404)
  })

  it('should hide critical unresolved issues from non-admins', async () => {
    mockDoc.data.mockReturnValue({
      title: 'Critical',
      category: 'critical',
      status: 'open',
      walletAddress: VALID_WALLET,
      visibility: 'hidden',
      replyCount: 0,
      upvoteCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      isAdmin: false,
    })

    const req = new NextRequest('http://localhost/api/feedback/crit-1')
    const res = await GET(req, makeParams('crit-1'))

    expect(res.status).toBe(404)
  })

  it('should show critical issues to admins', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(true)
    mockDoc.data.mockReturnValue({
      title: 'Critical',
      category: 'critical',
      status: 'open',
      walletAddress: VALID_WALLET,
      visibility: 'hidden',
      replyCount: 0,
      upvoteCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      isAdmin: false,
    })

    const req = new NextRequest(`http://localhost/api/feedback/crit-1?wallet=${VALID_WALLET}`)
    const res = await GET(req, makeParams('crit-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.issue.category).toBe('critical')
  })
})

describe('PATCH /api/feedback/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDoc.exists = true
    mockDoc.data.mockReturnValue({ category: 'bug', status: 'open' })
    ;(isAdminWallet as jest.Mock).mockReturnValue(true)
    ;(verifyWalletSignature as jest.Mock).mockReturnValue(true)
  })

  function makeRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost/api/feedback/issue-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  const validBody = {
    status: 'resolved',
    walletAddress: VALID_WALLET,
    signature: 'dGVzdA==',
    message: `FogoPulse Feedback: status resolved at ${new Date().toISOString()}`,
  }

  it('should update status for admin', async () => {
    const res = await PATCH(makeRequest(validBody), makeParams('issue-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.status).toBe('resolved')
  })

  it('should return 403 for non-admin', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(false)
    const res = await PATCH(makeRequest(validBody), makeParams('issue-1'))

    expect(res.status).toBe(403)
  })

  it('should return 401 for invalid signature', async () => {
    ;(verifyWalletSignature as jest.Mock).mockReturnValue(false)
    const res = await PATCH(makeRequest(validBody), makeParams('issue-1'))

    expect(res.status).toBe(401)
  })

  it('should return 400 for invalid status', async () => {
    const res = await PATCH(
      makeRequest({ ...validBody, status: 'invalid-status' }),
      makeParams('issue-1')
    )

    expect(res.status).toBe(400)
  })

  it('should auto-unhide critical issues when resolved', async () => {
    mockDoc.data.mockReturnValue({ category: 'critical', status: 'open' })
    const res = await PATCH(makeRequest(validBody), makeParams('issue-1'))
    const json = await res.json()

    expect(json.visibility).toBe('public')
  })
})

describe('DELETE /api/feedback/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDoc.exists = true
    mockDoc.data.mockReturnValue({
      walletAddress: VALID_WALLET,
      category: 'bug',
    })
    ;(verifyWalletSignature as jest.Mock).mockReturnValue(true)
    ;(isAdminWallet as jest.Mock).mockReturnValue(false)
  })

  function makeRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost/api/feedback/issue-1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  const validBody = {
    walletAddress: VALID_WALLET,
    signature: 'dGVzdA==',
    message: `FogoPulse Delete: issue-1 at ${new Date().toISOString()}`,
  }

  it('should allow author to delete', async () => {
    const res = await DELETE(makeRequest(validBody), makeParams('issue-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.deleted).toBe(true)
  })

  it('should allow admin to delete', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(true)
    mockDoc.data.mockReturnValue({
      walletAddress: 'other-wallet-address',
      category: 'bug',
    })

    const res = await DELETE(makeRequest(validBody), makeParams('issue-1'))
    expect(res.status).toBe(200)
  })

  it('should return 403 for non-author non-admin', async () => {
    mockDoc.data.mockReturnValue({
      walletAddress: 'other-wallet-address',
      category: 'bug',
    })

    const res = await DELETE(makeRequest(validBody), makeParams('issue-1'))
    expect(res.status).toBe(403)
  })

  it('should return 401 for invalid signature', async () => {
    ;(verifyWalletSignature as jest.Mock).mockReturnValue(false)
    const res = await DELETE(makeRequest(validBody), makeParams('issue-1'))

    expect(res.status).toBe(401)
  })

  it('should return 404 for non-existent issue', async () => {
    mockDoc.exists = false
    const res = await DELETE(makeRequest(validBody), makeParams('issue-1'))

    expect(res.status).toBe(404)
  })
})
