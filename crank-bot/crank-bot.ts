/**
 * FogoPulse Crank Bot
 *
 * Standalone bot that manages the full epoch lifecycle:
 * - CREATE_EPOCH: When no active epoch exists
 * - ADVANCE_EPOCH: When epoch is Open and freeze_time has passed
 * - SETTLE_EPOCH: When epoch is Frozen and end_time has passed
 *
 * Run locally:
 *   npm install
 *   cp .env.example .env
 *   # Edit .env with PYTH_ACCESS_TOKEN
 *   npx tsx crank-bot.ts
 *
 * Environment variables:
 *   PYTH_ACCESS_TOKEN - Required: Pyth Lazer API access token
 *   WALLET_PATH - Optional: Path to wallet keypair (default: ~/.config/solana/fogo-testnet.json)
 *   POLL_INTERVAL_SECONDS - Optional: Poll interval in seconds (default: 10)
 *   RPC_URL - Optional: RPC URL (default: https://testnet.fogo.io)
 *   LOG_LEVEL - Optional: Log level (default: info)
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js'
import WebSocket from 'ws'

// Load environment variables
dotenv.config()

// =============================================================================
// CONSTANTS
// =============================================================================

// Program
const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const DEFAULT_RPC_URL = 'https://testnet.fogo.io'

// Asset mints for pool derivation
const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

type Asset = keyof typeof ASSET_MINTS

// Pyth Lazer (FOGO-specific addresses)
const PYTH_PROGRAM_ID = new PublicKey('pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt')
const PYTH_STORAGE_ID = new PublicKey('3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL')
const PYTH_TREASURY_ID = new PublicKey('upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr')
const PYTH_WS_URL = 'wss://pyth-lazer-0.dourolabs.app/v1/stream'

// Pyth Lazer feed IDs (numeric u32 format)
const PYTH_FEED_IDS: Record<Asset, number> = {
  BTC: 1,
  ETH: 2,
  SOL: 5,
  FOGO: 1, // TODO: Using BTC feed as placeholder - DO NOT use FOGO pool until real feed available
}

// Instruction discriminators
const CREATE_EPOCH_DISCRIMINATOR = Buffer.from([115, 111, 36, 230, 59, 145, 168, 27])
const ADVANCE_EPOCH_DISCRIMINATOR = Buffer.from([93, 138, 234, 218, 241, 230, 132, 38])
const SETTLE_EPOCH_DISCRIMINATOR = Buffer.from([148, 223, 178, 38, 201, 158, 167, 13])

// Sysvars and programs
const SYSVAR_CLOCK_PUBKEY = new PublicKey('SysvarC1ock11111111111111111111111111111111')
const ED25519_PROGRAM_ID = new PublicKey('Ed25519SigVerify111111111111111111111111111')

// Pool state mapping (from Pool.active_epoch_state cache)
const POOL_STATE = {
  None: 0,
  Open: 1,
  Frozen: 2,
  Settling: 3,
  Settled: 4,
  Refunded: 5,
} as const

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
}

// Critical errors that should exit the bot
const CRITICAL_ERRORS = [
  'InsufficientFunds',
  'insufficient funds',
  'AccountNotFound',
  'InvalidKeyPair',
  'ENOENT', // File not found (wallet)
]

// =============================================================================
// TYPES
// =============================================================================

interface Config {
  walletPath: string
  pythAccessToken: string
  pollIntervalSeconds: number
  rpcUrl: string
  poolAsset: Asset
  logLevel: LogLevel
}

interface PoolData {
  assetMint: PublicKey
  nextEpochId: bigint
  activeEpoch: PublicKey | null
  activeEpochState: number
}

interface EpochData {
  pool: PublicKey
  epochId: bigint
  state: number
  startTime: bigint
  endTime: bigint
  freezeTime: bigint
  bump: number
}

enum Action {
  NONE = 'NONE',
  CREATE_EPOCH = 'CREATE_EPOCH',
  ADVANCE_EPOCH = 'ADVANCE_EPOCH',
  SETTLE_EPOCH = 'SETTLE_EPOCH',
}

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// =============================================================================
// LOGGING
// =============================================================================

let currentLogLevel = LogLevel.INFO

const log = {
  debug: (msg: string) => logAt(LogLevel.DEBUG, 'DEBUG', msg),
  info: (msg: string) => logAt(LogLevel.INFO, 'INFO', msg),
  warn: (msg: string) => logAt(LogLevel.WARN, 'WARN', msg),
  error: (msg: string) => logAt(LogLevel.ERROR, 'ERROR', msg),
}

function logAt(level: LogLevel, label: string, msg: string) {
  if (level >= currentLogLevel) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [${label}] ${msg}`)
  }
}

function parseLogLevel(level: string): LogLevel {
  switch (level.toLowerCase()) {
    case 'debug': return LogLevel.DEBUG
    case 'info': return LogLevel.INFO
    case 'warn': return LogLevel.WARN
    case 'error': return LogLevel.ERROR
    default: return LogLevel.INFO
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

function defaultWalletPath(): string {
  return path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')
}

function loadConfig(): Config {
  const pythAccessToken = process.env.PYTH_ACCESS_TOKEN
  if (!pythAccessToken) {
    throw new Error('PYTH_ACCESS_TOKEN environment variable required. Get from https://pyth.network/developers')
  }

  const config: Config = {
    walletPath: process.env.WALLET_PATH || defaultWalletPath(),
    pythAccessToken,
    pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS || '10', 10),
    rpcUrl: process.env.RPC_URL || DEFAULT_RPC_URL,
    poolAsset: (process.env.POOL_ASSET?.toUpperCase() as Asset) || 'BTC',
    logLevel: parseLogLevel(process.env.LOG_LEVEL || 'info'),
  }

  // Validate
  if (!(config.poolAsset in ASSET_MINTS)) {
    throw new Error(`Invalid POOL_ASSET: ${config.poolAsset}. Valid options: BTC, ETH, SOL, FOGO`)
  }

  if (config.pollIntervalSeconds < 1) {
    throw new Error('POLL_INTERVAL_SECONDS must be at least 1')
  }

  return config
}

// =============================================================================
// WALLET AND PDA HELPERS
// =============================================================================

function loadWallet(walletPath: string): Keypair {
  log.debug(`Loading wallet from: ${walletPath}`)
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

// =============================================================================
// ACCOUNT PARSERS
// =============================================================================

function parsePoolAccount(data: Buffer): PoolData {
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

function parseEpochAccount(data: Buffer): EpochData {
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

  // Skip remaining fields to get bump
  // start_price (8 bytes, u64)
  offset += 8
  // start_confidence (8 bytes, u64)
  offset += 8
  // start_publish_time (8 bytes, i64)
  offset += 8

  // settlement_price (1 byte option + 8 bytes u64)
  const settlementPriceSome = data.readUInt8(offset)
  offset += 1
  if (settlementPriceSome === 1) offset += 8

  // settlement_confidence (1 byte option + 8 bytes u64)
  const settlementConfidenceSome = data.readUInt8(offset)
  offset += 1
  if (settlementConfidenceSome === 1) offset += 8

  // settlement_publish_time (1 byte option + 8 bytes i64)
  const settlementPublishTimeSome = data.readUInt8(offset)
  offset += 1
  if (settlementPublishTimeSome === 1) offset += 8

  // outcome (1 byte option + 1 byte enum)
  const outcomeSome = data.readUInt8(offset)
  offset += 1
  if (outcomeSome === 1) offset += 1

  // bump (1 byte, u8)
  const bump = data.readUInt8(offset)

  return { pool, epochId, state, startTime, endTime, freezeTime, bump }
}

function getPoolStateName(state: number): string {
  const states = ['None', 'Open', 'Frozen', 'Settling', 'Settled', 'Refunded']
  return states[state] || `Unknown(${state})`
}

// =============================================================================
// PYTH ORACLE INTEGRATION
// =============================================================================

async function fetchPythMessage(feedId: number, accessToken: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Pyth timeout after 30s'))
    }, 30000)

    const ws = new WebSocket(PYTH_WS_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    ws.on('open', () => {
      log.debug('Connected to Pyth Lazer WebSocket')

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
      log.debug(`Subscribed to price feed: ${feedId}`)
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString())

        if (msg.type === 'error') {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(`Pyth API error: ${msg.message || JSON.stringify(msg)}`))
          return
        }

        if (msg.type === 'subscribed') {
          log.debug('Subscription confirmed, waiting for price...')
          return
        }

        if (msg.type === 'streamUpdated' && msg.solana) {
          clearTimeout(timeout)
          ws.close()

          const solanaData = msg.solana.data || msg.solana
          const pythMessage = Buffer.from(solanaData, 'hex')
          log.debug(`Received Pyth message: ${pythMessage.length} bytes`)

          resolve(pythMessage)
        }
      } catch (err) {
        log.warn(`Failed to parse Pyth message: ${err}`)
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Pyth WebSocket error: ${err.message}`))
    })

    ws.on('close', (code, reason) => {
      log.debug(`Pyth WebSocket closed. Code: ${code}`)
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

  // Number of signatures
  data.writeUInt8(1, offset)
  offset += 1

  // Padding
  data.writeUInt8(0, offset)
  offset += 1

  // Signature offset (u16)
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

// =============================================================================
// TRANSACTION BUILDERS
// =============================================================================

function buildCreateEpochData(pythMessage: Buffer): Buffer {
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

function buildSettleEpochData(pythMessage: Buffer): Buffer {
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

async function buildAndSendCreateEpochTx(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  pythMessage: Buffer
): Promise<string> {
  const createEpochData = buildCreateEpochData(pythMessage)
  const pythMessageOffset = 12 // 8 (discriminator) + 4 (vec length)

  // Ed25519 instruction references create_epoch instruction at index 1
  const ed25519Ix = createEd25519Instruction(pythMessage, 1, pythMessageOffset)

  const createEpochIx = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: globalConfigPda, isSigner: false, isWritable: false },
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: epochPda, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: PYTH_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: PYTH_STORAGE_ID, isSigner: false, isWritable: false },
      { pubkey: PYTH_TREASURY_ID, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: createEpochData,
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  // Ed25519 MUST be first
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

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  })

  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  })

  return signature
}

async function buildAndSendAdvanceEpochTx(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey
): Promise<string> {
  const advanceEpochIx = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: globalConfigPda, isSigner: false, isWritable: false },
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: epochPda, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: ADVANCE_EPOCH_DISCRIMINATOR,
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [advanceEpochIx],
  }).compileToV0Message()

  const tx = new VersionedTransaction(messageV0)
  tx.sign([wallet])

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  })

  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  })

  return signature
}

async function buildAndSendSettleEpochTx(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  pythMessage: Buffer
): Promise<string> {
  const settleEpochData = buildSettleEpochData(pythMessage)
  const pythMessageOffset = 12 // 8 (discriminator) + 4 (vec length)

  // Ed25519 instruction references settle_epoch instruction at index 1
  const ed25519Ix = createEd25519Instruction(pythMessage, 1, pythMessageOffset)

  const settleEpochIx = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: globalConfigPda, isSigner: false, isWritable: false },
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: epochPda, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: PYTH_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: PYTH_STORAGE_ID, isSigner: false, isWritable: false },
      { pubkey: PYTH_TREASURY_ID, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: settleEpochData,
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  // Ed25519 MUST be first
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

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  })

  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  })

  return signature
}

// =============================================================================
// RETRY AND ERROR HANDLING
// =============================================================================

function isCriticalError(error: Error): boolean {
  return CRITICAL_ERRORS.some(e => error.message.includes(e))
}

async function withRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      if (isCriticalError(error)) {
        throw error // Don't retry critical errors
      }

      const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
        RETRY_CONFIG.maxDelayMs
      )

      log.warn(`${context} failed (attempt ${attempt}/${RETRY_CONFIG.maxRetries}): ${error.message}`)

      if (attempt < RETRY_CONFIG.maxRetries) {
        await sleep(delay)
      }
    }
  }

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// =============================================================================
// STATE MACHINE
// =============================================================================

function determineAction(
  poolData: PoolData,
  epochData: EpochData | null,
  currentTime: number
): Action {
  // No active epoch - create one
  if (poolData.activeEpoch === null) {
    return Action.CREATE_EPOCH
  }

  // Open state - check if freeze_time passed
  if (poolData.activeEpochState === POOL_STATE.Open) {
    if (epochData && currentTime >= Number(epochData.freezeTime)) {
      return Action.ADVANCE_EPOCH
    }
    return Action.NONE
  }

  // Frozen state - check if end_time passed
  if (poolData.activeEpochState === POOL_STATE.Frozen) {
    if (epochData && currentTime >= Number(epochData.endTime)) {
      return Action.SETTLE_EPOCH
    }
    return Action.NONE
  }

  // Any other state (Settling, Settled, Refunded) - wait
  return Action.NONE
}

// =============================================================================
// MAIN LOOP
// =============================================================================

let isShuttingDown = false
let config: Config
let connection: Connection
let wallet: Keypair
let globalConfigPda: PublicKey
let poolPda: PublicKey
let cycleCount = 0

function setupSignalHandlers() {
  const shutdown = (signal: string) => {
    if (isShuttingDown) return
    isShuttingDown = true
    log.info(`Received ${signal}, shutting down gracefully...`)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

// Returns the current pool state for dynamic poll interval
async function runCycle(): Promise<number> {
  cycleCount++
  const currentTime = Math.floor(Date.now() / 1000)

  try {
    // Fetch pool account
    const poolAccount = await connection.getAccountInfo(poolPda)
    if (!poolAccount) {
      log.error('Pool not found. Ensure pool is created.')
      return POOL_STATE.None
    }

    const poolData = parsePoolAccount(poolAccount.data)

    // Fetch epoch account if active
    let epochData: EpochData | null = null
    if (poolData.activeEpoch) {
      const epochAccount = await connection.getAccountInfo(poolData.activeEpoch)
      if (epochAccount) {
        epochData = parseEpochAccount(epochAccount.data)
      }
    }

    // Determine action
    const action = determineAction(poolData, epochData, currentTime)

    // Log current state
    const stateStr = getPoolStateName(poolData.activeEpochState)
    if (action === Action.NONE) {
      if (epochData) {
        const waitTarget = poolData.activeEpochState === POOL_STATE.Open
          ? Number(epochData.freezeTime)
          : Number(epochData.endTime)
        const waitSecs = Math.max(0, waitTarget - currentTime)
        log.debug(`Cycle ${cycleCount}: ${stateStr}, waiting ${waitSecs}s`)
      } else {
        log.debug(`Cycle ${cycleCount}: ${stateStr}`)
      }
      return poolData.activeEpochState
    }

    log.info(`Cycle ${cycleCount}: ${stateStr} → Action: ${action}`)

    // Execute action
    switch (action) {
      case Action.CREATE_EPOCH: {
        const feedId = PYTH_FEED_IDS[config.poolAsset]
        log.info('Fetching Pyth price for epoch creation...')

        const pythMessage = await withRetry(
          () => fetchPythMessage(feedId, config.pythAccessToken),
          'Pyth fetch'
        )

        const [epochPda] = deriveEpochPda(poolPda, poolData.nextEpochId)
        log.info(`Creating epoch ${poolData.nextEpochId}...`)

        const sig = await withRetry(
          () => buildAndSendCreateEpochTx(connection, wallet, globalConfigPda, poolPda, epochPda, pythMessage),
          'Create epoch'
        )

        log.info(`Epoch ${poolData.nextEpochId} created. TX: ${sig}`)
        log.info(`Explorer: https://explorer.fogo.io/tx/${sig}`)
        break
      }

      case Action.ADVANCE_EPOCH: {
        log.info(`Advancing epoch ${epochData!.epochId} to Frozen...`)

        const sig = await withRetry(
          () => buildAndSendAdvanceEpochTx(connection, wallet, globalConfigPda, poolPda, poolData.activeEpoch!),
          'Advance epoch'
        )

        log.info(`Epoch ${epochData!.epochId} advanced to Frozen. TX: ${sig}`)
        log.info(`Explorer: https://explorer.fogo.io/tx/${sig}`)
        break
      }

      case Action.SETTLE_EPOCH: {
        const feedId = PYTH_FEED_IDS[config.poolAsset]
        log.info('Fetching Pyth price for settlement...')

        const pythMessage = await withRetry(
          () => fetchPythMessage(feedId, config.pythAccessToken),
          'Pyth fetch'
        )

        log.info(`Settling epoch ${epochData!.epochId}...`)

        const sig = await withRetry(
          () => buildAndSendSettleEpochTx(connection, wallet, globalConfigPda, poolPda, poolData.activeEpoch!, pythMessage),
          'Settle epoch'
        )

        log.info(`Epoch ${epochData!.epochId} settled. TX: ${sig}`)
        log.info(`Explorer: https://explorer.fogo.io/tx/${sig}`)

        // Chain: Immediately create next epoch after settlement
        log.info('Chaining: Creating next epoch immediately...')

        // Fetch updated pool state to get nextEpochId
        const updatedPoolAccount = await connection.getAccountInfo(poolPda)
        if (updatedPoolAccount) {
          const updatedPoolData = parsePoolAccount(updatedPoolAccount.data)

          // Verify pool has no active epoch (settlement cleared it)
          // This also guards against race conditions where another crank already created an epoch
          if (updatedPoolData.activeEpoch === null) {
            const pythMessageForCreate = await withRetry(
              () => fetchPythMessage(feedId, config.pythAccessToken),
              'Pyth fetch for create'
            )

            const [newEpochPda] = deriveEpochPda(poolPda, updatedPoolData.nextEpochId)
            log.info(`Creating epoch ${updatedPoolData.nextEpochId}...`)

            try {
              const createSig = await withRetry(
                () => buildAndSendCreateEpochTx(connection, wallet, globalConfigPda, poolPda, newEpochPda, pythMessageForCreate),
                'Create epoch'
              )

              log.info(`Epoch ${updatedPoolData.nextEpochId} created. TX: ${createSig}`)
              log.info(`Explorer: https://explorer.fogo.io/tx/${createSig}`)
            } catch (chainError: any) {
              // Another crank may have created the epoch - this is normal in concurrent operation
              log.warn(`Chained epoch creation failed (another crank may have processed): ${chainError.message}`)
            }
          } else {
            log.info('Epoch already exists (another crank may have created it), skipping chained creation')
          }
        }
        break
      }
    }

    // Return current state (after actions, state may have changed - return Open for new epoch)
    return POOL_STATE.Open

  } catch (error: any) {
    if (isCriticalError(error)) {
      log.error(`Critical error: ${error.message}`)
      isShuttingDown = true
      return POOL_STATE.None
    }

    log.error(`Cycle ${cycleCount} failed: ${error.message}`)
    if (error.stack) {
      log.debug(`Stack trace: ${error.stack}`)
    }
    if (error.logs) {
      log.debug('Program logs:')
      error.logs.forEach((l: string) => log.debug(`  ${l}`))
    }
    return POOL_STATE.None
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('FogoPulse Crank Bot')
  console.log('='.repeat(60))
  console.log()

  // Load configuration
  try {
    config = loadConfig()
  } catch (error: any) {
    console.error('Configuration error:', error.message)
    process.exit(1)
  }

  currentLogLevel = config.logLevel

  log.info(`Pool: ${config.poolAsset}`)
  log.info(`RPC: ${config.rpcUrl}`)
  log.info(`Poll interval: ${config.pollIntervalSeconds}s`)

  // Load wallet
  try {
    wallet = loadWallet(config.walletPath)
    log.info(`Wallet: ${wallet.publicKey.toBase58().slice(0, 8)}...${wallet.publicKey.toBase58().slice(-4)}`)
  } catch (error: any) {
    log.error(`Failed to load wallet: ${error.message}`)
    process.exit(1)
  }

  // Setup connection
  connection = new Connection(config.rpcUrl, 'confirmed')

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey)
  log.info(`Balance: ${(balance / 1e9).toFixed(4)} SOL`)

  if (balance < 0.01 * 1e9) {
    log.error('Insufficient balance. Get SOL from https://faucet.fogo.io/')
    process.exit(1)
  }

  // Derive PDAs
  ;[globalConfigPda] = deriveGlobalConfigPda()
  const assetMint = ASSET_MINTS[config.poolAsset]
  ;[poolPda] = derivePoolPda(assetMint)

  log.info(`GlobalConfig: ${globalConfigPda.toBase58()}`)
  log.info(`Pool: ${poolPda.toBase58()}`)

  // Setup signal handlers
  setupSignalHandlers()

  log.info('Starting main loop...')
  console.log()

  // Dynamic poll intervals
  const FROZEN_POLL_INTERVAL_MS = 5000  // 5s when frozen (waiting for end_time)
  const NORMAL_POLL_INTERVAL_MS = config.pollIntervalSeconds * 1000  // 10s otherwise

  // Main loop
  while (!isShuttingDown) {
    const currentState = await runCycle()

    if (!isShuttingDown) {
      // Use faster polling when frozen (waiting for settlement)
      const pollInterval = currentState === POOL_STATE.Frozen
        ? FROZEN_POLL_INTERVAL_MS
        : NORMAL_POLL_INTERVAL_MS
      await sleep(pollInterval)
    }
  }

  log.info('Crank bot stopped.')
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
