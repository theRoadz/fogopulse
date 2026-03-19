/**
 * FogoPulse Crank Bot
 *
 * Standalone bot that manages the full epoch lifecycle:
 * - CREATE_EPOCH: When no active epoch exists
 * - ADVANCE_EPOCH: When epoch is Open and freeze_time has passed
 * - SETTLE_EPOCH: When epoch is Frozen and end_time has passed
 *
 * Supports multi-pool concurrent execution via PoolRunner instances,
 * sharing a single persistent Pyth WebSocket and RPC connection.
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
 *   POOL_ASSETS - Optional: Comma-separated pools (default: BTC,ETH,SOL,FOGO)
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as readline from 'readline'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
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
  FOGO: 2923, // FOGO/USD (confirmed stable on Pyth Lazer)
}

// USDC Mint (FOGO Testnet)
const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')

// Instruction discriminators
const CREATE_EPOCH_DISCRIMINATOR = Buffer.from([115, 111, 36, 230, 59, 145, 168, 27])
const ADVANCE_EPOCH_DISCRIMINATOR = Buffer.from([93, 138, 234, 218, 241, 230, 132, 38])
const SETTLE_EPOCH_DISCRIMINATOR = Buffer.from([148, 223, 178, 38, 201, 158, 167, 13])
const PROCESS_WITHDRAWAL_DISCRIMINATOR = Buffer.from([51, 97, 236, 17, 37, 33, 196, 64])
const CRANK_PROCESS_WITHDRAWAL_DISCRIMINATOR = Buffer.from([27, 194, 37, 86, 75, 227, 102, 217])

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
  idlePollIntervalSeconds: number
  rpcUrl: string
  poolAssets: Asset[]
  logLevel: LogLevel
  autoCreateEpoch: boolean
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

interface ChainResult {
  freezeTime: number
  endTime: number
  epochPda: PublicKey
  epochId: bigint
}

interface SharedContext {
  connection: Connection
  wallet: Keypair
  globalConfigPda: PublicKey
  pythManager: PythPriceManager
  config: Config
}

interface PoolLogger {
  debug: (msg: string) => void
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
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

function createPoolLogger(asset: Asset): PoolLogger {
  const prefix = `[${asset}]`
  return {
    debug: (msg: string) => logAt(LogLevel.DEBUG, 'DEBUG', `${prefix} ${msg}`),
    info: (msg: string) => logAt(LogLevel.INFO, 'INFO', `${prefix} ${msg}`),
    warn: (msg: string) => logAt(LogLevel.WARN, 'WARN', `${prefix} ${msg}`),
    error: (msg: string) => logAt(LogLevel.ERROR, 'ERROR', `${prefix} ${msg}`),
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
// CLI HELPERS
// =============================================================================

async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase().startsWith('y'))
    })
  })
}

// =============================================================================
// CONFIGURATION
// =============================================================================

function defaultWalletPath(): string {
  return path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')
}

function loadConfig(autoCreateOverride?: boolean, poolsOverride?: Asset[]): Config {
  const pythAccessToken = process.env.PYTH_ACCESS_TOKEN

  if (!pythAccessToken) {
    throw new Error('PYTH_ACCESS_TOKEN environment variable required. Get from https://pyth.network/developers')
  }

  // Determine pool assets: CLI --pools > POOL_ASSETS env > POOL_ASSET env > default
  let poolAssets: Asset[]
  if (poolsOverride) {
    poolAssets = poolsOverride
  } else if (process.env.POOL_ASSETS) {
    const raw = process.env.POOL_ASSETS.replace(/['"]/g, '').trim()
    poolAssets = raw.split(',').map(a => a.trim().toUpperCase() as Asset)
  } else if (process.env.POOL_ASSET) {
    const raw = process.env.POOL_ASSET.replace(/['"]/g, '').trim()
    poolAssets = raw.includes(',')
      ? raw.split(',').map(a => a.trim().toUpperCase() as Asset)
      : [raw.toUpperCase() as Asset]
  } else {
    poolAssets = ['BTC', 'ETH', 'SOL', 'FOGO']
  }

  const config: Config = {
    walletPath: process.env.WALLET_PATH || defaultWalletPath(),
    pythAccessToken,
    pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS || '10', 10),
    idlePollIntervalSeconds: parseInt(process.env.IDLE_POLL_INTERVAL_SECONDS || '180', 10),
    rpcUrl: process.env.RPC_URL || DEFAULT_RPC_URL,
    poolAssets,
    logLevel: parseLogLevel(process.env.LOG_LEVEL || 'info'),
    autoCreateEpoch: autoCreateOverride ?? (process.env.AUTO_CREATE_EPOCH !== 'false'),
  }

  // Validate each asset
  for (const asset of config.poolAssets) {
    if (!(asset in ASSET_MINTS)) {
      throw new Error(`Invalid pool asset: ${asset}. Valid options: BTC, ETH, SOL, FOGO`)
    }
  }

  // Deduplicate pool assets (prevent duplicate runners racing on the same pool)
  config.poolAssets = [...new Set(config.poolAssets)]

  if (config.poolAssets.length === 0) {
    throw new Error('At least one pool asset must be configured')
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

/**
 * One-shot Pyth WebSocket fetch (used as fallback when persistent WS is down)
 */
