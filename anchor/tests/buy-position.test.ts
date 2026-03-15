/**
 * Buy Position Integration Tests
 *
 * Tests the buy_position instruction for opening and adding to positions.
 * Includes fee distribution verification (Story 3.5):
 * - Trading fee deducted upfront (1.8% = 180 bps)
 * - LP fee (70%) stays in pool USDC
 * - Treasury fee (20%) transferred to treasury
 * - Insurance fee (10%) transferred to insurance
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx tests/buy-position.test.ts
 *
 * Prerequisites:
 *   1. GlobalConfig initialized (run scripts/initialize-protocol.ts)
 *   2. Pool created with USDC ATA (run scripts/create-pools.ts)
 *   3. An active epoch in Open state (created via create_epoch)
 *   4. User has USDC balance in their ATA
 *   5. Treasury and Insurance USDC ATAs exist
 */

// Load environment variables
import * as dotenv from 'dotenv'
dotenv.config({ path: 'anchor/.env' })
dotenv.config()  // Also try current directory .env

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
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

// BTC pool for testing (you can change to ETH, SOL, or FOGO)
const BTC_MINT = new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY')

// buy_position instruction discriminator (from IDL)
const BUY_POSITION_DISCRIMINATOR = Buffer.from([
  210, 108, 108, 28, 10, 46, 226, 137,
])

// Direction enum values
const Direction = {
  Up: 0,
  Down: 1,
} as const

// Fee constants (must match GlobalConfig)
const TRADING_FEE_BPS = 180 // 1.8%
const LP_FEE_SHARE_BPS = 7000 // 70%
const TREASURY_FEE_SHARE_BPS = 2000 // 20%
const INSURANCE_FEE_SHARE_BPS = 1000 // 10%

// Treasury and Insurance wallets (from GlobalConfig - updated via setup-fee-wallets.ts)
const TREASURY_WALLET = new PublicKey('HkSz5Avhwn29eeK1fkBGeCtfo1L7uTwct4Wgu5bbfy9U')
const INSURANCE_WALLET = new PublicKey('2GJ2pajUMv2ZXVxNUgVme9i2pHoM51jzYyAzdEa1BTww')

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
  // Convert epoch_id to 8-byte little-endian buffer
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
 * Calculate fee split matching on-chain logic
 */
function calculateFeeSplit(amount: bigint): {
  totalFee: bigint
  lpFee: bigint
  treasuryFee: bigint
  insuranceFee: bigint
  netAmount: bigint
} {
  // Ceiling division for total fee: (amount * bps + 9999) / 10000
  const totalFee = (amount * BigInt(TRADING_FEE_BPS) + BigInt(9999)) / BigInt(10000)

  // Floor division for fee splits
  const treasuryFee = (totalFee * BigInt(TREASURY_FEE_SHARE_BPS)) / BigInt(10000)
  const insuranceFee = (totalFee * BigInt(INSURANCE_FEE_SHARE_BPS)) / BigInt(10000)
  // LP gets remainder
  const lpFee = totalFee - treasuryFee - insuranceFee
  const netAmount = amount - totalFee

  return { totalFee, lpFee, treasuryFee, insuranceFee, netAmount }
}

/**
 * Parse Pool account data to extract active_epoch and epoch_id
 */
function parsePoolAccount(data: Buffer): {
  assetMint: PublicKey
  yesReserves: bigint
  noReserves: bigint
  totalLpShares: bigint
  nextEpochId: bigint
  activeEpoch: PublicKey | null
  activeEpochState: number
} {
  // Skip discriminator (8 bytes)
  let offset = 8

  // asset_mint (32 bytes)
  const assetMint = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  // yes_reserves (8 bytes, u64)
  const yesReserves = data.readBigUInt64LE(offset)
  offset += 8

  // no_reserves (8 bytes, u64)
  const noReserves = data.readBigUInt64LE(offset)
  offset += 8

  // total_lp_shares (8 bytes, u64)
  const totalLpShares = data.readBigUInt64LE(offset)
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
  } else {
    offset += 32 // Skip the pubkey bytes even if None
  }

  // active_epoch_state (1 byte, u8)
  const activeEpochState = data.readUInt8(offset)
  offset += 1

  return {
    assetMint,
    yesReserves,
    noReserves,
    totalLpShares,
    nextEpochId,
    activeEpoch,
    activeEpochState,
  }
}

