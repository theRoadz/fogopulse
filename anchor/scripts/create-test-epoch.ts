/**
 * Create Test Epoch Script
 *
 * Creates a new epoch for testing buy_position and other trading instructions.
 * This script:
 * 1. Connects to Pyth Lazer WebSocket to get a signed price message
 * 2. Builds Ed25519 verification instruction
 * 3. Builds create_epoch instruction
 * 4. Submits transaction to FOGO testnet
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/create-test-epoch.ts [--pool BTC|ETH|SOL|FOGO]
 *
 * Prerequisites:
 *   1. GlobalConfig initialized (run scripts/initialize-protocol.ts)
 *   2. Pool created (run scripts/create-pools.ts)
 *   3. No active epoch on the pool (or wait for current to expire)
 *   4. Create .env file with PYTH_ACCESS_TOKEN
 *
 * Environment (via .env file or environment variables):
 *   WALLET_PATH - Path to wallet keypair (default: ~/.config/solana/fogo-testnet.json)
 *   PYTH_ACCESS_TOKEN - Pyth Lazer API access token (get from pyth.network)
 *
 * .env file location (checked in order):
 *   1. ./anchor/.env
 *   2. ./.env
 *   3. ../.env.local (project root)
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
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js'
import * as fs from 'fs'
import * as os from 'os'
import WebSocket from 'ws'

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'

// FOGO-specific Pyth addresses
const PYTH_PROGRAM_ID = new PublicKey('pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt')
const PYTH_STORAGE_ID = new PublicKey('3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL')
const PYTH_TREASURY_ID = new PublicKey('upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr')

// Pyth Lazer WebSocket endpoints (numbered endpoints required)
// See: https://docs.pyth.network/price-feeds/pro/subscribe-to-prices
const PYTH_LAZER_WS_URLS = [
  'wss://pyth-lazer-0.dourolabs.app/v1/stream',
  'wss://pyth-lazer-1.dourolabs.app/v1/stream',
  'wss://pyth-lazer-2.dourolabs.app/v1/stream',
]

// Asset mints for pool derivation
const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

// Pyth Lazer feed IDs (numeric u32 format - NOT hex strings!)
// See: https://docs.pyth.network/price-feeds/price-feed-ids
const PYTH_FEED_IDS: Record<string, number> = {
  BTC: 1,   // BTC/USD
  ETH: 2,   // ETH/USD
  SOL: 5,   // SOL/USD
  FOGO: 1,  // Using BTC feed for FOGO (placeholder)
}

type Asset = keyof typeof ASSET_MINTS

// create_epoch instruction discriminator (from IDL)
const CREATE_EPOCH_DISCRIMINATOR = Buffer.from([
  115, 111, 36, 230, 59, 145, 168, 27
])

// Ed25519 program ID
const ED25519_PROGRAM_ID = new PublicKey('Ed25519SigVerify111111111111111111111111111')

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
 * Parse Pool account data to extract next_epoch_id
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
 * Fetch signed price message from Pyth Lazer WebSocket
 */
