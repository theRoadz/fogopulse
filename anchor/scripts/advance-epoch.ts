/**
 * Advance Epoch Script
 *
 * Advances an epoch from Open to Frozen state when freeze_time is reached.
 * This script:
 * 1. Finds the active epoch for the specified pool
 * 2. Verifies the epoch is in Open state and freeze_time has passed
 * 3. Builds and submits advance_epoch transaction
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/advance-epoch.ts --pool BTC|ETH|SOL|FOGO
 *
 * Prerequisites:
 *   1. Pool exists with an active epoch in Open state
 *   2. Epoch has passed its freeze_time
 *
 * Environment (via .env file or environment variables):
 *   WALLET_PATH - Path to wallet keypair (default: ~/.config/solana/fogo-testnet.json)
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv'
import * as path from 'path'

// Try multiple .env locations
dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
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

// advance_epoch instruction discriminator (sha256("global:advance_epoch")[0:8])
// Computed from: sha256("global:advance_epoch")
const ADVANCE_EPOCH_DISCRIMINATOR = Buffer.from([
  93, 138, 234, 218, 241, 230, 132, 38
])

// Clock sysvar
const SYSVAR_CLOCK_PUBKEY = new PublicKey('SysvarC1ock11111111111111111111111111111111')

// Epoch states
const EPOCH_STATE = {
  Open: 0,
  Frozen: 1,
  Settling: 2,
  Settled: 3,
  Refunded: 4,
} as const

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
 * Parse Pool account data to extract active epoch info
 */
function parsePoolAccount(data: Buffer): {
  assetMint: PublicKey
  nextEpochId: bigint
  activeEpoch: PublicKey | null
  activeEpochState: number
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
    offset += 32
  }

  // active_epoch_state (1 byte, u8)
  const activeEpochState = data.readUInt8(offset)

  return { assetMint, nextEpochId, activeEpoch, activeEpochState }
}

/**
 * Parse Epoch account data
 */
function parseEpochAccount(data: Buffer): {
  pool: PublicKey
  epochId: bigint
  state: number
  startTime: bigint
  endTime: bigint
  freezeTime: bigint
  bump: number
} {
  // Skip discriminator (8 bytes)
  let offset = 8

  // pool (32 bytes)
  const pool = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  // epoch_id (8 bytes, u64)
  const epochId = data.readBigUInt64LE(offset)
  offset += 8

  // state (1 byte, enum)
  const state = data.readUInt8(offset)
  offset += 1

  // start_time (8 bytes, i64)
  const startTime = data.readBigInt64LE(offset)
  offset += 8

  // end_time (8 bytes, i64)
  const endTime = data.readBigInt64LE(offset)
  offset += 8

  // freeze_time (8 bytes, i64)
  const freezeTime = data.readBigInt64LE(offset)
  offset += 8

  // start_price (8 bytes, u64)
  offset += 8

  // start_confidence (8 bytes, u64)
  offset += 8

  // start_publish_time (8 bytes, i64)
  offset += 8

  // settlement_price (1 byte option + 8 bytes u64)
  const settlementPriceSome = data.readUInt8(offset)
  offset += 1
  if (settlementPriceSome === 1) {
    offset += 8
  }

  // settlement_confidence (1 byte option + 8 bytes u64)
  const settlementConfidenceSome = data.readUInt8(offset)
  offset += 1
  if (settlementConfidenceSome === 1) {
    offset += 8
  }

  // settlement_publish_time (1 byte option + 8 bytes i64)
  const settlementPublishTimeSome = data.readUInt8(offset)
  offset += 1
  if (settlementPublishTimeSome === 1) {
    offset += 8
  }

  // outcome (1 byte option + 1 byte enum)
  const outcomeSome = data.readUInt8(offset)
  offset += 1
  if (outcomeSome === 1) {
    offset += 1
  }

  // bump (1 byte, u8)
  const bump = data.readUInt8(offset)

  return { pool, epochId, state, startTime, endTime, freezeTime, bump }
}

/**
 * Get epoch state name
 */
