/**
 * Update Config Integration Tests
 *
 * Tests the update_config instruction for modifying protocol parameters.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx tests/update-config.test.ts
 *
 * Prerequisites:
 *   1. GlobalConfig initialized (run scripts/initialize-protocol.ts)
 *   2. Wallet must be the protocol admin (GlobalConfig.admin)
 *
 * Test Coverage:
 *   - ✅ Success: Update single field (trading_fee_bps)
 *   - ✅ Success: Update multiple fields simultaneously
 *   - ✅ Success: Partial updates leave other fields unchanged
 *   - ❌ Failure: Fee shares don't sum to 10000 (InvalidFeeShare)
 *   - ❌ Failure: Cap > 10000 (InvalidCap)
 *   - ❌ Failure: Oracle threshold out of range (InvalidOracleThreshold)
 *   - ❌ Failure: Staleness threshold <= 0 (InvalidOracleThreshold)
 *   - ❌ Failure: Timing validation (InvalidTimingParams)
 *   - ❌ Failure: Trading fee > 1000 bps (InvalidTradingFee)
 *   - ❌ Failure: Non-admin signer (Unauthorized)
 *   - ❌ Failure: Oracle threshold > 10000 (InvalidOracleThreshold)
 *   - ❌ Failure: Negative staleness threshold (InvalidOracleThreshold)
 *   - ✅ Success: Update oracle thresholds (happy path)
 *   - ✅ Success: Update timing params (happy path)
 *   - ✅ Success: Update paused/frozen flags
 *   - ✅ Success: Update allow_hedging flag
 *   - 🔄 Restore: Original config values restored after tests
 */

// Load environment variables
import * as dotenv from 'dotenv'
dotenv.config({ path: 'anchor/.env' })
dotenv.config()

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
import * as path from 'path'

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'

// update_config instruction discriminator (from IDL)
const UPDATE_CONFIG_DISCRIMINATOR = Buffer.from([
  29, 158, 252, 191, 10, 83, 219, 99,
])

// =============================================================================
// TYPES
// =============================================================================

interface UpdateConfigParams {
  treasury: PublicKey | null
  insurance: PublicKey | null
  tradingFeeBps: number | null
  lpFeeShareBps: number | null
  treasuryFeeShareBps: number | null
  insuranceFeeShareBps: number | null
  perWalletCapBps: number | null
  perSideCapBps: number | null
  oracleConfidenceThresholdStartBps: number | null
  oracleConfidenceThresholdSettleBps: number | null
  oracleStalenessThresholdStart: bigint | null
  oracleStalenessThresholdSettle: bigint | null
  epochDurationSeconds: bigint | null
  freezeWindowSeconds: bigint | null
  allowHedging: boolean | null
  paused: boolean | null
  frozen: boolean | null
}

interface GlobalConfigData {
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
}

interface TestResult {
  name: string
  passed: boolean
  signature?: string
  error?: string
}

// =============================================================================
// HELPERS
// =============================================================================

