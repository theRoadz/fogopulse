/**
 * @jest-environment node
 */

// ── Mocks must be declared before imports ──────────────────────────────
const mockGetAssociatedTokenAddress = jest.fn()
const mockGetAccount = jest.fn()
const mockMintTo = jest.fn()
const mockGetOrCreateAssociatedTokenAccount = jest.fn()

jest.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddress: (...args: unknown[]) => mockGetAssociatedTokenAddress(...args),
  getAccount: (...args: unknown[]) => mockGetAccount(...args),
  mintTo: (...args: unknown[]) => mockMintTo(...args),
  getOrCreateAssociatedTokenAccount: (...args: unknown[]) =>
    mockGetOrCreateAssociatedTokenAccount(...args),
  TokenAccountNotFoundError: class TokenAccountNotFoundError extends Error {
    name = 'TokenAccountNotFoundError'
  },
  TokenInvalidAccountOwnerError: class TokenInvalidAccountOwnerError extends Error {
    name = 'TokenInvalidAccountOwnerError'
  },
}))

jest.mock('@solana/web3.js', () => {
  const original = jest.requireActual('@solana/web3.js')
  return {
    ...original,
    Connection: jest.fn().mockImplementation(() => ({})),
    Keypair: {
      fromSecretKey: jest.fn().mockReturnValue({ publicKey: 'MockMintAuthority' }),
    },
  }
})

import { GET, POST } from './route'
import { NextRequest } from 'next/server'
import { FAUCET_BALANCE_CAP, FAUCET_MINT_AMOUNT, USDC_DECIMALS } from '@/lib/constants'

// ── Helpers ────────────────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/faucet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// A valid 64-byte key (all zeros) — Keypair.fromSecretKey accepts any 64 bytes
const VALID_KEY_JSON = JSON.stringify(Array.from({ length: 64 }, () => 0))
const VALID_WALLET = '11111111111111111111111111111111'
const MOCK_ATA = { address: 'MockATAAddress' }
const MOCK_SIGNATURE = 'txSig123'

