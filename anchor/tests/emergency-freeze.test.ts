/**
 * Emergency Freeze Integration Tests
 *
 * Tests the emergency_freeze instruction for freezing all protocol activity.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx tests/emergency-freeze.test.ts
 *
 * Prerequisites:
 *   1. GlobalConfig initialized (run scripts/initialize-protocol.ts)
 *   2. Wallet must be the protocol admin (GlobalConfig.admin)
 *
 * Test Coverage:
 *   - ❌ Failure: Non-admin cannot freeze (run first to not corrupt state)
 *   - ✅ Success: Admin freezes protocol (happy path + event verification)
 *   - ✅ Success: Idempotent freeze (already frozen, no error, no event)
 *   - 🧹 Cleanup: Restore protocol to unfrozen state via update_config
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: 'anchor/.env' })
dotenv.config()

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
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

// emergency_freeze discriminator from IDL
const EMERGENCY_FREEZE_DISCRIMINATOR = Buffer.from([179, 69, 168, 100, 173, 7, 136, 112])

// update_config discriminator from IDL
const UPDATE_CONFIG_DISCRIMINATOR = Buffer.from([29, 158, 252, 191, 10, 83, 219, 99])

// GlobalConfig frozen field offset: 8 (discriminator) + 32 (admin) + 32 (treasury) +
// 32 (insurance) + 2*8 (u16 fields) + 2*8 (i64 fields) + 1 (allow_hedging) + 1 (paused) = 154
const GLOBAL_CONFIG_FROZEN_OFFSET = 154

// =============================================================================
// HELPERS
// =============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 2000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) throw error
      const delay = baseDelayMs * Math.pow(2, attempt)
      console.log(`  RPC retry ${attempt + 1}/${maxRetries} after ${delay}ms...`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

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

function readFrozen(data: Buffer | Uint8Array): boolean {
  return data[GLOBAL_CONFIG_FROZEN_OFFSET] === 1
}

function buildEmergencyFreezeInstruction(
  admin: PublicKey,
  globalConfigPda: PublicKey
): TransactionInstruction {
  const data = EMERGENCY_FREEZE_DISCRIMINATOR

  const keys = [
    { pubkey: admin, isSigner: true, isWritable: true },
    { pubkey: globalConfigPda, isSigner: false, isWritable: true },
  ]

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  })
}

/**
 * Build update_config instruction with frozen = false (all other params None).
 *
 * UpdateConfigParams Borsh layout (17 Option fields):
 *   treasury: Option<Pubkey>           - 1 byte None
 *   insurance: Option<Pubkey>          - 1 byte None
 *   trading_fee_bps: Option<u16>       - 1 byte None
 *   lp_fee_share_bps: Option<u16>      - 1 byte None
 *   treasury_fee_share_bps: Option<u16> - 1 byte None
 *   insurance_fee_share_bps: Option<u16> - 1 byte None
 *   per_wallet_cap_bps: Option<u16>    - 1 byte None
 *   per_side_cap_bps: Option<u16>      - 1 byte None
 *   oracle_confidence_threshold_start_bps: Option<u16> - 1 byte None
 *   oracle_confidence_threshold_settle_bps: Option<u16> - 1 byte None
 *   oracle_staleness_threshold_start: Option<i64> - 1 byte None
 *   oracle_staleness_threshold_settle: Option<i64> - 1 byte None
 *   epoch_duration_seconds: Option<i64> - 1 byte None
 *   freeze_window_seconds: Option<i64>  - 1 byte None
 *   allow_hedging: Option<bool>         - 1 byte None
 *   paused: Option<bool>               - 1 byte None
 *   frozen: Option<bool>               - 1 (Some) + 1 (false) = 2 bytes
 */