async function fetchPythMessage(feedId: number, accessToken: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        ws.close()
      } catch {
        // Ignore close errors on timeout
      }
      reject(new Error('Pyth timeout after 30s'))
    }, 30000)

    const ws = new WebSocket(PYTH_WS_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    ws.on('open', () => {
      log.debug('Connected to Pyth Lazer WebSocket (one-shot)')

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

// =============================================================================
// PYTH PRICE MANAGER (Persistent WebSocket)
// =============================================================================

class PythPriceManager {
  private ws: WebSocket | null = null
  private latestMessages = new Map<number, { message: Buffer, timestamp: number }>()
  private feedIds: number[]
  private accessToken: string
  private isConnected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private waiters = new Map<number, Array<(message: Buffer) => void>>()
  // Map subscriptionId → feedId for routing messages
  private subIdToFeedId = new Map<number, number>()

  constructor(feedIds: number[], accessToken: string) {
    this.feedIds = feedIds
    this.accessToken = accessToken
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('PythPriceManager connection timeout after 30s'))
      }, 30000)

      this.ws = new WebSocket(PYTH_WS_URL, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      })

      this.ws.on('open', () => {
        log.info('PythPriceManager: Connected to Pyth Lazer WebSocket')
        this.isConnected = true
        this.reconnectAttempts = 0

        // Subscribe to each feed separately so each gets its own Solana message
        this.feedIds.forEach((feedId, index) => {
          const subId = index + 1
          this.subIdToFeedId.set(subId, feedId)

          const subscribeMsg = {
            type: 'subscribe',
            subscriptionId: subId,
            priceFeedIds: [feedId],
            properties: ['price', 'confidence'],
            formats: ['solana'],
            deliveryFormat: 'json',
            channel: 'fixed_rate@200ms',
            jsonBinaryEncoding: 'hex',
          }

          this.ws!.send(JSON.stringify(subscribeMsg))
        })
        log.info(`PythPriceManager: Subscribed to ${this.feedIds.length} feeds: [${this.feedIds.join(', ')}]`)
      })

      let subscribedCount = 0
      let resolved = false
      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())

          if (msg.type === 'subscribed') {
            subscribedCount++
            log.debug(`PythPriceManager: Subscription ${msg.subscriptionId} confirmed (${subscribedCount}/${this.feedIds.length})`)
            if (subscribedCount >= this.feedIds.length && !resolved) {
              resolved = true
              clearTimeout(timeout)
              log.info(`PythPriceManager: All ${this.feedIds.length} subscriptions confirmed`)
              resolve()
            }
            return
          }

          if (msg.type === 'error') {
            log.warn(`PythPriceManager: API error: ${msg.message || JSON.stringify(msg)}`)
            return
          }

          if (msg.type === 'streamUpdated' && msg.solana) {
            const solanaData = msg.solana.data || msg.solana
            const pythMessage = Buffer.from(solanaData, 'hex')

            // Route message to correct feed using subscriptionId
            const msgFeedId = this.subIdToFeedId.get(msg.subscriptionId)
            if (msgFeedId != null) {
              this.latestMessages.set(msgFeedId, {
                message: pythMessage,
                timestamp: Date.now(),
              })

              // Notify any waiters for this feed
              const feedWaiters = this.waiters.get(msgFeedId)
              if (feedWaiters && feedWaiters.length > 0) {
                const waiter = feedWaiters.shift()!
                waiter(pythMessage)
                if (feedWaiters.length === 0) {
                  this.waiters.delete(msgFeedId)
                }
              }
            }
          }
        } catch (err) {
          // Ignore parse errors on streaming data
        }
      })

      this.ws.on('error', (err) => {
        log.warn(`PythPriceManager: WebSocket error: ${err.message}`)
        this.isConnected = false
        clearTimeout(timeout)
        if (!resolved) {
          resolved = true
          reject(new Error(`PythPriceManager: WebSocket error: ${err.message}`))
        }
      })

      this.ws.on('close', (code) => {
        log.warn(`PythPriceManager: WebSocket closed (code: ${code})`)
        this.isConnected = false
        if (!resolved) {
          resolved = true
          reject(new Error(`PythPriceManager: WebSocket closed before subscriptions confirmed (code: ${code})`))
        }
        this.scheduleReconnect()
      })
    })
  }

  private scheduleReconnect(): void {
    if (isShuttingDown || this.reconnectTimer) return

    this.reconnectAttempts++
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      log.error('PythPriceManager: Max reconnect attempts reached, falling back to one-shot connections')
      return
    }

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts - 1),
      30000
    )
    log.info(`PythPriceManager: Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`)

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (isShuttingDown) return
      try {
        await this.connect()
      } catch (err: any) {
        log.warn(`PythPriceManager: Reconnect failed: ${err.message}`)
        this.scheduleReconnect()
      }
    }, delay)
  }

  async waitForFreshMessage(feedId: number, maxAgeSeconds = 10, timeoutMs = 30000): Promise<Buffer> {
    // Check cache first
    const cached = this.latestMessages.get(feedId)
    if (cached) {
      const ageMs = Date.now() - cached.timestamp
      if (ageMs < maxAgeSeconds * 1000) {
        return cached.message
      }
    }

    // If persistent WS is connected, wait for next update
    if (this.isConnected) {
      return new Promise<Buffer>((resolve, reject) => {
        const timeout = setTimeout(() => {
          // Remove waiter on timeout
          const feedWaiters = this.waiters.get(feedId)
          if (feedWaiters) {
            const idx = feedWaiters.indexOf(resolveHandler)
            if (idx >= 0) feedWaiters.splice(idx, 1)
          }
          // Fallback to one-shot
          log.warn(`PythPriceManager: Timeout waiting for feed ${feedId}, falling back to one-shot`)
          fetchPythMessage(feedId, this.accessToken).then(resolve).catch(reject)
        }, timeoutMs)

        const resolveHandler = (message: Buffer) => {
          clearTimeout(timeout)
          resolve(message)
        }

        if (!this.waiters.has(feedId)) {
          this.waiters.set(feedId, [])
        }
        this.waiters.get(feedId)!.push(resolveHandler)
      })
    }

    // Persistent WS is down — use one-shot fallback
    log.warn(`PythPriceManager: Persistent WS down, using one-shot fallback for feed ${feedId}`)
    return fetchPythMessage(feedId, this.accessToken)
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
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
  data.writeUInt16LE(messageOffset + MAGIC_LEN + SIGNATURE_LEN + PUBKEY_LEN + MESSAGE_SIZE_LEN, offset)
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
// WITHDRAWAL PROCESSING HELPERS
// =============================================================================

// LpShare account discriminator
const LP_SHARE_DISCRIMINATOR = Buffer.from([137, 210, 47, 236, 167, 57, 72, 145])

interface PendingWithdrawal {
  lpSharePda: PublicKey
  user: PublicKey
  pool: PublicKey
  pendingWithdrawalShares: bigint
}

/**
 * Find all LpShare accounts with pending withdrawals for a specific pool.
 * Uses memcmp filters on discriminator, pool pubkey, and non-zero pending_withdrawal.
 * Filters out accounts still within cooldown period to avoid wasting transactions.
 *
 * LpShare layout (after 8-byte discriminator):
 *   user: Pubkey (32 bytes) offset 8
 *   pool: Pubkey (32 bytes) offset 40
 *   shares: u64 (8 bytes) offset 72
 *   deposited_amount: u64 (8 bytes) offset 80
 *   pending_withdrawal: u64 (8 bytes) offset 88
 *   withdrawal_requested_at: Option<i64> (1+8 bytes) offset 96
 */
async function findPendingWithdrawals(
  conn: Connection,
  poolPubkey: PublicKey
): Promise<PendingWithdrawal[]> {
  const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
    filters: [
      // Match LpShare discriminator
      { memcmp: { offset: 0, bytes: LP_SHARE_DISCRIMINATOR.toString('base64'), encoding: 'base64' } },
      // Match pool pubkey at offset 40
      { memcmp: { offset: 40, bytes: poolPubkey.toBase58() } },
    ],
  })

  const pending: PendingWithdrawal[] = []
  const now = BigInt(Math.floor(Date.now() / 1000))
  const cooldownSeconds = 60n // WITHDRAWAL_COOLDOWN_SECONDS

  for (const { pubkey, account } of accounts) {
    const data = account.data
    // Read pending_withdrawal at offset 88 (8 bytes u64)
    const pendingWithdrawalShares = data.readBigUInt64LE(88)
    if (pendingWithdrawalShares > 0n) {
      // Read withdrawal_requested_at: Option<i64> at offset 96
      // Borsh Option layout: 1 byte tag (0=None, 1=Some) + 8 bytes i64 if Some
      const optionTag = data.readUInt8(96)
      if (optionTag === 1) {
        const requestedAt = data.readBigInt64LE(97)
        if (now < requestedAt + cooldownSeconds) {
          // Still in cooldown — skip to avoid wasting a transaction
          continue
        }
      }

      const user = new PublicKey(data.subarray(8, 40))
      const pool = new PublicKey(data.subarray(40, 72))
      pending.push({ lpSharePda: pubkey, user, pool, pendingWithdrawalShares })
    }
  }

  return pending
}

