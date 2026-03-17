/**
 * @jest-environment node
 */

// ── Mocks ──────────────────────────────────────────────────────────────

const mockIssueDoc = {
  exists: true,
  data: jest.fn().mockReturnValue({ status: 'open' }),
}

const mockIssueRef = {
  get: jest.fn().mockResolvedValue(mockIssueDoc),
  update: jest.fn().mockResolvedValue(undefined),
  collection: jest.fn().mockReturnValue({
    add: jest.fn().mockResolvedValue({ id: 'reply-1' }),
  }),
}

const mockCountGet = jest.fn().mockResolvedValue({ data: () => ({ count: 0 }) })

jest.mock('@/lib/firebase', () => ({
  getDb: () => ({
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue(mockIssueRef),
    }),
    collectionGroup: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          count: jest.fn().mockReturnValue({ get: mockCountGet }),
        }),
      }),
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

jest.mock('@/lib/feedback-constants', () => ({
  FEEDBACK_REPLY_RATE_LIMIT: 20,
}))

// Must use FieldValue.increment in the route — mock it
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    increment: jest.fn((n: number) => `increment(${n})`),
  },
}))

import { POST } from './route'
import { NextRequest } from 'next/server'
import { verifyWalletSignature } from '@/lib/verify-signature'

const VALID_WALLET = 'HkSz5Avhwn29eeK1fkBGeCtfo1L7uTwct4Wgu5bbfy9U'
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/feedback/issue-1/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  content: 'This is a reply',
  walletAddress: VALID_WALLET,
  signature: 'dGVzdA==',
  message: `FogoPulse Reply: This is a reply at ${new Date().toISOString()}`,
}

describe('POST /api/feedback/[id]/reply', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIssueDoc.exists = true
    mockIssueDoc.data.mockReturnValue({ status: 'open' })
    ;(verifyWalletSignature as jest.Mock).mockReturnValue(true)
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) })
  })

  it('should create a reply', async () => {
    const res = await POST(makeRequest(validBody), makeParams('issue-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.id).toBe('reply-1')
    expect(json.issueId).toBe('issue-1')
  })

  it('should return 400 for missing fields', async () => {
    const res = await POST(
      makeRequest({ content: 'only content' }),
      makeParams('issue-1')
    )
    expect(res.status).toBe(400)
  })

  it('should return 400 for content too long', async () => {
    const res = await POST(
      makeRequest({ ...validBody, content: 'x'.repeat(2001) }),
      makeParams('issue-1')
    )
    expect(res.status).toBe(400)
  })

  it('should return 401 for invalid signature', async () => {
    ;(verifyWalletSignature as jest.Mock).mockReturnValue(false)
    const res = await POST(makeRequest(validBody), makeParams('issue-1'))
    expect(res.status).toBe(401)
  })

  it('should return 404 for non-existent issue', async () => {
    mockIssueDoc.exists = false
    const res = await POST(makeRequest(validBody), makeParams('issue-1'))
    expect(res.status).toBe(404)
  })

  it('should return 403 when issue is closed', async () => {
    mockIssueDoc.data.mockReturnValue({ status: 'closed' })
    const res = await POST(makeRequest(validBody), makeParams('issue-1'))
    expect(res.status).toBe(403)
  })

  it('should return 429 when rate limited', async () => {
    mockCountGet.mockResolvedValue({ data: () => ({ count: 25 }) })
    const res = await POST(makeRequest(validBody), makeParams('issue-1'))
    expect(res.status).toBe(429)
  })
})