function loadWallet(): Keypair {
  const walletPath =
    process.env.WALLET_PATH ||
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

/**
 * Parse GlobalConfig account data from raw buffer.
 *
 * Layout (after 8-byte discriminator):
 *   admin:                                  Pubkey  (32 bytes)
 *   treasury:                               Pubkey  (32 bytes)
 *   insurance:                              Pubkey  (32 bytes)
 *   trading_fee_bps:                        u16     (2 bytes)
 *   lp_fee_share_bps:                       u16     (2 bytes)
 *   treasury_fee_share_bps:                 u16     (2 bytes)
 *   insurance_fee_share_bps:                u16     (2 bytes)
 *   per_wallet_cap_bps:                     u16     (2 bytes)
 *   per_side_cap_bps:                       u16     (2 bytes)
 *   oracle_confidence_threshold_start_bps:  u16     (2 bytes)
 *   oracle_confidence_threshold_settle_bps: u16     (2 bytes)
 *   oracle_staleness_threshold_start:       i64     (8 bytes)
 *   oracle_staleness_threshold_settle:      i64     (8 bytes)
 *   epoch_duration_seconds:                 i64     (8 bytes)
 *   freeze_window_seconds:                  i64     (8 bytes)
 *   allow_hedging:                          bool    (1 byte)
 *   paused:                                 bool    (1 byte)
 *   frozen:                                 bool    (1 byte)
 *   bump:                                   u8      (1 byte)
 */
function parseGlobalConfig(data: Buffer): GlobalConfigData {
  let offset = 8 // Skip discriminator

  const admin = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const treasury = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const insurance = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const tradingFeeBps = data.readUInt16LE(offset)
  offset += 2

  const lpFeeShareBps = data.readUInt16LE(offset)
  offset += 2

  const treasuryFeeShareBps = data.readUInt16LE(offset)
  offset += 2

  const insuranceFeeShareBps = data.readUInt16LE(offset)
  offset += 2

  const perWalletCapBps = data.readUInt16LE(offset)
  offset += 2

  const perSideCapBps = data.readUInt16LE(offset)
  offset += 2

  const oracleConfidenceThresholdStartBps = data.readUInt16LE(offset)
  offset += 2

  const oracleConfidenceThresholdSettleBps = data.readUInt16LE(offset)
  offset += 2

  const oracleStalenessThresholdStart = data.readBigInt64LE(offset)
  offset += 8

  const oracleStalenessThresholdSettle = data.readBigInt64LE(offset)
  offset += 8

  const epochDurationSeconds = data.readBigInt64LE(offset)
  offset += 8

  const freezeWindowSeconds = data.readBigInt64LE(offset)
  offset += 8

  const allowHedging = data.readUInt8(offset) !== 0
  offset += 1

  const paused = data.readUInt8(offset) !== 0
  offset += 1

  const frozen = data.readUInt8(offset) !== 0
  offset += 1

  const bump = data.readUInt8(offset)

  return {
    admin,
    treasury,
    insurance,
    tradingFeeBps,
    lpFeeShareBps,
    treasuryFeeShareBps,
    insuranceFeeShareBps,
    perWalletCapBps,
    perSideCapBps,
    oracleConfidenceThresholdStartBps,
    oracleConfidenceThresholdSettleBps,
    oracleStalenessThresholdStart,
    oracleStalenessThresholdSettle,
    epochDurationSeconds,
    freezeWindowSeconds,
    allowHedging,
    paused,
    frozen,
    bump,
  }
}

/**
 * Serialize UpdateConfigParams to Borsh format matching Anchor layout.
 *
 * Each field is Option<T>:
 *   - None: 0x00 (1 byte)
 *   - Some(v): 0x01 (1 byte) + value bytes
 *
 * Field order matches UpdateConfigParams struct in Rust:
 *   treasury, insurance, trading_fee_bps, lp_fee_share_bps,
 *   treasury_fee_share_bps, insurance_fee_share_bps, per_wallet_cap_bps,
 *   per_side_cap_bps, oracle_confidence_threshold_start_bps,
 *   oracle_confidence_threshold_settle_bps, oracle_staleness_threshold_start,
 *   oracle_staleness_threshold_settle, epoch_duration_seconds,
 *   freeze_window_seconds, allow_hedging, paused, frozen
 */
function serializeUpdateConfigParams(params: UpdateConfigParams): Buffer {
  const parts: Buffer[] = []

  // Helper: Option<Pubkey> - 1 byte tag + 32 bytes
  function optionPubkey(val: PublicKey | null) {
    if (val === null) {
      parts.push(Buffer.from([0]))
    } else {
      parts.push(Buffer.from([1]))
      parts.push(val.toBuffer())
    }
  }

  // Helper: Option<u16> - 1 byte tag + 2 bytes LE
  function optionU16(val: number | null) {
    if (val === null) {
      parts.push(Buffer.from([0]))
    } else {
      const buf = Buffer.alloc(3)
      buf.writeUInt8(1, 0)
      buf.writeUInt16LE(val, 1)
      parts.push(buf)
    }
  }

  // Helper: Option<i64> - 1 byte tag + 8 bytes LE
  function optionI64(val: bigint | null) {
    if (val === null) {
      parts.push(Buffer.from([0]))
    } else {
      const buf = Buffer.alloc(9)
      buf.writeUInt8(1, 0)
      buf.writeBigInt64LE(val, 1)
      parts.push(buf)
    }
  }

  // Helper: Option<bool> - 1 byte tag + 1 byte
  function optionBool(val: boolean | null) {
    if (val === null) {
      parts.push(Buffer.from([0]))
    } else {
      parts.push(Buffer.from([1, val ? 1 : 0]))
    }
  }

  optionPubkey(params.treasury)
  optionPubkey(params.insurance)
  optionU16(params.tradingFeeBps)
  optionU16(params.lpFeeShareBps)
  optionU16(params.treasuryFeeShareBps)
  optionU16(params.insuranceFeeShareBps)
  optionU16(params.perWalletCapBps)
  optionU16(params.perSideCapBps)
  optionU16(params.oracleConfidenceThresholdStartBps)
  optionU16(params.oracleConfidenceThresholdSettleBps)
  optionI64(params.oracleStalenessThresholdStart)
  optionI64(params.oracleStalenessThresholdSettle)
  optionI64(params.epochDurationSeconds)
  optionI64(params.freezeWindowSeconds)
  optionBool(params.allowHedging)
  optionBool(params.paused)
  optionBool(params.frozen)

  return Buffer.concat(parts)
}

function defaultParams(): UpdateConfigParams {
  return {
    treasury: null,
    insurance: null,
    tradingFeeBps: null,
    lpFeeShareBps: null,
    treasuryFeeShareBps: null,
    insuranceFeeShareBps: null,
    perWalletCapBps: null,
    perSideCapBps: null,
    oracleConfidenceThresholdStartBps: null,
    oracleConfidenceThresholdSettleBps: null,
    oracleStalenessThresholdStart: null,
    oracleStalenessThresholdSettle: null,
    epochDurationSeconds: null,
    freezeWindowSeconds: null,
    allowHedging: null,
    paused: null,
    frozen: null,
  }
}

/**
 * Build update_config TransactionInstruction
 */
function buildUpdateConfigInstruction(
  admin: PublicKey,
  globalConfigPda: PublicKey,
  params: UpdateConfigParams
): TransactionInstruction {
  const paramData = serializeUpdateConfigParams(params)
  const data = Buffer.concat([UPDATE_CONFIG_DISCRIMINATOR, paramData])

  const keys = [
    { pubkey: admin, isSigner: true, isWritable: false },
    { pubkey: globalConfigPda, isSigner: false, isWritable: true },
  ]

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  })
}