async function fetchPythMessage(feedId: number, accessToken: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Timeout waiting for Pyth price message (30s)'))
    }, 30000)

    // Use first available WebSocket endpoint
    const wsUrl = PYTH_LAZER_WS_URLS[0]
    const ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    ws.on('open', () => {
      console.log('  Connected to Pyth Lazer WebSocket')

      // Subscribe to price feed with Ed25519 format
      const subscribeMsg = {
        type: 'subscribe',
        subscriptionId: 1,
        priceFeedIds: [feedId],
        properties: ['price', 'confidence'],
        formats: ['solana'],  // Ed25519 format - REQUIRED for FOGO
        deliveryFormat: 'json',
        channel: 'fixed_rate@200ms',
        jsonBinaryEncoding: 'hex',
      }

      ws.send(JSON.stringify(subscribeMsg))
      console.log('  Subscribed to price feed:', feedId)
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString())
        console.log('  Received message type:', msg.type)

        // Handle errors
        if (msg.type === 'error') {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(`Pyth API error: ${msg.message || JSON.stringify(msg)}`))
          return
        }

        // Handle subscription confirmation
        if (msg.type === 'subscribed') {
          console.log('  Subscription confirmed, waiting for price update...')
          return
        }

        // Handle price update
        if (msg.type === 'streamUpdated' && msg.solana) {
          clearTimeout(timeout)
          ws.close()

          // Extract hex data from solana object: { encoding: 'hex', data: '...' }
          const solanaData = msg.solana.data || msg.solana
          const pythMessage = Buffer.from(solanaData, 'hex')
          console.log('  Received Pyth message:', pythMessage.length, 'bytes')

          resolve(pythMessage)
        }
      } catch (err) {
        console.log('  Raw message:', data.toString().substring(0, 200))
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Pyth WebSocket error: ${err.message}`))
    })

    ws.on('close', (code, reason) => {
      console.log('  WebSocket closed. Code:', code, 'Reason:', reason?.toString() || 'none')
      clearTimeout(timeout)
    })
  })
}

/**
 * Create Ed25519 instruction that references data in another instruction
 *
 * Based on @pythnetwork/pyth-lazer-solana-sdk createEd25519Instruction
 *
 * Pyth Solana message format:
 * Bytes 0-3:     4-byte magic prefix
 * Bytes 4-67:    64-byte Ed25519 signature
 * Bytes 68-99:   32-byte Ed25519 public key
 * Bytes 100-101: 2-byte message size (u16 LE)
 * Bytes 102+:    Actual payload
 */
function createEd25519Instruction(
  pythMessage: Buffer,
  instructionIndex: number,
  messageOffset: number
): { keys: any[], programId: PublicKey, data: Buffer } {
  const MAGIC_LEN = 4
  const SIGNATURE_LEN = 64
  const PUBKEY_LEN = 32
  const MESSAGE_SIZE_LEN = 2

  // Parse message components
  const signatureOffset = MAGIC_LEN
  const pubkeyOffset = MAGIC_LEN + SIGNATURE_LEN
  const messageSizeOffset = MAGIC_LEN + SIGNATURE_LEN + PUBKEY_LEN
  const payloadOffset = MAGIC_LEN + SIGNATURE_LEN + PUBKEY_LEN + MESSAGE_SIZE_LEN

  // Read message size
  const messageSize = pythMessage.readUInt16LE(messageSizeOffset)

  // Build Ed25519 instruction data
  // Format: https://docs.solana.com/developing/runtime-facilities/programs#ed25519-program
  const data = Buffer.alloc(2 + 14) // num_signatures (1) + padding (1) + signature_instruction (14)

  let offset = 0

  // Number of signatures
  data.writeUInt8(1, offset)
  offset += 1

  // Padding
  data.writeUInt8(0, offset)
  offset += 1

  // Signature offset (u16) - relative to start of pyth_message in create_epoch instruction
  data.writeUInt16LE(messageOffset + signatureOffset, offset)
  offset += 2

  // Signature instruction index (u16)
  data.writeUInt16LE(instructionIndex, offset)
  offset += 2

  // Public key offset (u16)
  data.writeUInt16LE(messageOffset + pubkeyOffset, offset)
  offset += 2

  // Public key instruction index (u16)
  data.writeUInt16LE(instructionIndex, offset)
  offset += 2

  // Message data offset (u16)
  data.writeUInt16LE(messageOffset + payloadOffset, offset)
  offset += 2

  // Message data size (u16)
  data.writeUInt16LE(messageSize, offset)
  offset += 2

  // Message instruction index (u16)
  data.writeUInt16LE(instructionIndex, offset)

  return {
    keys: [],
    programId: ED25519_PROGRAM_ID,
    data,
  }
}

/**
 * Build create_epoch instruction data
 */
function buildCreateEpochData(pythMessage: Buffer): Buffer {
  // Anchor layout:
  // 8 bytes: discriminator
  // 4 bytes: vec length (u32)
  // N bytes: pyth_message
  // 1 byte: ed25519_instruction_index (u8)
  // 1 byte: signature_index (u8)

  const data = Buffer.alloc(8 + 4 + pythMessage.length + 1 + 1)
  let offset = 0

  // Discriminator
  CREATE_EPOCH_DISCRIMINATOR.copy(data, offset)
  offset += 8

  // Vec length (u32 LE)
  data.writeUInt32LE(pythMessage.length, offset)
  offset += 4

  // Pyth message bytes
  pythMessage.copy(data, offset)
  offset += pythMessage.length

  // ed25519_instruction_index (0 = first instruction)
  data.writeUInt8(0, offset)
  offset += 1

  // signature_index (0 = first signature)
  data.writeUInt8(0, offset)

  return data
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Create Test Epoch')
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

  // Check for Pyth access token
  const accessToken = process.env.PYTH_ACCESS_TOKEN
  if (!accessToken) {
    console.error('ERROR: PYTH_ACCESS_TOKEN environment variable required')
    console.log('Get an access token from https://pyth.network/developers')
    console.log('Set it with: export PYTH_ACCESS_TOKEN=your_token_here')
    process.exit(1)
  }

  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet public key:', wallet.publicKey.toBase58())

  // Setup connection
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC endpoint:', FOGO_TESTNET_RPC)

  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Wallet balance:', balance / 1e9, 'SOL')

  if (balance < 0.01 * 1e9) {
    console.error('ERROR: Insufficient SOL balance. Get SOL from https://faucet.fogo.io/')
    process.exit(1)
  }

  // Derive PDAs
  const [globalConfigPda] = deriveGlobalConfigPda()
  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())

  const assetMint = ASSET_MINTS[selectedAsset]
  const [poolPda] = derivePoolPda(assetMint)
  console.log(`${selectedAsset} Pool PDA:`, poolPda.toBase58())

  // Check pool exists and get next_epoch_id
  const poolAccount = await connection.getAccountInfo(poolPda)
  if (!poolAccount) {
    console.error('ERROR: Pool not found. Run create-pools.ts first.')
    process.exit(1)
  }

  const poolData = parsePoolAccount(poolAccount.data)
  console.log('Next epoch ID:', poolData.nextEpochId.toString())

  if (poolData.activeEpoch) {
    console.error('ERROR: Pool already has an active epoch:', poolData.activeEpoch.toBase58())
    console.log('Wait for the current epoch to settle or expire before creating a new one.')
    process.exit(1)
  }

  // Derive epoch PDA
  const [epochPda] = deriveEpochPda(poolPda, poolData.nextEpochId)
  console.log('New Epoch PDA:', epochPda.toBase58())

  console.log()
  console.log('Fetching Pyth price message...')

  // Fetch signed price message from Pyth Lazer
  const feedId = PYTH_FEED_IDS[selectedAsset]
  const pythMessage = await fetchPythMessage(feedId, accessToken)

  console.log()
  console.log('Building transaction...')

  // Build create_epoch instruction data
  const createEpochData = buildCreateEpochData(pythMessage)

  // pythMessageOffset = 8 (discriminator) + 4 (vec length) = 12
  // Wait, the doc says 20... let me recalculate
  // Actually: 8 (discriminator) + 4 (vec length prefix) = 12
  // But the doc says offset 20... checking create_epoch signature
  // create_epoch(pyth_message: Vec<u8>, ed25519_instruction_index: u8, signature_index: u8)
  // So it's just: discriminator(8) + vec_len(4) = 12
  // The doc might be wrong or there's an epoch_id param... checking

  // Looking at the instruction, there's no epoch_id param - it uses pool.next_epoch_id
  // So offset should be 12, not 20

  const pythMessageOffset = 12 // 8 (discriminator) + 4 (vec length)

  // Create Ed25519 instruction (references data in create_epoch instruction at index 1)
  const ed25519Ix = createEd25519Instruction(pythMessage, 1, pythMessageOffset)

  // Build create_epoch instruction
  const createEpochIx = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },      // payer
      { pubkey: globalConfigPda, isSigner: false, isWritable: false },     // global_config
      { pubkey: poolPda, isSigner: false, isWritable: true },              // pool
      { pubkey: epochPda, isSigner: false, isWritable: true },             // epoch
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false }, // clock -> actually instructions sysvar
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false }, // instructions_sysvar
      { pubkey: PYTH_PROGRAM_ID, isSigner: false, isWritable: false },     // pyth_program
      { pubkey: PYTH_STORAGE_ID, isSigner: false, isWritable: false },     // pyth_storage
      { pubkey: PYTH_TREASURY_ID, isSigner: false, isWritable: true },     // pyth_treasury
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    programId: PROGRAM_ID,
    data: createEpochData,
  }

  // Wait, looking at CreateEpoch accounts, clock is Sysvar<'info, Clock>
  // Need to use Clock sysvar, not instructions
  const SYSVAR_CLOCK_PUBKEY = new PublicKey('SysvarC1ock11111111111111111111111111111111')

  createEpochIx.keys[4] = { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  // Build versioned transaction
  // Ed25519 instruction MUST be first
  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      { keys: ed25519Ix.keys, programId: ed25519Ix.programId, data: ed25519Ix.data },
      createEpochIx,
    ],
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
    console.log('SUCCESS! Epoch created')
    console.log('='.repeat(60))
    console.log()
    console.log('Epoch PDA:', epochPda.toBase58())
    console.log('Epoch ID:', poolData.nextEpochId.toString())
    console.log('Pool:', selectedAsset)
    console.log('Transaction:', signature)
    console.log()
    console.log('Next steps:')
    console.log('  1. Run buy-position tests: npx tsx tests/buy-position.test.ts')
    console.log('  2. View epoch on explorer: https://explorer.fogo.io/tx/' + signature)
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
