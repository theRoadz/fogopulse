/**
 * Mint Test USDC Tokens (Admin Only)
 *
 * Mints test USDC tokens to a specified wallet for testing buy_position transactions.
 * Uses the FOGO Testnet USDC mint.
 *
 * Usage:
 *   npx tsx scripts/mint-test-usdc.ts <recipient_wallet> [amount_in_usdc]
 *   npx tsx scripts/mint-test-usdc.ts --self [--amount <amount>]
 *
 * Examples:
 *   npx tsx scripts/mint-test-usdc.ts BKUyNjHLDNQSqeWtQ5R9vLCmfvjzPLe1bM5pLfCqvwJM 1000
 *   npx tsx scripts/mint-test-usdc.ts --self --amount 50000
 *   npx tsx scripts/mint-test-usdc.ts --self
 *
 * Prerequisites:
 *   1. Wallet must be the USDC mint authority
 *
 * Environment (via .env file or environment variables):
 *   WALLET_PATH - Path to wallet keypair (default: ~/.config/solana/fogo-testnet.json)
 *
 * @see Story 2.4+: Test buy_position from Frontend
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv'
import * as path from 'path'

// Try multiple .env locations
dotenv.config({ path: path.resolve(__dirname, '../.env') })  // anchor/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') })  // project root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })  // project root .env.local

import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getMint,
} from '@solana/spl-token'
import * as fs from 'fs'
import * as os from 'os'

// =============================================================================
// CONSTANTS
// =============================================================================

const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'

// USDC mint on FOGO Testnet
const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')
const USDC_DECIMALS = 6

// Default amount to mint (in USDC)
const DEFAULT_AMOUNT_USDC = 10000 // $10,000

// =============================================================================
// HELPERS
// =============================================================================

function loadWallet(): Keypair {
  const walletPath = process.env.WALLET_PATH ||
    path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')

  console.log('Loading wallet from:', walletPath)

  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'))
  return Keypair.fromSecretKey(Uint8Array.from(secretKey))
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('============================================================')
  console.log('FOGO Pulse - Mint Test USDC')
  console.log('============================================================')
  console.log()
  console.log('WARNING: This is TEST USDC with no real value!')
  console.log()

  // Parse args
  const args = process.argv.slice(2)
  let recipient: PublicKey | 'self' | undefined
  let amount: number = DEFAULT_AMOUNT_USDC

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--self') {
      recipient = 'self'
    } else if (args[i] === '--amount' && args[i + 1]) {
      amount = parseFloat(args[i + 1])
      if (isNaN(amount) || amount <= 0) {
        console.error(`Invalid amount: ${args[i + 1]}. Must be a positive number.`)
        process.exit(1)
      }
      i++
    } else if (!recipient && !args[i].startsWith('--')) {
      // First non-flag argument is recipient
      try {
        recipient = new PublicKey(args[i])
      } catch {
        console.error(`Invalid recipient address: ${args[i]}`)
        process.exit(1)
      }
    } else if (recipient && !args[i].startsWith('--')) {
      // Second non-flag argument is amount (legacy positional syntax)
      amount = parseFloat(args[i])
      if (isNaN(amount) || amount <= 0) {
        console.error(`Invalid amount: ${args[i]}. Must be a positive number.`)
        process.exit(1)
      }
    }
  }

  if (!recipient) {
    console.log('Usage: npx tsx scripts/mint-test-usdc.ts <recipient_wallet> [amount]')
    console.log('       npx tsx scripts/mint-test-usdc.ts --self [--amount <amount>]')
    console.log('')
    console.log('Options:')
    console.log('  --self              Mint to your own wallet')
    console.log('  --amount <amount>   Amount in USDC (default: 10000)')
    console.log('')
    console.log('Examples:')
    console.log('  npx tsx scripts/mint-test-usdc.ts BKUyNjHLDNQSqeWtQ5R9vLCmfvjzPLe1bM5pLfCqvwJM 1000')
    console.log('  npx tsx scripts/mint-test-usdc.ts --self --amount 50000')
    console.log('  npx tsx scripts/mint-test-usdc.ts --self')
    process.exit(1)
  }

  // Load wallet
  const wallet = loadWallet()
  const recipientPubkey = recipient === 'self' ? wallet.publicKey : recipient
  const amountLamports = BigInt(Math.floor(amount * 10 ** USDC_DECIMALS))

  console.log('Wallet public key:', wallet.publicKey.toString())
  console.log('Recipient:', recipientPubkey.toString())
  console.log(`Amount: ${amount.toLocaleString()} USDC (${amountLamports} lamports)`)
  console.log('USDC Mint:', USDC_MINT.toString())

  // Connect to FOGO testnet
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC endpoint:', FOGO_TESTNET_RPC)

  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Wallet SOL balance:', balance / 1e9, 'SOL')

  if (balance < 0.001 * 1e9) {
    console.error('ERROR: Insufficient balance. Need at least 0.001 SOL for transaction fees.')
    process.exit(1)
  }

  // Verify the mint exists and we are the authority
  console.log()
  console.log('Verifying USDC mint...')
  try {
    const mintInfo = await getMint(connection, USDC_MINT)
    console.log('  Decimals:', mintInfo.decimals)
    console.log('  Supply:  ', Number(mintInfo.supply) / 10 ** mintInfo.decimals, 'USDC')

    if (!mintInfo.mintAuthority?.equals(wallet.publicKey)) {
      console.error()
      console.error('ERROR: Wallet is not the mint authority!')
      console.error('  Expected:', wallet.publicKey.toString())
      console.error('  Actual:  ', mintInfo.mintAuthority?.toString() || 'null')
      process.exit(1)
    }
    console.log('  Authority: Verified')
  } catch (error: unknown) {
    console.error('ERROR: Failed to fetch USDC mint:', error)

    if (error instanceof Error && 'logs' in error) {
      console.error('Transaction logs:', (error as { logs: string[] }).logs)
    }

    process.exit(1)
  }

  // Get or create recipient's token account
  console.log()
  console.log('Creating/fetching recipient token account...')
  const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet,
    USDC_MINT,
    recipientPubkey
  )
  console.log('Recipient ATA:', recipientTokenAccount.address.toString())

  // Check current balance
  const balanceBefore = recipientTokenAccount.amount
  console.log('Balance Before:', Number(balanceBefore) / 10 ** USDC_DECIMALS, 'USDC')

  // Mint tokens
  console.log()
  console.log(`Minting ${amount.toLocaleString()} USDC...`)

  try {
    const signature = await mintTo(
      connection,
      wallet,
      USDC_MINT,
      recipientTokenAccount.address,
      wallet, // Mint authority
      amountLamports
    )

    console.log('Transaction signature:', signature)
    console.log(`Explorer: https://explorer.fogo.io/tx/${signature}?cluster=testnet`)

    // Wait a moment for confirmation
    console.log('Waiting for confirmation...')
    await connection.confirmTransaction(signature, 'confirmed')

    console.log()
    console.log('SUCCESS! USDC minted.')
    console.log('============================================================')

    // Check new balance
    const accountInfo = await getAccount(connection, recipientTokenAccount.address)
    const balanceAfter = accountInfo.amount
    console.log('Balance After:', Number(balanceAfter) / 10 ** USDC_DECIMALS, 'USDC')
    console.log()
    console.log('Token Account:')
    console.log(`  https://explorer.fogo.io/account/${recipientTokenAccount.address.toString()}?cluster=testnet`)

  } catch (error: unknown) {
    console.error('Transaction error:', error)

    // Try to get more details
    if (error instanceof Error && 'logs' in error) {
      console.error('Transaction logs:', (error as { logs: string[] }).logs)
    }

    process.exit(1)
  }
}

main().catch(console.error)