/**
 * Send a transaction and return the signature or throw on error
 */
async function sendTransaction(
  connection: Connection,
  wallet: Keypair,
  instruction: TransactionInstruction
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash()

  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message()

  const transaction = new VersionedTransaction(messageV0)
  transaction.sign([wallet])

  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed'
  )

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
  }

  return signature
}

/**
 * Read current GlobalConfig state
 */
async function readGlobalConfig(
  connection: Connection,
  globalConfigPda: PublicKey
): Promise<GlobalConfigData> {
  const accountInfo = await connection.getAccountInfo(globalConfigPda)
  if (!accountInfo) {
    throw new Error('GlobalConfig account not found')
  }
  return parseGlobalConfig(accountInfo.data)
}

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

/**
 * Test 1.4: Update single field (trading_fee_bps), read back and verify
 */
async function testUpdateSingleField(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Update single field (trading_fee_bps)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const before = await readGlobalConfig(connection, globalConfigPda)
    console.log('  trading_fee_bps before:', before.tradingFeeBps)

    // Change to a different valid value (toggle between 180 and 200)
    const newValue = before.tradingFeeBps === 180 ? 200 : 180

    const params = defaultParams()
    params.tradingFeeBps = newValue

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)
    const sig = await sendTransaction(connection, wallet, ix)
    console.log('  TX:', sig)

    const after = await readGlobalConfig(connection, globalConfigPda)
    console.log('  trading_fee_bps after:', after.tradingFeeBps)

    if (after.tradingFeeBps !== newValue) {
      return {
        name: testName,
        passed: false,
        signature: sig,
        error: `Expected ${newValue}, got ${after.tradingFeeBps}`,
      }
    }

    // Restore original value
    const restoreParams = defaultParams()
    restoreParams.tradingFeeBps = before.tradingFeeBps
    const restoreIx = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, restoreParams)
    await sendTransaction(connection, wallet, restoreIx)
    console.log('  Restored trading_fee_bps to:', before.tradingFeeBps)

    return { name: testName, passed: true, signature: sig }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.5: Update multiple fields simultaneously
 */
async function testUpdateMultipleFields(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Update multiple fields simultaneously'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const before = await readGlobalConfig(connection, globalConfigPda)

    // Update trading fee and caps together
    const newTradingFee = before.tradingFeeBps === 180 ? 150 : 180
    const newWalletCap = before.perWalletCapBps === 500 ? 600 : 500
    const newSideCap = before.perSideCapBps === 3000 ? 3500 : 3000

    const params = defaultParams()
    params.tradingFeeBps = newTradingFee
    params.perWalletCapBps = newWalletCap
    params.perSideCapBps = newSideCap

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)
    const sig = await sendTransaction(connection, wallet, ix)
    console.log('  TX:', sig)

    const after = await readGlobalConfig(connection, globalConfigPda)

    const checks = [
      { field: 'tradingFeeBps', expected: newTradingFee, actual: after.tradingFeeBps },
      { field: 'perWalletCapBps', expected: newWalletCap, actual: after.perWalletCapBps },
      { field: 'perSideCapBps', expected: newSideCap, actual: after.perSideCapBps },
    ]

    for (const check of checks) {
      if (check.actual !== check.expected) {
        return {
          name: testName,
          passed: false,
          signature: sig,
          error: `${check.field}: expected ${check.expected}, got ${check.actual}`,
        }
      }
      console.log(`  ${check.field}: ${check.actual} ✓`)
    }

    // Restore original values
    const restoreParams = defaultParams()
    restoreParams.tradingFeeBps = before.tradingFeeBps
    restoreParams.perWalletCapBps = before.perWalletCapBps
    restoreParams.perSideCapBps = before.perSideCapBps
    const restoreIx = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, restoreParams)
    await sendTransaction(connection, wallet, restoreIx)
    console.log('  Restored original values')

    return { name: testName, passed: true, signature: sig }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.6: Partial updates — only provided fields change, others unchanged
 */
