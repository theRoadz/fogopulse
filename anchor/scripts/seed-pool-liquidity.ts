/**
 * Seed Pool Liquidity Script (Admin Only)
 *
 * Seeds initial liquidity into a pool using the admin_seed_liquidity instruction.
 * Splits the amount 50/50 between YES and NO reserves.
 *
 * Usage:
 *   npx tsx scripts/seed-pool-liquidity.ts --pool BTC --amount 20000
 *   npx tsx scripts/seed-pool-liquidity.ts --pool ETH --amount 20000
 *   npx tsx scripts/seed-pool-liquidity.ts --pool SOL --amount 10000
 *   npx tsx scripts/seed-pool-liquidity.ts --pool FOGO --amount 10000
 *
 * Prerequisites:
 *   1. Wallet must be the protocol admin (GlobalConfig.admin)
 *   2. Admin must have sufficient USDC balance
 *   3. Pool must exist with USDC ATA initialized
 *
 * Environment (via .env file or environment variables):
 *   WALLET_PATH - Path to admin wallet keypair (default: ~/.config/solana/fogo-testnet.json)
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv'
import * as path from 'path'

// Try multiple .env locations
dotenv.config({ path: path.resolve(__dirname, '../.env') })  // anchor/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') })  // project root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })  // project root .env.local

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import * as fs from 'fs'
import * as os from 'os'

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'
const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')

// admin_seed_liquidity instruction discriminator (from IDL)
const ADMIN_SEED_LIQUIDITY_DISCRIMINATOR = Buffer.from([
  194, 141, 140, 99, 191, 15, 59, 217
])

// Asset mints for pool derivation
const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

type Asset = keyof typeof ASSET_MINTS

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

function deriveGlobalConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('global_config')],
    PROGRAM_ID
  )
}

function derivePoolPda(assetMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), assetMint.toBuffer()],
    PROGRAM_ID
  )
}

/**
 * Build admin_seed_liquidity instruction
 */
function buildSeedLiquidityInstruction(
  admin: PublicKey,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  poolUsdcAta: PublicKey,
  adminUsdcAta: PublicKey,
  amount: bigint,
): TransactionInstruction {
  // Instruction data: discriminator + amount (u64 little-endian)
  const data = Buffer.alloc(8 + 8)
  ADMIN_SEED_LIQUIDITY_DISCRIMINATOR.copy(data, 0)

  // Write amount as u64 little-endian
  const amountBuffer = Buffer.alloc(8)
  amountBuffer.writeBigUInt64LE(amount)
  amountBuffer.copy(data, 8)

  const keys = [
    { pubkey: admin, isSigner: true, isWritable: true },
    { pubkey: globalConfigPda, isSigner: false, isWritable: false },
    { pubkey: poolPda, isSigner: false, isWritable: true },
    { pubkey: poolUsdcAta, isSigner: false, isWritable: true },
    { pubkey: adminUsdcAta, isSigner: false, isWritable: true },
    { pubkey: USDC_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ]

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  })
}