function buildUpdateConfigUnfreezeInstruction(
  admin: PublicKey,
  globalConfigPda: PublicKey
): TransactionInstruction {
  // 8 bytes discriminator + 16 bytes None (16 fields) + 2 bytes Some(false) for frozen
  const paramsBuf = Buffer.alloc(16 + 2)
  // First 16 bytes are 0x00 (None for each of the first 16 Option fields)
  // Byte 16: 0x01 (Some tag for frozen)
  paramsBuf[16] = 1
  // Byte 17: 0x00 (false — unfreeze)
  paramsBuf[17] = 0

  const data = Buffer.concat([UPDATE_CONFIG_DISCRIMINATOR, paramsBuf])

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

async function sendAndConfirm(
  connection: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[],
  opts?: { skipPreflight?: boolean }
): Promise<{ signature: string; logs?: string[] | null }> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash()

  const messageV0 = new TransactionMessage({
    payerKey: signers[0].publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message()

  const transaction = new VersionedTransaction(messageV0)
  transaction.sign(signers)

  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: opts?.skipPreflight ?? false,
    preflightCommitment: 'confirmed',
  })

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed'
  )

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
  }

  // Fetch logs (wait for RPC to index the transaction)
  await sleep(3000)
  const txInfo = await withRetry(() =>
    connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
  )

  const logs = txInfo?.meta?.logMessages ?? null
  if (logs) {
    console.log('Transaction logs:')
    for (const log of logs) {
      console.log('  ', log)
    }
  }

  return { signature, logs }
}

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

interface TestResult {
  name: string
  passed: boolean
  signature?: string
  error?: string
}