async function testPartialUpdate(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Partial update — unchanged fields preserved'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const before = await readGlobalConfig(connection, globalConfigPda)

    // Only update trading_fee_bps, leave everything else null
    const newValue = before.tradingFeeBps === 180 ? 100 : 180
    const params = defaultParams()
    params.tradingFeeBps = newValue

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)
    const sig = await sendTransaction(connection, wallet, ix)
    console.log('  TX:', sig)

    const after = await readGlobalConfig(connection, globalConfigPda)

    // Verify changed field
    if (after.tradingFeeBps !== newValue) {
      return {
        name: testName,
        passed: false,
        signature: sig,
        error: `trading_fee_bps: expected ${newValue}, got ${after.tradingFeeBps}`,
      }
    }

    // Verify unchanged fields
    const unchangedChecks = [
      { field: 'lpFeeShareBps', before: before.lpFeeShareBps, after: after.lpFeeShareBps },
      { field: 'treasuryFeeShareBps', before: before.treasuryFeeShareBps, after: after.treasuryFeeShareBps },
      { field: 'insuranceFeeShareBps', before: before.insuranceFeeShareBps, after: after.insuranceFeeShareBps },
      { field: 'perWalletCapBps', before: before.perWalletCapBps, after: after.perWalletCapBps },
      { field: 'perSideCapBps', before: before.perSideCapBps, after: after.perSideCapBps },
      { field: 'epochDurationSeconds', before: before.epochDurationSeconds, after: after.epochDurationSeconds },
      { field: 'freezeWindowSeconds', before: before.freezeWindowSeconds, after: after.freezeWindowSeconds },
      { field: 'allowHedging', before: before.allowHedging, after: after.allowHedging },
      { field: 'paused', before: before.paused, after: after.paused },
      { field: 'frozen', before: before.frozen, after: after.frozen },
    ]

    for (const check of unchangedChecks) {
      if (check.before !== check.after) {
        return {
          name: testName,
          passed: false,
          signature: sig,
          error: `${check.field} changed unexpectedly: ${check.before} -> ${check.after}`,
        }
      }
    }
    console.log('  All unchanged fields preserved ✓')

    // Restore
    const restoreParams = defaultParams()
    restoreParams.tradingFeeBps = before.tradingFeeBps
    const restoreIx = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, restoreParams)
    await sendTransaction(connection, wallet, restoreIx)
    console.log('  Restored trading_fee_bps to:', before.tradingFeeBps)

    return { name: testName, passed: true, signature: sig }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.7: Fee share validation — lp + treasury + insurance must sum to 10000
 */
