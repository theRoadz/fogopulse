/**
 * USDC Testnet Faucet API Route
 *
 * Server-side endpoint that mints test USDC to a wallet.
 * Holds the mint authority keypair securely on the server.
 *
 * GET  /api/faucet?wallet=<address>
 * Returns: { canMint: boolean }
 *
 * POST /api/faucet
 * Body: { wallet: string }
 * Returns: { signature: string } or { error: string }
 *
 * Rules:
 * - Cannot mint if wallet balance >= cap
 * - Mints 1000 USDC per request
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  getAccount,
  mintTo,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token'
import {
  USDC_MINT,
  USDC_DECIMALS,
  FAUCET_MINT_AMOUNT,
  FAUCET_BALANCE_CAP,
  FOGO_TESTNET_RPC,
} from '@/lib/constants'

function getMintAuthority(): Keypair {
  const keyJson = process.env.FAUCET_PRIVATE_KEY
  if (!keyJson) {
    throw new Error('FAUCET_PRIVATE_KEY not configured')
  }

  try {
    const secretKey = new Uint8Array(JSON.parse(keyJson))
    return Keypair.fromSecretKey(secretKey)
  } catch {
    throw new Error('FAUCET_PRIVATE_KEY is not a valid JSON byte array')
  }
}

async function getUsdcBalance(
  connection: Connection,
  wallet: PublicKey
): Promise<number> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, wallet)
  try {
    const account = await getAccount(connection, ata)
    return Number(account.amount) / 10 ** USDC_DECIMALS
  } catch (err) {
    if (
      err instanceof TokenAccountNotFoundError ||
      err instanceof TokenInvalidAccountOwnerError
    ) {
      return 0
    }
    throw err
  }
}

export async function GET(request: NextRequest) {
  try {
    const walletAddress = request.nextUrl.searchParams.get('wallet')

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Missing wallet query parameter' },
        { status: 400 }
      )
    }

    let walletPubkey: PublicKey
    try {
      walletPubkey = new PublicKey(walletAddress)
    } catch {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      )
    }

    const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
    const balance = await getUsdcBalance(connection, walletPubkey)

    return NextResponse.json({ canMint: balance < FAUCET_BALANCE_CAP })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Faucet status error:', message)
    // Default to allowing mint on error so the button isn't permanently disabled
    return NextResponse.json({ canMint: true })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Load mint authority
    let mintAuthority: Keypair
    try {
      mintAuthority = getMintAuthority()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Server configuration error'
      return NextResponse.json({ error: message }, { status: 500 })
    }

    // Parse request body
    const body = await request.json()
    const walletAddress = body.wallet

    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid wallet address' },
        { status: 400 }
      )
    }

    // Validate public key
    let walletPubkey: PublicKey
    try {
      walletPubkey = new PublicKey(walletAddress)
    } catch {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      )
    }

    const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')

    // Check current balance
    const balance = await getUsdcBalance(connection, walletPubkey)
    if (balance >= FAUCET_BALANCE_CAP) {
      return NextResponse.json(
        {
          error: 'You already have enough USDC to trade. Come back when you\'re running low.',
        },
        { status: 429 }
      )
    }

    // Ensure the wallet has an ATA (create if needed)
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      mintAuthority, // payer
      USDC_MINT,
      walletPubkey
    )

    // Mint USDC
    const mintAmount = FAUCET_MINT_AMOUNT * 10 ** USDC_DECIMALS
    const signature = await mintTo(
      connection,
      mintAuthority, // payer
      USDC_MINT,
      ata.address,
      mintAuthority, // mint authority
      mintAmount
    )

    return NextResponse.json({ signature })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Faucet error:', message)
    return NextResponse.json(
      { error: 'Failed to mint USDC', message },
      { status: 500 }
    )
  }
}