async function testNonAdminCannotFreeze(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Non-admin cannot freeze (failure case)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const nonAdmin = Keypair.generate()
    console.log('Non-admin pubkey:', nonAdmin.publicKey.toBase58())

    // Fund the non-admin wallet so the test actually reaches the program's
    // has_one constraint instead of failing with "insufficient funds"
    console.log('Funding non-admin wallet with 0.005 SOL for tx fees...')
    const transferIx = SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: nonAdmin.publicKey,
      lamports: 5_000_000, // 0.005 SOL
    })
    await sendAndConfirm(connection, [transferIx], [wallet])
    console.log('Non-admin funded successfully')

    const freezeIx = buildEmergencyFreezeInstruction(
      nonAdmin.publicKey,
      globalConfigPda
    )

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash()

    const messageV0 = new TransactionMessage({
      payerKey: nonAdmin.publicKey,
      recentBlockhash: blockhash,
      instructions: [freezeIx],
    }).compileToV0Message()

    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([nonAdmin])

    console.log('Submitting emergency_freeze with non-admin (funded)...')

    try {
      // skipPreflight: true so the TX reaches the validator and we get
      // the actual program error (not a simulation error)
      const sig = await connection.sendTransaction(transaction, {
        skipPreflight: true,
      })

      // Wait for confirmation — expect it to fail on-chain
      const confirmation = await connection.confirmTransaction(
        {
          signature: sig,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      )

      if (confirmation.value.err) {
        const errJson = JSON.stringify(confirmation.value.err)
        console.log('✅ Transaction failed on-chain as expected:', errJson.substring(0, 150))

        // Verify it's an auth/constraint error (Anchor custom error or ConstraintHasOne)
        if (
          errJson.includes('0x7d6') ||    // ConstraintHasOne (2006)
          errJson.includes('0x1770') ||   // Unauthorized (6000)
          errJson.includes('ConstraintHasOne') ||
          errJson.includes('Unauthorized')
        ) {
          return { name: testName, passed: true }
        }

        // Any on-chain failure is acceptable — the key thing is it didn't succeed
        console.log('  (Error is not specifically auth-related, but TX did fail)')
        return { name: testName, passed: true }
      }

      // TX succeeded — this is BAD
      return {
        name: testName,
        passed: false,
        error: 'Non-admin transaction succeeded! Authorization check missing.',
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error)

      // Acceptable: auth constraint errors
      if (
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('has_one') ||
        errorMessage.includes('ConstraintHasOne') ||
        errorMessage.includes('0x7d6') ||
        errorMessage.includes('0x1770')
      ) {
        console.log('✅ Transaction correctly rejected:', errorMessage.substring(0, 120))
        return { name: testName, passed: true }
      }

      console.log('❌ Unexpected error:', errorMessage.substring(0, 120))
      return {
        name: testName,
        passed: false,
        error: `Unexpected error (not auth-related): ${errorMessage.substring(0, 200)}`,
      }
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

async function testEmergencyFreeze(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Emergency freeze (happy path + event verification)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const freezeIx = buildEmergencyFreezeInstruction(
      wallet.publicKey,
      globalConfigPda
    )

    console.log('Submitting emergency_freeze transaction...')
    const { signature, logs } = await sendAndConfirm(
      connection,
      [freezeIx],
      [wallet]
    )
    console.log('Transaction signature:', signature)

    // Verify frozen state
    await sleep(2000)
    const configAccount = await withRetry(() =>
      connection.getAccountInfo(globalConfigPda)
    )
    if (!configAccount) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'GlobalConfig account not found',
      }
    }

    const isFrozen = readFrozen(configAccount.data)
    console.log('GlobalConfig frozen after emergency_freeze:', isFrozen)

    if (!isFrozen) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'GlobalConfig.frozen not set to true',
      }
    }

    // Verify ProtocolFrozen event in logs (AC #8)
    // Anchor emits events as base64-encoded "Program data:" log entries.
    // The first 8 bytes of the decoded data are the event discriminator.
    // We verify at least one "Program data:" entry decodes to contain the admin pubkey,
    // confirming it's the ProtocolFrozen event (not just any log).
    const programDataLogs = logs?.filter((log) => log.includes('Program data:')) ?? []
    console.log('Program data entries in logs:', programDataLogs.length)

    let eventVerified = false
    const adminKeyBytes = wallet.publicKey.toBytes()

    for (const log of programDataLogs) {
      const base64Data = log.split('Program data: ')[1]
      if (!base64Data) continue
      const decoded = Buffer.from(base64Data, 'base64')
      // ProtocolFrozen event: 8-byte discriminator + 32-byte admin pubkey + 8-byte timestamp
      if (decoded.length >= 48) {
        const eventAdmin = decoded.subarray(8, 40)
        if (Buffer.from(adminKeyBytes).equals(eventAdmin)) {
          eventVerified = true
          console.log('✅ ProtocolFrozen event verified: admin pubkey matches')
          break
        }
      }
    }

    if (!eventVerified) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'ProtocolFrozen event not found or admin pubkey mismatch in transaction logs',
      }
    }

    console.log('✅ Protocol successfully frozen with event emitted')
    return { name: testName, passed: true, signature }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

