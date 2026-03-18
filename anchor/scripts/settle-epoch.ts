/**
 * Settle Epoch Script
 *
 * Settles an epoch for a pool that has passed its end_time.
 * This script:
 * 1. Finds the active epoch for the specified pool
 * 2. Verifies the epoch has passed its end_time
 * 3. Connects to Pyth Lazer WebSocket to get a signed price message
 * 4. Builds Ed25519 verification instruction
 * 5. Builds settle_epoch instruction
 * 6. Submits transaction to FOGO testnet
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/settle-epoch.ts --pool BTC|ETH|SOL|FOGO
 *
 * Prerequisites:
 *   1. Pool exists with an active epoch in Frozen state
 *   2. Epoch has passed its end_time
 *   3. Create .env file with PYTH_ACCESS_TOKEN
 *
 * Environment (via .env file or environment variables):
 *   WALLET_PATH - Path to wallet keypair (default: ~/.config/solana/fogo-testnet.json)
 *   PYTH_ACCESS_TOKEN - Pyth Lazer API access token (get from pyth.network)
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

// Pyth Lazer WebSocket endpoints
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

// Pyth Lazer feed IDs (numeric u32 format)
// See: https://docs.pyth.network/price-feeds/price-feed-ids
const PYTH_FEED_IDS: Record<string, number> = {
  BTC: 1,
  ETH: 2,
  SOL: 5,
  // TODO: FOGO token does not have a Pyth price feed yet.
  // Using BTC feed as placeholder - DO NOT use FOGO pool in production until
  // a real FOGO feed is available or this is intentionally designed as BTC-correlated.
  FOGO: 1,
}

type Asset = keyof typeof ASSET_MINTS

// settle_epoch instruction discriminator (from IDL)
const SETTLE_EPOCH_DISCRIMINATOR = Buffer.from([
  148, 223, 178, 38, 201, 158, 167, 13
])

// Ed25519 program ID
const ED25519_PROGRAM_ID = new PublicKey('Ed25519SigVerify111111111111111111111111111')

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

  // pending_withdrawal_shares (8 bytes, u64)
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
  endTime: bigint
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
  offset += 8

  // end_time (8 bytes, i64)
  const endTime = data.readBigInt64LE(offset)
  offset += 8

  // freeze_time (8 bytes, i64)
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

  return { pool, epochId, state, endTime, bump }
}

/**
 * Get epoch state name
 */
