/**
 * Verify Protocol Script
 *
 * Verifies all protocol accounts exist and have correct data on FOGO testnet.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/verify-protocol.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'
const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')

// Asset mints for pool derivation
const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

type Asset = keyof typeof ASSET_MINTS

// Expected GlobalConfig parameters
const EXPECTED_PARAMS = {
  tradingFeeBps: 180,
  lpFeeShareBps: 7000,
  treasuryFeeShareBps: 2000,
  insuranceFeeShareBps: 1000,
  perWalletCapBps: 500,
  perSideCapBps: 3000,
  epochDurationSeconds: 300,
  freezeWindowSeconds: 15,
  oracleConfidenceThresholdStartBps: 25,
  oracleConfidenceThresholdSettleBps: 80,
  oracleStalenessThresholdStart: 3,
  oracleStalenessThresholdSettle: 10,
  allowHedging: false,
}

// Account discriminators (first 8 bytes)
const GLOBAL_CONFIG_DISCRIMINATOR = Buffer.from([149, 8, 156, 202, 160, 252, 176, 217])
const POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188])

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

function checkMark(condition: boolean): string {
  return condition ? '✓' : '✗'
}

/**
 * Decode GlobalConfig account data
 * Layout (after 8-byte discriminator):
 * - admin: pubkey (32)
 * - treasury: pubkey (32)
 * - insurance: pubkey (32)
 * - trading_fee_bps: u16 (2)
 * - lp_fee_share_bps: u16 (2)
 * - treasury_fee_share_bps: u16 (2)
 * - insurance_fee_share_bps: u16 (2)
 * - per_wallet_cap_bps: u16 (2)
 * - per_side_cap_bps: u16 (2)
 * - oracle_confidence_threshold_start_bps: u16 (2)
 * - oracle_confidence_threshold_settle_bps: u16 (2)
 * - oracle_staleness_threshold_start: i64 (8)
 * - oracle_staleness_threshold_settle: i64 (8)
 * - epoch_duration_seconds: i64 (8)
 * - freeze_window_seconds: i64 (8)
 * - allow_hedging: bool (1)
 * - paused: bool (1)
 * - frozen: bool (1)
 * - bump: u8 (1)
 */
function decodeGlobalConfig(data: Buffer): {
  admin: PublicKey
  treasury: PublicKey
  insurance: PublicKey
  tradingFeeBps: number
  lpFeeShareBps: number
  treasuryFeeShareBps: number
  insuranceFeeShareBps: number
  perWalletCapBps: number
  perSideCapBps: number
  oracleConfidenceThresholdStartBps: number
  oracleConfidenceThresholdSettleBps: number
  oracleStalenessThresholdStart: bigint
  oracleStalenessThresholdSettle: bigint
  epochDurationSeconds: bigint
  freezeWindowSeconds: bigint
  allowHedging: boolean
  paused: boolean
  frozen: boolean
  bump: number
} {
  let offset = 8 // Skip discriminator

  const admin = new PublicKey(data.subarray(offset, offset + 32)); offset += 32
  const treasury = new PublicKey(data.subarray(offset, offset + 32)); offset += 32
  const insurance = new PublicKey(data.subarray(offset, offset + 32)); offset += 32

  const tradingFeeBps = data.readUInt16LE(offset); offset += 2
  const lpFeeShareBps = data.readUInt16LE(offset); offset += 2
  const treasuryFeeShareBps = data.readUInt16LE(offset); offset += 2
  const insuranceFeeShareBps = data.readUInt16LE(offset); offset += 2
  const perWalletCapBps = data.readUInt16LE(offset); offset += 2
  const perSideCapBps = data.readUInt16LE(offset); offset += 2
  const oracleConfidenceThresholdStartBps = data.readUInt16LE(offset); offset += 2
  const oracleConfidenceThresholdSettleBps = data.readUInt16LE(offset); offset += 2

  const oracleStalenessThresholdStart = data.readBigInt64LE(offset); offset += 8
  const oracleStalenessThresholdSettle = data.readBigInt64LE(offset); offset += 8
  const epochDurationSeconds = data.readBigInt64LE(offset); offset += 8
  const freezeWindowSeconds = data.readBigInt64LE(offset); offset += 8

  const allowHedging = data.readUInt8(offset) !== 0; offset += 1
  const paused = data.readUInt8(offset) !== 0; offset += 1
  const frozen = data.readUInt8(offset) !== 0; offset += 1
  const bump = data.readUInt8(offset)

  return {
    admin, treasury, insurance,
    tradingFeeBps, lpFeeShareBps, treasuryFeeShareBps, insuranceFeeShareBps,
    perWalletCapBps, perSideCapBps,
    oracleConfidenceThresholdStartBps, oracleConfidenceThresholdSettleBps,
    oracleStalenessThresholdStart, oracleStalenessThresholdSettle,
    epochDurationSeconds, freezeWindowSeconds,
    allowHedging, paused, frozen, bump
  }
}

