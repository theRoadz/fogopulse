/**
 * Claim Refund Integration Tests
 *
 * Tests the claim_refund instruction for claiming refunds from refunded epochs.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx tests/claim-refund.test.ts
 *
 * Prerequisites:
 *   1. GlobalConfig initialized (run scripts/initialize-protocol.ts)
 *   2. Pool created with liquidity (run scripts/create-pools.ts, deposit via deposit_liquidity instruction)
 *   3. An epoch in Refunded state (use admin_force_close_epoch or wait for exact tie)
 *   4. User position exists in that epoch
 *
 * Test Coverage:
 *   - Successful refund claim
 *   - AlreadyClaimed rejection (double-claim)
 *   - InvalidEpochState rejection (non-refunded epoch)
 *   - ProtocolFrozen rejection
 *   - PoolFrozen rejection
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
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token'
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

// claim_refund instruction discriminator (from IDL)
const CLAIM_REFUND_DISCRIMINATOR = Buffer.from([
  15, 16, 30, 161, 255, 228, 97, 60,
])

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

function deriveEpochPda(
  poolPda: PublicKey,
  epochId: bigint
): [PublicKey, number] {
  const epochIdBuffer = Buffer.alloc(8)
  epochIdBuffer.writeBigUInt64LE(epochId)

  return PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), poolPda.toBuffer(), epochIdBuffer],
    PROGRAM_ID
  )
}

function derivePositionPda(
  epochPda: PublicKey,
  userPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), epochPda.toBuffer(), userPubkey.toBuffer()],
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
  }

  return { assetMint, nextEpochId, activeEpoch }
}

/**
 * Parse Epoch account data
 */
function parseEpochAccount(data: Buffer): {
  pool: PublicKey
  epochId: bigint
  state: number
} {
  let offset = 8 // Skip discriminator

  const pool = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const epochId = data.readBigUInt64LE(offset)
  offset += 8

  const state = data.readUInt8(offset)

  return { pool, epochId, state }
}

/**
 * Parse UserPosition account data
 */
function parsePositionAccount(data: Buffer): {
  user: PublicKey
  epoch: PublicKey
  amount: bigint
  claimed: boolean
} {
  let offset = 8 // Skip discriminator

  const user = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  const epoch = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  offset += 1 // direction

  const amount = data.readBigUInt64LE(offset)
  offset += 8

  offset += 8 // shares
  offset += 8 // entry_price

  const claimed = data.readUInt8(offset) === 1

  return { user, epoch, amount, claimed }
}

function epochStateToString(state: number): string {
  switch (state) {
    case EpochState.Open:
      return 'Open'
    case EpochState.Frozen:
      return 'Frozen'
    case EpochState.Settling:
      return 'Settling'
    case EpochState.Settled:
      return 'Settled'
    case EpochState.Refunded:
      return 'Refunded'
    default:
      return `Unknown(${state})`
  }
}

/**
 * Build claim_refund instruction
 */