function deriveLpSharePda(user: PublicKey, pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('lp_share'), user.toBuffer(), pool.toBuffer()],
    PROGRAM_ID
  )
}

/**
 * Build and send a crank_process_withdrawal transaction for a pending withdrawal.
 * Uses the permissionless crank_process_withdrawal instruction — no session/user
 * signature required. The crank bot just pays the TX fee; USDC goes to the LP user.
 */
async function buildAndSendProcessWithdrawalTx(
  conn: Connection,
  crankWallet: Keypair,
  globalConfigPda: PublicKey,
  poolPubkey: PublicKey,
  withdrawal: PendingWithdrawal
): Promise<string> {
  const { user, lpSharePda } = withdrawal

  // Derive token accounts
  const poolUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, poolPubkey, true)
  const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, user)

  // Build instruction data: discriminator only (no user arg — derived from lp_share on-chain)
  const data = Buffer.alloc(8)
  CRANK_PROCESS_WITHDRAWAL_DISCRIMINATOR.copy(data, 0)

  const crankProcessWithdrawalIx = {
    keys: [
      { pubkey: crankWallet.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: globalConfigPda, isSigner: false, isWritable: false },     // config
      { pubkey: poolPubkey, isSigner: false, isWritable: true },           // pool
      { pubkey: lpSharePda, isSigner: false, isWritable: true },           // lp_share
      { pubkey: poolUsdcAta, isSigner: false, isWritable: true },          // pool_usdc
      { pubkey: userUsdcAta, isSigner: false, isWritable: true },          // user_usdc
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },           // usdc_mint
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },    // token_program
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associated_token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },     // system_program
    ],
    programId: PROGRAM_ID,
    data,
  }

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash()

  const messageV0 = new TransactionMessage({
    payerKey: crankWallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [crankProcessWithdrawalIx],
  }).compileToV0Message()

  const tx = new VersionedTransaction(messageV0)
  tx.sign([crankWallet])

  const signature = await conn.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  })

  await conn.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  })

  return signature
}

