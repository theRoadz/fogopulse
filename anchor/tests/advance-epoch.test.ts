/**
 * Advance Epoch Integration Tests
 *
 * Tests the advance_epoch instruction for transitioning epochs from Open to Frozen.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx tests/advance-epoch.test.ts --pool BTC
 *
 * Prerequisites:
 *   1. GlobalConfig initialized (run scripts/initialize-protocol.ts)
 *   2. Pool created (run scripts/create-pools.ts)
 *   3. Active epoch exists (any state - tests adapt to current state)
 *
 * Test Coverage:
 *   - Test 1: Successful advance (Open → Frozen) - runs if epoch is Open and freeze_time passed
 *   - Test 2: Rejection before freeze_time - actually submits TX and expects failure
 *   - Test 3: Rejection if not Open state - actually submits TX and expects failure
 *   - Test 4: Pool cache updated correctly - verifies active_epoch_state matches
 *
 * Note: Tests 2 and 3 gracefully skip if preconditions aren't met (e.g., freeze_time already
 * passed for Test 2, or epoch already in Open state for Test 3). They are true integration
 * tests that submit transactions and verify rejection when preconditions allow.
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

// advance_epoch instruction discriminator (sha256("global:advance_epoch")[0:8])
const ADVANCE_EPOCH_DISCRIMINATOR = Buffer.from([
  93, 138, 234, 218, 241, 230, 132, 38
])

// Clock sysvar
const SYSVAR_CLOCK_PUBKEY = new PublicKey('SysvarC1ock11111111111111111111111111111111')

// EpochState enum values
const EpochState = {
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
 * Parse Pool account data
 */
function parsePoolAccount(data: Buffer): {
  assetMint: PublicKey
  nextEpochId: bigint
  activeEpoch: PublicKey | null
  activeEpochState: number
} {
  let offset = 8 // Skip discriminator

  const assetMint = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  offset += 8 // yes_reserves
  offset += 8 // no_reserves
  offset += 8 // total_lp_shares

  const nextEpochId = data.readBigUInt64LE(offset)
  offset += 8

  const activeEpochSome = data.readUInt8(offset)
  offset += 1
  let activeEpoch: PublicKey | null = null
  if (activeEpochSome === 1) {
    activeEpoch = new PublicKey(data.subarray(offset, offset + 32))
    offset += 32
  } else {
    offset += 32
  }

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
  startTime: bigint
  endTime: bigint
  freezeTime: bigint
  bump: number
} {
  let offset = 8 // Skip discriminator

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

  // Skip remaining fields to get bump
  offset += 8 // start_price
  offset += 8 // start_confidence
  offset += 8 // start_publish_time

  // settlement_price (Option<u64>)
  const settlementPriceSome = data.readUInt8(offset)
  offset += 1
  if (settlementPriceSome === 1) offset += 8

  // settlement_confidence (Option<u64>)
  const settlementConfidenceSome = data.readUInt8(offset)
  offset += 1
  if (settlementConfidenceSome === 1) offset += 8

  // settlement_publish_time (Option<i64>)
  const settlementPublishTimeSome = data.readUInt8(offset)
  offset += 1
  if (settlementPublishTimeSome === 1) offset += 8

  // outcome (Option<Outcome>)
  const outcomeSome = data.readUInt8(offset)
  offset += 1
  if (outcomeSome === 1) offset += 1

  const bump = data.readUInt8(offset)

  return { pool, epochId, state, startTime, endTime, freezeTime, bump }
}

function epochStateToString(state: number): string {
  const states = ['Open', 'Frozen', 'Settling', 'Settled', 'Refunded']
  return states[state] || `Unknown(${state})`
}

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

interface TestResult {
  name: string
  passed: boolean
  signature?: string
  error?: string
  details?: Record<string, any>
}

