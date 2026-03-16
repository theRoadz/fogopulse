/**
 * @jest-environment node
 */

// ── Mocks ──────────────────────────────────────────────────────────────

// Firebase mock — use a factory that doesn't reference hoisted variables
const mockFirestore = {
  add: jest.fn(),
  get: jest.fn(),
  doc: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  offset: jest.fn(),
  limit: jest.fn(),
  count: jest.fn(),
  countGet: jest.fn(),
}

// Wire up chainable API
function resetChain() {
  const chain = mockFirestore
  chain.where.mockReturnValue(chain)
  chain.orderBy.mockReturnValue(chain)
  chain.offset.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.get.mockResolvedValue({ docs: [] })
  chain.count.mockReturnValue({ get: chain.countGet })
  chain.countGet.mockResolvedValue({ data: () => ({ count: 0 }) })
}

jest.mock('@/lib/firebase', () => ({
  getDb: () => ({
    collection: jest.fn().mockReturnValue(mockFirestore),
  }),
}))

jest.mock('@/lib/verify-signature', () => ({
  verifyWalletSignature: jest.fn().mockReturnValue(true),
  validateSignedMessage: jest.fn().mockReturnValue({ valid: true }),
}))

jest.mock('@/lib/admin', () => ({
  isAdminWallet: jest.fn().mockReturnValue(false),
}))

jest.mock('@/lib/feedback-constants', () => ({
  FEEDBACK_RATE_LIMIT: 5,
}))

import { GET, POST } from './route'
import { NextRequest } from 'next/server'
import { isAdminWallet } from '@/lib/admin'
import { verifyWalletSignature } from '@/lib/verify-signature'

const VALID_WALLET = 'HkSz5Avhwn29eeK1fkBGeCtfo1L7uTwct4Wgu5bbfy9U'

describe('GET /api/feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetChain()
  })

  it('should return empty list', async () => {
    const req = new NextRequest('http://localhost/api/feedback')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.issues).toEqual([])
    expect(json.total).toBe(0)
  })

  it('should return issues', async () => {
    const mockIssue = {
      id: 'test-1',
      data: () => ({
        title: 'Test issue',
        category: 'bug',
        status: 'open',
        walletAddress: VALID_WALLET,
        visibility: 'public',
        replyCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isAdmin: false,
      }),
    }
    mockFirestore.countGet.mockResolvedValue({ data: () => ({ count: 1 }) })
    mockFirestore.get.mockResolvedValue({ docs: [mockIssue] })

    const req = new NextRequest('http://localhost/api/feedback')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.issues).toHaveLength(1)
    expect(json.issues[0].title).toBe('Test issue')
  })

  it('should filter hidden criticals for non-admins', async () => {
    const mockCritical = {
      id: 'crit-1',
      data: () => ({
        title: 'Critical issue',
        category: 'critical',
        status: 'open',
        walletAddress: VALID_WALLET,
        visibility: 'hidden',
        replyCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isAdmin: false,
      }),
    }
    mockFirestore.countGet.mockResolvedValue({ data: () => ({ count: 1 }) })
    mockFirestore.get.mockResolvedValue({ docs: [mockCritical] })

    const req = new NextRequest('http://localhost/api/feedback')
    const res = await GET(req)
    const json = await res.json()

    expect(json.issues).toHaveLength(0)
  })

  it('should show hidden criticals for admins', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(true)
    const mockCritical = {
      id: 'crit-1',
      data: () => ({
        title: 'Critical issue',
        category: 'critical',
        status: 'open',
        walletAddress: VALID_WALLET,
        visibility: 'hidden',
        replyCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isAdmin: false,
      }),
    }
    mockFirestore.countGet.mockResolvedValue({ data: () => ({ count: 1 }) })
    mockFirestore.get.mockResolvedValue({ docs: [mockCritical] })

    const req = new NextRequest(`http://localhost/api/feedback?wallet=${VALID_WALLET}`)
    const res = await GET(req)
    const json = await res.json()

    expect(json.issues).toHaveLength(1)
  })
})

describe('POST /api/feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetChain()
    ;(verifyWalletSignature as jest.Mock).mockReturnValue(true)
    ;(isAdminWallet as jest.Mock).mockReturnValue(false)
    mockFirestore.add.mockResolvedValue({ id: 'new-issue-1' })
  })

  function makeRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  const validBody = {
    title: 'Test Issue',
    category: 'bug',
    description: 'A test bug report',
    walletAddress: VALID_WALLET,
    signature: 'dGVzdA==',
    message: `FogoPulse Feedback: Test Issue at ${new Date().toISOString()}`,
  }

  it('should create an issue', async () => {
    const res = await POST(makeRequest(validBody))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.id).toBe('new-issue-1')
    expect(json.title).toBe('Test Issue')
    expect(json.status).toBe('open')
  })

  it('should return 400 for missing fields', async () => {
    const res = await POST(makeRequest({ title: 'Only title' }))
    expect(res.status).toBe(400)
  })

  it('should return 400 for invalid category', async () => {
    const res = await POST(makeRequest({ ...validBody, category: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('should return 401 for invalid signature', async () => {
    ;(verifyWalletSignature as jest.Mock).mockReturnValue(false)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(401)
  })

  it('should return 429 when rate limited', async () => {
    mockFirestore.countGet.mockResolvedValue({ data: () => ({ count: 10 }) })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(429)
  })

  it('should auto-hide critical issues', async () => {
    const res = await POST(makeRequest({ ...validBody, category: 'critical' }))
    const json = await res.json()

    expect(json.visibility).toBe('hidden')
  })
})
