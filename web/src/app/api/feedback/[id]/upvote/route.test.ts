/**
 * @jest-environment node
 */

// ── Mocks ──────────────────────────────────────────────────────────────

const mockTxDoc = {
  exists: true,
  data: jest.fn().mockReturnValue({
    category: 'bug',
    status: 'open',
    upvoters: [],
    upvoteCount: 0,
  }),
}

const mockTxUpdate = jest.fn()
const mockDocRef = { id: 'issue-1' }

jest.mock('@/lib/firebase', () => ({
  getDb: () => ({
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue(mockDocRef),
    }),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: jest.fn().mockResolvedValue(mockTxDoc),
        update: mockTxUpdate,
      }
      return fn(tx)
    }),
  }),
}))

jest.mock('@/lib/admin', () => ({
  isAdminWallet: jest.fn().mockReturnValue(false),
}))

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: jest.fn((v: string) => `arrayUnion(${v})`),
    arrayRemove: jest.fn((v: string) => `arrayRemove(${v})`),
    increment: jest.fn((n: number) => `increment(${n})`),
  },
}))

// Mock @solana/web3.js PublicKey for wallet validation
jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn().mockImplementation((addr: string) => {
    if (addr === 'invalid') throw new Error('Invalid public key')
    return { toBase58: () => addr }
  }),
}))

import { POST } from './route'
import { NextRequest } from 'next/server'
import { isAdminWallet } from '@/lib/admin'

const VALID_WALLET = 'HkSz5Avhwn29eeK1fkBGeCtfo1L7uTwct4Wgu5bbfy9U'
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/feedback/issue-1/upvote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/feedback/[id]/upvote', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTxDoc.exists = true
    mockTxDoc.data.mockReturnValue({
      category: 'bug',
      status: 'open',
      upvoters: [],
      upvoteCount: 0,
    })
    ;(isAdminWallet as jest.Mock).mockReturnValue(false)
  })

  it('should upvote an issue', async () => {
    const res = await POST(makeRequest({ walletAddress: VALID_WALLET }), makeParams('issue-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.upvoted).toBe(true)
    expect(json.upvoteCount).toBe(1)
  })

  it('should remove upvote if already upvoted', async () => {
    mockTxDoc.data.mockReturnValue({
      category: 'bug',
      status: 'open',
      upvoters: [VALID_WALLET],
      upvoteCount: 1,
    })

    const res = await POST(makeRequest({ walletAddress: VALID_WALLET }), makeParams('issue-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.upvoted).toBe(false)
    expect(json.upvoteCount).toBe(0)
  })

  it('should return 400 for missing wallet', async () => {
    const res = await POST(makeRequest({}), makeParams('issue-1'))
    expect(res.status).toBe(400)
  })

  it('should return 400 for invalid wallet', async () => {
    const res = await POST(makeRequest({ walletAddress: 'invalid' }), makeParams('issue-1'))
    expect(res.status).toBe(400)
  })

  it('should return 404 for non-existent issue', async () => {
    mockTxDoc.exists = false
    const res = await POST(makeRequest({ walletAddress: VALID_WALLET }), makeParams('issue-1'))
    expect(res.status).toBe(404)
  })

  it('should return 404 for hidden critical issue when non-admin', async () => {
    mockTxDoc.data.mockReturnValue({
      category: 'critical',
      status: 'open',
      upvoters: [],
      upvoteCount: 0,
    })

    const res = await POST(makeRequest({ walletAddress: VALID_WALLET }), makeParams('issue-1'))
    expect(res.status).toBe(404)
  })

  it('should allow admin to upvote hidden critical issue', async () => {
    ;(isAdminWallet as jest.Mock).mockReturnValue(true)
    mockTxDoc.data.mockReturnValue({
      category: 'critical',
      status: 'open',
      upvoters: [],
      upvoteCount: 0,
    })

    const res = await POST(makeRequest({ walletAddress: VALID_WALLET }), makeParams('issue-1'))
    expect(res.status).toBe(200)
  })
})
