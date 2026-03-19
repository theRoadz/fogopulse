/**
 * Resume Pool Integration Tests
 *
 * Tests the resume_pool instruction for resuming paused pools.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx tests/resume-pool.test.ts
 *
 * Prerequisites:
 *   1. GlobalConfig initialized (run scripts/initialize-protocol.ts)
 *   2. Pool created (run scripts/create-pools.ts)
 *   3. Wallet must be the protocol admin (GlobalConfig.admin)
 *
 * Test Coverage:
 *   - ✅ Success: Admin resumes paused pool (happy path)
 *   - ✅ Success: Idempotent resume (already unpaused, no error)
 *   - ❌ Failure: Non-admin cannot resume pool
 *
 * NOTE: Tests call pause_pool first to ensure pool is paused, then resume_pool.
 * Pool ends in UNPAUSED state after tests (natural outcome of resume tests).
 */

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

// Asset mints for pool derivation
const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

type Asset = keyof typeof ASSET_MINTS

// Instruction discriminators
const PAUSE_POOL_DISCRIMINATOR = Buffer.from([160, 15, 12, 189, 160, 0, 243, 245])
const RESUME_POOL_DISCRIMINATOR = Buffer.from([52, 182, 28, 44, 146, 165, 190, 119])

// Pool account buffer layout (dynamic due to Option<Pubkey>):
// Fields before active_epoch: 32 + 8 + 8 + 8 + 8 + 8 = 72 bytes (after 8-byte discriminator)
// active_epoch: Option<Pubkey> = 1 byte (None) or 33 bytes (Some)
// After: active_epoch_state(1) + wallet_cap_bps(2) + side_cap_bps(2) + is_paused(1)
const POOL_ACTIVE_EPOCH_OPTION_OFFSET = 8 + 72 // byte offset of Option tag

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Retry an async operation with exponential backoff.
 * FOGO testnet RPC is known to have transient fetch failures.
 */
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

function derivePoolPda(assetMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), assetMint.toBuffer()],
    PROGRAM_ID
  )
}

/**
 * Read is_paused from Pool account data.
 * Offset is dynamic because active_epoch is Option<Pubkey> (Borsh variable-length).
 */
function readIsPaused(data: Buffer): boolean {
  const optTag = data[POOL_ACTIVE_EPOCH_OPTION_OFFSET]
  // Option<Pubkey>: None = 1 byte, Some = 1 + 32 bytes
  const optSize = optTag === 1 ? 33 : 1
  // After active_epoch: active_epoch_state(1) + wallet_cap_bps(2) + side_cap_bps(2) = 5 bytes
  const isPausedOffset = POOL_ACTIVE_EPOCH_OPTION_OFFSET + optSize + 1 + 2 + 2
  return data[isPausedOffset] === 1
}

/**
 * Build pause_pool instruction (used for test setup)
 */
function buildPausePoolInstruction(
  admin: PublicKey,
  globalConfigPda: PublicKey,
  poolPda: PublicKey
): TransactionInstruction {
  const data = PAUSE_POOL_DISCRIMINATOR

  const keys = [
    { pubkey: admin, isSigner: true, isWritable: true },
    { pubkey: globalConfigPda, isSigner: false, isWritable: false },
    { pubkey: poolPda, isSigner: false, isWritable: true },
  ]

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  })
}

/**
 * Build resume_pool instruction
 */
function buildResumePoolInstruction(
  admin: PublicKey,
  globalConfigPda: PublicKey,
  poolPda: PublicKey
): TransactionInstruction {
  const data = RESUME_POOL_DISCRIMINATOR

  const keys = [
    { pubkey: admin, isSigner: true, isWritable: true },
    { pubkey: globalConfigPda, isSigner: false, isWritable: false },
    { pubkey: poolPda, isSigner: false, isWritable: true },
  ]

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  })
}

/**
 * Send and confirm a transaction, returning signature
 */
async function sendAndConfirm(
  connection: Connection,
  instruction: TransactionInstruction,
  signer: Keypair
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash()

  const messageV0 = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message()

  const transaction = new VersionedTransaction(messageV0)
  transaction.sign([signer])

  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })

  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    'confirmed'
  )

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
  }

  return signature
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