// ── Tests ──────────────────────────────────────────────────────────────
describe('POST /api/faucet', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, FAUCET_PRIVATE_KEY: VALID_KEY_JSON }

    // Happy-path defaults
    mockGetAssociatedTokenAddress.mockResolvedValue('MockATAAddress')
    mockGetAccount.mockResolvedValue({ amount: BigInt(0) })
    mockGetOrCreateAssociatedTokenAccount.mockResolvedValue(MOCK_ATA)
    mockMintTo.mockResolvedValue(MOCK_SIGNATURE)
  })

  afterAll(() => {
    process.env = originalEnv
  })

  // ── Success path ───────────────────────────────────────────────────
  it('should mint USDC and return signature on success', async () => {
    const res = await POST(makeRequest({ wallet: VALID_WALLET }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.signature).toBe(MOCK_SIGNATURE)
    expect(mockMintTo).toHaveBeenCalledTimes(1)

    // Verify mint amount is correct (1000 * 10^6)
    const mintAmountArg = mockMintTo.mock.calls[0][5]
    expect(mintAmountArg).toBe(FAUCET_MINT_AMOUNT * 10 ** USDC_DECIMALS)
  })

  it('should create ATA if it does not exist', async () => {
    const res = await POST(makeRequest({ wallet: VALID_WALLET }))

    expect(res.status).toBe(200)
    expect(mockGetOrCreateAssociatedTokenAccount).toHaveBeenCalledTimes(1)
  })

  // ── Balance cap enforcement ────────────────────────────────────────
  it('should return 429 when balance equals cap', async () => {
    mockGetAccount.mockResolvedValue({
      amount: BigInt(FAUCET_BALANCE_CAP * 10 ** USDC_DECIMALS),
    })

    const res = await POST(makeRequest({ wallet: VALID_WALLET }))
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.error).toContain('enough USDC')
    expect(mockMintTo).not.toHaveBeenCalled()
  })

  it('should return 429 when balance exceeds cap', async () => {
    mockGetAccount.mockResolvedValue({
      amount: BigInt(1000 * 10 ** USDC_DECIMALS),
    })

    const res = await POST(makeRequest({ wallet: VALID_WALLET }))

    expect(res.status).toBe(429)
    expect(mockMintTo).not.toHaveBeenCalled()
  })

  it('should allow minting when balance is below cap', async () => {
    mockGetAccount.mockResolvedValue({
      amount: BigInt(100 * 10 ** USDC_DECIMALS),
    })

    const res = await POST(makeRequest({ wallet: VALID_WALLET }))

    expect(res.status).toBe(200)
    expect(mockMintTo).toHaveBeenCalledTimes(1)
  })

  // ── TokenAccountNotFoundError → treat as zero balance ──────────────
  it('should treat TokenAccountNotFoundError as zero balance and mint', async () => {
    const { TokenAccountNotFoundError } = jest.requireMock('@solana/spl-token')
    mockGetAccount.mockRejectedValue(new TokenAccountNotFoundError())

    const res = await POST(makeRequest({ wallet: VALID_WALLET }))

    expect(res.status).toBe(200)
    expect(mockMintTo).toHaveBeenCalledTimes(1)
  })

  // ── TokenInvalidAccountOwnerError → treat as zero balance ──────────
  it('should treat TokenInvalidAccountOwnerError as zero balance and mint', async () => {
    const { TokenInvalidAccountOwnerError } = jest.requireMock('@solana/spl-token')
    mockGetAccount.mockRejectedValue(new TokenInvalidAccountOwnerError())

    const res = await POST(makeRequest({ wallet: VALID_WALLET }))

    expect(res.status).toBe(200)
    expect(mockMintTo).toHaveBeenCalledTimes(1)
  })

  // ── Input validation ───────────────────────────────────────────────
  it('should return 400 for missing wallet', async () => {
    const res = await POST(makeRequest({}))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Missing')
  })

  it('should return 400 for invalid wallet address', async () => {
    const res = await POST(makeRequest({ wallet: 'not-a-pubkey!!!' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Invalid wallet')
  })

  // ── Server config errors ───────────────────────────────────────────
  it('should return 500 when FAUCET_PRIVATE_KEY is missing', async () => {
    delete process.env.FAUCET_PRIVATE_KEY

    const res = await POST(makeRequest({ wallet: VALID_WALLET }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('FAUCET_PRIVATE_KEY')
  })

  it('should return 500 when FAUCET_PRIVATE_KEY is invalid JSON', async () => {
    process.env.FAUCET_PRIVATE_KEY = 'not-json'

    const res = await POST(makeRequest({ wallet: VALID_WALLET }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('not a valid JSON')
  })

  // ── Downstream failure ─────────────────────────────────────────────
  it('should return 500 when mintTo fails', async () => {
    mockMintTo.mockRejectedValue(new Error('Transaction failed'))

    const res = await POST(makeRequest({ wallet: VALID_WALLET }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to mint USDC')
  })
})

// ── GET /api/faucet ────────────────────────────────────────────────────
describe('GET /api/faucet', () => {
  function makeGetRequest(wallet?: string): NextRequest {
    const url = wallet
      ? `http://localhost/api/faucet?wallet=${wallet}`
      : 'http://localhost/api/faucet'
    return new NextRequest(url, { method: 'GET' })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAssociatedTokenAddress.mockResolvedValue('MockATAAddress')
    mockGetAccount.mockResolvedValue({ amount: BigInt(0) })
  })

  it('should return canMint: true when balance is below cap', async () => {
    mockGetAccount.mockResolvedValue({ amount: BigInt(100 * 10 ** USDC_DECIMALS) })

    const res = await GET(makeGetRequest(VALID_WALLET))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.canMint).toBe(true)
  })

  it('should return canMint: false when balance equals cap', async () => {
    mockGetAccount.mockResolvedValue({
      amount: BigInt(FAUCET_BALANCE_CAP * 10 ** USDC_DECIMALS),
    })

    const res = await GET(makeGetRequest(VALID_WALLET))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.canMint).toBe(false)
  })

  it('should return canMint: false when balance exceeds cap', async () => {
    mockGetAccount.mockResolvedValue({
      amount: BigInt(1000 * 10 ** USDC_DECIMALS),
    })

    const res = await GET(makeGetRequest(VALID_WALLET))
    const json = await res.json()

    expect(json.canMint).toBe(false)
  })

  it('should return 400 when wallet param is missing', async () => {
    const res = await GET(makeGetRequest())
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Missing wallet')
  })

  it('should return 400 for invalid wallet address', async () => {
    const res = await GET(makeGetRequest('not-valid!!!'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Invalid wallet')
  })

  it('should default to canMint: true on unexpected error', async () => {
    mockGetAccount.mockRejectedValue(new Error('RPC down'))
    // getUsdcBalance will re-throw non-token errors, caught by outer try
    const res = await GET(makeGetRequest(VALID_WALLET))
    const json = await res.json()

    expect(json.canMint).toBe(true)
  })
})