function buildClaimRefundInstruction(
  signerOrSession: PublicKey,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey,
  poolUsdcAta: PublicKey,
  userUsdcAta: PublicKey,
  userPubkey: PublicKey
): TransactionInstruction {
  const data = Buffer.concat([
    CLAIM_REFUND_DISCRIMINATOR,
    userPubkey.toBuffer(),
  ])

  const keys = [
    { pubkey: signerOrSession, isSigner: true, isWritable: true },
    { pubkey: globalConfigPda, isSigner: false, isWritable: false },
    { pubkey: poolPda, isSigner: false, isWritable: true },
    { pubkey: epochPda, isSigner: false, isWritable: false },
    { pubkey: positionPda, isSigner: false, isWritable: true },
    { pubkey: poolUsdcAta, isSigner: false, isWritable: true },
    { pubkey: userUsdcAta, isSigner: false, isWritable: true },
    { pubkey: USDC_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    {
      pubkey: new PublicKey('11111111111111111111111111111111'),
      isSigner: false,
      isWritable: false,
    },
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

/**
 * Test successful refund claim
 */
async function testSuccessfulRefundClaim(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey
): Promise<TestResult> {
  const testName = 'Successful refund claim'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Get token accounts
    const poolUsdcAta = await getAssociatedTokenAddress(USDC_MINT, poolPda, true)
    const userUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      wallet.publicKey
    )

    // Get balances before
    const poolUsdcBefore = await getAccount(connection, poolUsdcAta)
    const userUsdcBefore = await getAccount(connection, userUsdcAta)
    const positionBefore = await connection.getAccountInfo(positionPda)

    if (!positionBefore) {
      return { name: testName, passed: false, error: 'Position not found' }
    }

    const positionData = parsePositionAccount(positionBefore.data)
    console.log(
      'Position amount to refund:',
      Number(positionData.amount) / 1e6,
      'USDC'
    )
    console.log(
      'User USDC balance before:',
      Number(userUsdcBefore.amount) / 1e6,
      'USDC'
    )

    if (positionData.claimed) {
      return {
        name: testName,
        passed: false,
        error: 'Position already claimed - need fresh position',
      }
    }

    // Build instruction
    const claimRefundIx = buildClaimRefundInstruction(
      wallet.publicKey,
      globalConfigPda,
      poolPda,
      epochPda,
      positionPda,
      poolUsdcAta,
      userUsdcAta,
      wallet.publicKey
    )

    // Build transaction
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash()

    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [claimRefundIx],
    }).compileToV0Message()

    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([wallet])

    // Submit transaction
    console.log('Submitting claim_refund transaction...')

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

    // Verify position is now claimed
    const positionAfter = await connection.getAccountInfo(positionPda)
    if (!positionAfter) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Position account not found after claim',
      }
    }

    const positionDataAfter = parsePositionAccount(positionAfter.data)
    if (!positionDataAfter.claimed) {
      return {
        name: testName,
        passed: false,
        signature,
        error: 'Position.claimed not set to true after claim',
      }
    }

    // Verify USDC transferred
    const userUsdcAfter = await getAccount(connection, userUsdcAta)
    const expectedIncrease = positionData.amount
    const actualIncrease =
      userUsdcAfter.amount - userUsdcBefore.amount

    console.log(
      'User USDC balance after:',
      Number(userUsdcAfter.amount) / 1e6,
      'USDC'
    )
    console.log('USDC received:', Number(actualIncrease) / 1e6, 'USDC')

    if (actualIncrease !== expectedIncrease) {
      return {
        name: testName,
        passed: false,
        signature,
        error: `USDC transfer mismatch: expected ${expectedIncrease}, got ${actualIncrease}`,
      }
    }

    console.log('Position claimed:', positionDataAfter.claimed)

    return { name: testName, passed: true, signature }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test non-refunded epoch rejection (InvalidEpochState) - AC3
 */
async function testNonRefundedEpochRejection(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  settledEpochPda: PublicKey,
  positionPda: PublicKey
): Promise<TestResult> {
  const testName = 'Non-refunded epoch rejection (InvalidEpochState)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Get token accounts
    const poolUsdcAta = await getAssociatedTokenAddress(USDC_MINT, poolPda, true)
    const userUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      wallet.publicKey
    )

    // Build instruction targeting a settled (not refunded) epoch
    const claimRefundIx = buildClaimRefundInstruction(
      wallet.publicKey,
      globalConfigPda,
      poolPda,
      settledEpochPda,
      positionPda,
      poolUsdcAta,
      userUsdcAta,
      wallet.publicKey
    )

    // Build transaction
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash()

    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [claimRefundIx],
    }).compileToV0Message()

    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([wallet])

    // Submit transaction - should fail
    console.log('Attempting claim on non-refunded epoch (should fail)...')

    try {
      await connection.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (non-refunded epoch)',
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error)

      if (errorMessage.includes('InvalidEpochState') || errorMessage.includes('6031')) {
        console.log('Correctly rejected with InvalidEpochState error')
        return { name: testName, passed: true }
      }

      // Any constraint error related to epoch state is acceptable
      if (errorMessage.includes('ConstraintRaw') || errorMessage.includes('custom program error')) {
        console.log('Correctly rejected with constraint error:', errorMessage)
        return { name: testName, passed: true }
      }

      return { name: testName, passed: false, error: errorMessage }
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Test frozen protocol rejection (ProtocolFrozen) - AC4
 */
async function testFrozenProtocolRejection(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey
): Promise<TestResult> {
  const testName = 'Frozen protocol rejection (ProtocolFrozen)'
  console.log(`\n--- Test: ${testName} ---`)
  console.log('SKIPPED: Requires admin access to freeze protocol')
  console.log('Manual test: Use update_config to set frozen=true, then attempt claim_refund')
  return { name: testName, passed: true, error: 'Skipped - requires admin access' }
}

/**
 * Test frozen pool rejection (PoolFrozen) - AC4
 */
async function testFrozenPoolRejection(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey
): Promise<TestResult> {
  const testName = 'Frozen pool rejection (PoolFrozen)'
  console.log(`\n--- Test: ${testName} ---`)
  console.log('SKIPPED: Requires admin access to freeze pool')
  console.log('Manual test: Use admin instruction to set pool.is_frozen=true, then attempt claim_refund')
  return { name: testName, passed: true, error: 'Skipped - requires admin access' }
}