async function testIdempotentFreeze(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Idempotent freeze (already frozen, no error, no event)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Verify already frozen
    const configBefore = await withRetry(() =>
      connection.getAccountInfo(globalConfigPda)
    )
    if (!configBefore) {
      return { name: testName, passed: false, error: 'GlobalConfig account not found' }
    }

    const frozenBefore = readFrozen(configBefore.data)
    console.log('GlobalConfig frozen before:', frozenBefore)

    if (!frozenBefore) {
      return {
        name: testName,
        passed: false,
        error: 'Protocol should already be frozen from previous test',
      }
    }

    // Call emergency_freeze again
    const freezeIx = buildEmergencyFreezeInstruction(
      wallet.publicKey,
      globalConfigPda
    )

    console.log('Submitting second emergency_freeze transaction...')
    const { signature, logs } = await sendAndConfirm(
      connection,
      [freezeIx],
      [wallet]
    )
    console.log('Transaction signature:', signature)

    // Verify still frozen
    await sleep(2000)
    const configAfter = await withRetry(() =>
      connection.getAccountInfo(globalConfigPda)
    )
    if (!configAfter) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'GlobalConfig account not found after idempotent freeze',
      }
    }

    const frozenAfter = readFrozen(configAfter.data)
    console.log('GlobalConfig frozen after idempotent freeze:', frozenAfter)

    if (!frozenAfter) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'GlobalConfig.frozen should still be true',
      }
    }

    // Verify NO ProtocolFrozen event in logs (AC #10)
    // Check that no "Program data:" entry contains a ProtocolFrozen event
    // (i.e., no base64 payload with admin pubkey at offset 8-40)
    const programDataLogs = logs?.filter((log) => log.includes('Program data:')) ?? []
    console.log('Program data entries in logs (should be 0):', programDataLogs.length)

    let spuriousEvent = false
    for (const log of programDataLogs) {
      const base64Data = log.split('Program data: ')[1]
      if (!base64Data) continue
      const decoded = Buffer.from(base64Data, 'base64')
      if (decoded.length >= 48) {
        const eventAdmin = decoded.subarray(8, 40)
        if (Buffer.from(wallet.publicKey.toBytes()).equals(eventAdmin)) {
          spuriousEvent = true
          break
        }
      }
    }

    if (spuriousEvent) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'ProtocolFrozen event should NOT be emitted on idempotent call',
      }
    }

    console.log('✅ Idempotent freeze succeeded (no event)')
    return { name: testName, passed: true, signature }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

async function cleanupUnfreeze(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey
): Promise<TestResult> {
  const testName = 'Cleanup: Restore unfrozen state via update_config'
  console.log(`\n--- ${testName} ---`)

  try {
    const unfreezeIx = buildUpdateConfigUnfreezeInstruction(
      wallet.publicKey,
      globalConfigPda
    )

    console.log('Submitting update_config(frozen: false) to restore state...')
    const { signature } = await sendAndConfirm(
      connection,
      [unfreezeIx],
      [wallet]
    )
    console.log('Transaction signature:', signature)

    // Verify unfrozen
    await sleep(2000)
    const configAccount = await withRetry(() =>
      connection.getAccountInfo(globalConfigPda)
    )
    if (!configAccount) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'GlobalConfig account not found after unfreeze',
      }
    }

    const isFrozen = readFrozen(configAccount.data)
    console.log('GlobalConfig frozen after cleanup:', isFrozen)

    if (isFrozen) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Failed to unfreeze protocol — GlobalConfig.frozen still true!',
      }
    }

    console.log('✅ Protocol successfully restored to unfrozen state')
    return { name: testName, passed: true, signature }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    console.error('⚠️  CRITICAL: Failed to unfreeze protocol!', errorMessage)
    console.error('⚠️  Manual fix needed: Run update_config with frozen=false')
    return { name: testName, passed: false, error: errorMessage }
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Emergency Freeze Tests')
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

  // Check GlobalConfig exists
  const configAccount = await withRetry(() =>
    connection.getAccountInfo(globalConfigPda)
  )
  if (!configAccount) {
    console.error('ERROR: GlobalConfig account not found. Has the protocol been initialized?')
    process.exit(1)
  }

  // Show current frozen state
  const currentFrozen = readFrozen(configAccount.data)
  console.log('Current frozen:', currentFrozen)

  // Run tests
  const results: TestResult[] = []

  // Test 1: Non-admin cannot freeze (run first to not corrupt state)
  results.push(await testNonAdminCannotFreeze(connection, wallet, globalConfigPda))

  // Test 2: Admin freezes protocol (happy path)
  results.push(await testEmergencyFreeze(connection, wallet, globalConfigPda))

  // Test 3: Idempotent freeze (already frozen from test 2)
  results.push(await testIdempotentFreeze(connection, wallet, globalConfigPda))

  // Cleanup: Restore unfrozen state (CRITICAL)
  results.push(await cleanupUnfreeze(connection, wallet, globalConfigPda))

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

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch(console.error)