/**
 * Process all pending withdrawals for a pool.
 * Called between settle_epoch and create_epoch in the crank chain.
 */
async function processPendingWithdrawals(
  conn: Connection,
  crankWallet: Keypair,
  globalConfigPda: PublicKey,
  poolPubkey: PublicKey,
  poolAsset: string,
  poolLog: PoolLogger
): Promise<number> {
  const pending = await findPendingWithdrawals(conn, poolPubkey)

  if (pending.length === 0) {
    poolLog.debug('No pending withdrawals to process')
    return 0
  }

  poolLog.info(`Found ${pending.length} pending withdrawal(s) to process`)

  let processed = 0
  for (const withdrawal of pending) {
    try {
      const sig = await buildAndSendProcessWithdrawalTx(
        conn, crankWallet, globalConfigPda, poolPubkey, withdrawal
      )
      poolLog.info(`Processed withdrawal for ${withdrawal.user.toBase58().slice(0, 8)}... (${withdrawal.pendingWithdrawalShares} shares). TX: ${sig}`)
      poolLog.info(`Explorer: https://explorer.fogo.io/tx/${sig}`)
      processed++
    } catch (error: any) {
      // Gracefully handle expected on-chain rejections (race conditions, timing)
      if (error.message?.includes('NoPendingWithdrawal') || error.message?.includes('CooldownNotElapsed') || error.message?.includes('WithdrawalBlockedDuringEpoch')) {
        poolLog.debug(`Skipping withdrawal for ${withdrawal.user.toBase58().slice(0, 8)}...: ${error.message}`)
      } else {
        poolLog.warn(`Failed to process withdrawal for ${withdrawal.user.toBase58().slice(0, 8)}...: ${error.message}`)
      }
    }
  }

  if (processed > 0) {
    poolLog.info(`Processed ${processed}/${pending.length} pending withdrawal(s)`)
  }

  return processed
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
  return new Promise(resolve => {
    const checkInterval = 1000  // Check every 1 second for shutdown
    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += checkInterval
      if (isShuttingDown || elapsed >= ms) {
        clearInterval(timer)
        resolve()
      }
    }, checkInterval)
  })
}

