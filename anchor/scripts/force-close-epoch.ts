/**
 * Force Close Epoch Script (Admin Only)
 *
 * Force-closes a stuck epoch when settlement is not yet implemented.
 * This is an emergency admin utility for testnet development.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/force-close-epoch.ts --pool BTC
 *
 * Prerequisites:
 *   1. Wallet must be the protocol admin (GlobalConfig.admin)
 *   2. Pool must have an active epoch
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
import * as fs from 'fs'
import * as os from 'os'

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'

// Asset mints for pool derivation
const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

type Asset = keyof typeof ASSET_MINTS

// admin_force_close_epoch instruction discriminator (from IDL)
const ADMIN_FORCE_CLOSE_EPOCH_DISCRIMINATOR = Buffer.from([
  81, 199, 93, 201, 181, 131, 174, 29
])

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

function deriveEpochPda(poolPda: PublicKey, epochId: bigint): [PublicKey, number] {
  const epochIdBuffer = Buffer.alloc(8)
  epochIdBuffer.writeBigUInt64LE(epochId)

  return PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), poolPda.toBuffer(), epochIdBuffer],
    PROGRAM_ID
  )
}

/**
 * Parse Pool account data to extract active_epoch info
 */
function parsePoolAccount(data: Buffer): {
  assetMint: PublicKey
  nextEpochId: bigint
  activeEpoch: PublicKey | null
} {
  // Skip discriminator (8 bytes)
  let offset = 8

  // asset_mint (32 bytes)
  const assetMint = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  // yes_reserves (8 bytes, u64)
  offset += 8

  // no_reserves (8 bytes, u64)
  offset += 8

  // total_lp_shares (8 bytes, u64)
  offset += 8

  // next_epoch_id (8 bytes, u64)
  const nextEpochId = data.readBigUInt64LE(offset)
  offset += 8

  // active_epoch (1 byte option tag + 32 bytes pubkey)
  const activeEpochSome = data.readUInt8(offset)
  offset += 1
  let activeEpoch: PublicKey | null = null
  if (activeEpochSome === 1) {
    activeEpoch = new PublicKey(data.subarray(offset, offset + 32))
  }

  return { assetMint, nextEpochId, activeEpoch }
}

/**
 * Parse Epoch account data to get epoch_id
 */
function parseEpochAccount(data: Buffer): {
  pool: PublicKey
  epochId: bigint
} {
  // Skip discriminator (8 bytes)
  let offset = 8

  // pool (32 bytes)
  const pool = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  // epoch_id (8 bytes, u64)
  const epochId = data.readBigUInt64LE(offset)

  return { pool, epochId }
}

/**
 * Build admin_force_close_epoch instruction
 */
function buildForceCloseEpochInstruction(
  admin: PublicKey,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
): TransactionInstruction {
  // Instruction data: just discriminator (no args)
  const data = ADMIN_FORCE_CLOSE_EPOCH_DISCRIMINATOR

  const keys = [
    { pubkey: admin, isSigner: true, isWritable: true },
    { pubkey: globalConfigPda, isSigner: false, isWritable: false },
    { pubkey: poolPda, isSigner: false, isWritable: true },
    { pubkey: epochPda, isSigner: false, isWritable: true },
  ]

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  })
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('============================================================')
  console.log('FOGO Pulse - Force Close Epoch (Admin)')
  console.log('============================================================')
  console.log()

  // Parse args
  const args = process.argv.slice(2)
  let selectedPool: Asset = 'BTC'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pool' && args[i + 1]) {
      const poolArg = args[i + 1].toUpperCase() as Asset
      if (poolArg in ASSET_MINTS) {
        selectedPool = poolArg
      } else {
        console.error(`Invalid pool: ${args[i + 1]}. Must be one of: ${Object.keys(ASSET_MINTS).join(', ')}`)
        process.exit(1)
      }
      i++
    }
  }

  console.log('Selected pool:', selectedPool)

  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet public key:', wallet.publicKey.toString())

  // Connect to FOGO testnet
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC endpoint:', FOGO_TESTNET_RPC)

  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Wallet balance:', balance / 1e9, 'SOL')

  if (balance < 0.001 * 1e9) {
    console.error('ERROR: Insufficient balance. Need at least 0.001 SOL for transaction fees.')
    process.exit(1)
  }

  // Derive PDAs
  const [globalConfigPda] = deriveGlobalConfigPda()
  const assetMint = ASSET_MINTS[selectedPool]
  const [poolPda] = derivePoolPda(assetMint)

  console.log('GlobalConfig PDA:', globalConfigPda.toString())
  console.log(`${selectedPool} Pool PDA:`, poolPda.toString())

  // Fetch pool account to get active epoch
  const poolAccountInfo = await connection.getAccountInfo(poolPda)
  if (!poolAccountInfo) {
    console.error('ERROR: Pool account not found. Has the pool been created?')
    process.exit(1)
  }

  const poolData = parsePoolAccount(poolAccountInfo.data)
  console.log('Next epoch ID:', poolData.nextEpochId.toString())

  if (!poolData.activeEpoch) {
    console.log('No active epoch on this pool. Nothing to force-close.')
    process.exit(0)
  }

  console.log('Active epoch:', poolData.activeEpoch.toString())

  // Fetch epoch account to get epoch_id for PDA derivation
  const epochAccountInfo = await connection.getAccountInfo(poolData.activeEpoch)
  if (!epochAccountInfo) {
    console.error('ERROR: Epoch account not found at:', poolData.activeEpoch.toString())
    process.exit(1)
  }

  const epochData = parseEpochAccount(epochAccountInfo.data)
  console.log('Epoch ID:', epochData.epochId.toString())

  // Re-derive epoch PDA to confirm it matches
  const [derivedEpochPda] = deriveEpochPda(poolPda, epochData.epochId)
  if (!derivedEpochPda.equals(poolData.activeEpoch)) {
    console.error('ERROR: Derived epoch PDA does not match active epoch')
    console.error('  Derived:', derivedEpochPda.toString())
    console.error('  Active:', poolData.activeEpoch.toString())
    process.exit(1)
  }

  // Build instruction
  console.log()
  console.log('Building admin_force_close_epoch instruction...')

  const forceCloseIx = buildForceCloseEpochInstruction(
    wallet.publicKey,
    globalConfigPda,
    poolPda,
    poolData.activeEpoch,
  )

  // Build transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [forceCloseIx],
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
    console.log('SUCCESS! Epoch force-closed.')
    console.log()
    console.log('You can now create a new epoch:')
    console.log(`  npx tsx scripts/create-test-epoch.ts --pool ${selectedPool}`)

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