function getEpochStateName(state: number): string {
  const states = ['Open', 'Frozen', 'Settling', 'Settled', 'Refunded']
  return states[state] || `Unknown(${state})`
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

    const wsUrl = PYTH_LAZER_WS_URLS[0]
    const ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    ws.on('open', () => {
      console.log('  Connected to Pyth Lazer WebSocket')

      const subscribeMsg = {
        type: 'subscribe',
        subscriptionId: 1,
        priceFeedIds: [feedId],
        properties: ['price', 'confidence'],
        formats: ['solana'],
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

        if (msg.type === 'error') {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(`Pyth API error: ${msg.message || JSON.stringify(msg)}`))
          return
        }

        if (msg.type === 'subscribed') {
          console.log('  Subscription confirmed, waiting for price update...')
          return
        }

        if (msg.type === 'streamUpdated' && msg.solana) {
          clearTimeout(timeout)
          ws.close()

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

  const signatureOffset = MAGIC_LEN
  const pubkeyOffset = MAGIC_LEN + SIGNATURE_LEN
  const messageSizeOffset = MAGIC_LEN + SIGNATURE_LEN + PUBKEY_LEN
  const payloadOffset = MAGIC_LEN + SIGNATURE_LEN + PUBKEY_LEN + MESSAGE_SIZE_LEN

  const messageSize = pythMessage.readUInt16LE(messageSizeOffset)

  const data = Buffer.alloc(2 + 14)
  let offset = 0

  data.writeUInt8(1, offset)
  offset += 1

  data.writeUInt8(0, offset)
  offset += 1

  data.writeUInt16LE(messageOffset + signatureOffset, offset)
  offset += 2

  data.writeUInt16LE(instructionIndex, offset)
  offset += 2

  data.writeUInt16LE(messageOffset + pubkeyOffset, offset)
  offset += 2

  data.writeUInt16LE(instructionIndex, offset)
  offset += 2

  data.writeUInt16LE(messageOffset + payloadOffset, offset)
  offset += 2

  data.writeUInt16LE(messageSize, offset)
  offset += 2

  data.writeUInt16LE(instructionIndex, offset)

  return {
    keys: [],
    programId: ED25519_PROGRAM_ID,
    data,
  }
}

/**
 * Build settle_epoch instruction data
 */
function buildSettleEpochData(pythMessage: Buffer): Buffer {
  // Anchor layout:
  // 8 bytes: discriminator
  // 4 bytes: vec length (u32)
  // N bytes: pyth_message
  // 1 byte: ed25519_instruction_index (u8)
  // 1 byte: signature_index (u8)

  const data = Buffer.alloc(8 + 4 + pythMessage.length + 1 + 1)
  let offset = 0

  // Discriminator
  SETTLE_EPOCH_DISCRIMINATOR.copy(data, offset)
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
  console.log('FOGO Pulse - Settle Epoch')
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

  // Check pool exists and has active epoch
  const poolAccount = await connection.getAccountInfo(poolPda)
  if (!poolAccount) {
    console.error('ERROR: Pool not found. Run create-pools.ts first.')
    process.exit(1)
  }

  const poolData = parsePoolAccount(poolAccount.data)
  console.log('Next epoch ID:', poolData.nextEpochId.toString())
  console.log('Active epoch state:', poolData.activeEpochState)

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
  console.log('Epoch end_time:', new Date(Number(epochData.endTime) * 1000).toISOString())

  // Verify epoch is in Frozen state
  if (epochData.state !== EPOCH_STATE.Frozen) {
    console.error(`ERROR: Epoch is in ${getEpochStateName(epochData.state)} state, not Frozen.`)
    console.log('Only epochs in Frozen state can be settled.')
    process.exit(1)
  }

  // Verify epoch has passed end_time
  const currentTime = Math.floor(Date.now() / 1000)
  if (currentTime < Number(epochData.endTime)) {
    const remaining = Number(epochData.endTime) - currentTime
    console.error(`ERROR: Epoch has not reached end_time yet.`)
    console.log(`Time remaining: ${remaining} seconds`)
    console.log(`End time: ${new Date(Number(epochData.endTime) * 1000).toISOString()}`)
    process.exit(1)
  }

  console.log()
  console.log('Fetching Pyth price message...')

  // Fetch signed price message from Pyth Lazer
  const feedId = PYTH_FEED_IDS[selectedAsset]
  const pythMessage = await fetchPythMessage(feedId, accessToken)

  console.log()
  console.log('Building transaction...')

  // Build settle_epoch instruction data
  const settleEpochData = buildSettleEpochData(pythMessage)

  // pythMessageOffset = 8 (discriminator) + 4 (vec length) = 12
  const pythMessageOffset = 12

  // Create Ed25519 instruction (references data in settle_epoch instruction at index 1)
  const ed25519Ix = createEd25519Instruction(pythMessage, 1, pythMessageOffset)

  // Build settle_epoch instruction
  const settleEpochIx = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },           // payer
      { pubkey: globalConfigPda, isSigner: false, isWritable: false },          // global_config
      { pubkey: poolPda, isSigner: false, isWritable: true },                   // pool
      { pubkey: poolData.activeEpoch, isSigner: false, isWritable: true },      // epoch
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },      // clock
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false }, // instructions_sysvar
      { pubkey: PYTH_PROGRAM_ID, isSigner: false, isWritable: false },          // pyth_program
      { pubkey: PYTH_STORAGE_ID, isSigner: false, isWritable: false },          // pyth_storage
      { pubkey: PYTH_TREASURY_ID, isSigner: false, isWritable: true },          // pyth_treasury
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },  // system_program
    ],
    programId: PROGRAM_ID,
    data: settleEpochData,
  }

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  // Build versioned transaction
  // Ed25519 instruction MUST be first
  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      { keys: ed25519Ix.keys, programId: ed25519Ix.programId, data: ed25519Ix.data },
      settleEpochIx,
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
    console.log('SUCCESS! Epoch settled')
    console.log('='.repeat(60))
    console.log()
    console.log('Epoch PDA:', poolData.activeEpoch.toBase58())
    console.log('Epoch ID:', epochData.epochId.toString())
    console.log('Pool:', selectedAsset)
    console.log('Transaction:', signature)
    console.log()
    console.log('View on explorer: https://explorer.fogo.io/tx/' + signature)
    console.log()
    console.log('Next steps:')
    console.log('  1. Check epoch outcome (Up, Down, or Refunded)')
    console.log('  2. Run claim-payout for winning positions')
    console.log('  3. Create a new epoch: npx tsx scripts/create-test-epoch.ts --pool', selectedAsset)
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
