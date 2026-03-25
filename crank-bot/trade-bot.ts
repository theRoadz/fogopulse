/**
 * FogoPulse Trade Simulation Bot
 *
 * Standalone bot that places randomized trades across all 4 markets to simulate
 * user activity. Manages a configurable number of wallets that independently
 * buy positions with random directions, amounts, and timing.
 *
 * Runs alongside the crank-bot (separate process). Crank manages epoch lifecycle;
 * trade bot simulates users.
 *
 * Run:
 *   npx tsx trade-bot.ts
 *
 * Environment variables:
 *   TRADE_BOT_ENABLED            - Master on/off (default: false)
 *   TRADE_BOT_COUNT              - Number of bot wallets (default: 5)
 *   TRADE_BOT_MIN_AMOUNT         - Min trade USDC (default: 0.5)
 *   TRADE_BOT_MAX_AMOUNT         - Max trade USDC (default: 5.0)
 *   TRADE_BOT_MAX_TRADES_PER_EPOCH - Max trades per bot per epoch (default: 2)
 *   TRADE_BOT_WALLETS_DIR        - Keypair dir (default: ./trade-bot-wallets)
 *   TRADE_BOT_POLL_INTERVAL_SECONDS - Poll interval (default: 10)
 *   TRADE_BOT_STRATEGY           - Trading strategy: random|momentum|contrarian|pool_imbalance|composite (default: random)
 *   TRADE_BOT_TIME_BIAS          - Trade timing: early|late|uniform (default: uniform)
 *   TRADE_BOT_STRATEGY_BTC       - Per-asset strategy override (optional, same values as TRADE_BOT_STRATEGY)
 *   TRADE_BOT_STRATEGY_ETH       - Per-asset strategy override
 *   TRADE_BOT_STRATEGY_SOL       - Per-asset strategy override
 *   TRADE_BOT_STRATEGY_FOGO      - Per-asset strategy override
 *   PYTH_ACCESS_TOKEN            - Pyth Lazer API token (required for non-random strategies)
 *   WALLET_PATH                  - Master wallet for claims (shared with crank)
 *   RPC_URL                      - RPC URL (default: https://testnet.fogo.io)
 *   LOG_LEVEL                    - Log level (default: info)
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
  TransactionInstruction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import WebSocket from 'ws'

// Load environment variables
dotenv.config()

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const DEFAULT_RPC_URL = 'https://testnet.fogo.io'

const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

type Asset = keyof typeof ASSET_MINTS

const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')

// Pyth Lazer
const PYTH_WS_URL = 'wss://pyth-lazer-0.dourolabs.app/v1/stream'
const PYTH_FEED_IDS: Record<Asset, number> = {
  BTC: 1,
  ETH: 2,
  SOL: 6,
  FOGO: 2923,
}

// Instruction discriminators
const BUY_POSITION_DISCRIMINATOR = Buffer.from([210, 108, 108, 28, 10, 46, 226, 137])
const CLAIM_PAYOUT_DISCRIMINATOR = Buffer.from([127, 240, 132, 62, 227, 198, 146, 133])
const CLAIM_REFUND_DISCRIMINATOR = Buffer.from([15, 16, 30, 161, 255, 228, 97, 60])

// Pool active_epoch_state (cached on Pool account)
const POOL_STATE = {
  None: 0,
  Open: 1,
  Frozen: 2,
} as const

// Epoch state (on Epoch account - different numbering from pool state!)
const EPOCH_STATE = {
  Open: 0,
  Frozen: 1,
  Settling: 2,
  Settled: 3,
  Refunded: 4,
} as const

// Epoch outcome
const OUTCOME = {
  Up: 0,
  Down: 1,
  Refunded: 2,
} as const

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 15000,
  backoffMultiplier: 2,
}

// GlobalConfig refresh interval (5 minutes)
const GLOBAL_CONFIG_REFRESH_MS = 5 * 60 * 1000

// =============================================================================
// TYPES
// =============================================================================

type StrategyName = 'random' | 'momentum' | 'contrarian' | 'pool_imbalance' | 'composite'
type TimeBias = 'early' | 'late' | 'uniform'

interface TradeBotConfig {
  enabled: boolean
  botCount: number
  minAmount: number
  maxAmount: number
  maxTradesPerEpoch: number
  walletsDir: string
  pollIntervalSeconds: number
  rpcUrl: string
  logLevel: LogLevel
  strategy: StrategyName
  timeBias: TimeBias
  assetStrategies: Partial<Record<Asset, StrategyName>>
  strategyParams: StrategyParams
}

interface StrategyParams {
  momentumThresholdPct: number
  momentumMaxBias: number
  contrarianThresholdPct: number
  contrarianMaxBias: number
  imbalanceThreshold: number
  compositeWeights: { momentum: number; imbalance: number; noise: number }
}

interface BotWallet {
  index: number
  keypair: Keypair
}

interface GlobalConfigData {
  admin: PublicKey
  treasury: PublicKey
  insurance: PublicKey
  tradingFeeBps: number
  paused: boolean
  frozen: boolean
  maxTradeAmount: bigint
}

interface PoolData {
  assetMint: PublicKey
  yesReserves: bigint
  noReserves: bigint
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
  startPrice: bigint
  startConfidence: bigint
  outcome: number | null
}

interface PositionData {
  user: PublicKey
  epoch: PublicKey
  direction: number
  amount: bigint
  shares: bigint
  claimed: boolean
}

interface PriceSnapshot {
  price: number
  confidence: number
  timestamp: number
}

interface TradeDecision {
  direction: number
  amount: number
  reason: string
}

interface StrategyContext {
  asset: Asset
  epoch: EpochData
  pool: PoolData
  currentPrice: PriceSnapshot | null
  config: TradeBotConfig
  globalConfig: GlobalConfigData
  nowSeconds: number
}

interface TradingStrategy {
  name: string
  decide(ctx: StrategyContext): TradeDecision | null
}

// =============================================================================
// LOGGING
// =============================================================================

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

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

interface PoolLogger {
  debug: (msg: string) => void
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
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
// CONFIGURATION
// =============================================================================

function parseStrategyName(value: string | undefined, fallback: StrategyName): StrategyName {
  const valid: StrategyName[] = ['random', 'momentum', 'contrarian', 'pool_imbalance', 'composite']
  if (value && valid.includes(value as StrategyName)) return value as StrategyName
  return fallback
}

function parseTimeBias(value: string | undefined): TimeBias {
  const valid: TimeBias[] = ['early', 'late', 'uniform']
  if (value && valid.includes(value as TimeBias)) return value as TimeBias
  return 'uniform'
}

function loadConfig(): TradeBotConfig {
  const strategy = parseStrategyName(process.env.TRADE_BOT_STRATEGY, 'random')

  const assetStrategies: Partial<Record<Asset, StrategyName>> = {}
  for (const asset of ['BTC', 'ETH', 'SOL', 'FOGO'] as Asset[]) {
    const envVal = process.env[`TRADE_BOT_STRATEGY_${asset}`]
    if (envVal) assetStrategies[asset] = parseStrategyName(envVal, strategy)
  }

  const cw = {
    momentum: parseFloat(process.env.STRATEGY_COMPOSITE_MOMENTUM_WEIGHT || '0.5'),
    imbalance: parseFloat(process.env.STRATEGY_COMPOSITE_IMBALANCE_WEIGHT || '0.3'),
    noise: parseFloat(process.env.STRATEGY_COMPOSITE_NOISE_WEIGHT || '0.2'),
  }

  const config: TradeBotConfig = {
    enabled: process.env.TRADE_BOT_ENABLED === 'true',
    botCount: parseInt(process.env.TRADE_BOT_COUNT || '5', 10),
    minAmount: parseFloat(process.env.TRADE_BOT_MIN_AMOUNT || '0.5'),
    maxAmount: parseFloat(process.env.TRADE_BOT_MAX_AMOUNT || '5.0'),
    maxTradesPerEpoch: parseInt(process.env.TRADE_BOT_MAX_TRADES_PER_EPOCH || '2', 10),
    walletsDir: process.env.TRADE_BOT_WALLETS_DIR || './trade-bot-wallets',
    pollIntervalSeconds: parseInt(process.env.TRADE_BOT_POLL_INTERVAL_SECONDS || '10', 10),
    rpcUrl: process.env.RPC_URL || DEFAULT_RPC_URL,
    logLevel: parseLogLevel(process.env.LOG_LEVEL || 'info'),
    strategy,
    timeBias: parseTimeBias(process.env.TRADE_BOT_TIME_BIAS),
    assetStrategies,
    strategyParams: {
      momentumThresholdPct: parseFloat(process.env.STRATEGY_MOMENTUM_THRESHOLD_PCT || '0.0001'),
      momentumMaxBias: parseFloat(process.env.STRATEGY_MOMENTUM_MAX_BIAS || '0.85'),
      contrarianThresholdPct: parseFloat(process.env.STRATEGY_CONTRARIAN_THRESHOLD_PCT || '0.0005'),
      contrarianMaxBias: parseFloat(process.env.STRATEGY_CONTRARIAN_MAX_BIAS || '0.80'),
      imbalanceThreshold: parseFloat(process.env.STRATEGY_IMBALANCE_THRESHOLD || '0.10'),
      compositeWeights: cw,
    },
  }

  if (!config.enabled) {
    console.error('ERROR: TRADE_BOT_ENABLED is not set to "true". Set TRADE_BOT_ENABLED=true in .env')
    process.exit(1)
  }

  if (config.minAmount <= 0 || config.maxAmount <= 0 || config.minAmount > config.maxAmount) {
    throw new Error('Invalid amount range: TRADE_BOT_MIN_AMOUNT must be <= TRADE_BOT_MAX_AMOUNT and both positive')
  }

  if (config.botCount < 1) {
    throw new Error('TRADE_BOT_COUNT must be at least 1')
  }

  if (config.pollIntervalSeconds < 1) {
    throw new Error('TRADE_BOT_POLL_INTERVAL_SECONDS must be at least 1')
  }

  return config
}

// =============================================================================
// WALLET MANAGEMENT
// =============================================================================

function loadBotWallets(walletsDir: string, count: number): BotWallet[] {
  const wallets: BotWallet[] = []

  if (!fs.existsSync(walletsDir)) {
    throw new Error(`Wallets directory not found: ${walletsDir}. Run setup-trade-bots.ts first.`)
  }

  for (let i = 0; i < count; i++) {
    const keypairPath = path.join(walletsDir, `bot-${i}.json`)
    if (!fs.existsSync(keypairPath)) {
      throw new Error(`Bot wallet not found: ${keypairPath}. Run setup-trade-bots.ts with --count ${count}`)
    }
    const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf8'))
    const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey))
    wallets.push({ index: i, keypair })
  }

  return wallets
}

// =============================================================================
// PDA HELPERS
// =============================================================================

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

function derivePositionPda(epochPda: PublicKey, userPubkey: PublicKey, direction: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), epochPda.toBuffer(), userPubkey.toBuffer(), Buffer.from([direction])],
    PROGRAM_ID
  )
}

// =============================================================================
// ACCOUNT PARSERS
// =============================================================================

function parseGlobalConfigAccount(data: Buffer): GlobalConfigData {
  let offset = 8 // skip discriminator

  const admin = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const treasury = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const insurance = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const tradingFeeBps = data.readUInt16LE(offset)
  offset += 2

  // Skip lp_fee_share_bps, treasury_fee_share_bps, insurance_fee_share_bps
  offset += 2 + 2 + 2

  // Skip per_wallet_cap_bps, per_side_cap_bps
  offset += 2 + 2

  // Skip oracle thresholds
  offset += 2 + 2 // confidence thresholds
  offset += 8 + 8 // staleness thresholds

  // Skip epoch_duration_seconds, freeze_window_seconds
  offset += 8 + 8

  // allow_hedging
  offset += 1

  // paused (1 byte bool)
  const paused = data.readUInt8(offset) === 1
  offset += 1

  // frozen (1 byte bool)
  const frozen = data.readUInt8(offset) === 1
  offset += 1

  // max_trade_amount (8 bytes, u64)
  const maxTradeAmount = data.readBigUInt64LE(offset)

  return { admin, treasury, insurance, tradingFeeBps, paused, frozen, maxTradeAmount }
}

function parsePoolAccount(data: Buffer): PoolData {
  let offset = 8 // skip discriminator

  const assetMint = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  // Read yes_reserves, no_reserves (skip total_lp_shares, pending_withdrawal_shares)
  const yesReserves = data.readBigUInt64LE(offset)
  offset += 8
  const noReserves = data.readBigUInt64LE(offset)
  offset += 8
  offset += 8 + 8 // skip total_lp_shares, pending_withdrawal_shares

  const nextEpochId = data.readBigUInt64LE(offset)
  offset += 8

  // active_epoch (Option<Pubkey>)
  const activeEpochSome = data.readUInt8(offset)
  offset += 1
  let activeEpoch: PublicKey | null = null
  if (activeEpochSome === 1) {
    activeEpoch = new PublicKey(data.subarray(offset, offset + 32))
    offset += 32
  }

  const activeEpochState = data.readUInt8(offset)

  return { assetMint, yesReserves, noReserves, nextEpochId, activeEpoch, activeEpochState }
}

function parseEpochAccount(data: Buffer): EpochData {
  let offset = 8 // skip discriminator

  const pool = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const epochId = data.readBigUInt64LE(offset)
  offset += 8

  const state = data.readUInt8(offset)
  offset += 1

  const startTime = data.readBigInt64LE(offset)
  offset += 8
  const endTime = data.readBigInt64LE(offset)
  offset += 8
  const freezeTime = data.readBigInt64LE(offset)
  offset += 8

  // Read start_price, start_confidence, skip start_publish_time
  const startPrice = data.readBigUInt64LE(offset)
  offset += 8
  const startConfidence = data.readBigUInt64LE(offset)
  offset += 8
  offset += 8 // skip start_publish_time

  // settlement_price (Option<u64>)
  const hasSettPrice = data.readUInt8(offset) === 1
  offset += 1
  if (hasSettPrice) offset += 8

  // settlement_confidence (Option<u64>)
  const hasSettConf = data.readUInt8(offset) === 1
  offset += 1
  if (hasSettConf) offset += 8

  // settlement_publish_time (Option<i64>)
  const hasSettTime = data.readUInt8(offset) === 1
  offset += 1
  if (hasSettTime) offset += 8

  // outcome (Option<Outcome>)
  const hasOutcome = data.readUInt8(offset) === 1
  offset += 1
  const outcome = hasOutcome ? data.readUInt8(offset) : null

  return { pool, epochId, state, startTime, endTime, freezeTime, startPrice, startConfidence, outcome }
}

function parsePositionAccount(data: Buffer): PositionData {
  let offset = 8 // skip discriminator

  const user = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const epoch = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const direction = data.readUInt8(offset)
  offset += 1

  const amount = data.readBigUInt64LE(offset)
  offset += 8

  const shares = data.readBigUInt64LE(offset)
  offset += 8

  // Skip entry_price
  offset += 8

  const claimed = data.readUInt8(offset) === 1

  return { user, epoch, direction, amount, shares, claimed }
}

function getPoolStateName(state: number): string {
  const states = ['None', 'Open', 'Frozen']
  return states[state] || `Unknown(${state})`
}

// =============================================================================
// TRANSACTION BUILDERS
// =============================================================================

function buildBuyPositionInstruction(
  signer: PublicKey,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey,
  userUsdcAta: PublicKey,
  poolUsdcAta: PublicKey,
  treasuryUsdcAta: PublicKey,
  insuranceUsdcAta: PublicKey,
  userPubkey: PublicKey,
  direction: number,
  amount: bigint,
): TransactionInstruction {
  // Data: discriminator + user pubkey + direction byte + amount (u64 LE)
  const data = Buffer.alloc(8 + 32 + 1 + 8)
  let offset = 0

  BUY_POSITION_DISCRIMINATOR.copy(data, offset)
  offset += 8

  userPubkey.toBuffer().copy(data, offset)
  offset += 32

  data.writeUInt8(direction, offset)
  offset += 1

  data.writeBigUInt64LE(amount, offset)

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: globalConfigPda, isSigner: false, isWritable: false },
    { pubkey: poolPda, isSigner: false, isWritable: true },
    { pubkey: epochPda, isSigner: false, isWritable: true },
    { pubkey: positionPda, isSigner: false, isWritable: true },
    { pubkey: userUsdcAta, isSigner: false, isWritable: true },
    { pubkey: poolUsdcAta, isSigner: false, isWritable: true },
    { pubkey: treasuryUsdcAta, isSigner: false, isWritable: true },
    { pubkey: insuranceUsdcAta, isSigner: false, isWritable: true },
    { pubkey: USDC_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ]

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data })
}

function buildClaimPayoutInstruction(
  signer: PublicKey,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey,
  poolUsdcAta: PublicKey,
  userUsdcAta: PublicKey,
  userPubkey: PublicKey,
  direction: number,
): TransactionInstruction {
  const data = Buffer.concat([
    CLAIM_PAYOUT_DISCRIMINATOR,
    userPubkey.toBuffer(),
    Buffer.from([direction]),
  ])

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: globalConfigPda, isSigner: false, isWritable: false },
    { pubkey: poolPda, isSigner: false, isWritable: false },
    { pubkey: epochPda, isSigner: false, isWritable: false },
    { pubkey: positionPda, isSigner: false, isWritable: true },
    { pubkey: poolUsdcAta, isSigner: false, isWritable: true },
    { pubkey: userUsdcAta, isSigner: false, isWritable: true },
    { pubkey: USDC_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ]

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data })
}

function buildClaimRefundInstruction(
  signer: PublicKey,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey,
  poolUsdcAta: PublicKey,
  userUsdcAta: PublicKey,
  userPubkey: PublicKey,
  direction: number,
): TransactionInstruction {
  const data = Buffer.concat([
    CLAIM_REFUND_DISCRIMINATOR,
    userPubkey.toBuffer(),
    Buffer.from([direction]),
  ])

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: globalConfigPda, isSigner: false, isWritable: false },
    { pubkey: poolPda, isSigner: false, isWritable: false },
    { pubkey: epochPda, isSigner: false, isWritable: false },
    { pubkey: positionPda, isSigner: false, isWritable: true },
    { pubkey: poolUsdcAta, isSigner: false, isWritable: true },
    { pubkey: userUsdcAta, isSigner: false, isWritable: true },
    { pubkey: USDC_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ]

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data })
}

async function sendTransaction(
  connection: Connection,
  wallet: Keypair,
  instruction: TransactionInstruction,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message()

  const tx = new VersionedTransaction(messageV0)
  tx.sign([wallet])

  const sig = await connection.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })

  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
  return sig
}

async function sendWithRetry(
  connection: Connection,
  wallet: Keypair,
  instruction: TransactionInstruction,
  label: string,
  logger: PoolLogger,
): Promise<string | null> {
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await sendTransaction(connection, wallet, instruction)
    } catch (err: any) {
      const msg = err.message || String(err)

      // Don't retry on certain errors
      if (msg.includes('insufficient funds') || msg.includes('InsufficientFunds') ||
          msg.includes('already in use') || msg.includes('custom program error')) {
        logger.warn(`${label} failed (non-retryable): ${msg}`)
        return null
      }

      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
          RETRY_CONFIG.maxDelayMs
        )
        logger.warn(`${label} attempt ${attempt + 1} failed, retrying in ${delay}ms: ${msg}`)
        await sleep(delay)
      } else {
        logger.error(`${label} failed after ${RETRY_CONFIG.maxRetries + 1} attempts: ${msg}`)
        return null
      }
    }
  }
  return null
}

// =============================================================================
// HELPERS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (isShuttingDown) { resolve(); return }
    const timer = setTimeout(() => {
      activeTimers.delete(timer)
      resolve()
    }, ms)
    activeTimers.set(timer, resolve)
  })
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

// =============================================================================
// PYTH PRICE MANAGER (for strategies)
// =============================================================================

class TradeBotPriceManager {
  private ws: WebSocket | null = null
  private prices = new Map<number, PriceSnapshot>()
  private feedIds: number[]
  private accessToken: string
  private isConnected = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10

  constructor(feedIds: number[], accessToken: string) {
    this.feedIds = feedIds
    this.accessToken = accessToken
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('TradeBotPriceManager connection timeout after 30s'))
      }, 30000)

      this.ws = new WebSocket(PYTH_WS_URL, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      })

      this.ws.on('open', () => {
        log.info('PriceManager: Connected to Pyth Lazer')
        this.isConnected = true
        this.reconnectAttempts = 0

        this.feedIds.forEach((feedId, index) => {
          const subId = index + 1
          this.ws!.send(JSON.stringify({
            type: 'subscribe',
            subscriptionId: subId,
            priceFeedIds: [feedId],
            properties: ['price', 'confidence', 'exponent'],
            formats: ['solana'],
            deliveryFormat: 'json',
            channel: 'fixed_rate@200ms',
            jsonBinaryEncoding: 'hex',
          }))
        })
      })

      let subscribedCount = 0
      let resolved = false

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())

          if (msg.type === 'subscribed') {
            subscribedCount++
            if (subscribedCount >= this.feedIds.length && !resolved) {
              resolved = true
              clearTimeout(timeout)
              log.info(`PriceManager: All ${this.feedIds.length} feeds subscribed`)
              resolve()
            }
            return
          }

          if (msg.type === 'streamUpdated' && msg.parsed) {
            this.handleParsedMessage(msg.parsed)
          } else if (msg.type === 'streamUpdated' && msg.solana) {
            // Fallback: parse price from Solana binary if no parsed field
            this.handleSolanaMessage(msg)
          }
        } catch {
          // Ignore parse errors
        }
      })

      this.ws.on('close', () => {
        this.isConnected = false
        if (!isShuttingDown) {
          this.scheduleReconnect()
        }
      })

      this.ws.on('error', (err: Error) => {
        log.warn(`PriceManager: WebSocket error: ${err.message}`)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          // Resolve anyway — strategies will degrade to random
          resolve()
        }
      })
    })
  }

  private handleParsedMessage(parsed: any): void {
    try {
      const feeds = parsed.priceFeeds || parsed.price_feeds || []
      for (const feed of feeds) {
        const feedId = feed.priceFeedId || feed.price_feed_id
        const price = Number(feed.price)
        const confidence = Number(feed.confidence)
        const exponent = Number(feed.exponent)
        if (feedId != null && !isNaN(price)) {
          const scale = Math.pow(10, exponent)
          this.prices.set(feedId, {
            price: price * scale,
            confidence: confidence * scale,
            timestamp: Date.now(),
          })
        }
      }
    } catch {
      // Ignore
    }
  }

  private handleSolanaMessage(msg: any): void {
    // Extract feed ID from subscriptionId mapping
    const subId = msg.subscriptionId
    if (subId == null || subId < 1 || subId > this.feedIds.length) return
    const feedId = this.feedIds[subId - 1]

    // Parse Solana binary format for price data
    try {
      const solanaData = msg.solana?.data || msg.solana
      if (!solanaData) return
      const buf = Buffer.from(solanaData, 'hex')
      // Pyth Lazer Solana message layout varies; attempt to read price at known offset
      // The message contains: magic(4) + channel(1) + feedId(4) + timestamp(8) + price(8) + conf(8) + exponent(4)
      if (buf.length >= 37) {
        const priceBigInt = buf.readBigInt64LE(17)
        const confBigInt = buf.readBigUInt64LE(25)
        const exponent = buf.readInt32LE(33)
        const scale = Math.pow(10, exponent)
        this.prices.set(feedId, {
          price: Number(priceBigInt) * scale,
          confidence: Number(confBigInt) * scale,
          timestamp: Date.now(),
        })
      }
    } catch {
      // Ignore parse failures
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.warn('PriceManager: Max reconnect attempts reached, strategies will use random fallback')
      return
    }
    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts))
    this.reconnectAttempts++
    log.info(`PriceManager: Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`)
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        log.warn(`PriceManager: Reconnect failed: ${err.message}`)
      })
    }, delay)
  }

  getPrice(feedId: number): PriceSnapshot | null {
    const snap = this.prices.get(feedId)
    if (!snap) return null
    if (Date.now() - snap.timestamp > 30_000) return null
    return snap
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

// =============================================================================
// TRADING STRATEGIES
// =============================================================================

class RandomStrategy implements TradingStrategy {
  name = 'random'
  decide(ctx: StrategyContext): TradeDecision {
    return {
      direction: Math.random() < 0.5 ? 0 : 1,
      amount: randomFloat(ctx.config.minAmount, ctx.config.maxAmount),
      reason: 'random',
    }
  }
}

class MomentumStrategy implements TradingStrategy {
  name = 'momentum'
  private params: StrategyParams

  constructor(params: StrategyParams) {
    this.params = params
  }

  decide(ctx: StrategyContext): TradeDecision {
    if (!ctx.currentPrice || ctx.epoch.startPrice === 0n) {
      return new RandomStrategy().decide(ctx)
    }

    const startPriceUsd = Number(ctx.epoch.startPrice) / 1e8
    const pctMove = (ctx.currentPrice.price - startPriceUsd) / startPriceUsd

    if (Math.abs(pctMove) < this.params.momentumThresholdPct) {
      return new RandomStrategy().decide(ctx)
    }

    // Scale bias: threshold → 50%, large move → maxBias
    const moveScale = Math.abs(pctMove) / 0.001 // normalize: 0.1% = 1.0
    const biasStrength = Math.min(this.params.momentumMaxBias, 0.5 + moveScale * 0.35)
    const upProb = pctMove > 0 ? biasStrength : (1 - biasStrength)
    const direction = Math.random() < upProb ? 0 : 1

    // Scale amount with conviction
    const conviction = Math.min(1, moveScale)
    const amountRange = ctx.config.maxAmount - ctx.config.minAmount
    const amount = ctx.config.minAmount + conviction * amountRange

    return {
      direction,
      amount,
      reason: `momentum ${(pctMove * 100).toFixed(4)}% → ${direction === 0 ? 'UP' : 'DOWN'} p=${upProb.toFixed(2)}`,
    }
  }
}

class ContrarianStrategy implements TradingStrategy {
  name = 'contrarian'
  private params: StrategyParams

  constructor(params: StrategyParams) {
    this.params = params
  }

  decide(ctx: StrategyContext): TradeDecision {
    if (!ctx.currentPrice || ctx.epoch.startPrice === 0n) {
      return new RandomStrategy().decide(ctx)
    }

    const startPriceUsd = Number(ctx.epoch.startPrice) / 1e8
    const pctMove = (ctx.currentPrice.price - startPriceUsd) / startPriceUsd

    if (Math.abs(pctMove) < this.params.contrarianThresholdPct) {
      return new RandomStrategy().decide(ctx)
    }

    // Bet AGAINST the move
    const direction = pctMove > 0 ? 1 : 0
    const moveScale = Math.abs(pctMove) / 0.001
    const conviction = Math.min(1, moveScale)
    const amountRange = ctx.config.maxAmount - ctx.config.minAmount
    const amount = ctx.config.minAmount + conviction * amountRange

    return {
      direction,
      amount,
      reason: `contrarian ${(pctMove * 100).toFixed(4)}% → bet ${direction === 0 ? 'UP' : 'DOWN'}`,
    }
  }
}

class PoolImbalanceStrategy implements TradingStrategy {
  name = 'pool_imbalance'
  private params: StrategyParams

  constructor(params: StrategyParams) {
    this.params = params
  }

  decide(ctx: StrategyContext): TradeDecision {
    const yes = Number(ctx.pool.yesReserves)
    const no = Number(ctx.pool.noReserves)
    const total = yes + no

    if (total === 0) {
      return new RandomStrategy().decide(ctx)
    }

    const yesRatio = yes / total
    const imbalance = yesRatio - 0.5 // positive = yes reserves heavy = yes shares cheap

    if (Math.abs(imbalance) < this.params.imbalanceThreshold) {
      return new RandomStrategy().decide(ctx)
    }

    // Higher yes reserves → yes shares cheaper → bet UP (0)
    const direction = imbalance > 0 ? 0 : 1
    const conviction = Math.min(1, Math.abs(imbalance) / 0.3)
    const amountRange = ctx.config.maxAmount - ctx.config.minAmount
    const amount = ctx.config.minAmount + conviction * amountRange

    return {
      direction,
      amount,
      reason: `imbalance yes=${(yesRatio * 100).toFixed(1)}% → ${direction === 0 ? 'UP' : 'DOWN'}`,
    }
  }
}

class CompositeStrategy implements TradingStrategy {
  name = 'composite'
  private params: StrategyParams

  constructor(params: StrategyParams) {
    this.params = params
  }

  decide(ctx: StrategyContext): TradeDecision {
    let upScore = 0
    let totalWeight = 0
    const w = this.params.compositeWeights

    // 1. Momentum signal
    if (ctx.currentPrice && ctx.epoch.startPrice !== 0n) {
      const startPriceUsd = Number(ctx.epoch.startPrice) / 1e8
      const pctMove = (ctx.currentPrice.price - startPriceUsd) / startPriceUsd
      const signal = Math.tanh(pctMove * 500) // -1 to 1, 0.1% move → tanh(0.5) ≈ 0.46
      upScore += signal * w.momentum
      totalWeight += w.momentum
    }

    // 2. Pool imbalance signal
    const yes = Number(ctx.pool.yesReserves)
    const no = Number(ctx.pool.noReserves)
    if (yes + no > 0) {
      const signal = (yes / (yes + no) - 0.5) * 2 // -1 to 1
      upScore += signal * w.imbalance
      totalWeight += w.imbalance
    }

    // 3. Random noise
    upScore += (Math.random() - 0.5) * 2 * w.noise
    totalWeight += w.noise

    const normalizedScore = totalWeight > 0 ? upScore / totalWeight : 0
    // Clamp probability to [0.1, 0.9]
    const upProb = Math.max(0.1, Math.min(0.9, 0.5 + normalizedScore * 0.4))
    const direction = Math.random() < upProb ? 0 : 1

    // Amount: scale with absolute score (higher conviction → larger bet)
    const conviction = Math.min(1, Math.abs(normalizedScore))
    const amountRange = ctx.config.maxAmount - ctx.config.minAmount
    const amount = ctx.config.minAmount + conviction * amountRange

    return {
      direction,
      amount,
      reason: `composite score=${normalizedScore.toFixed(3)} p(UP)=${upProb.toFixed(2)}`,
    }
  }
}

function createStrategy(name: StrategyName, params: StrategyParams): TradingStrategy {
  switch (name) {
    case 'random': return new RandomStrategy()
    case 'momentum': return new MomentumStrategy(params)
    case 'contrarian': return new ContrarianStrategy(params)
    case 'pool_imbalance': return new PoolImbalanceStrategy(params)
    case 'composite': return new CompositeStrategy(params)
    default: return new RandomStrategy()
  }
}

// =============================================================================
// MARKET MONITOR
// =============================================================================

class MarketMonitor {
  private asset: Asset
  private connection: Connection
  private botWallets: BotWallet[]
  private config: TradeBotConfig
  private globalConfigPda: PublicKey
  private globalConfig: GlobalConfigData
  private poolPda: PublicKey
  private poolUsdcAta: PublicKey
  private treasuryUsdcAta: PublicKey
  private insuranceUsdcAta: PublicKey
  private logger: PoolLogger
  private strategy: TradingStrategy
  private priceManager: TradeBotPriceManager | null

  // Epoch tracking
  private currentEpochId: bigint | null = null
  private epochTradeCount = new Map<number, number>() // botIndex → trades this epoch
  private tradedDirections = new Map<number, Set<number>>() // botIndex → set of directions traded
  private scheduledTimers = new Set<ReturnType<typeof setTimeout>>()

  // Claim tracking — supports multiple pending epochs
  // Maps epochId → Map<botIndex, Set<direction>>
  private pendingClaims = new Map<bigint, Map<number, Set<number>>>()
  private claimedPositions = new Set<string>() // "epochId-botIndex-direction"

  constructor(
    asset: Asset,
    connection: Connection,
    botWallets: BotWallet[],
    config: TradeBotConfig,
    globalConfigPda: PublicKey,
    globalConfig: GlobalConfigData,
    strategy: TradingStrategy,
    priceManager: TradeBotPriceManager | null,
  ) {
    this.asset = asset
    this.connection = connection
    this.botWallets = botWallets
    this.config = config
    this.globalConfigPda = globalConfigPda
    this.globalConfig = globalConfig
    this.strategy = strategy
    this.priceManager = priceManager
    this.logger = createPoolLogger(asset)

    const assetMint = ASSET_MINTS[asset]
    const [poolPda] = derivePoolPda(assetMint)
    this.poolPda = poolPda
    this.poolUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, poolPda, true)
    this.treasuryUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, globalConfig.treasury, true)
    this.insuranceUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, globalConfig.insurance, true)
  }

  updateGlobalConfig(config: GlobalConfigData): void {
    this.globalConfig = config
    this.treasuryUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, config.treasury, true)
    this.insuranceUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, config.insurance, true)
  }

  async run(): Promise<void> {
    this.logger.info(`Starting MarketMonitor for ${this.asset}`)

    while (!isShuttingDown) {
      try {
        await this.poll()
      } catch (err: any) {
        this.logger.error(`Poll error: ${err.message}`)
      }

      // Wait poll interval
      await sleep(this.config.pollIntervalSeconds * 1000)
    }

    // Cancel scheduled trades on shutdown
    this.cancelScheduledTrades()
    this.logger.info('MarketMonitor stopped')
  }

  private cancelScheduledTrades(): void {
    for (const timer of this.scheduledTimers) {
      clearTimeout(timer)
      activeTimers.delete(timer)
    }
    this.scheduledTimers.clear()
  }

  private async poll(): Promise<void> {
    // Check protocol pause/freeze
    if (this.globalConfig.paused || this.globalConfig.frozen) {
      this.logger.debug('Protocol is paused/frozen, skipping')
      return
    }

    // Fetch pool account
    const poolInfo = await this.connection.getAccountInfo(this.poolPda)
    if (!poolInfo) {
      this.logger.warn('Pool account not found')
      return
    }

    const poolData = parsePoolAccount(poolInfo.data)
    const stateName = getPoolStateName(poolData.activeEpochState)

    // Handle Open epoch — schedule trades
    if (poolData.activeEpochState === POOL_STATE.Open && poolData.activeEpoch) {
      // Fetch epoch data to get timing
      const epochInfo = await this.connection.getAccountInfo(poolData.activeEpoch)
      if (!epochInfo) return

      const epochData = parseEpochAccount(epochInfo.data)

      // New epoch detected?
      if (this.currentEpochId === null || epochData.epochId !== this.currentEpochId) {
        this.logger.info(`New epoch detected: #${epochData.epochId} (state: ${stateName})`)

        // Move current epoch's traded directions to pending claims
        if (this.currentEpochId !== null && this.tradedDirections.size > 0) {
          this.pendingClaims.set(this.currentEpochId, new Map(this.tradedDirections))
        }

        this.currentEpochId = epochData.epochId
        this.epochTradeCount.clear()
        this.tradedDirections.clear()
        this.cancelScheduledTrades()
        this.scheduleTrades(epochData)
      }
    }

    // Handle Frozen epoch — no trades, just wait
    if (poolData.activeEpochState === POOL_STATE.Frozen) {
      this.cancelScheduledTrades()
    }

    // Handle pool back to None (after settlement) — move current epoch to pending claims
    if (poolData.activeEpochState === POOL_STATE.None && this.currentEpochId !== null) {
      if (this.tradedDirections.size > 0) {
        this.pendingClaims.set(this.currentEpochId, new Map(this.tradedDirections))
      }
      this.currentEpochId = null
      this.epochTradeCount.clear()
      this.tradedDirections.clear()
      this.cancelScheduledTrades()
    }

    // Run claim cycles for all pending epochs
    if (this.pendingClaims.size > 0) {
      for (const [epochId, botDirections] of this.pendingClaims) {
        const [epochPda] = deriveEpochPda(this.poolPda, epochId)
        const epochInfo = await this.connection.getAccountInfo(epochPda)
        if (!epochInfo) continue

        const epochData = parseEpochAccount(epochInfo.data)
        if (epochData.state === EPOCH_STATE.Settled || epochData.state === EPOCH_STATE.Refunded) {
          await this.runClaimCycle(epochPda, epochData, botDirections)
          this.pendingClaims.delete(epochId)
        }
      }
    }
  }

  private scheduleTrades(epochData: EpochData): void {
    const now = Math.floor(Date.now() / 1000)
    const freezeTime = Number(epochData.freezeTime)
    const tradingWindowEnd = freezeTime - 5 // 5s buffer before freeze

    if (now >= tradingWindowEnd) {
      this.logger.debug(`Trading window closed for epoch #${epochData.epochId}`)
      return
    }

    const windowMs = (tradingWindowEnd - now) * 1000

    for (const bot of this.botWallets) {
      // Roll random number of trades (0 to maxTradesPerEpoch)
      const numTrades = randomInt(0, this.config.maxTradesPerEpoch)
      if (numTrades === 0) continue

      for (let t = 0; t < numTrades; t++) {
        // Apply time bias to delay range
        let delayMin = 1000
        let delayMax = windowMs
        if (this.config.timeBias === 'early') {
          delayMax = Math.max(delayMin + 1, Math.floor(windowMs * 0.4))
        } else if (this.config.timeBias === 'late') {
          delayMin = Math.max(1000, Math.floor(windowMs * 0.6))
        }
        const delayMs = randomInt(delayMin, delayMax)
        const timer = setTimeout(() => {
          this.scheduledTimers.delete(timer)
          activeTimers.delete(timer)
          this.executeTrade(bot, epochData).catch((err) => {
            this.logger.warn(`Bot-${bot.index} trade error: ${err.message}`)
          })
        }, delayMs)

        this.scheduledTimers.add(timer)
        activeTimers.set(timer, () => {})
      }

      this.logger.debug(`Bot-${bot.index}: Scheduled ${numTrades} trades within ${Math.round(windowMs / 1000)}s window`)
    }
  }

  private async executeTrade(bot: BotWallet, epochData: EpochData): Promise<void> {
    if (isShuttingDown) return

    // Pre-trade safety checks
    if (this.globalConfig.paused || this.globalConfig.frozen) {
      this.logger.info(`Bot-${bot.index} skipping trade: protocol paused/frozen`)
      return
    }

    // Check trade count
    const tradeCount = this.epochTradeCount.get(bot.index) || 0
    if (tradeCount >= this.config.maxTradesPerEpoch) {
      this.logger.debug(`Bot-${bot.index} reached max trades (${tradeCount}) for epoch #${epochData.epochId}`)
      return
    }

    // Re-check epoch state
    const [epochPda] = deriveEpochPda(this.poolPda, epochData.epochId)
    const epochInfo = await this.connection.getAccountInfo(epochPda)
    if (!epochInfo) return
    const freshEpoch = parseEpochAccount(epochInfo.data)
    if (freshEpoch.state !== EPOCH_STATE.Open) {
      this.logger.debug(`Bot-${bot.index} skipping: epoch #${epochData.epochId} no longer Open (state=${freshEpoch.state})`)
      return
    }

    // Check USDC balance
    const botUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, bot.keypair.publicKey)
    try {
      const usdcInfo = await this.connection.getAccountInfo(botUsdcAta)
      if (!usdcInfo) {
        this.logger.warn(`Bot-${bot.index} has no USDC ATA`)
        return
      }
      // Parse token account balance (offset 64 for amount in SPL token account)
      const usdcBalance = usdcInfo.data.readBigUInt64LE(64)
      const minAmountLamports = BigInt(Math.floor(this.config.minAmount * 1_000_000))
      if (usdcBalance < minAmountLamports) {
        this.logger.warn(`Bot-${bot.index} insufficient USDC: ${Number(usdcBalance) / 1e6} < ${this.config.minAmount}`)
        return
      }
    } catch {
      this.logger.warn(`Bot-${bot.index} failed to check USDC balance`)
      return
    }

    // Fetch fresh pool data for reserves (strategy may need it)
    const freshPoolInfo = await this.connection.getAccountInfo(this.poolPda)
    const freshPool = freshPoolInfo ? parsePoolAccount(freshPoolInfo.data) : null

    // Build strategy context and get trade decision
    const currentPrice = this.priceManager?.getPrice(PYTH_FEED_IDS[this.asset]) ?? null
    const ctx: StrategyContext = {
      asset: this.asset,
      epoch: freshEpoch,
      pool: freshPool || { assetMint: ASSET_MINTS[this.asset], yesReserves: 0n, noReserves: 0n, nextEpochId: 0n, activeEpoch: null, activeEpochState: 0 },
      currentPrice,
      config: this.config,
      globalConfig: this.globalConfig,
      nowSeconds: Math.floor(Date.now() / 1000),
    }

    const decision = this.strategy.decide(ctx)
    if (!decision) {
      this.logger.debug(`Bot-${bot.index} strategy returned null, skipping trade`)
      return
    }

    const direction = decision.direction
    const directionName = direction === 0 ? 'UP' : 'DOWN'
    const amountUsdc = Math.min(Math.max(decision.amount, this.config.minAmount), this.config.maxAmount)
    const amountLamports = BigInt(Math.floor(amountUsdc * 1_000_000))

    // Derive position account
    const [positionPda] = derivePositionPda(epochPda, bot.keypair.publicKey, direction)

    const ix = buildBuyPositionInstruction(
      bot.keypair.publicKey,
      this.globalConfigPda,
      this.poolPda,
      epochPda,
      positionPda,
      botUsdcAta,
      this.poolUsdcAta,
      this.treasuryUsdcAta,
      this.insuranceUsdcAta,
      bot.keypair.publicKey,
      direction,
      amountLamports,
    )

    const sig = await sendWithRetry(
      this.connection,
      bot.keypair,
      ix,
      `Bot-${bot.index} buy_position ${directionName} ${amountUsdc.toFixed(2)} USDC`,
      this.logger,
    )

    if (sig) {
      this.epochTradeCount.set(bot.index, tradeCount + 1)

      // Track traded direction for claims
      if (!this.tradedDirections.has(bot.index)) {
        this.tradedDirections.set(bot.index, new Set())
      }
      this.tradedDirections.get(bot.index)!.add(direction)

      this.logger.info(
        `Bot-${bot.index} traded ${directionName} ${amountUsdc.toFixed(2)} USDC in epoch #${epochData.epochId} [${decision.reason}] (tx: ${sig.slice(0, 16)}...)`
      )
    }
  }

  private async runClaimCycle(epochPda: PublicKey, epochData: EpochData, botDirections: Map<number, Set<number>>): Promise<void> {
    const epochId = epochData.epochId
    const isSettled = epochData.state === EPOCH_STATE.Settled
    const isRefunded = epochData.state === EPOCH_STATE.Refunded

    if (!isSettled && !isRefunded) return

    this.logger.info(`Running claim cycle for epoch #${epochId} (${isSettled ? 'Settled' : 'Refunded'})`)

    for (const bot of this.botWallets) {
      const directions = botDirections.get(bot.index)
      if (!directions || directions.size === 0) continue

      for (const direction of directions) {
        const claimKey = `${epochId}-${bot.index}-${direction}`
        if (this.claimedPositions.has(claimKey)) continue

        const [positionPda] = derivePositionPda(epochPda, bot.keypair.publicKey, direction)

        // Fetch position
        const posInfo = await this.connection.getAccountInfo(positionPda)
        if (!posInfo) continue

        const posData = parsePositionAccount(posInfo.data)
        if (posData.claimed) {
          this.claimedPositions.add(claimKey)
          continue
        }

        const directionName = direction === 0 ? 'UP' : 'DOWN'
        const botUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, bot.keypair.publicKey)

        if (isRefunded) {
          // Claim refund
          const ix = buildClaimRefundInstruction(
            bot.keypair.publicKey,
            this.globalConfigPda,
            this.poolPda,
            epochPda,
            positionPda,
            this.poolUsdcAta,
            botUsdcAta,
            bot.keypair.publicKey,
            direction,
          )

          const sig = await sendWithRetry(
            this.connection, bot.keypair, ix,
            `Bot-${bot.index} claim_refund ${directionName} epoch #${epochId}`,
            this.logger,
          )

          if (sig) {
            this.claimedPositions.add(claimKey)
            const amountUsdc = Number(posData.amount) / 1e6
            this.logger.info(`Bot-${bot.index} claimed ${amountUsdc.toFixed(2)} USDC refund from epoch #${epochId}`)
          }
        } else if (isSettled) {
          // Check if winner
          const isWinner =
            (epochData.outcome === OUTCOME.Up && direction === 0) ||
            (epochData.outcome === OUTCOME.Down && direction === 1)

          if (!isWinner) {
            // Loser — nothing to claim
            this.claimedPositions.add(claimKey)
            this.logger.debug(`Bot-${bot.index} lost ${directionName} in epoch #${epochId}, skipping claim`)
            continue
          }

          // Claim payout
          const ix = buildClaimPayoutInstruction(
            bot.keypair.publicKey,
            this.globalConfigPda,
            this.poolPda,
            epochPda,
            positionPda,
            this.poolUsdcAta,
            botUsdcAta,
            bot.keypair.publicKey,
            direction,
          )

          const sig = await sendWithRetry(
            this.connection, bot.keypair, ix,
            `Bot-${bot.index} claim_payout ${directionName} epoch #${epochId}`,
            this.logger,
          )

          if (sig) {
            this.claimedPositions.add(claimKey)
            const amountUsdc = Number(posData.amount) / 1e6
            this.logger.info(`Bot-${bot.index} claimed payout from epoch #${epochId} (stake: ${amountUsdc.toFixed(2)} USDC)`)
          }
        }
      }
    }
  }
}

// =============================================================================
// SHUTDOWN
// =============================================================================

let isShuttingDown = false
const activeTimers = new Map<ReturnType<typeof setTimeout>, () => void>()

function setupSignalHandlers() {
  const shutdown = (signal: string) => {
    if (isShuttingDown) {
      log.info('Force shutdown...')
      process.exit(1)
    }
    isShuttingDown = true
    log.info(`Received ${signal}, shutting down gracefully...`)

    // Clear all active timers and resolve their pending sleeps
    for (const [timer, resolve] of activeTimers) {
      clearTimeout(timer)
      resolve()
    }
    activeTimers.clear()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FogoPulse Trade Simulation Bot')
  console.log('='.repeat(60))
  console.log()

  setupSignalHandlers()

  // Load configuration
  const config = loadConfig()
  currentLogLevel = config.logLevel

  log.info(`Config: ${config.botCount} bots, ${config.minAmount}-${config.maxAmount} USDC, max ${config.maxTradesPerEpoch} trades/epoch`)
  log.info(`Strategy: ${config.strategy}, time bias: ${config.timeBias}`)
  log.info(`Wallets dir: ${path.resolve(config.walletsDir)}`)
  log.info(`Poll interval: ${config.pollIntervalSeconds}s`)

  // Load bot wallets
  const botWallets = loadBotWallets(config.walletsDir, config.botCount)
  log.info(`Loaded ${botWallets.length} bot wallets:`)
  for (const w of botWallets) {
    log.info(`  Bot-${w.index}: ${w.keypair.publicKey.toString()}`)
  }

  // Connect to RPC
  const connection = new Connection(config.rpcUrl, 'confirmed')
  log.info(`RPC: ${config.rpcUrl}`)

  // Fetch GlobalConfig
  const [globalConfigPda] = deriveGlobalConfigPda()
  log.info(`GlobalConfig PDA: ${globalConfigPda.toString()}`)

  const gcInfo = await connection.getAccountInfo(globalConfigPda)
  if (!gcInfo) {
    log.error('GlobalConfig account not found. Has the program been initialized?')
    process.exit(1)
  }

  let globalConfig = parseGlobalConfigAccount(gcInfo.data)
  log.info(`Treasury: ${globalConfig.treasury.toString()}`)
  log.info(`Insurance: ${globalConfig.insurance.toString()}`)
  log.info(`Protocol paused: ${globalConfig.paused}, frozen: ${globalConfig.frozen}`)

  if (globalConfig.paused || globalConfig.frozen) {
    log.warn('Protocol is currently paused/frozen. Bot will wait for it to resume.')
  }

  // Initialize price manager if a non-random strategy needs it
  const needsPriceManager = config.strategy !== 'random' ||
    Object.values(config.assetStrategies).some((s) => s !== 'random')
  const pythAccessToken = process.env.PYTH_ACCESS_TOKEN
  let priceManager: TradeBotPriceManager | null = null

  if (needsPriceManager && pythAccessToken) {
    const feedIds = Object.values(PYTH_FEED_IDS)
    priceManager = new TradeBotPriceManager(feedIds, pythAccessToken)
    try {
      await priceManager.connect()
      log.info('Price manager connected — strategies will use live Pyth prices')
    } catch (err: any) {
      log.warn(`Price manager failed to connect: ${err.message}. Strategies will degrade to random.`)
      priceManager = null
    }
  } else if (needsPriceManager && !pythAccessToken) {
    log.warn('PYTH_ACCESS_TOKEN not set — non-random strategies will degrade to random fallback')
  }

  // Start MarketMonitors for all 4 pools
  const assets: Asset[] = ['BTC', 'ETH', 'SOL', 'FOGO']
  const monitors = assets.map((asset) => {
    const strategyName = config.assetStrategies[asset] || config.strategy
    const strategy = createStrategy(strategyName, config.strategyParams)
    log.info(`[${asset}] Strategy: ${strategy.name}`)
    return new MarketMonitor(asset, connection, botWallets, config, globalConfigPda, globalConfig, strategy, priceManager)
  })

  // Periodic GlobalConfig refresh
  const gcRefreshInterval = setInterval(async () => {
    if (isShuttingDown) return
    try {
      const info = await connection.getAccountInfo(globalConfigPda)
      if (info) {
        globalConfig = parseGlobalConfigAccount(info.data)
        for (const m of monitors) {
          m.updateGlobalConfig(globalConfig)
        }
        log.debug(`GlobalConfig refreshed: paused=${globalConfig.paused}, frozen=${globalConfig.frozen}`)
      }
    } catch (err: any) {
      log.warn(`GlobalConfig refresh failed: ${err.message}`)
    }
  }, GLOBAL_CONFIG_REFRESH_MS)

  // Run all monitors concurrently
  log.info(`Starting ${assets.length} market monitors...`)

  try {
    await Promise.allSettled(monitors.map((m) => m.run()))
  } finally {
    clearInterval(gcRefreshInterval)
    if (priceManager) priceManager.disconnect()
    log.info('All market monitors stopped. Trade bot shutdown complete.')
  }
}

main().catch((err) => {
  log.error(`Fatal error: ${err.message}`)
  process.exit(1)
})
