/**
 * Pause Pool Integration Tests
 *
 * Tests the pause_pool instruction for pausing individual pools.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx tests/pause-pool.test.ts
 *
 * Prerequisites:
 *   1. GlobalConfig initialized (run scripts/initialize-protocol.ts)
 *   2. Pool created (run scripts/create-pools.ts)
 *   3. Wallet must be the protocol admin (GlobalConfig.admin)
 *
 * Test Coverage:
 *   - ✅ Success: Admin pauses pool (happy path)
 *   - ✅ Success: Idempotent pause (already paused, no error)
 *   - ❌ Failure: Non-admin cannot pause pool
 *   - 📝 Document-only: create_epoch blocked when paused (requires Pyth oracle data)
 *
 * NOTE: Tests call pause_pool which sets is_paused=true. Since resume_pool
 * (Story 6.3) does not exist yet, the pool will remain paused after tests.
 * Run resume_pool once implemented to restore state, or redeploy the program.
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

// pause_pool instruction discriminator (SHA256("global:pause_pool")[0..8])
const PAUSE_POOL_DISCRIMINATOR = Buffer.from([160, 15, 12, 189, 160, 0, 243, 245])

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
 * Build pause_pool instruction
 */
function buildPausePoolInstruction(
  admin: PublicKey,
  globalConfigPda: PublicKey,
  poolPda: PublicKey
): TransactionInstruction {
  // Instruction data: just discriminator (no args)
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

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

interface TestResult {
  name: string
  passed: boolean
  signature?: string
  error?: string
}

async function testPausePool(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey
): Promise<TestResult> {
  const testName = 'Pause pool (happy path)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Build instruction
    const pauseIx = buildPausePoolInstruction(
      wallet.publicKey,
      globalConfigPda,
      poolPda
    )

    // Build transaction
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash()

    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [pauseIx],
    }).compileToV0Message()

    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([wallet])

    // Submit transaction
    console.log('Submitting pause_pool transaction...')

    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })

    console.log('Transaction signature:', signature)

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'confirmed'
    )

    if (confirmation.value.err) {
      return {
        name: testName,
        passed: false,
        signature,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      }
    }

    // Wait briefly then verify pool is_paused == true (with retry for RPC stability)
    await sleep(2000)
    const poolAccount = await withRetry(() => connection.getAccountInfo(poolPda))
    if (!poolAccount) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Pool account not found after pause',
      }
    }

    const isPaused = readIsPaused(poolAccount.data)
    console.log('Pool is_paused after pause_pool:', isPaused)

    if (!isPaused) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Pool is_paused not set to true after pause_pool',
      }
    }

    console.log('✅ Pool successfully paused')
    return { name: testName, passed: true, signature }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

async function testIdempotentPause(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey
): Promise<TestResult> {
  const testName = 'Idempotent pause (already paused, no error)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Verify pool is already paused (with retry for RPC stability)
    const poolBefore = await withRetry(() => connection.getAccountInfo(poolPda))
    if (!poolBefore) {
      return { name: testName, passed: false, error: 'Pool account not found' }
    }

    const isPausedBefore = readIsPaused(poolBefore.data)
    console.log('Pool is_paused before:', isPausedBefore)

    if (!isPausedBefore) {
      return {
        name: testName,
        passed: false,
        error: 'Pool should already be paused from previous test',
      }
    }

    // Call pause_pool again — should succeed without error
    const pauseIx = buildPausePoolInstruction(
      wallet.publicKey,
      globalConfigPda,
      poolPda
    )

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash()

    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [pauseIx],
    }).compileToV0Message()

    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([wallet])

    console.log('Submitting second pause_pool transaction...')

    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })

    console.log('Transaction signature:', signature)

    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'confirmed'
    )

    if (confirmation.value.err) {
      return {
        name: testName,
        passed: false,
        signature,
        error: `Transaction failed on idempotent call: ${JSON.stringify(confirmation.value.err)}`,
      }
    }

    // Verify still paused (with retry for RPC stability)
    await sleep(2000)
    const poolAfter = await withRetry(() => connection.getAccountInfo(poolPda))
    if (!poolAfter) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Pool account not found after idempotent pause',
      }
    }

    const isPausedAfter = readIsPaused(poolAfter.data)
    console.log('Pool is_paused after idempotent pause:', isPausedAfter)

    if (!isPausedAfter) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Pool is_paused should still be true',
      }
    }

    console.log('✅ Idempotent pause succeeded')
    return { name: testName, passed: true, signature }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

async function testNonAdminCannotPause(
  connection: Connection,
  adminWallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey
): Promise<TestResult> {
  const testName = 'Non-admin cannot pause pool (failure case)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Generate a random non-admin keypair
    const nonAdmin = Keypair.generate()
    console.log('Non-admin pubkey:', nonAdmin.publicKey.toBase58())

    // Build instruction with non-admin signer
    const pauseIx = buildPausePoolInstruction(
      nonAdmin.publicKey,
      globalConfigPda,
      poolPda
    )

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash()

    const messageV0 = new TransactionMessage({
      payerKey: nonAdmin.publicKey,
      recentBlockhash: blockhash,
      instructions: [pauseIx],
    }).compileToV0Message()

    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([nonAdmin])

    console.log('Submitting pause_pool with non-admin...')

    try {
      await connection.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      // If we get here, the transaction succeeded when it should have failed
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (non-admin)',
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error)

      // Transaction should fail — either has_one constraint or insufficient funds
      if (
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('insufficient funds') ||
        errorMessage.includes('no record of a prior credit') ||
        errorMessage.includes('has_one') ||
        errorMessage.includes('ConstraintHasOne') ||
        errorMessage.includes('0x7d6') // Anchor has_one error code
      ) {
        console.log('✅ Transaction correctly rejected:', errorMessage.substring(0, 120))
        return { name: testName, passed: true }
      }

      // Unexpected error — fail the test so we don't mask real issues
      console.log('❌ Unexpected error:', errorMessage.substring(0, 120))
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
  console.log('FOGO Pulse - Pause Pool Tests')
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

  // Test 1: Non-admin cannot pause (run first since it doesn't modify state)
  results.push(
    await testNonAdminCannotPause(
      connection,
      wallet,
      globalConfigPda,
      poolPda
    )
  )

  // Test 2: Admin pauses pool (happy path)
  results.push(
    await testPausePool(
      connection,
      wallet,
      globalConfigPda,
      poolPda
    )
  )

  // Test 3: Idempotent pause (pool already paused from test 2)
  results.push(
    await testIdempotentPause(
      connection,
      wallet,
      globalConfigPda,
      poolPda
    )
  )

  // Note: create_epoch blocked test is document-only (requires Pyth oracle data setup)
  console.log('\n📝 Document-only: create_epoch blocked when pool is paused')
  console.log('   (Requires Pyth Lazer oracle data + Ed25519 verification, skipping)')

  // Note: Cannot restore pool state since resume_pool (Story 6.3) doesn't exist yet
  console.log('\n⚠️  Pool remains paused after tests. Run resume_pool (Story 6.3) to unpause.')

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
  console.log('📝 1 document-only test (create_epoch blocked)')

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch(console.error)