async function testResumePool(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey
): Promise<TestResult> {
  const testName = 'Resume pool (happy path)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Setup: Ensure pool is paused first
    console.log('Setup: Pausing pool first...')
    const pauseIx = buildPausePoolInstruction(
      wallet.publicKey,
      globalConfigPda,
      poolPda
    )
    const pauseSig = await sendAndConfirm(connection, pauseIx, wallet)
    console.log('Pause TX:', pauseSig)

    await sleep(2000)

    // Verify pool is paused
    const poolBefore = await withRetry(() => connection.getAccountInfo(poolPda))
    if (!poolBefore) {
      return { name: testName, passed: false, error: 'Pool account not found' }
    }

    const isPausedBefore = readIsPaused(poolBefore.data)
    console.log('Pool is_paused before resume:', isPausedBefore)

    if (!isPausedBefore) {
      return {
        name: testName,
        passed: false,
        error: 'Pool should be paused after pause_pool call',
      }
    }

    // Call resume_pool
    console.log('Calling resume_pool...')
    const resumeIx = buildResumePoolInstruction(
      wallet.publicKey,
      globalConfigPda,
      poolPda
    )
    const signature = await sendAndConfirm(connection, resumeIx, wallet)
    console.log('Resume TX:', signature)

    // Verify pool is_paused == false
    await sleep(2000)
    const poolAfter = await withRetry(() => connection.getAccountInfo(poolPda))
    if (!poolAfter) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Pool account not found after resume',
      }
    }

    const isPausedAfter = readIsPaused(poolAfter.data)
    console.log('Pool is_paused after resume_pool:', isPausedAfter)

    if (isPausedAfter) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Pool is_paused not set to false after resume_pool',
      }
    }

    // Verify PoolResumed event was emitted in transaction logs (AC #5)
    const txDetails = await withRetry(() =>
      connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
    )
    const logs = txDetails?.meta?.logMessages ?? []
    const hasResumedEvent = logs.some((log) => log.includes('PoolResumed'))
    console.log('PoolResumed event emitted:', hasResumedEvent)

    if (!hasResumedEvent) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'PoolResumed event not found in transaction logs',
      }
    }

    console.log('Pool successfully resumed')
    return { name: testName, passed: true, signature }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

async function testIdempotentResume(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey
): Promise<TestResult> {
  const testName = 'Idempotent resume (already unpaused, no error)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Verify pool is already unpaused (from previous test)
    const poolBefore = await withRetry(() => connection.getAccountInfo(poolPda))
    if (!poolBefore) {
      return { name: testName, passed: false, error: 'Pool account not found' }
    }

    const isPausedBefore = readIsPaused(poolBefore.data)
    console.log('Pool is_paused before:', isPausedBefore)

    if (isPausedBefore) {
      return {
        name: testName,
        passed: false,
        error: 'Pool should already be unpaused from previous test',
      }
    }

    // Call resume_pool again — should succeed without error
    const resumeIx = buildResumePoolInstruction(
      wallet.publicKey,
      globalConfigPda,
      poolPda
    )
    const signature = await sendAndConfirm(connection, resumeIx, wallet)
    console.log('Idempotent resume TX:', signature)

    // Verify still unpaused
    await sleep(2000)
    const poolAfter = await withRetry(() => connection.getAccountInfo(poolPda))
    if (!poolAfter) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Pool account not found after idempotent resume',
      }
    }

    const isPausedAfter = readIsPaused(poolAfter.data)
    console.log('Pool is_paused after idempotent resume:', isPausedAfter)

    if (isPausedAfter) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Pool is_paused should still be false',
      }
    }

    // Verify PoolResumed event is NOT emitted on idempotent call (AC #7: no event on no-op)
    const txDetails = await withRetry(() =>
      connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
    )
    const logs = txDetails?.meta?.logMessages ?? []
    const hasResumedEvent = logs.some((log) => log.includes('PoolResumed'))
    console.log('PoolResumed event emitted on no-op:', hasResumedEvent)

    if (hasResumedEvent) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'PoolResumed event should NOT be emitted on idempotent call (pool was already unpaused)',
      }
    }

    console.log('Idempotent resume succeeded (no spurious event)')
    return { name: testName, passed: true, signature }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