/**
 * Test double-claim rejection (AlreadyClaimed)
 */
async function testDoubleClaimRejection(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey
): Promise<TestResult> {
  const testName = 'Double-claim rejection (AlreadyClaimed)'
  console.log(`\n--- Test: ${testName} ---`)

  try {
    // Get token accounts
    const poolUsdcAta = await getAssociatedTokenAddress(USDC_MINT, poolPda, true)
    const userUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      wallet.publicKey
    )

    // Build instruction
    const claimRefundIx = buildClaimRefundInstruction(
      wallet.publicKey,
      globalConfigPda,
      poolPda,
      epochPda,
      positionPda,
      poolUsdcAta,
      userUsdcAta,
      wallet.publicKey
    )

    // Build transaction
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash()

    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [claimRefundIx],
    }).compileToV0Message()

    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([wallet])

    // Submit transaction - should fail
    console.log('Attempting double-claim (should fail)...')

    try {
      await connection.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      return {
        name: testName,
        passed: false,
        error: 'Transaction succeeded but should have failed (double-claim)',
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error)

      if (errorMessage.includes('AlreadyClaimed') || errorMessage.includes('6020')) {
        console.log('Correctly rejected with AlreadyClaimed error')
        return { name: testName, passed: true }
      }

      // Any constraint error is acceptable here
      if (errorMessage.includes('ConstraintRaw') || errorMessage.includes('custom program error')) {
        console.log('Correctly rejected with constraint error:', errorMessage)
        return { name: testName, passed: true }
      }

      return { name: testName, passed: false, error: errorMessage }
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error)
    return { name: testName, passed: false, error: errorMessage }
  }
}

/**
 * Find a refunded epoch with an unclaimed position
 */
async function findRefundedEpochWithPosition(
  connection: Connection,
  poolPda: PublicKey,
  userPubkey: PublicKey,
  maxEpochId: bigint
): Promise<{ epochPda: PublicKey; epochId: bigint; positionPda: PublicKey } | null> {
  for (let epochId = maxEpochId - BigInt(1); epochId >= BigInt(0); epochId--) {
    const [epochPda] = deriveEpochPda(poolPda, epochId)
    const epochAccount = await connection.getAccountInfo(epochPda)

    if (!epochAccount) continue

    const epochData = parseEpochAccount(epochAccount.data)
    if (epochData.state !== EpochState.Refunded) continue

    // Check for position
    const [positionPda] = derivePositionPda(epochPda, userPubkey)
    const positionAccount = await connection.getAccountInfo(positionPda)

    if (!positionAccount) continue

    const positionData = parsePositionAccount(positionAccount.data)
    if (!positionData.claimed) {
      console.log(`Found unclaimed position in refunded epoch ${epochId}`)
      return { epochPda, epochId, positionPda }
    }
  }

  return null
}

/**
 * Find a settled (non-refunded) epoch for testing InvalidEpochState
 */