function getEpochStateName(state: number): string {
  const states = ['Open', 'Frozen', 'Settling', 'Settled', 'Refunded']
  return states[state] || `Unknown(${state})`
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Advance Epoch (Open → Frozen)')
  console.log('='.repeat(60))
  console.log()

  // Parse CLI arguments
  const args = process.argv.slice(2)
  let selectedAsset: Asset = 'BTC'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pool' && args[i + 1]) {
      const asset = args[i + 1].toUpperCase() as Asset
      if (asset in ASSET_MINTS) {
        selectedAsset = asset
      } else {
        console.error(`Invalid pool: ${args[i + 1]}. Valid options: BTC, ETH, SOL, FOGO`)
        process.exit(1)
      }
    }
  }

  console.log('Selected pool:', selectedAsset)

  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet public key:', wallet.publicKey.toBase58())

  // Setup connection
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC endpoint:', FOGO_TESTNET_RPC)

  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Wallet balance:', balance / 1e9, 'SOL')

  if (balance < 0.001 * 1e9) {
    console.error('ERROR: Insufficient SOL balance. Get SOL from https://faucet.fogo.io/')
    process.exit(1)
  }

  // Derive PDAs
  const [globalConfigPda] = deriveGlobalConfigPda()
  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())

  const assetMint = ASSET_MINTS[selectedAsset]
  const [poolPda] = derivePoolPda(assetMint)
  console.log(`${selectedAsset} Pool PDA:`, poolPda.toBase58())

  // Check pool exists and has active epoch
  const poolAccount = await connection.getAccountInfo(poolPda)
  if (!poolAccount) {
    console.error('ERROR: Pool not found. Run create-pools.ts first.')
    process.exit(1)
  }

  const poolData = parsePoolAccount(poolAccount.data)
  console.log('Next epoch ID:', poolData.nextEpochId.toString())
  console.log('Active epoch state:', poolData.activeEpochState, `(${getEpochStateName(poolData.activeEpochState)})`)

  if (!poolData.activeEpoch) {
    console.error('ERROR: Pool has no active epoch. Create an epoch first.')
    process.exit(1)
  }

  console.log('Active epoch:', poolData.activeEpoch.toBase58())

  // Fetch epoch account to verify state and timing
  const epochAccount = await connection.getAccountInfo(poolData.activeEpoch)
  if (!epochAccount) {
    console.error('ERROR: Epoch account not found.')
    process.exit(1)
  }

  const epochData = parseEpochAccount(epochAccount.data)
  console.log('Epoch ID:', epochData.epochId.toString())
  console.log('Epoch state:', getEpochStateName(epochData.state))
  console.log('Epoch start_time:', new Date(Number(epochData.startTime) * 1000).toISOString())
  console.log('Epoch freeze_time:', new Date(Number(epochData.freezeTime) * 1000).toISOString())
  console.log('Epoch end_time:', new Date(Number(epochData.endTime) * 1000).toISOString())

  // Verify epoch is in Open state
  if (epochData.state !== EPOCH_STATE.Open) {
    console.error(`ERROR: Epoch is in ${getEpochStateName(epochData.state)} state, not Open.`)
    console.log('Only epochs in Open state can be advanced to Frozen.')
    process.exit(1)
  }

  // Verify epoch has passed freeze_time
  const currentTime = Math.floor(Date.now() / 1000)
  console.log('Current time:', new Date(currentTime * 1000).toISOString())

  if (currentTime < Number(epochData.freezeTime)) {
    const remaining = Number(epochData.freezeTime) - currentTime
    console.error(`ERROR: Epoch has not reached freeze_time yet.`)
    console.log(`Time remaining: ${remaining} seconds`)
    console.log(`Freeze time: ${new Date(Number(epochData.freezeTime) * 1000).toISOString()}`)
    process.exit(1)
  }

  console.log()
  console.log('✓ Epoch is ready to be advanced (freeze_time reached)')
  console.log()
  console.log('Building transaction...')

  // Build advance_epoch instruction
  const advanceEpochIx = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },           // payer
      { pubkey: globalConfigPda, isSigner: false, isWritable: false },          // global_config
      { pubkey: poolPda, isSigner: false, isWritable: true },                   // pool
      { pubkey: poolData.activeEpoch, isSigner: false, isWritable: true },      // epoch
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },      // clock
    ],
    programId: PROGRAM_ID,
    data: ADVANCE_EPOCH_DISCRIMINATOR,
  }

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  // Build versioned transaction
  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [advanceEpochIx],
  }).compileToV0Message()

  const tx = new VersionedTransaction(messageV0)
  tx.sign([wallet])

  console.log('Submitting transaction...')

  try {
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    })

    console.log('Transaction sent:', signature)

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    })

    if (confirmation.value.err) {
      console.error('Transaction failed:', confirmation.value.err)
      process.exit(1)
    }

    console.log()
    console.log('='.repeat(60))
    console.log('SUCCESS! Epoch advanced to Frozen state')
    console.log('='.repeat(60))
    console.log()
    console.log('Epoch PDA:', poolData.activeEpoch.toBase58())
    console.log('Epoch ID:', epochData.epochId.toString())
    console.log('Pool:', selectedAsset)
    console.log('State transition: Open → Frozen')
    console.log('Transaction:', signature)
    console.log()
    console.log('View on explorer: https://explorer.fogo.io/tx/' + signature)
    console.log()
    console.log('Next steps:')
    console.log('  1. Wait for epoch end_time to pass')
    console.log('  2. Run settle-epoch to settle: npx tsx scripts/settle-epoch.ts --pool', selectedAsset)
    console.log()

  } catch (error: any) {
    console.error('Transaction failed:', error.message)

    if (error.logs) {
      console.log('\nProgram logs:')
      error.logs.forEach((log: string) => console.log('  ', log))
    }

    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