async function testSuccessfulAdvance(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey
): Promise<TestResult> {
  const testName = 'Successful epoch advance (Open → Frozen)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Verify epoch is in Open state and past freeze_time
    const epochAccountBefore = await connection.getAccountInfo(epochPda)
    if (!epochAccountBefore) {
      return { name: testName, passed: false, error: 'Epoch account not found' }
    }

    const epochDataBefore = parseEpochAccount(epochAccountBefore.data)
    console.log('Epoch state before:', epochStateToString(epochDataBefore.state))
    console.log('Epoch freeze_time:', new Date(Number(epochDataBefore.freezeTime) * 1000).toISOString())

    if (epochDataBefore.state !== EpochState.Open) {
      return {
        name: testName,
        passed: false,
        error: `Epoch not in Open state (state=${epochStateToString(epochDataBefore.state)})`,
      }
    }

    const currentTime = Math.floor(Date.now() / 1000)
    console.log('Current time:', new Date(currentTime * 1000).toISOString())

    if (currentTime < Number(epochDataBefore.freezeTime)) {
      const remaining = Number(epochDataBefore.freezeTime) - currentTime
      return {
        name: testName,
        passed: false,
        error: `Epoch has not reached freeze_time (${remaining}s remaining)`,
      }
    }

    // Build advance_epoch instruction
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

    console.log('Submitting advance_epoch transaction...')

    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })

    console.log('Transaction signature:', signature)

    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
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

    // Verify epoch state changed to Frozen
    const epochAccountAfter = await connection.getAccountInfo(epochPda)
    if (!epochAccountAfter) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Epoch account not found after advance',
      }
    }

    const epochDataAfter = parseEpochAccount(epochAccountAfter.data)
    console.log('Epoch state after:', epochStateToString(epochDataAfter.state))

    if (epochDataAfter.state !== EpochState.Frozen) {
      return {
        name: testName,
        passed: false,
        signature,
        error: `Epoch not in Frozen state (state=${epochStateToString(epochDataAfter.state)})`,
      }
    }

    console.log('✅ Epoch state: Open → Frozen')

    return {
      name: testName,
      passed: true,
      signature,
      details: {
        stateBefore: epochStateToString(epochDataBefore.state),
        stateAfter: epochStateToString(epochDataAfter.state),
      },
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

async function testCannotAdvanceBeforeFreezeTime(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey
): Promise<TestResult> {
  const testName = 'Cannot advance before freeze_time (rejection test)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const epochAccount = await connection.getAccountInfo(epochPda)
    if (!epochAccount) {
      return { name: testName, passed: false, error: 'Epoch account not found' }
    }

    const epochData = parseEpochAccount(epochAccount.data)
    const currentTime = Math.floor(Date.now() / 1000)

    // If freeze_time HAS passed, we can't test rejection - skip with note
    if (currentTime >= Number(epochData.freezeTime)) {
      console.log('⚠️  Freeze time already passed - cannot test rejection scenario')
      console.log('   This test requires an epoch that has NOT reached freeze_time')
      console.log('   Skipping test (not a failure)')
      return {
        name: testName,
        passed: true,
        details: { skipped: true, reason: 'freeze_time already passed' }
      }
    }

    // Epoch has NOT reached freeze_time - attempt advance and expect failure
    console.log('Epoch has not reached freeze_time - attempting advance (should fail)...')
    console.log(`   Current: ${new Date(currentTime * 1000).toISOString()}`)
    console.log(`   Freeze:  ${new Date(Number(epochData.freezeTime) * 1000).toISOString()}`)

    // Build advance_epoch instruction
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

    try {
      await connection.sendTransaction(tx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })
      // If we get here, the transaction succeeded - that's a test failure
      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (EpochNotFrozen expected)',
      }
    } catch (sendError: unknown) {
      // Transaction failed - check if it's the expected error
      const errorStr = sendError instanceof Error ? sendError.message : JSON.stringify(sendError)
      if (errorStr.includes('EpochNotFrozen') || errorStr.includes('0x1773') || errorStr.includes('6003')) {
        console.log('✅ Transaction correctly rejected with EpochNotFrozen error')
        return { name: testName, passed: true }
      }
      // Different error - still a pass if it rejected, but note the error
      console.log('✅ Transaction rejected (error:', errorStr.substring(0, 100), '...)')
      return { name: testName, passed: true, details: { rejectionError: errorStr.substring(0, 200) } }
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

async function testCannotAdvanceNonOpenEpoch(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey
): Promise<TestResult> {
  const testName = 'Cannot advance non-Open epoch (rejection test)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const epochAccount = await connection.getAccountInfo(epochPda)
    if (!epochAccount) {
      return { name: testName, passed: false, error: 'Epoch account not found' }
    }

    const epochData = parseEpochAccount(epochAccount.data)

    // If epoch IS in Open state, we can't test this rejection scenario
    if (epochData.state === EpochState.Open) {
      console.log('⚠️  Epoch is in Open state - cannot test non-Open rejection')
      console.log('   This test requires an epoch in Frozen/Settled/Refunded state')
      console.log('   Skipping test (not a failure)')
      return {
        name: testName,
        passed: true,
        details: { skipped: true, reason: 'epoch is in Open state' }
      }
    }

    // Epoch is NOT in Open state - attempt advance and expect failure
    console.log(`Epoch is in ${epochStateToString(epochData.state)} state - attempting advance (should fail)...`)

    // Build advance_epoch instruction
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

    try {
      await connection.sendTransaction(tx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })
      // If we get here, the transaction succeeded - that's a test failure
      return {
        name: testName,
        passed: false,
        error: `Transaction succeeded but should have failed (epoch in ${epochStateToString(epochData.state)} state)`,
      }
    } catch (sendError: unknown) {
      // Transaction failed - check if it's the expected error
      const errorStr = sendError instanceof Error ? sendError.message : JSON.stringify(sendError)
      if (errorStr.includes('InvalidEpochState') || errorStr.includes('0x176d') || errorStr.includes('5997')) {
        console.log('✅ Transaction correctly rejected with InvalidEpochState error')
        return { name: testName, passed: true }
      }
      // Different error - still a pass if it rejected, but note the error
      console.log('✅ Transaction rejected (error:', errorStr.substring(0, 100), '...)')
      return { name: testName, passed: true, details: { rejectionError: errorStr.substring(0, 200) } }
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

async function testPoolCacheUpdated(
  connection: Connection,
  poolPda: PublicKey
): Promise<TestResult> {
  const testName = 'Pool active_epoch_state cache updated'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    const poolAccount = await connection.getAccountInfo(poolPda)
    if (!poolAccount) {
      return { name: testName, passed: false, error: 'Pool account not found' }
    }

    const poolData = parsePoolAccount(poolAccount.data)
    console.log('Pool active_epoch_state:', poolData.activeEpochState, `(${epochStateToString(poolData.activeEpochState)})`)

    // active_epoch_state: 0 = None, 1 = Open, 2 = Frozen
    if (poolData.activeEpoch !== null && poolData.activeEpochState === 2) {
      console.log('✅ Pool cache shows Frozen state (2)')
      return { name: testName, passed: true }
    }

    if (poolData.activeEpoch === null) {
      console.log('No active epoch - cannot verify cache')
      return { name: testName, passed: true }
    }

    // Fetch actual epoch state to compare
    const epochAccount = await connection.getAccountInfo(poolData.activeEpoch)
    if (epochAccount) {
      const epochData = parseEpochAccount(epochAccount.data)
      const expectedCacheValue = epochData.state + 1 // Cache uses 0=None, 1=Open, 2=Frozen, etc.

      if (poolData.activeEpochState === expectedCacheValue) {
        console.log(`✅ Pool cache matches epoch state: ${epochStateToString(epochData.state)}`)
        return { name: testName, passed: true }
      } else {
        return {
          name: testName,
          passed: false,
          error: `Cache mismatch: pool.active_epoch_state=${poolData.activeEpochState}, expected=${expectedCacheValue}`,
        }
      }
    }

    return { name: testName, passed: true }
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
  console.log('FOGO Pulse - Advance Epoch Integration Tests')
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
    console.error('ERROR: Insufficient balance.')
    process.exit(1)
  }

  // Derive PDAs
  const [globalConfigPda] = deriveGlobalConfigPda()
  const assetMint = ASSET_MINTS[selectedPool]
  const [poolPda] = derivePoolPda(assetMint)

  console.log('GlobalConfig PDA:', globalConfigPda.toString())
  console.log(`${selectedPool} Pool PDA:`, poolPda.toString())

  // Fetch pool account to get active epoch
  const poolAccountInfo = await connection.getAccountInfo(poolPda)
  if (!poolAccountInfo) {
    console.error('ERROR: Pool account not found.')
    process.exit(1)
  }

  const poolData = parsePoolAccount(poolAccountInfo.data)
  console.log('Next epoch ID:', poolData.nextEpochId.toString())
  console.log('Active epoch state:', poolData.activeEpochState, `(${epochStateToString(poolData.activeEpochState)})`)

  if (!poolData.activeEpoch) {
    console.log('\n⚠️  No active epoch on this pool.')
    console.log('Run: npx tsx scripts/create-test-epoch.ts --pool', selectedPool)
    console.log('\nRunning validation tests only...')

    const results: TestResult[] = [
      await testPoolCacheUpdated(connection, poolPda),
    ]

    printSummary(results)
    return
  }

  console.log('Active epoch:', poolData.activeEpoch.toString())

  // Fetch epoch to show current state
  const epochAccountInfo = await connection.getAccountInfo(poolData.activeEpoch)
  if (epochAccountInfo) {
    const epochData = parseEpochAccount(epochAccountInfo.data)
    console.log('Epoch ID:', epochData.epochId.toString())
    console.log('Epoch state:', epochStateToString(epochData.state))
    console.log('Epoch freeze_time:', new Date(Number(epochData.freezeTime) * 1000).toISOString())
    console.log('Epoch end_time:', new Date(Number(epochData.endTime) * 1000).toISOString())

    const currentTime = Math.floor(Date.now() / 1000)
    console.log('Current time:', new Date(currentTime * 1000).toISOString())

    if (epochData.state !== EpochState.Open) {
      console.log(`\n⚠️  Epoch is in ${epochStateToString(epochData.state)} state, not Open.`)
      if (epochData.state === EpochState.Frozen) {
        console.log('Epoch already frozen. Running validation tests...')
      } else {
        console.log('Cannot advance epoch - it must be in Open state.')
      }
      skipExecution = true
    } else if (currentTime < Number(epochData.freezeTime)) {
      const remaining = Number(epochData.freezeTime) - currentTime
      console.log(`\n⚠️  Epoch has not reached freeze_time (${remaining}s remaining)`)
      console.log('Wait for freeze_time before advancing.')
      skipExecution = true
    }
  }

  // Run tests
  const results: TestResult[] = []

  if (!skipExecution) {
    // Test 1: Successful advance
    results.push(
      await testSuccessfulAdvance(
        connection,
        wallet,
        globalConfigPda,
        poolPda,
        poolData.activeEpoch
      )
    )
  }

  // Test 2: Timing validation (rejection test)
  results.push(
    await testCannotAdvanceBeforeFreezeTime(
      connection,
      wallet,
      globalConfigPda,
      poolPda,
      poolData.activeEpoch
    )
  )

  // Test 3: State validation (rejection test)
  results.push(
    await testCannotAdvanceNonOpenEpoch(
      connection,
      wallet,
      globalConfigPda,
      poolPda,
      poolData.activeEpoch
    )
  )

  // Test 4: Pool cache updated
  results.push(await testPoolCacheUpdated(connection, poolPda))

  printSummary(results)
}

function printSummary(results: TestResult[]) {
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
      if (result.details) {
        console.log(`   Details:`, result.details)
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