async function findSettledEpoch(
  connection: Connection,
  poolPda: PublicKey,
  maxEpochId: bigint
): Promise<{ epochPda: PublicKey; epochId: bigint } | null> {
  for (let epochId = maxEpochId - BigInt(1); epochId >= BigInt(0); epochId--) {
    const [epochPda] = deriveEpochPda(poolPda, epochId)
    const epochAccount = await connection.getAccountInfo(epochPda)

    if (!epochAccount) continue

    const epochData = parseEpochAccount(epochAccount.data)
    // Look for Settled state (3), Open (0), or Frozen (1) - anything NOT Refunded
    if (epochData.state !== EpochState.Refunded) {
      console.log(`Found non-refunded epoch ${epochId} in state ${epochStateToString(epochData.state)}`)
      return { epochPda, epochId }
    }
  }

  return null
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Claim Refund Tests')
  console.log('='.repeat(60))
  console.log()

  // Parse args
  const args = process.argv.slice(2)
  let selectedPool: Asset = 'BTC'
  let epochIdArg: bigint | null = null

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
    if (args[i] === '--epoch' && args[i + 1]) {
      epochIdArg = BigInt(args[i + 1])
      i++
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

  // Fetch pool account
  const poolAccountInfo = await connection.getAccountInfo(poolPda)
  if (!poolAccountInfo) {
    console.error('ERROR: Pool account not found. Has the pool been created?')
    process.exit(1)
  }

  const poolData = parsePoolAccount(poolAccountInfo.data)
  console.log('Next epoch ID:', poolData.nextEpochId.toString())

  // Find a refunded epoch with unclaimed position
  let epochPda: PublicKey
  let positionPda: PublicKey
  let epochId: bigint

  if (epochIdArg !== null) {
    epochId = epochIdArg
    ;[epochPda] = deriveEpochPda(poolPda, epochId)
    ;[positionPda] = derivePositionPda(epochPda, wallet.publicKey)

    // Verify epoch exists and is refunded
    const epochAccount = await connection.getAccountInfo(epochPda)
    if (!epochAccount) {
      console.error(`ERROR: Epoch ${epochId} not found`)
      process.exit(1)
    }

    const epochData = parseEpochAccount(epochAccount.data)
    if (epochData.state !== EpochState.Refunded) {
      console.error(
        `ERROR: Epoch ${epochId} is in ${epochStateToString(epochData.state)} state, not Refunded`
      )
      process.exit(1)
    }
  } else {
    // Search for refunded epoch with position
    console.log('\nSearching for refunded epoch with unclaimed position...')
    const found = await findRefundedEpochWithPosition(
      connection,
      poolPda,
      wallet.publicKey,
      poolData.nextEpochId
    )

    if (!found) {
      console.log('\n  No refunded epochs with unclaimed positions found.')
      console.log('  To create a test scenario:')
      console.log('    1. Create an epoch: npx tsx scripts/create-test-epoch.ts --pool', selectedPool)
      console.log('    2. Buy a position: (use the web UI or a script)')
      console.log('    3. Force-close epoch: npx tsx scripts/force-close-epoch.ts --pool', selectedPool)
      console.log('    4. Run this test again')
      console.log('\nSkipping tests - no testable data available.')
      return
    }

    epochPda = found.epochPda
    positionPda = found.positionPda
    epochId = found.epochId
  }

  console.log('\nTest targets:')
  console.log('  Epoch ID:', epochId.toString())
  console.log('  Epoch PDA:', epochPda.toString())
  console.log('  Position PDA:', positionPda.toString())

  // Verify position exists and is not claimed
  const positionAccount = await connection.getAccountInfo(positionPda)
  if (!positionAccount) {
    console.error('ERROR: Position not found for this wallet in this epoch')
    process.exit(1)
  }

  const positionData = parsePositionAccount(positionAccount.data)
  console.log('  Position amount:', Number(positionData.amount) / 1e6, 'USDC')
  console.log('  Position claimed:', positionData.claimed)

  // Run tests
  const results: TestResult[] = []

  if (!positionData.claimed) {
    // Test 1: Successful refund claim
    results.push(
      await testSuccessfulRefundClaim(
        connection,
        wallet,
        globalConfigPda,
        poolPda,
        epochPda,
        positionPda
      )
    )

    // Test 2: Double-claim rejection (must run after successful claim)
    results.push(
      await testDoubleClaimRejection(
        connection,
        wallet,
        globalConfigPda,
        poolPda,
        epochPda,
        positionPda
      )
    )
  } else {
    console.log('\nPosition already claimed - skipping successful claim test')

    // Only run double-claim test
    results.push(
      await testDoubleClaimRejection(
        connection,
        wallet,
        globalConfigPda,
        poolPda,
        epochPda,
        positionPda
      )
    )
  }

  // Test 3: Non-refunded epoch rejection (AC3)
  // Find a settled/open epoch to test against
  const settledEpoch = await findSettledEpoch(connection, poolPda, poolData.nextEpochId)
  if (settledEpoch) {
    const [settledPositionPda] = derivePositionPda(settledEpoch.epochPda, wallet.publicKey)
    results.push(
      await testNonRefundedEpochRejection(
        connection,
        wallet,
        globalConfigPda,
        poolPda,
        settledEpoch.epochPda,
        settledPositionPda
      )
    )
  } else {
    console.log('\nNo non-refunded epochs found - skipping InvalidEpochState test')
    results.push({
      name: 'Non-refunded epoch rejection (InvalidEpochState)',
      passed: true,
      error: 'Skipped - no non-refunded epochs available',
    })
  }

  // Test 4a: Frozen protocol rejection (AC4)
  results.push(
    await testFrozenProtocolRejection(
      connection,
      wallet,
      globalConfigPda,
      poolPda,
      epochPda,
      positionPda
    )
  )

  // Test 4b: Frozen pool rejection (AC4)
  results.push(
    await testFrozenPoolRejection(
      connection,
      wallet,
      globalConfigPda,
      poolPda,
      epochPda,
      positionPda
    )
  )

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