// =============================================================================
// STATE MACHINE
// =============================================================================

function determineAction(
  poolData: PoolData,
  epochData: EpochData | null,
  currentTime: number,
  autoCreateEpoch: boolean
): Action {
  // No active epoch - check if auto-create is enabled
  if (poolData.activeEpoch === null) {
    if (autoCreateEpoch) {
      return Action.CREATE_EPOCH
    }
    return Action.NONE  // Skip creation, stay idle
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
// POOL RUNNER
// =============================================================================

let isShuttingDown = false

class PoolRunner {
  private shared: SharedContext
  private poolAsset: Asset
  private poolPda: PublicKey
  private feedId: number
  private log: PoolLogger
  private cycleCount = 0

  constructor(shared: SharedContext, poolAsset: Asset) {
    this.shared = shared
    this.poolAsset = poolAsset
    this.feedId = PYTH_FEED_IDS[poolAsset]
    this.log = createPoolLogger(poolAsset)

    const assetMint = ASSET_MINTS[poolAsset]
    ;[this.poolPda] = derivePoolPda(assetMint)

    this.log.info(`Pool PDA: ${this.poolPda.toBase58()}`)
    this.log.info(`Feed ID: ${this.feedId}`)
  }

  async start(): Promise<void> {
    this.log.info('Starting pool runner...')

    // Dynamic poll intervals
    const IDLE_POLL_INTERVAL_MS = this.shared.config.idlePollIntervalSeconds * 1000
    const NORMAL_POLL_INTERVAL_MS = this.shared.config.pollIntervalSeconds * 1000
    const FROZEN_POLL_INTERVAL_MS = 2000

    while (!isShuttingDown) {
      try {
        const result = await this.runCycle()

        if (!isShuttingDown) {
          let pollInterval: number
          if (result.nextActionMs != null && result.nextActionMs > 0) {
            // Sleep precisely until the next action time (+ 500ms buffer)
            pollInterval = result.nextActionMs + 500
          } else if (result.state === POOL_STATE.None) {
            pollInterval = IDLE_POLL_INTERVAL_MS
          } else if (result.state === POOL_STATE.Frozen) {
            pollInterval = FROZEN_POLL_INTERVAL_MS
          } else {
            pollInterval = NORMAL_POLL_INTERVAL_MS
          }
          await sleep(pollInterval)
        }
      } catch (error: any) {
        if (isCriticalError(error)) {
          this.log.error(`Critical error: ${error.message}`)
          isShuttingDown = true
          return
        }

        this.log.error(`Unhandled error in pool runner: ${error.message}`)
        if (error.stack) {
          this.log.debug(`Stack trace: ${error.stack}`)
        }
        if (!isShuttingDown) {
          await sleep(RETRY_CONFIG.baseDelayMs)
        }
      }
    }

    this.log.info('Pool runner stopped.')
  }

  private async settleAndCreateNext(
    epochPda: PublicKey,
    epochId: bigint
  ): Promise<ChainResult | null> {
    this.log.info('Fetching Pyth price for settlement...')

    const pythMessage = await withRetry(
      () => this.shared.pythManager.waitForFreshMessage(this.feedId),
      'Pyth fetch'
    )

    this.log.info(`Settling epoch ${epochId}...`)

    const sig = await withRetry(
      () => buildAndSendSettleEpochTx(this.shared.connection, this.shared.wallet, this.shared.globalConfigPda, this.poolPda, epochPda, pythMessage),
      'Settle epoch'
    )

    this.log.info(`Epoch ${epochId} settled. TX: ${sig}`)
    this.log.info(`Explorer: https://explorer.fogo.io/tx/${sig}`)

    // Process pending withdrawals before creating next epoch
    try {
      await processPendingWithdrawals(this.shared.connection, this.shared.wallet, this.shared.globalConfigPda, this.poolPda, this.poolAsset, this.log)
    } catch (withdrawalError: any) {
      this.log.warn(`Failed to process pending withdrawals: ${withdrawalError.message}`)
    }

    // Chain: Immediately create next epoch after settlement (if auto-create enabled)
    if (!this.shared.config.autoCreateEpoch) {
      this.log.info('Auto-create disabled, skipping chained epoch creation')
      return null
    }

    if (isShuttingDown) return null

    this.log.info('Chaining: Creating next epoch immediately...')

    // Fetch updated pool state to get nextEpochId
    const updatedPoolAccount = await withRetry(
      () => this.shared.connection.getAccountInfo(this.poolPda),
      'Fetch pool after settlement'
    )
    if (!updatedPoolAccount) return null

    const updatedPoolData = parsePoolAccount(updatedPoolAccount.data)

    // Verify pool has no active epoch (settlement cleared it)
    if (updatedPoolData.activeEpoch !== null) {
      this.log.info('Epoch already exists (another crank may have created it), skipping chained creation')
      return null
    }

    const pythMessageForCreate = await withRetry(
      () => this.shared.pythManager.waitForFreshMessage(this.feedId),
      'Pyth fetch for create'
    )

    const [newEpochPda] = deriveEpochPda(this.poolPda, updatedPoolData.nextEpochId)
    this.log.info(`Creating epoch ${updatedPoolData.nextEpochId}...`)

    try {
      const createSig = await withRetry(
        () => buildAndSendCreateEpochTx(this.shared.connection, this.shared.wallet, this.shared.globalConfigPda, this.poolPda, newEpochPda, pythMessageForCreate),
        'Create epoch'
      )

      this.log.info(`Epoch ${updatedPoolData.nextEpochId} created. TX: ${createSig}`)
      this.log.info(`Explorer: https://explorer.fogo.io/tx/${createSig}`)

      // Fetch the new epoch to get timing data for continued chaining
      const newEpochAccount = await withRetry(
        () => this.shared.connection.getAccountInfo(newEpochPda),
        'Fetch new epoch for chaining'
      )
      if (newEpochAccount) {
        const newEpochData = parseEpochAccount(newEpochAccount.data)
        return {
          freezeTime: Number(newEpochData.freezeTime),
          endTime: Number(newEpochData.endTime),
          epochPda: newEpochPda,
          epochId: newEpochData.epochId,
        }
      }
    } catch (chainError: any) {
      // Another crank may have created the epoch - this is normal in concurrent operation
      this.log.warn(`Chained epoch creation failed (another crank may have processed): ${chainError.message}`)
    }

    return null
  }

  private async runChainLoop(
    initialFreezeTime: number,
    initialEndTime: number,
    initialEpochPda: PublicKey,
    initialEpochId: bigint
  ): Promise<void> {
    let freezeTime = initialFreezeTime
    let endTime = initialEndTime
    let epochPda = initialEpochPda
    let epochId = initialEpochId

    while (!isShuttingDown) {
      // Wait until freezeTime
      const nowSec1 = Math.floor(Date.now() / 1000)
      const waitToFreeze = Math.max(0, (freezeTime - nowSec1) * 1000)
      if (waitToFreeze > 0) {
        this.log.info(`Chaining: Waiting ${Math.ceil(waitToFreeze / 1000)}s until freezeTime...`)
        await sleep(waitToFreeze)
      }
      if (isShuttingDown) break

      // Advance to Frozen
      this.log.info(`Chaining: Advancing epoch ${epochId} to Frozen...`)
      const advSig = await withRetry(
        () => buildAndSendAdvanceEpochTx(this.shared.connection, this.shared.wallet, this.shared.globalConfigPda, this.poolPda, epochPda),
        'Advance epoch'
      )
      this.log.info(`Epoch ${epochId} advanced to Frozen. TX: ${advSig}`)
      this.log.info(`Explorer: https://explorer.fogo.io/tx/${advSig}`)

      // Wait until endTime
      const nowSec2 = Math.floor(Date.now() / 1000)
      const waitToEnd = Math.max(0, (endTime - nowSec2) * 1000)
      if (waitToEnd > 0) {
        this.log.info(`Chaining: Waiting ${Math.ceil(waitToEnd / 1000)}s until endTime for settlement...`)
        await sleep(waitToEnd)
      }
      if (isShuttingDown) break

      // Settle and create next
      const chainResult = await this.settleAndCreateNext(epochPda, epochId)
      if (!chainResult) break  // Auto-create disabled, creation failed, or shutdown

      // Continue chain with the new epoch
      freezeTime = chainResult.freezeTime
      endTime = chainResult.endTime
      epochPda = chainResult.epochPda
      epochId = chainResult.epochId
    }
  }

  private async runCycle(): Promise<{ state: number, nextActionMs?: number }> {
    this.cycleCount++
    const currentTime = Math.floor(Date.now() / 1000)

    try {
      // Fetch pool account (with retry for transient network errors)
      const poolAccount = await withRetry(
        () => this.shared.connection.getAccountInfo(this.poolPda),
        'Fetch pool account'
      )
      if (!poolAccount) {
        this.log.error('Pool not found. Ensure pool is created.')
        return { state: POOL_STATE.None }
      }

      const poolData = parsePoolAccount(poolAccount.data)

      // Fetch epoch account if active (with retry for transient network errors)
      let epochData: EpochData | null = null
      if (poolData.activeEpoch) {
        const epochAccount = await withRetry(
          () => this.shared.connection.getAccountInfo(poolData.activeEpoch!),
          'Fetch epoch account'
        )
        if (epochAccount) {
          epochData = parseEpochAccount(epochAccount.data)
        }
      }

      // Determine action
      const action = determineAction(poolData, epochData, currentTime, this.shared.config.autoCreateEpoch)

      // Log current state
      const stateStr = getPoolStateName(poolData.activeEpochState)
      if (action === Action.NONE) {
        if (epochData) {
          const waitTarget = poolData.activeEpochState === POOL_STATE.Open
            ? Number(epochData.freezeTime)
            : Number(epochData.endTime)
          const waitSecs = Math.max(0, waitTarget - currentTime)
          this.log.debug(`Cycle ${this.cycleCount}: ${stateStr}, waiting ${waitSecs}s`)
          return { state: poolData.activeEpochState, nextActionMs: waitSecs * 1000 }
        } else {
          this.log.debug(`Cycle ${this.cycleCount}: ${stateStr}`)
        }
        return { state: poolData.activeEpochState }
      }

      this.log.info(`Cycle ${this.cycleCount}: ${stateStr} → Action: ${action}`)

      // Execute action
      switch (action) {
        case Action.CREATE_EPOCH: {
          this.log.info('Fetching Pyth price for epoch creation...')

          const pythMessage = await withRetry(
            () => this.shared.pythManager.waitForFreshMessage(this.feedId),
            'Pyth fetch'
          )

          const [epochPda] = deriveEpochPda(this.poolPda, poolData.nextEpochId)
          this.log.info(`Creating epoch ${poolData.nextEpochId}...`)

          const sig = await withRetry(
            () => buildAndSendCreateEpochTx(this.shared.connection, this.shared.wallet, this.shared.globalConfigPda, this.poolPda, epochPda, pythMessage),
            'Create epoch'
          )

          this.log.info(`Epoch ${poolData.nextEpochId} created. TX: ${sig}`)
          this.log.info(`Explorer: https://explorer.fogo.io/tx/${sig}`)

          // Chain: Fetch epoch times and run deterministic lifecycle loop
          if (!isShuttingDown) {
            const newEpochAccount = await withRetry(
              () => this.shared.connection.getAccountInfo(epochPda),
              'Fetch new epoch for chaining'
            )
            if (newEpochAccount) {
              const newEpochData = parseEpochAccount(newEpochAccount.data)
              await this.runChainLoop(
                Number(newEpochData.freezeTime),
                Number(newEpochData.endTime),
                epochPda,
                newEpochData.epochId
              )
            }
          }
          break
        }

        case Action.ADVANCE_EPOCH: {
          this.log.info(`Advancing epoch ${epochData!.epochId} to Frozen...`)

          const sig = await withRetry(
            () => buildAndSendAdvanceEpochTx(this.shared.connection, this.shared.wallet, this.shared.globalConfigPda, this.poolPda, poolData.activeEpoch!),
            'Advance epoch'
          )

          this.log.info(`Epoch ${epochData!.epochId} advanced to Frozen. TX: ${sig}`)
          this.log.info(`Explorer: https://explorer.fogo.io/tx/${sig}`)

          // Chain: Sleep until endTime then settle
          if (!isShuttingDown) {
            const nowSec = Math.floor(Date.now() / 1000)
            const endTimeSec = Number(epochData!.endTime)
            const waitMs = Math.max(0, (endTimeSec - nowSec) * 1000)

            if (waitMs > 0) {
              this.log.info(`Chaining: Waiting ${Math.ceil(waitMs / 1000)}s until endTime for settlement...`)
              await sleep(waitMs)
            }

            if (!isShuttingDown) {
              const chainResult = await this.settleAndCreateNext(poolData.activeEpoch!, epochData!.epochId)

              // If a new epoch was created, continue the chain loop
              if (chainResult && !isShuttingDown) {
                await this.runChainLoop(
                  chainResult.freezeTime,
                  chainResult.endTime,
                  chainResult.epochPda,
                  chainResult.epochId
                )
              }
            }
          }
          break
        }

        case Action.SETTLE_EPOCH: {
          const chainResult = await this.settleAndCreateNext(poolData.activeEpoch!, epochData!.epochId)

          // If a new epoch was created, continue the chain loop
          if (chainResult && !isShuttingDown) {
            await this.runChainLoop(
              chainResult.freezeTime,
              chainResult.endTime,
              chainResult.epochPda,
              chainResult.epochId
            )
          }
          break
        }
      }

      // Return current state (after actions, state may have changed - return Open for new epoch)
      return { state: POOL_STATE.Open }

    } catch (error: any) {
      if (isCriticalError(error)) {
        this.log.error(`Critical error: ${error.message}`)
        isShuttingDown = true
        return { state: POOL_STATE.None }
      }

      this.log.error(`Cycle ${this.cycleCount} failed: ${error.message}`)
      if (error.stack) {
        this.log.debug(`Stack trace: ${error.stack}`)
      }
      if (error.logs) {
        this.log.debug('Program logs:')
        error.logs.forEach((l: string) => this.log.debug(`  ${l}`))
      }
      return { state: POOL_STATE.None }
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================

function setupSignalHandlers() {
  const shutdown = (signal: string) => {
    if (isShuttingDown) return
    isShuttingDown = true
    log.info(`Received ${signal}, shutting down gracefully...`)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

async function main() {
  console.log('='.repeat(60))
  console.log('FogoPulse Crank Bot')
  console.log('='.repeat(60))
  console.log()

  // Parse CLI arguments
  const args = process.argv.slice(2)
  const hasEpochFlag = args.includes('--epoch')
  const hasNoEpochFlag = args.includes('--no-epoch')

  let autoCreateOverride: boolean | undefined
  let poolsOverride: Asset[] | undefined

  if (hasEpochFlag) {
    autoCreateOverride = true
  } else if (hasNoEpochFlag) {
    autoCreateOverride = false
  } else if (process.env.AUTO_CREATE_EPOCH === undefined) {
    // No CLI flag and no env var - prompt user
    autoCreateOverride = await promptYesNo('Auto-create epochs when none exists?')
  }
  // else: env var is set, let loadConfig handle it (autoCreateOverride stays undefined)

  // Parse --pools flag
  const poolsIdx = args.indexOf('--pools')
  if (poolsIdx !== -1 && args[poolsIdx + 1]) {
    poolsOverride = args[poolsIdx + 1].split(',').map(a => a.trim().toUpperCase() as Asset)
  }

  // Load configuration
  let config: Config
  try {
    config = loadConfig(autoCreateOverride, poolsOverride)
  } catch (error: any) {
    console.error('Configuration error:', error.message)
    process.exit(1)
  }

  currentLogLevel = config.logLevel

  log.info(`Pools: ${config.poolAssets.join(', ')}`)
  log.info(`RPC: ${config.rpcUrl}`)
  log.info(`Poll interval: ${config.pollIntervalSeconds}s`)
  log.info(`Auto-create epochs: ${config.autoCreateEpoch ? 'enabled' : 'disabled'}`)

  // Load wallet
  let wallet: Keypair
  try {
    wallet = loadWallet(config.walletPath)
    log.info(`Wallet: ${wallet.publicKey.toBase58().slice(0, 8)}...${wallet.publicKey.toBase58().slice(-4)}`)
  } catch (error: any) {
    log.error(`Failed to load wallet: ${error.message}`)
    process.exit(1)
  }

  // Setup connection
  const connection = new Connection(config.rpcUrl, 'confirmed')

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey)
  log.info(`Balance: ${(balance / 1e9).toFixed(4)} SOL`)

  const minBalance = 0.01 * config.poolAssets.length * 1e9
  if (balance < minBalance) {
    log.error(`Insufficient balance. Need at least ${(minBalance / 1e9).toFixed(2)} SOL for ${config.poolAssets.length} pool(s). Get SOL from https://faucet.fogo.io/`)
    process.exit(1)
  }

  // Derive global config PDA
  const [globalConfigPda] = deriveGlobalConfigPda()
  log.info(`GlobalConfig: ${globalConfigPda.toBase58()}`)

  // Setup signal handlers
  setupSignalHandlers()

  // Create PythPriceManager with feeds for all configured pools
  const feedIds = [...new Set(config.poolAssets.map(a => PYTH_FEED_IDS[a]))]
  const pythManager = new PythPriceManager(feedIds, config.pythAccessToken)

  try {
    await pythManager.connect()
  } catch (err: any) {
    log.warn(`PythPriceManager initial connection failed: ${err.message}. Will use one-shot fallback.`)
  }

  // Create shared context
  const shared: SharedContext = {
    connection,
    wallet,
    globalConfigPda,
    pythManager,
    config,
  }

  // Launch pool runners
  const runners = config.poolAssets.map(asset => new PoolRunner(shared, asset))

  log.info(`Launching ${runners.length} pool runner(s)...`)
  console.log()

  // Run all pool runners concurrently with crash isolation
  const results = await Promise.allSettled(runners.map(r => r.start()))

  // Log any runner failures
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      log.error(`Pool runner ${config.poolAssets[i]} crashed: ${result.reason}`)
    }
  })

  // Cleanup
  await pythManager.disconnect()
  log.info('Crank bot stopped.')
}

main().catch((error) => {
  console.error('Fatal startup error:', error)
  process.exit(1)
})