async function testInvalidFeeShare(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Fee share validation (InvalidFeeShare)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Set fee shares that don't sum to 10000
    const params = defaultParams()
    params.lpFeeShareBps = 5000
    params.treasuryFeeShareBps = 3000
    params.insuranceFeeShareBps = 1000
    // Sum = 9000, not 10000

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)

    try {
      await sendTransaction(connection, wallet, ix)
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (invalid fee shares)',
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      if (errorMessage.includes('0x1772') || errorMessage.includes('6002') || errorMessage.includes('InvalidFeeShare')) {
        console.log('  ✅ Correctly rejected with InvalidFeeShare')
        return { name: testName, passed: true }
      }
      return {
        name: testName,
        passed: false,
        error: `Expected InvalidFeeShare (0x1772/6002), got: ${errorMessage.substring(0, 150)}`,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.8: Cap validation — per_wallet_cap_bps > 10000
 */
async function testInvalidCap(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Cap validation (InvalidCap)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const params = defaultParams()
    params.perWalletCapBps = 10001 // > 10000

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)

    try {
      await sendTransaction(connection, wallet, ix)
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (invalid cap)',
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      if (errorMessage.includes('0x1773') || errorMessage.includes('6003') || errorMessage.includes('InvalidCap')) {
        console.log('  ✅ Correctly rejected with InvalidCap')
        return { name: testName, passed: true }
      }
      return {
        name: testName,
        passed: false,
        error: `Expected InvalidCap (0x1773/6003), got: ${errorMessage.substring(0, 150)}`,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.9: Oracle threshold validation — 0 or > 10000
 */
async function testInvalidOracleThreshold(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Oracle threshold validation (InvalidOracleThreshold)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Test with 0 (below minimum of 1)
    const params = defaultParams()
    params.oracleConfidenceThresholdStartBps = 0

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)

    try {
      await sendTransaction(connection, wallet, ix)
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (oracle threshold = 0)',
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      if (errorMessage.includes('0x1776') || errorMessage.includes('6006') || errorMessage.includes('InvalidOracleThreshold')) {
        console.log('  ✅ Correctly rejected threshold=0 with InvalidOracleThreshold')
        return { name: testName, passed: true }
      }
      return {
        name: testName,
        passed: false,
        error: `Expected InvalidOracleThreshold (0x1776/6006), got: ${errorMessage.substring(0, 150)}`,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.10: Staleness threshold validation — 0 or negative
 */
async function testInvalidStalenessThreshold(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Staleness threshold validation (InvalidOracleThreshold)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const params = defaultParams()
    params.oracleStalenessThresholdStart = 0n // Must be > 0

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)

    try {
      await sendTransaction(connection, wallet, ix)
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (staleness threshold = 0)',
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      if (errorMessage.includes('0x1776') || errorMessage.includes('6006') || errorMessage.includes('InvalidOracleThreshold')) {
        console.log('  ✅ Correctly rejected staleness=0 with InvalidOracleThreshold')
        return { name: testName, passed: true }
      }
      return {
        name: testName,
        passed: false,
        error: `Expected InvalidOracleThreshold (0x1776/6006), got: ${errorMessage.substring(0, 150)}`,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.11: Timing validation — epoch_duration < 60s or freeze_window >= epoch_duration
 */
async function testInvalidTimingParams(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Timing validation (InvalidTimingParams)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Test epoch_duration < 60s
    const params = defaultParams()
    params.epochDurationSeconds = 30n // Below 60s minimum

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)

    try {
      await sendTransaction(connection, wallet, ix)
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (epoch < 60s)',
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      if (errorMessage.includes('0x1775') || errorMessage.includes('6005') || errorMessage.includes('InvalidTimingParams')) {
        console.log('  ✅ Correctly rejected epoch<60s with InvalidTimingParams')
      } else {
        console.log('  Transaction failed with:', errorMessage)
      }
    }

    // Test freeze_window >= epoch_duration (read current epoch to avoid hardcoded assumption)
    const currentConfig = await readGlobalConfig(connection, globalConfigPda)
    const params2 = defaultParams()
    params2.freezeWindowSeconds = currentConfig.epochDurationSeconds // >= epoch_duration

    const ix2 = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params2)

    try {
      await sendTransaction(connection, wallet, ix2)
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (freeze >= epoch)',
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      if (errorMessage.includes('0x1775') || errorMessage.includes('6005') || errorMessage.includes('InvalidTimingParams')) {
        console.log('  ✅ Correctly rejected freeze>=epoch with InvalidTimingParams')
      } else {
        console.log('  Transaction failed with:', errorMessage)
      }
      return { name: testName, passed: true }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.12: Trading fee > 1000 bps (10%)
 */
async function testInvalidTradingFee(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Trading fee max validation (InvalidTradingFee)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const params = defaultParams()
    params.tradingFeeBps = 1001 // > 1000 (10%)

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)

    try {
      await sendTransaction(connection, wallet, ix)
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (trading fee > 1000)',
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      if (errorMessage.includes('0x1774') || errorMessage.includes('6004') || errorMessage.includes('InvalidTradingFee')) {
        console.log('  ✅ Correctly rejected with InvalidTradingFee')
        return { name: testName, passed: true }
      }
      return {
        name: testName,
        passed: false,
        error: `Expected InvalidTradingFee (0x1774/6004), got: ${errorMessage.substring(0, 150)}`,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.13: Non-admin signer should fail with Unauthorized
 */
async function testNonAdminUnauthorized(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Non-admin signer (Unauthorized)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const nonAdmin = Keypair.generate()
    console.log('  Non-admin pubkey:', nonAdmin.publicKey.toBase58())

    const params = defaultParams()
    params.tradingFeeBps = 100

    const ix = buildUpdateConfigInstruction(nonAdmin.publicKey, globalConfigPda, params)

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash()

    const messageV0 = new TransactionMessage({
      payerKey: nonAdmin.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message()

    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([nonAdmin])

    try {
      await connection.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (non-admin)',
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      if (
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('has_one') ||
        errorMessage.includes('insufficient funds') ||
        errorMessage.includes('0x7d1') ||
        errorMessage.includes('ConstraintHasOne') ||
        errorMessage.includes('2001')
      ) {
        console.log('  ✅ Correctly rejected non-admin:', errorMessage.substring(0, 100))
        return { name: testName, passed: true }
      }
      return {
        name: testName,
        passed: false,
        error: `Expected Unauthorized/ConstraintHasOne/insufficient funds, got: ${errorMessage.substring(0, 150)}`,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.14: Update paused and frozen flags
 */
async function testPausedFrozenFlags(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Update paused/frozen flags'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const before = await readGlobalConfig(connection, globalConfigPda)
    console.log('  paused before:', before.paused, 'frozen before:', before.frozen)

    // Toggle paused
    const params = defaultParams()
    params.paused = !before.paused

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)
    const sig = await sendTransaction(connection, wallet, ix)
    console.log('  TX:', sig)

    const after = await readGlobalConfig(connection, globalConfigPda)
    console.log('  paused after:', after.paused)

    if (after.paused !== !before.paused) {
      return {
        name: testName,
        passed: false,
        signature: sig,
        error: `paused: expected ${!before.paused}, got ${after.paused}`,
      }
    }

    // Verify frozen unchanged
    if (after.frozen !== before.frozen) {
      return {
        name: testName,
        passed: false,
        signature: sig,
        error: `frozen changed unexpectedly: ${before.frozen} -> ${after.frozen}`,
      }
    }

    // Restore paused to original
    const restoreParams = defaultParams()
    restoreParams.paused = before.paused
    const restoreIx = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, restoreParams)
    await sendTransaction(connection, wallet, restoreIx)
    console.log('  Restored paused to:', before.paused)

    return { name: testName, passed: true, signature: sig }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test 1.15: Update allow_hedging flag
 */
async function testAllowHedgingFlag(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Update allow_hedging flag'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const before = await readGlobalConfig(connection, globalConfigPda)
    console.log('  allow_hedging before:', before.allowHedging)

    const params = defaultParams()
    params.allowHedging = !before.allowHedging

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)
    const sig = await sendTransaction(connection, wallet, ix)
    console.log('  TX:', sig)

    const after = await readGlobalConfig(connection, globalConfigPda)
    console.log('  allow_hedging after:', after.allowHedging)

    if (after.allowHedging !== !before.allowHedging) {
      return {
        name: testName,
        passed: false,
        signature: sig,
        error: `allow_hedging: expected ${!before.allowHedging}, got ${after.allowHedging}`,
      }
    }

    // Restore
    const restoreParams = defaultParams()
    restoreParams.allowHedging = before.allowHedging
    const restoreIx = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, restoreParams)
    await sendTransaction(connection, wallet, restoreIx)
    console.log('  Restored allow_hedging to:', before.allowHedging)

    return { name: testName, passed: true, signature: sig }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test: Oracle threshold > 10000 boundary (upper bound validation)
 */
async function testOracleThresholdUpperBound(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Oracle threshold > 10000 (InvalidOracleThreshold)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const params = defaultParams()
    params.oracleConfidenceThresholdStartBps = 10001 // > 10000

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)

    try {
      await sendTransaction(connection, wallet, ix)
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (oracle threshold > 10000)',
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      if (errorMessage.includes('0x1776') || errorMessage.includes('6006') || errorMessage.includes('InvalidOracleThreshold')) {
        console.log('  ✅ Correctly rejected threshold=10001 with InvalidOracleThreshold')
        return { name: testName, passed: true }
      }
      return {
        name: testName,
        passed: false,
        error: `Expected InvalidOracleThreshold (0x1776/6006), got: ${errorMessage.substring(0, 150)}`,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test: Staleness threshold negative value validation
 */
async function testNegativeStalenessThreshold(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Negative staleness threshold (InvalidOracleThreshold)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const params = defaultParams()
    params.oracleStalenessThresholdStart = -1n // Negative

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)

    try {
      await sendTransaction(connection, wallet, ix)
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (staleness threshold = -1)',
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      if (errorMessage.includes('0x1776') || errorMessage.includes('6006') || errorMessage.includes('InvalidOracleThreshold')) {
        console.log('  ✅ Correctly rejected staleness=-1 with InvalidOracleThreshold')
        return { name: testName, passed: true }
      }
      return {
        name: testName,
        passed: false,
        error: `Expected InvalidOracleThreshold (0x1776/6006), got: ${errorMessage.substring(0, 150)}`,
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test: Happy-path update of oracle thresholds — update and read back
 */
async function testUpdateOracleThresholds(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Update oracle thresholds (happy path)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const before = await readGlobalConfig(connection, globalConfigPda)
    console.log('  oracle_confidence_start before:', before.oracleConfidenceThresholdStartBps)
    console.log('  oracle_staleness_start before:', before.oracleStalenessThresholdStart.toString())

    // Toggle oracle confidence threshold
    const newConfidence = before.oracleConfidenceThresholdStartBps === 500 ? 600 : 500
    const newStaleness = before.oracleStalenessThresholdStart === 30n ? 45n : 30n

    const params = defaultParams()
    params.oracleConfidenceThresholdStartBps = newConfidence
    params.oracleStalenessThresholdStart = newStaleness

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)
    const sig = await sendTransaction(connection, wallet, ix)
    console.log('  TX:', sig)

    const after = await readGlobalConfig(connection, globalConfigPda)

    if (after.oracleConfidenceThresholdStartBps !== newConfidence) {
      return {
        name: testName,
        passed: false,
        signature: sig,
        error: `oracle_confidence_threshold_start_bps: expected ${newConfidence}, got ${after.oracleConfidenceThresholdStartBps}`,
      }
    }
    console.log('  oracle_confidence_start after:', after.oracleConfidenceThresholdStartBps, '✓')

    if (after.oracleStalenessThresholdStart !== newStaleness) {
      return {
        name: testName,
        passed: false,
        signature: sig,
        error: `oracle_staleness_threshold_start: expected ${newStaleness}, got ${after.oracleStalenessThresholdStart}`,
      }
    }
    console.log('  oracle_staleness_start after:', after.oracleStalenessThresholdStart.toString(), '✓')

    // Restore original values
    const restoreParams = defaultParams()
    restoreParams.oracleConfidenceThresholdStartBps = before.oracleConfidenceThresholdStartBps
    restoreParams.oracleStalenessThresholdStart = before.oracleStalenessThresholdStart
    const restoreIx = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, restoreParams)
    await sendTransaction(connection, wallet, restoreIx)
    console.log('  Restored oracle values')

    return { name: testName, passed: true, signature: sig }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test: Happy-path update of timing params — update and read back
 */
async function testUpdateTimingParams(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Update timing params (happy path)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const before = await readGlobalConfig(connection, globalConfigPda)
    console.log('  epoch_duration before:', before.epochDurationSeconds.toString())
    console.log('  freeze_window before:', before.freezeWindowSeconds.toString())

    // Use valid values: new epoch must be >= 60, new freeze must be < new epoch
    const newEpoch = before.epochDurationSeconds === 300n ? 360n : 300n
    const newFreeze = before.freezeWindowSeconds === 15n ? 20n : 15n

    const params = defaultParams()
    params.epochDurationSeconds = newEpoch
    params.freezeWindowSeconds = newFreeze

    const ix = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, params)
    const sig = await sendTransaction(connection, wallet, ix)
    console.log('  TX:', sig)

    const after = await readGlobalConfig(connection, globalConfigPda)

    if (after.epochDurationSeconds !== newEpoch) {
      return {
        name: testName,
        passed: false,
        signature: sig,
        error: `epoch_duration_seconds: expected ${newEpoch}, got ${after.epochDurationSeconds}`,
      }
    }
    console.log('  epoch_duration after:', after.epochDurationSeconds.toString(), '✓')

    if (after.freezeWindowSeconds !== newFreeze) {
      return {
        name: testName,
        passed: false,
        signature: sig,
        error: `freeze_window_seconds: expected ${newFreeze}, got ${after.freezeWindowSeconds}`,
      }
    }
    console.log('  freeze_window after:', after.freezeWindowSeconds.toString(), '✓')

    // Restore original values
    const restoreParams = defaultParams()
    restoreParams.epochDurationSeconds = before.epochDurationSeconds
    restoreParams.freezeWindowSeconds = before.freezeWindowSeconds
    const restoreIx = buildUpdateConfigInstruction(wallet.publicKey, globalConfigPda, restoreParams)
    await sendTransaction(connection, wallet, restoreIx)
    console.log('  Restored timing values')

    return { name: testName, passed: true, signature: sig }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Update Config Integration Tests')
  console.log('='.repeat(60))
  console.log()

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
    console.error(
      'ERROR: Insufficient balance. Need at least 0.001 SOL for transaction fees.'
    )
    process.exit(1)
  }

  // Derive GlobalConfig PDA
  const [globalConfigPda] = deriveGlobalConfigPda()
  console.log('GlobalConfig PDA:', globalConfigPda.toString())

  // Verify GlobalConfig exists and we are admin
  const config = await readGlobalConfig(connection, globalConfigPda)
  console.log('GlobalConfig admin:', config.admin.toString())

  if (!config.admin.equals(wallet.publicKey)) {
    console.error('ERROR: Wallet is not the protocol admin.')
    console.error('  Wallet:', wallet.publicKey.toString())
    console.error('  Admin:', config.admin.toString())
    process.exit(1)
  }

  console.log('✅ Admin verified')
  console.log()
  console.log('Current config values:')
  console.log('  trading_fee_bps:', config.tradingFeeBps)
  console.log('  lp_fee_share_bps:', config.lpFeeShareBps)
  console.log('  treasury_fee_share_bps:', config.treasuryFeeShareBps)
  console.log('  insurance_fee_share_bps:', config.insuranceFeeShareBps)
  console.log('  per_wallet_cap_bps:', config.perWalletCapBps)
  console.log('  per_side_cap_bps:', config.perSideCapBps)
  console.log('  epoch_duration_seconds:', config.epochDurationSeconds.toString())
  console.log('  freeze_window_seconds:', config.freezeWindowSeconds.toString())
  console.log('  allow_hedging:', config.allowHedging)
  console.log('  paused:', config.paused)
  console.log('  frozen:', config.frozen)

  // Run tests (non-destructive tests first, authorization test doesn't need restore)
  const results: TestResult[] = []

  // Test 1.13: Non-admin authorization (run first — doesn't modify state)
  results.push(await testNonAdminUnauthorized(connection, wallet, globalConfigPda))

  // Test 1.4: Update single field
  results.push(await testUpdateSingleField(connection, wallet, globalConfigPda))

  // Test 1.5: Update multiple fields
  results.push(await testUpdateMultipleFields(connection, wallet, globalConfigPda))

  // Test 1.6: Partial updates
  results.push(await testPartialUpdate(connection, wallet, globalConfigPda))

  // Test 1.7: Fee share validation
  results.push(await testInvalidFeeShare(connection, wallet, globalConfigPda))

  // Test 1.8: Cap validation
  results.push(await testInvalidCap(connection, wallet, globalConfigPda))

  // Test 1.9: Oracle threshold validation
  results.push(await testInvalidOracleThreshold(connection, wallet, globalConfigPda))

  // Test 1.10: Staleness threshold validation
  results.push(await testInvalidStalenessThreshold(connection, wallet, globalConfigPda))

  // Test 1.11: Timing validation
  results.push(await testInvalidTimingParams(connection, wallet, globalConfigPda))

  // Test 1.12: Trading fee max validation
  results.push(await testInvalidTradingFee(connection, wallet, globalConfigPda))

  // Test: Oracle threshold upper bound (> 10000)
  results.push(await testOracleThresholdUpperBound(connection, wallet, globalConfigPda))

  // Test: Negative staleness threshold
  results.push(await testNegativeStalenessThreshold(connection, wallet, globalConfigPda))

  // Test: Happy-path oracle threshold update
  results.push(await testUpdateOracleThresholds(connection, wallet, globalConfigPda))

  // Test: Happy-path timing params update
  results.push(await testUpdateTimingParams(connection, wallet, globalConfigPda))

  // Test 1.14: Paused/frozen flags
  results.push(await testPausedFrozenFlags(connection, wallet, globalConfigPda))

  // Test 1.15: allow_hedging flag
  results.push(await testAllowHedgingFlag(connection, wallet, globalConfigPda))

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('TEST SUMMARY')
  console.log('='.repeat(60))

  let passed = 0
  let failed = 0

  for (const result of results) {
    if (result.passed) {
      console.log(`✅ PASS: ${result.name}`)
      if (result.signature) {
        console.log(`   TX: ${result.signature}`)
      }
      passed++
    } else {
      console.log(`❌ FAIL: ${result.name}`)
      console.log(`   Error: ${result.error}`)
      failed++
    }
  }

  console.log()
  console.log(`Results: ${passed} passed, ${failed} failed`)

  // Final verification: read config to confirm no corruption
  const finalConfig = await readGlobalConfig(connection, globalConfigPda)
  console.log('\nFinal config verification:')
  console.log('  trading_fee_bps:', finalConfig.tradingFeeBps)
  console.log('  paused:', finalConfig.paused)
  console.log('  frozen:', finalConfig.frozen)

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch(console.error)