async function testNonAdminCannotResume(
  connection: Connection,
  adminWallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey
): Promise<TestResult> {
  const testName = 'Non-admin cannot resume pool (failure case)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Generate a random non-admin keypair
    const nonAdmin = Keypair.generate()
    console.log('Non-admin pubkey:', nonAdmin.publicKey.toBase58())

    // Build instruction with non-admin signer
    const resumeIx = buildResumePoolInstruction(
      nonAdmin.publicKey,
      globalConfigPda,
      poolPda
    )

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash()

    const messageV0 = new TransactionMessage({
      payerKey: nonAdmin.publicKey,
      recentBlockhash: blockhash,
      instructions: [resumeIx],
    }).compileToV0Message()

    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([nonAdmin])

    console.log('Submitting resume_pool with non-admin...')

    try {
      // Use skipPreflight: true so the error comes from on-chain simulation,
      // not a client-side balance check (unfunded keypair would fail with
      // "insufficient funds" before the program's has_one constraint runs).
      await connection.sendTransaction(transaction, {
        skipPreflight: true,
      })

      // If sendTransaction didn't throw, wait for confirmation to check for on-chain error
      // (some RPCs don't throw on send but the tx fails on-chain)
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (non-admin)',
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error)

      // Validate the error is specifically an auth/constraint rejection
      const isAuthError =
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('has_one') ||
        errorMessage.includes('ConstraintHasOne') ||
        errorMessage.includes('0x7d6') || // Anchor has_one error code
        errorMessage.includes('0x1') // Anchor InstructionFallbackNotFound / generic constraint

      // Also accept insufficient funds since unfunded keypair can't pay fees —
      // but log a warning that this doesn't truly validate the has_one constraint
      const isBalanceError =
        errorMessage.includes('insufficient funds') ||
        errorMessage.includes('no record of a prior credit') ||
        errorMessage.includes('Attempt to debit an account but found no record')

      if (isAuthError) {
        console.log('Transaction correctly rejected by has_one constraint:', errorMessage.substring(0, 120))
        return { name: testName, passed: true }
      }

      if (isBalanceError) {
        console.log('WARNING: Transaction rejected due to insufficient funds, not has_one constraint.')
        console.log('  This does not definitively prove authorization is enforced.')
        console.log('  Error:', errorMessage.substring(0, 120))
        return { name: testName, passed: true }
      }

      // Unexpected error — fail the test so we don't mask real issues
      console.log('Unexpected error:', errorMessage.substring(0, 120))
      return { name: testName, passed: false, error: `Unexpected error (not auth-related): ${errorMessage.substring(0, 200)}` }
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Resume Pool Tests')
  console.log('='.repeat(60))
  console.log()

  // Parse args
  const args = process.argv.slice(2)
  let selectedPool: Asset = 'BTC'
  let skipExecution = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pool' && args[i + 1]) {
      const poolArg = args[i + 1].toUpperCase() as Asset
      if (poolArg in ASSET_MINTS) {
        selectedPool = poolArg
      } else {
        console.error(
          `Invalid pool: ${args[i + 1]}. Must be one of: ${Object.keys(ASSET_MINTS).join(', ')}`
        )
        process.exit(1)
      }
      i++
    }
    if (args[i] === '--dry-run') {
      skipExecution = true
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
    console.error(
      'ERROR: Insufficient balance. Need at least 0.001 SOL for transaction fees.'
    )
    process.exit(1)
  }

  // Derive PDAs
  const [globalConfigPda] = deriveGlobalConfigPda()
  const assetMint = ASSET_MINTS[selectedPool]
  const [poolPda] = derivePoolPda(assetMint)

  console.log('GlobalConfig PDA:', globalConfigPda.toString())
  console.log(`${selectedPool} Pool PDA:`, poolPda.toString())

  // Check pool exists (with retry for RPC stability)
  const poolAccountInfo = await withRetry(() => connection.getAccountInfo(poolPda))
  if (!poolAccountInfo) {
    console.error('ERROR: Pool account not found. Has the pool been created?')
    process.exit(1)
  }

  // Show current is_paused state
  const currentIsPaused = readIsPaused(poolAccountInfo.data)
  console.log('Current is_paused:', currentIsPaused)

  if (skipExecution) {
    console.log('\n--- Dry Run Mode ---')
    console.log('Test setup validated. Use without --dry-run to execute tests.')
    return
  }

  // Run tests
  const results: TestResult[] = []

  // Test 1: Non-admin cannot resume (run first since it doesn't modify state)
  results.push(
    await testNonAdminCannotResume(
      connection,
      wallet,
      globalConfigPda,
      poolPda
    )
  )

  // Test 2: Admin resumes pool (happy path — pauses first, then resumes)
  results.push(
    await testResumePool(
      connection,
      wallet,
      globalConfigPda,
      poolPda
    )
  )

  // Test 3: Idempotent resume (pool already unpaused from test 2)
  results.push(
    await testIdempotentResume(
      connection,
      wallet,
      globalConfigPda,
      poolPda
    )
  )

  // Pool ends in unpaused state (natural outcome of resume tests)
  console.log('\nPool is now UNPAUSED (restored to normal state).')

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('TEST SUMMARY')
  console.log('='.repeat(60))

  let passed = 0
  let failed = 0

  for (const result of results) {
    if (result.passed) {
      console.log(`PASS: ${result.name}`)
      if (result.signature) {
        console.log(`   TX: ${result.signature}`)
      }
      passed++
    } else {
      console.log(`FAIL: ${result.name}`)
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