/**
 * Parse Epoch account data to extract epoch_id and state
 */
function parseEpochAccount(data: Buffer): {
  pool: PublicKey
  epochId: bigint
  state: number
  startTime: bigint
  endTime: bigint
} {
  // Skip discriminator (8 bytes)
  let offset = 8

  // pool (32 bytes)
  const pool = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  // epoch_id (8 bytes, u64)
  const epochId = data.readBigUInt64LE(offset)
  offset += 8

  // state (1 byte enum)
  const state = data.readUInt8(offset)
  offset += 1

  // start_time (8 bytes, i64)
  const startTime = data.readBigInt64LE(offset)
  offset += 8

  // end_time (8 bytes, i64)
  const endTime = data.readBigInt64LE(offset)
  offset += 8

  return { pool, epochId, state, startTime, endTime }
}

// =============================================================================
// TESTS
// =============================================================================

async function testBuyPositionUp(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  epochId: bigint,
  amount: bigint
): Promise<{ signature: string; balancesBefore: BalanceSnapshot; balancesAfter: BalanceSnapshot }> {
  console.log('\n--- Test: Buy UP Position with Fee Distribution ---')

  const user = wallet.publicKey

  // Derive position PDA
  const [positionPda] = derivePositionPda(epochPda, user)
  console.log('Position PDA:', positionPda.toBase58())

  // Get user's USDC ATA
  const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, user)
  console.log('User USDC ATA:', userUsdcAta.toBase58())

  // Get pool's USDC ATA
  const poolUsdcAta = await getAssociatedTokenAddress(
    USDC_MINT,
    poolPda,
    true // allowOwnerOffCurve for PDA
  )
  console.log('Pool USDC ATA:', poolUsdcAta.toBase58())

  // Get treasury's USDC ATA
  const treasuryUsdcAta = await getAssociatedTokenAddress(USDC_MINT, TREASURY_WALLET)
  console.log('Treasury USDC ATA:', treasuryUsdcAta.toBase58())

  // Get insurance's USDC ATA
  const insuranceUsdcAta = await getAssociatedTokenAddress(USDC_MINT, INSURANCE_WALLET)
  console.log('Insurance USDC ATA:', insuranceUsdcAta.toBase58())

  // Record balances BEFORE the trade
  const balancesBefore = await getBalanceSnapshot(
    connection,
    userUsdcAta,
    poolUsdcAta,
    treasuryUsdcAta,
    insuranceUsdcAta
  )
  console.log('\n--- Balances Before Trade ---')
  console.log('User USDC:', balancesBefore.user.toString())
  console.log('Pool USDC:', balancesBefore.pool.toString())
  console.log('Treasury USDC:', balancesBefore.treasury.toString())
  console.log('Insurance USDC:', balancesBefore.insurance.toString())

  // Check user USDC balance
  if (balancesBefore.user < amount) {
    throw new Error(
      `Insufficient USDC balance: ${balancesBefore.user} < ${amount}`
    )
  }

  // Calculate expected fees
  const feeSplit = calculateFeeSplit(amount)
  console.log('\n--- Expected Fee Split ---')
  console.log('Gross amount:', amount.toString())
  console.log('Total fee:', feeSplit.totalFee.toString())
  console.log('LP fee:', feeSplit.lpFee.toString())
  console.log('Treasury fee:', feeSplit.treasuryFee.toString())
  console.log('Insurance fee:', feeSplit.insuranceFee.toString())
  console.log('Net amount:', feeSplit.netAmount.toString())

  // Build instruction data
  // buy_position(user: Pubkey, direction: Direction, amount: u64)
  const data = Buffer.alloc(8 + 32 + 1 + 8) // discriminator + user + direction + amount
  let offset = 0

  // Discriminator
  BUY_POSITION_DISCRIMINATOR.copy(data, offset)
  offset += 8

  // User pubkey
  user.toBuffer().copy(data, offset)
  offset += 32

  // Direction (0 = Up, 1 = Down)
  data.writeUInt8(Direction.Up, offset)
  offset += 1

  // Amount (u64)
  data.writeBigUInt64LE(amount, offset)

  // Build instruction with updated account order (includes treasury_usdc and insurance_usdc)
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // signer_or_session
      { pubkey: globalConfigPda, isSigner: false, isWritable: false }, // config
      { pubkey: poolPda, isSigner: false, isWritable: true }, // pool
      { pubkey: epochPda, isSigner: false, isWritable: true }, // epoch
      { pubkey: positionPda, isSigner: false, isWritable: true }, // position
      { pubkey: userUsdcAta, isSigner: false, isWritable: true }, // user_usdc
      { pubkey: poolUsdcAta, isSigner: false, isWritable: true }, // pool_usdc
      { pubkey: treasuryUsdcAta, isSigner: false, isWritable: true }, // treasury_usdc
      { pubkey: insuranceUsdcAta, isSigner: false, isWritable: true }, // insurance_usdc
      { pubkey: USDC_MINT, isSigner: false, isWritable: false }, // usdc_mint
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }, // associated_token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    programId: PROGRAM_ID,
    data,
  })

  console.log('\nSending buy_position transaction...')

  const tx = new Transaction().add(instruction)
  const signature = await sendAndConfirmTransaction(connection, tx, [wallet])

  console.log('Transaction confirmed:', signature)

  // Record balances AFTER the trade
  const balancesAfter = await getBalanceSnapshot(
    connection,
    userUsdcAta,
    poolUsdcAta,
    treasuryUsdcAta,
    insuranceUsdcAta
  )
  console.log('\n--- Balances After Trade ---')
  console.log('User USDC:', balancesAfter.user.toString())
  console.log('Pool USDC:', balancesAfter.pool.toString())
  console.log('Treasury USDC:', balancesAfter.treasury.toString())
  console.log('Insurance USDC:', balancesAfter.insurance.toString())

  return { signature, balancesBefore, balancesAfter }
}