function parseArgs(): { pool: Asset; amount: number } {
  const args = process.argv.slice(2)
  let pool: Asset | undefined
  let amount: number | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pool' && args[i + 1]) {
      const poolArg = args[i + 1].toUpperCase() as Asset
      if (poolArg in ASSET_MINTS) {
        pool = poolArg
      } else {
        console.error(`Invalid pool: ${args[i + 1]}. Must be one of: ${Object.keys(ASSET_MINTS).join(', ')}`)
        process.exit(1)
      }
      i++
    } else if (args[i] === '--amount' && args[i + 1]) {
      amount = parseInt(args[i + 1], 10)
      if (isNaN(amount) || amount <= 0) {
        console.error(`Invalid amount: ${args[i + 1]}. Must be a positive number.`)
        process.exit(1)
      }
      i++
    }
  }

  if (!pool) {
    console.error('Missing required --pool argument. Must be one of: BTC, ETH, SOL, FOGO')
    console.error('Usage: npx tsx scripts/seed-pool-liquidity.ts --pool BTC --amount 20000')
    process.exit(1)
  }

  if (!amount) {
    console.error('Missing required --amount argument. Amount in USDC (whole units).')
    console.error('Usage: npx tsx scripts/seed-pool-liquidity.ts --pool BTC --amount 20000')
    process.exit(1)
  }

  return { pool, amount }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('============================================================')
  console.log('FOGO Pulse - Seed Pool Liquidity (Admin)')
  console.log('============================================================')
  console.log()

  const { pool, amount } = parseArgs()

  // Convert USDC amount to lamports (6 decimals)
  const amountLamports = BigInt(amount) * BigInt(1_000_000)

  console.log('Selected pool:', pool)
  console.log(`Amount: ${amount} USDC (${amountLamports} lamports)`)

  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet public key:', wallet.publicKey.toString())

  // Connect to FOGO testnet
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC endpoint:', FOGO_TESTNET_RPC)

  // Check wallet SOL balance
  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Wallet SOL balance:', balance / 1e9, 'SOL')

  if (balance < 0.001 * 1e9) {
    console.error('ERROR: Insufficient SOL balance. Need at least 0.001 SOL for transaction fees.')
    process.exit(1)
  }

  // Get admin USDC ATA and check balance
  const adminUsdcAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey)
  console.log('Admin USDC ATA:', adminUsdcAta.toString())

  const adminUsdcAccount = await connection.getTokenAccountBalance(adminUsdcAta)
  const adminUsdcBalance = BigInt(adminUsdcAccount.value.amount)
  console.log('Admin USDC balance:', Number(adminUsdcBalance) / 1e6, 'USDC')

  if (adminUsdcBalance < amountLamports) {
    console.error(`ERROR: Insufficient USDC balance. Have ${Number(adminUsdcBalance) / 1e6} USDC, need ${amount} USDC`)
    console.error('Run: npx tsx scripts/mint-test-usdc.ts to mint test USDC')
    process.exit(1)
  }

  // Derive PDAs
  const [globalConfigPda] = deriveGlobalConfigPda()
  const assetMint = ASSET_MINTS[pool]
  const [poolPda] = derivePoolPda(assetMint)

  console.log('GlobalConfig PDA:', globalConfigPda.toString())
  console.log(`${pool} Pool PDA:`, poolPda.toString())

  // Check GlobalConfig exists
  const globalConfigAccount = await connection.getAccountInfo(globalConfigPda)
  if (!globalConfigAccount) {
    console.error('ERROR: GlobalConfig not initialized. Run initialize-protocol.ts first.')
    process.exit(1)
  }

  // Check pool exists
  const poolAccount = await connection.getAccountInfo(poolPda)
  if (!poolAccount) {
    console.error(`ERROR: ${pool} Pool not initialized. Run create-pools.ts first.`)
    process.exit(1)
  }

  // Derive Pool USDC ATA
  const poolUsdcAta = await getAssociatedTokenAddress(
    USDC_MINT,
    poolPda,
    true // allowOwnerOffCurve = true (REQUIRED for PDA owners)
  )
  console.log('Pool USDC ATA:', poolUsdcAta.toString())

  // Check pool USDC ATA exists
  const poolUsdcAccount = await connection.getAccountInfo(poolUsdcAta)
  if (!poolUsdcAccount) {
    console.error('ERROR: Pool USDC ATA not initialized. Run create-pools.ts to create it.')
    process.exit(1)
  }

  // Build instruction
  console.log()
  console.log('Building admin_seed_liquidity instruction...')

  const seedLiquidityIx = buildSeedLiquidityInstruction(
    wallet.publicKey,
    globalConfigPda,
    poolPda,
    poolUsdcAta,
    adminUsdcAta,
    amountLamports,
  )

  // Build transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [seedLiquidityIx],
  }).compileToV0Message()

  const transaction = new VersionedTransaction(messageV0)
  transaction.sign([wallet])

  // Submit transaction
  console.log('Submitting transaction...')

  try {
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })

    console.log('Transaction signature:', signature)
    console.log(`Explorer: https://explorer.fogo.io/tx/${signature}?cluster=testnet`)

    // Wait for confirmation
    console.log('Waiting for confirmation...')
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed')

    if (confirmation.value.err) {
      console.error('Transaction failed:', confirmation.value.err)
      process.exit(1)
    }

    console.log()
    console.log('SUCCESS! Liquidity seeded.')
    console.log('============================================================')
    console.log(`Pool: ${pool}`)
    console.log(`Amount seeded: ${amount} USDC`)
    console.log(`YES reserves: +${amount / 2} USDC`)
    console.log(`NO reserves: +${amount / 2} USDC`)
    console.log()
    console.log('Verify with: npx tsx scripts/check-pool-liquidity.ts')

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