/**
 * Decode Pool account data
 * Layout (after 8-byte discriminator):
 * - asset_mint: pubkey (32)
 * - yes_reserves: u64 (8)
 * - no_reserves: u64 (8)
 * - total_lp_shares: u64 (8)
 * - next_epoch_id: u64 (8)
 * - active_epoch: Option<pubkey> (1 + 32)
 * - active_epoch_state: u8 (1)
 * - wallet_cap_bps: u16 (2)
 * - side_cap_bps: u16 (2)
 * - is_paused: bool (1)
 * - is_frozen: bool (1)
 * - bump: u8 (1)
 */
function decodePool(data: Buffer): {
  assetMint: PublicKey
  yesReserves: bigint
  noReserves: bigint
  totalLpShares: bigint
  nextEpochId: bigint
  activeEpoch: PublicKey | null
  activeEpochState: number
  walletCapBps: number
  sideCapBps: number
  isPaused: boolean
  isFrozen: boolean
  bump: number
} {
  let offset = 8 // Skip discriminator

  const assetMint = new PublicKey(data.subarray(offset, offset + 32)); offset += 32

  const yesReserves = data.readBigUInt64LE(offset); offset += 8
  const noReserves = data.readBigUInt64LE(offset); offset += 8
  const totalLpShares = data.readBigUInt64LE(offset); offset += 8
  const pendingWithdrawalShares = data.readBigUInt64LE(offset); offset += 8 // pending_withdrawal_shares
  const nextEpochId = data.readBigUInt64LE(offset); offset += 8

  // Option<Pubkey>: 1 byte tag + 32 bytes pubkey if Some
  const hasActiveEpoch = data.readUInt8(offset) !== 0; offset += 1
  let activeEpoch: PublicKey | null = null
  if (hasActiveEpoch) {
    activeEpoch = new PublicKey(data.subarray(offset, offset + 32))
  }
  offset += 32 // Always skip 32 bytes for the optional pubkey

  const activeEpochState = data.readUInt8(offset); offset += 1
  const walletCapBps = data.readUInt16LE(offset); offset += 2
  const sideCapBps = data.readUInt16LE(offset); offset += 2
  const isPaused = data.readUInt8(offset) !== 0; offset += 1
  const isFrozen = data.readUInt8(offset) !== 0; offset += 1
  const bump = data.readUInt8(offset)

  return {
    assetMint, yesReserves, noReserves, totalLpShares, nextEpochId,
    activeEpoch, activeEpochState, walletCapBps, sideCapBps,
    isPaused, isFrozen, bump
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Protocol Verification')
  console.log('='.repeat(60))
  console.log()

  let errors = 0
  let warnings = 0

  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet public key:', wallet.publicKey.toBase58())

  // Setup connection
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC endpoint:', FOGO_TESTNET_RPC)
  console.log()

  // ==========================================================================
  // VERIFY GLOBALCONFIG
  // ==========================================================================
  console.log('1. VERIFYING GLOBALCONFIG')
  console.log('-'.repeat(40))

  const [globalConfigPda] = deriveGlobalConfigPda()
  console.log('PDA:', globalConfigPda.toBase58())

  const globalConfigAccount = await connection.getAccountInfo(globalConfigPda)

  if (!globalConfigAccount) {
    console.log('Account exists: NO')
    console.log('ERROR: GlobalConfig not found')
    errors++
  } else {
    console.log('Account exists: YES')
    console.log('Account size:', globalConfigAccount.data.length, 'bytes')

    // Verify discriminator
    const discriminator = globalConfigAccount.data.subarray(0, 8)
    const discriminatorMatch = discriminator.equals(GLOBAL_CONFIG_DISCRIMINATOR)
    console.log(`${checkMark(discriminatorMatch)} Discriminator valid`)
    if (!discriminatorMatch) errors++

    // Decode and verify
    const config = decodeGlobalConfig(globalConfigAccount.data)

    console.log()
    console.log('Parameters:')
    console.log(`  Admin:                    ${config.admin.toBase58()}`)
    console.log(`  Treasury:                 ${config.treasury.toBase58()}`)
    console.log(`  Insurance:                ${config.insurance.toBase58()}`)
    console.log()

    // Verify each parameter
    const checks = [
      { name: 'tradingFeeBps', actual: config.tradingFeeBps, expected: EXPECTED_PARAMS.tradingFeeBps },
      { name: 'lpFeeShareBps', actual: config.lpFeeShareBps, expected: EXPECTED_PARAMS.lpFeeShareBps },
      { name: 'treasuryFeeShareBps', actual: config.treasuryFeeShareBps, expected: EXPECTED_PARAMS.treasuryFeeShareBps },
      { name: 'insuranceFeeShareBps', actual: config.insuranceFeeShareBps, expected: EXPECTED_PARAMS.insuranceFeeShareBps },
      { name: 'perWalletCapBps', actual: config.perWalletCapBps, expected: EXPECTED_PARAMS.perWalletCapBps },
      { name: 'perSideCapBps', actual: config.perSideCapBps, expected: EXPECTED_PARAMS.perSideCapBps },
      { name: 'epochDurationSeconds', actual: Number(config.epochDurationSeconds), expected: EXPECTED_PARAMS.epochDurationSeconds },
      { name: 'freezeWindowSeconds', actual: Number(config.freezeWindowSeconds), expected: EXPECTED_PARAMS.freezeWindowSeconds },
      { name: 'oracleConfidenceThresholdStartBps', actual: config.oracleConfidenceThresholdStartBps, expected: EXPECTED_PARAMS.oracleConfidenceThresholdStartBps },
      { name: 'oracleConfidenceThresholdSettleBps', actual: config.oracleConfidenceThresholdSettleBps, expected: EXPECTED_PARAMS.oracleConfidenceThresholdSettleBps },
      { name: 'oracleStalenessThresholdStart', actual: Number(config.oracleStalenessThresholdStart), expected: EXPECTED_PARAMS.oracleStalenessThresholdStart },
      { name: 'oracleStalenessThresholdSettle', actual: Number(config.oracleStalenessThresholdSettle), expected: EXPECTED_PARAMS.oracleStalenessThresholdSettle },
      { name: 'allowHedging', actual: config.allowHedging, expected: EXPECTED_PARAMS.allowHedging },
    ]

    for (const check of checks) {
      const match = check.actual === check.expected
      const mark = checkMark(match)
      console.log(`  ${mark} ${check.name}: ${check.actual} ${match ? '' : `(expected: ${check.expected})`}`)
      if (!match) errors++
    }

    // Check paused/frozen status
    console.log()
    console.log('  Status flags:')
    console.log(`  ${checkMark(!config.paused)} paused: ${config.paused} (expected: false)`)
    console.log(`  ${checkMark(!config.frozen)} frozen: ${config.frozen} (expected: false)`)
    if (config.paused) warnings++
    if (config.frozen) warnings++
  }

  // ==========================================================================
  // VERIFY POOLS
  // ==========================================================================
  console.log()
  console.log('2. VERIFYING POOLS')
  console.log('-'.repeat(40))

  const poolAddresses: Record<Asset, string> = {} as any
  const poolUsdcAtaAddresses: Record<Asset, string> = {} as any

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    console.log()
    console.log(`${asset}:`)

    const [poolPda] = derivePoolPda(assetMint)
    console.log(`  Pool PDA: ${poolPda.toBase58()}`)
    poolAddresses[asset] = poolPda.toBase58()

    const poolAccount = await connection.getAccountInfo(poolPda)

    if (!poolAccount) {
      console.log(`  ${checkMark(false)} Account exists: NO`)
      console.log(`  ERROR: Pool not found`)
      errors++
    } else {
      console.log(`  ${checkMark(true)} Account exists: YES`)

      // Verify discriminator
      const discriminator = poolAccount.data.subarray(0, 8)
      const discriminatorMatch = discriminator.equals(POOL_DISCRIMINATOR)
      console.log(`  ${checkMark(discriminatorMatch)} Discriminator valid`)
      if (!discriminatorMatch) errors++

      // Decode pool
      const pool = decodePool(poolAccount.data)

      // Verify asset mint
      const mintMatch = pool.assetMint.toBase58() === assetMint.toBase58()
      console.log(`  ${checkMark(mintMatch)} Asset Mint: ${pool.assetMint.toBase58()}`)
      if (!mintMatch) errors++

      // Show pool data
      console.log(`  ${checkMark(true)} Yes Reserves: ${pool.yesReserves.toString()}`)
      console.log(`  ${checkMark(true)} No Reserves: ${pool.noReserves.toString()}`)
      console.log(`  ${checkMark(true)} Total LP Shares: ${pool.totalLpShares.toString()}`)
      console.log(`  ${checkMark(true)} Next Epoch ID: ${pool.nextEpochId.toString()}`)
      console.log(`  ${checkMark(true)} Active Epoch: ${pool.activeEpoch ? pool.activeEpoch.toBase58() : 'None'}`)

      // Check paused/frozen
      console.log(`  ${checkMark(!pool.isPaused)} isPaused: ${pool.isPaused}`)
      console.log(`  ${checkMark(!pool.isFrozen)} isFrozen: ${pool.isFrozen}`)
      if (pool.isPaused) warnings++
      if (pool.isFrozen) warnings++
    }

    // Verify Pool USDC ATA
    const poolUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      poolPda,
      true // allowOwnerOffCurve
    )
    console.log(`  Pool USDC ATA: ${poolUsdcAta.toBase58()}`)
    poolUsdcAtaAddresses[asset] = poolUsdcAta.toBase58()

    try {
      const ataAccount = await getAccount(connection, poolUsdcAta)
      console.log(`  ${checkMark(true)} ATA exists: YES`)
      console.log(`  ${checkMark(true)} ATA balance: ${ataAccount.amount.toString()} (raw USDC)`)
      console.log(`  ${checkMark(ataAccount.owner.equals(poolPda))} ATA owner: ${ataAccount.owner.toBase58()}`)
      if (!ataAccount.owner.equals(poolPda)) errors++
    } catch (error: any) {
      console.log(`  ${checkMark(false)} ATA exists: NO`)
      console.log(`  ERROR: ${error.message}`)
      errors++
    }
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log()
  console.log('='.repeat(60))
  console.log('VERIFICATION SUMMARY')
  console.log('='.repeat(60))
  console.log()

  if (errors === 0 && warnings === 0) {
    console.log('✓ All verifications PASSED!')
  } else {
    if (errors > 0) {
      console.log(`✗ ${errors} error(s) found`)
    }
    if (warnings > 0) {
      console.log(`⚠ ${warnings} warning(s) found`)
    }
  }

  console.log()
  console.log('ACCOUNT ADDRESSES:')
  console.log('-'.repeat(40))
  console.log()
  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())
  console.log()
  console.log('Pool PDAs:')
  for (const [asset, address] of Object.entries(poolAddresses)) {
    console.log(`  ${asset}: ${address}`)
  }
  console.log()
  console.log('Pool USDC ATAs:')
  for (const [asset, address] of Object.entries(poolUsdcAtaAddresses)) {
    console.log(`  ${asset}: ${address}`)
  }

  // Output code snippet for constants.ts
  console.log()
  console.log('='.repeat(60))
  console.log('CODE SNIPPET FOR constants.ts:')
  console.log('='.repeat(60))
  console.log()
  console.log(`// =============================================================================
// INITIALIZED ACCOUNTS (Story 1.11)
// =============================================================================

export const GLOBAL_CONFIG_PDA = new PublicKey('${globalConfigPda.toBase58()}')

export const POOL_PDAS = {
  BTC: new PublicKey('${poolAddresses.BTC || 'NOT_CREATED'}'),
  ETH: new PublicKey('${poolAddresses.ETH || 'NOT_CREATED'}'),
  SOL: new PublicKey('${poolAddresses.SOL || 'NOT_CREATED'}'),
  FOGO: new PublicKey('${poolAddresses.FOGO || 'NOT_CREATED'}'),
} as const

export const POOL_USDC_ATAS = {
  BTC: new PublicKey('${poolUsdcAtaAddresses.BTC || 'NOT_CREATED'}'),
  ETH: new PublicKey('${poolUsdcAtaAddresses.ETH || 'NOT_CREATED'}'),
  SOL: new PublicKey('${poolUsdcAtaAddresses.SOL || 'NOT_CREATED'}'),
  FOGO: new PublicKey('${poolUsdcAtaAddresses.FOGO || 'NOT_CREATED'}'),
} as const`)
  console.log()

  // Exit with error code if issues found
  if (errors > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