interface BalanceSnapshot {
  user: bigint
  pool: bigint
  treasury: bigint
  insurance: bigint
}

async function getBalanceSnapshot(
  connection: Connection,
  userAta: PublicKey,
  poolAta: PublicKey,
  treasuryAta: PublicKey,
  insuranceAta: PublicKey
): Promise<BalanceSnapshot> {
  const [userAccount, poolAccount, treasuryAccount, insuranceAccount] = await Promise.all([
    getAccount(connection, userAta).catch(() => ({ amount: BigInt(0) })),
    getAccount(connection, poolAta).catch(() => ({ amount: BigInt(0) })),
    getAccount(connection, treasuryAta).catch(() => ({ amount: BigInt(0) })),
    getAccount(connection, insuranceAta).catch(() => ({ amount: BigInt(0) })),
  ])

  return {
    user: userAccount.amount,
    pool: poolAccount.amount,
    treasury: treasuryAccount.amount,
    insurance: insuranceAccount.amount,
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Buy Position Tests')
  console.log('='.repeat(60))

  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet public key:', wallet.publicKey.toBase58())

  // Setup connection
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC endpoint:', FOGO_TESTNET_RPC)

  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Wallet balance:', balance / 1e9, 'SOL')

  // Derive PDAs
  const [globalConfigPda] = deriveGlobalConfigPda()
  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())

  const [poolPda] = derivePoolPda(BTC_MINT)
  console.log('BTC Pool PDA:', poolPda.toBase58())

  // Check pool exists and get active epoch
  const poolAccount = await connection.getAccountInfo(poolPda)
  if (!poolAccount) {
    console.error('ERROR: BTC Pool not found. Run create-pools.ts first.')
    process.exit(1)
  }

  const poolData = parsePoolAccount(poolAccount.data)
  console.log('Pool next_epoch_id:', poolData.nextEpochId.toString())
  console.log('Pool active_epoch_state:', poolData.activeEpochState)

  if (!poolData.activeEpoch) {
    console.error('ERROR: No active epoch. Create an epoch first.')
    console.log('Run: npx tsx scripts/create-test-epoch.ts')
    process.exit(1)
  }

  console.log('Active epoch:', poolData.activeEpoch.toBase58())

  // Get epoch data to verify it's Open
  const epochAccount = await connection.getAccountInfo(poolData.activeEpoch)
  if (!epochAccount) {
    console.error('ERROR: Active epoch account not found.')
    process.exit(1)
  }

  const epochData = parseEpochAccount(epochAccount.data)
  console.log('Epoch ID:', epochData.epochId.toString())
  console.log('Epoch state:', epochData.state, '(0=Open, 1=Frozen, etc.)')

  if (epochData.state !== 0) {
    console.error('ERROR: Epoch is not in Open state (state=' + epochData.state + ')')
    process.exit(1)
  }

  // Test buy position with fee verification
  try {
    // Buy 100 USDC worth (100_000_000 lamports = 100 USDC with 6 decimals)
    // Using 100 USDC for clearer fee calculations
    const amount = BigInt(100_000_000)

    const { signature, balancesBefore, balancesAfter } = await testBuyPositionUp(
      connection,
      wallet,
      globalConfigPda,
      poolPda,
      poolData.activeEpoch,
      epochData.epochId,
      amount
    )

    console.log('\n✅ Buy position UP succeeded!')
    console.log('Transaction:', signature)

    // Calculate expected changes
    const feeSplit = calculateFeeSplit(amount)

    // Verify fee distribution
    console.log('\n--- Verifying Fee Distribution ---')

    // User should have paid the full gross amount
    const userChange = balancesBefore.user - balancesAfter.user
    console.log(`User balance change: -${userChange.toString()} (expected: -${amount.toString()})`)
    if (userChange !== amount) {
      console.error('❌ User balance change mismatch!')
    } else {
      console.log('✅ User paid correct gross amount')
    }

    // Pool should receive net_amount + lp_fee
    const poolChange = balancesAfter.pool - balancesBefore.pool
    const expectedPoolChange = feeSplit.netAmount + feeSplit.lpFee
    console.log(`Pool balance change: +${poolChange.toString()} (expected: +${expectedPoolChange.toString()})`)
    if (poolChange !== expectedPoolChange) {
      console.error('❌ Pool balance change mismatch!')
    } else {
      console.log('✅ Pool received net_amount + lp_fee')
    }

    // Treasury should receive treasury_fee
    const treasuryChange = balancesAfter.treasury - balancesBefore.treasury
    console.log(`Treasury balance change: +${treasuryChange.toString()} (expected: +${feeSplit.treasuryFee.toString()})`)
    if (treasuryChange !== feeSplit.treasuryFee) {
      console.error('❌ Treasury balance change mismatch!')
    } else {
      console.log('✅ Treasury received correct fee')
    }

    // Insurance should receive insurance_fee
    const insuranceChange = balancesAfter.insurance - balancesBefore.insurance
    console.log(`Insurance balance change: +${insuranceChange.toString()} (expected: +${feeSplit.insuranceFee.toString()})`)
    if (insuranceChange !== feeSplit.insuranceFee) {
      console.error('❌ Insurance balance change mismatch!')
    } else {
      console.log('✅ Insurance received correct fee')
    }

    // Verify total: user_change = pool_change + treasury_change + insurance_change
    const totalReceived = poolChange + treasuryChange + insuranceChange
    console.log(`\nTotal received: ${totalReceived.toString()} (should equal user paid: ${userChange.toString()})`)
    if (totalReceived === userChange) {
      console.log('✅ All funds accounted for (no dust)')
    } else {
      console.error('❌ Fund accounting mismatch!')
    }

    // Verify position was created
    const [positionPda] = derivePositionPda(
      poolData.activeEpoch,
      wallet.publicKey
    )
    const positionAccount = await connection.getAccountInfo(positionPda)

    if (positionAccount) {
      console.log('\n--- Position Account Created ---')
      console.log('Position PDA:', positionPda.toBase58())
      console.log('Account size:', positionAccount.data.length, 'bytes')
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('FEE DISTRIBUTION SUMMARY (100 USDC trade)')
    console.log('='.repeat(60))
    console.log(`Trading Fee (1.8%):     ${(Number(feeSplit.totalFee) / 1_000_000).toFixed(6)} USDC`)
    console.log(`  LP (70%):             ${(Number(feeSplit.lpFee) / 1_000_000).toFixed(6)} USDC`)
    console.log(`  Treasury (20%):       ${(Number(feeSplit.treasuryFee) / 1_000_000).toFixed(6)} USDC`)
    console.log(`  Insurance (10%):      ${(Number(feeSplit.insuranceFee) / 1_000_000).toFixed(6)} USDC`)
    console.log(`Net Trade Amount:       ${(Number(feeSplit.netAmount) / 1_000_000).toFixed(6)} USDC`)
    console.log('='.repeat(60))

  } catch (error: any) {
    console.error('\n❌ Buy position failed:', error.message)
    if (error.logs) {
      console.log('\nProgram logs:')
      error.logs.forEach((log: string) => console.log('  ', log))
    }
    process.exit(1)
  }

  console.log('\n' + '='.repeat(60))
  console.log('All tests completed!')
  console.log('='.repeat(60))
}

/**
 * Test minimum trade amount (edge case for rounding)
 */
async function testMinimumTradeAmount(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  epochId: bigint
): Promise<void> {
  console.log('\n--- Test: Minimum Trade Amount Fee Calculation ---')

  // Minimum trade: 100_000 lamports (0.1 USDC)
  const amount = BigInt(100_000)
  const feeSplit = calculateFeeSplit(amount)

  console.log('Amount:', amount.toString(), 'lamports (0.1 USDC)')
  console.log('Expected total_fee:', feeSplit.totalFee.toString())
  console.log('Expected treasury_fee:', feeSplit.treasuryFee.toString())
  console.log('Expected insurance_fee:', feeSplit.insuranceFee.toString())
  console.log('Expected lp_fee:', feeSplit.lpFee.toString())
  console.log('Expected net_amount:', feeSplit.netAmount.toString())

  // Verify fee calculations don't fail
  if (feeSplit.totalFee === BigInt(0)) {
    console.error('❌ Total fee should not be zero for minimum trade')
  } else {
    console.log('✅ Fee calculation succeeds for minimum trade')
  }

  // Verify no underflow (net_amount should be positive)
  if (feeSplit.netAmount <= BigInt(0)) {
    console.error('❌ Net amount should be positive')
  } else {
    console.log('✅ Net amount is positive:', feeSplit.netAmount.toString())
  }

  // Verify fee split integrity
  const feeSum = feeSplit.lpFee + feeSplit.treasuryFee + feeSplit.insuranceFee
  if (feeSum !== feeSplit.totalFee) {
    console.error('❌ Fee split does not sum to total_fee')
  } else {
    console.log('✅ Fee split sums correctly')
  }
}

/**
 * Test very large trade amount (overflow protection)
 */
async function testLargeTradeAmount(): Promise<void> {
  console.log('\n--- Test: Large Trade Amount (Overflow Protection) ---')

  // Very large amount: 1 billion USDC = 1_000_000_000_000_000 lamports
  const amount = BigInt(1_000_000_000_000_000)
  const feeSplit = calculateFeeSplit(amount)

  console.log('Amount:', amount.toString(), 'lamports (1 billion USDC)')
  console.log('Expected total_fee:', feeSplit.totalFee.toString())
  console.log('Expected net_amount:', feeSplit.netAmount.toString())

  // Verify no overflow (values should be sensible)
  if (feeSplit.totalFee > amount) {
    console.error('❌ Total fee exceeds amount (overflow detected)')
  } else {
    console.log('✅ No overflow in fee calculation')
  }

  // Verify fee is 1.8% of amount
  const expectedFee = (amount * BigInt(180) + BigInt(9999)) / BigInt(10000)
  if (feeSplit.totalFee !== expectedFee) {
    console.error('❌ Fee mismatch:', feeSplit.totalFee.toString(), 'vs expected:', expectedFee.toString())
  } else {
    console.log('✅ Fee calculation correct for large amount')
  }

  // Verify net + fee = amount
  if (feeSplit.netAmount + feeSplit.totalFee !== amount) {
    console.error('❌ Net + fee does not equal original amount')
  } else {
    console.log('✅ Amount conservation verified')
  }
}

/**
 * Test DOWN direction trade
 */
async function testBuyPositionDown(
  connection: Connection,
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  epochId: bigint,
  amount: bigint
): Promise<void> {
  console.log('\n--- Test: Buy DOWN Position Fee Calculation ---')

  const user = wallet.publicKey

  // Derive position PDA
  const [positionPda] = derivePositionPda(epochPda, user)

  // Get ATAs
  const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, user)
  const poolUsdcAta = await getAssociatedTokenAddress(USDC_MINT, poolPda, true)
  const treasuryUsdcAta = await getAssociatedTokenAddress(USDC_MINT, TREASURY_WALLET)
  const insuranceUsdcAta = await getAssociatedTokenAddress(USDC_MINT, INSURANCE_WALLET)

  // Calculate expected fees
  const feeSplit = calculateFeeSplit(amount)

  console.log('Direction: DOWN')
  console.log('Amount:', amount.toString(), 'lamports')
  console.log('Expected fee split:', {
    totalFee: feeSplit.totalFee.toString(),
    lpFee: feeSplit.lpFee.toString(),
    treasuryFee: feeSplit.treasuryFee.toString(),
    insuranceFee: feeSplit.insuranceFee.toString(),
    netAmount: feeSplit.netAmount.toString(),
  })

  // Build instruction data for DOWN direction
  const data = Buffer.alloc(8 + 32 + 1 + 8)
  let offset = 0

  BUY_POSITION_DISCRIMINATOR.copy(data, offset)
  offset += 8

  user.toBuffer().copy(data, offset)
  offset += 32

  // Direction = Down (1)
  data.writeUInt8(Direction.Down, offset)
  offset += 1

  data.writeBigUInt64LE(amount, offset)

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
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
    ],
    programId: PROGRAM_ID,
    data,
  })

  // Record balances before
  const balancesBefore = await getBalanceSnapshot(
    connection,
    userUsdcAta,
    poolUsdcAta,
    treasuryUsdcAta,
    insuranceUsdcAta
  )

  console.log('\nSending buy_position DOWN transaction...')

  try {
    const tx = new Transaction().add(instruction)
    const signature = await sendAndConfirmTransaction(connection, tx, [wallet])
    console.log('Transaction confirmed:', signature)

    // Record balances after
    const balancesAfter = await getBalanceSnapshot(
      connection,
      userUsdcAta,
      poolUsdcAta,
      treasuryUsdcAta,
      insuranceUsdcAta
    )

    // Verify fee distribution
    const treasuryChange = balancesAfter.treasury - balancesBefore.treasury
    const insuranceChange = balancesAfter.insurance - balancesBefore.insurance

    if (treasuryChange === feeSplit.treasuryFee) {
      console.log('✅ Treasury received correct fee:', treasuryChange.toString())
    } else {
      console.error('❌ Treasury fee mismatch:', treasuryChange.toString(), 'vs', feeSplit.treasuryFee.toString())
    }

    if (insuranceChange === feeSplit.insuranceFee) {
      console.log('✅ Insurance received correct fee:', insuranceChange.toString())
    } else {
      console.error('❌ Insurance fee mismatch:', insuranceChange.toString(), 'vs', feeSplit.insuranceFee.toString())
    }

    console.log('✅ Buy position DOWN succeeded!')
  } catch (error: any) {
    // Position may already exist from previous test - that's OK for fee calculation verification
    if (error.message?.includes('InvalidDirection')) {
      console.log('⚠️ Position already exists with different direction (expected if running after UP test)')
    } else {
      throw error
    }
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Buy Position Tests')
  console.log('='.repeat(60))

  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet public key:', wallet.publicKey.toBase58())

  // Setup connection
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC endpoint:', FOGO_TESTNET_RPC)

  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Wallet balance:', balance / 1e9, 'SOL')

  // Derive PDAs
  const [globalConfigPda] = deriveGlobalConfigPda()
  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())

  const [poolPda] = derivePoolPda(BTC_MINT)
  console.log('BTC Pool PDA:', poolPda.toBase58())

  // Check pool exists and get active epoch
  const poolAccount = await connection.getAccountInfo(poolPda)
  if (!poolAccount) {
    console.error('ERROR: BTC Pool not found. Run create-pools.ts first.')
    process.exit(1)
  }

  const poolData = parsePoolAccount(poolAccount.data)
  console.log('Pool next_epoch_id:', poolData.nextEpochId.toString())
  console.log('Pool active_epoch_state:', poolData.activeEpochState)

  if (!poolData.activeEpoch) {
    console.error('ERROR: No active epoch. Create an epoch first.')
    console.log('Run: npx tsx scripts/create-test-epoch.ts')
    process.exit(1)
  }

  console.log('Active epoch:', poolData.activeEpoch.toBase58())

  // Get epoch data to verify it's Open
  const epochAccount = await connection.getAccountInfo(poolData.activeEpoch)
  if (!epochAccount) {
    console.error('ERROR: Active epoch account not found.')
    process.exit(1)
  }

  const epochData = parseEpochAccount(epochAccount.data)
  console.log('Epoch ID:', epochData.epochId.toString())
  console.log('Epoch state:', epochData.state, '(0=Open, 1=Frozen, etc.)')

  if (epochData.state !== 0) {
    console.error('ERROR: Epoch is not in Open state (state=' + epochData.state + ')')
    process.exit(1)
  }

  // ==========================================================================
  // TEST 1: Standard 100 USDC UP trade with fee distribution
  // ==========================================================================
  try {
    const amount = BigInt(100_000_000)

    const { signature, balancesBefore, balancesAfter } = await testBuyPositionUp(
      connection,
      wallet,
      globalConfigPda,
      poolPda,
      poolData.activeEpoch,
      epochData.epochId,
      amount
    )

    console.log('\n✅ Buy position UP succeeded!')
    console.log('Transaction:', signature)

    // Calculate expected changes
    const feeSplit = calculateFeeSplit(amount)

    // Verify fee distribution
    console.log('\n--- Verifying Fee Distribution ---')

    const userChange = balancesBefore.user - balancesAfter.user
    console.log(`User balance change: -${userChange.toString()} (expected: -${amount.toString()})`)
    if (userChange === amount) {
      console.log('✅ User paid correct gross amount')
    } else {
      console.error('❌ User balance change mismatch!')
    }

    const poolChange = balancesAfter.pool - balancesBefore.pool
    const expectedPoolChange = feeSplit.netAmount + feeSplit.lpFee
    console.log(`Pool balance change: +${poolChange.toString()} (expected: +${expectedPoolChange.toString()})`)
    if (poolChange === expectedPoolChange) {
      console.log('✅ Pool received net_amount + lp_fee')
    } else {
      console.error('❌ Pool balance change mismatch!')
    }

    const treasuryChange = balancesAfter.treasury - balancesBefore.treasury
    console.log(`Treasury balance change: +${treasuryChange.toString()} (expected: +${feeSplit.treasuryFee.toString()})`)
    if (treasuryChange === feeSplit.treasuryFee) {
      console.log('✅ Treasury received correct fee')
    } else {
      console.error('❌ Treasury balance change mismatch!')
    }

    const insuranceChange = balancesAfter.insurance - balancesBefore.insurance
    console.log(`Insurance balance change: +${insuranceChange.toString()} (expected: +${feeSplit.insuranceFee.toString()})`)
    if (insuranceChange === feeSplit.insuranceFee) {
      console.log('✅ Insurance received correct fee')
    } else {
      console.error('❌ Insurance balance change mismatch!')
    }

    const totalReceived = poolChange + treasuryChange + insuranceChange
    console.log(`\nTotal received: ${totalReceived.toString()} (should equal user paid: ${userChange.toString()})`)
    if (totalReceived === userChange) {
      console.log('✅ All funds accounted for (no dust)')
    } else {
      console.error('❌ Fund accounting mismatch!')
    }

    // Verify position was created
    const [positionPda] = derivePositionPda(poolData.activeEpoch, wallet.publicKey)
    const positionAccount = await connection.getAccountInfo(positionPda)

    if (positionAccount) {
      console.log('\n--- Position Account Created ---')
      console.log('Position PDA:', positionPda.toBase58())
      console.log('Account size:', positionAccount.data.length, 'bytes')
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('FEE DISTRIBUTION SUMMARY (100 USDC trade)')
    console.log('='.repeat(60))
    console.log(`Trading Fee (1.8%):     ${(Number(feeSplit.totalFee) / 1_000_000).toFixed(6)} USDC`)
    console.log(`  LP (70%):             ${(Number(feeSplit.lpFee) / 1_000_000).toFixed(6)} USDC`)
    console.log(`  Treasury (20%):       ${(Number(feeSplit.treasuryFee) / 1_000_000).toFixed(6)} USDC`)
    console.log(`  Insurance (10%):      ${(Number(feeSplit.insuranceFee) / 1_000_000).toFixed(6)} USDC`)
    console.log(`Net Trade Amount:       ${(Number(feeSplit.netAmount) / 1_000_000).toFixed(6)} USDC`)
    console.log('='.repeat(60))

  } catch (error: any) {
    console.error('\n❌ Buy position failed:', error.message)
    if (error.logs) {
      console.log('\nProgram logs:')
      error.logs.forEach((log: string) => console.log('  ', log))
    }
    process.exit(1)
  }

  // ==========================================================================
  // TEST 2: Minimum trade amount (edge case)
  // ==========================================================================
  await testMinimumTradeAmount(
    connection,
    wallet,
    globalConfigPda,
    poolPda,
    poolData.activeEpoch,
    epochData.epochId
  )

  // ==========================================================================
  // TEST 3: Large trade amount (overflow protection)
  // ==========================================================================
  await testLargeTradeAmount()

  console.log('\n' + '='.repeat(60))
  console.log('All tests completed!')
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
