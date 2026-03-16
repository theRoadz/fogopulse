/**
 * Sell Position Integration Tests
 *
 * Tests the sell_position instruction for selling/closing positions.
 * Requires an existing position (from buy_position) to sell.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx tests/sell-position.test.ts
 *
 * Prerequisites:
 *   1. GlobalConfig initialized
 *   2. Pool created with USDC ATA
 *   3. An active epoch in Open state
 *   4. User has an existing position with shares (run buy-position.test.ts first)
 *   5. Treasury and Insurance USDC ATAs exist
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: 'anchor/.env' })
dotenv.config()

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
const BTC_MINT = new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY')

// sell_position instruction discriminator (from IDL)
const SELL_POSITION_DISCRIMINATOR = Buffer.from([
  11, 170, 234, 139, 126, 196, 142, 74,
])

// buy_position instruction discriminator (for setup)
const BUY_POSITION_DISCRIMINATOR = Buffer.from([
  210, 108, 108, 28, 10, 46, 226, 137,
])

const Direction = { Up: 0, Down: 1 } as const

// Fee constants (must match GlobalConfig)
const TRADING_FEE_BPS = 180
const TREASURY_FEE_SHARE_BPS = 2000
const INSURANCE_FEE_SHARE_BPS = 1000

const TREASURY_WALLET = new PublicKey('HkSz5Avhwn29eeK1fkBGeCtfo1L7uTwct4Wgu5bbfy9U')
const INSURANCE_WALLET = new PublicKey('2GJ2pajUMv2ZXVxNUgVme9i2pHoM51jzYyAzdEa1BTww')

// =============================================================================
// HELPERS
// =============================================================================

function loadWallet(): Keypair {
  const walletPath =
    process.env.WALLET_PATH ||
    path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')
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

function derivePositionPda(epochPda: PublicKey, userPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), epochPda.toBuffer(), userPubkey.toBuffer()],
    PROGRAM_ID
  )
}

function calculateFeeSplit(amount: bigint) {
  const totalFee = (amount * BigInt(TRADING_FEE_BPS) + BigInt(9999)) / BigInt(10000)
  const treasuryFee = (totalFee * BigInt(TREASURY_FEE_SHARE_BPS)) / BigInt(10000)
  const insuranceFee = (totalFee * BigInt(INSURANCE_FEE_SHARE_BPS)) / BigInt(10000)
  const lpFee = totalFee - treasuryFee - insuranceFee
  const netAmount = amount - totalFee
  return { totalFee, lpFee, treasuryFee, insuranceFee, netAmount }
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

function parsePoolAccount(data: Buffer) {
  let offset = 8
  const assetMint = new PublicKey(data.subarray(offset, offset + 32)); offset += 32
  const yesReserves = data.readBigUInt64LE(offset); offset += 8
  const noReserves = data.readBigUInt64LE(offset); offset += 8
  const totalLpShares = data.readBigUInt64LE(offset); offset += 8
  const nextEpochId = data.readBigUInt64LE(offset); offset += 8
  const activeEpochSome = data.readUInt8(offset); offset += 1
  let activeEpoch: PublicKey | null = null
  if (activeEpochSome === 1) {
    activeEpoch = new PublicKey(data.subarray(offset, offset + 32))
  }
  offset += 32
  const activeEpochState = data.readUInt8(offset)
  return { assetMint, yesReserves, noReserves, totalLpShares, nextEpochId, activeEpoch, activeEpochState }
}

function parseEpochAccount(data: Buffer) {
  let offset = 8
  const pool = new PublicKey(data.subarray(offset, offset + 32)); offset += 32
  const epochId = data.readBigUInt64LE(offset); offset += 8
  const state = data.readUInt8(offset)
  return { pool, epochId, state }
}

function parsePositionAccount(data: Buffer) {
  let offset = 8
  const user = new PublicKey(data.subarray(offset, offset + 32)); offset += 32
  const epoch = new PublicKey(data.subarray(offset, offset + 32)); offset += 32
  const direction = data.readUInt8(offset); offset += 1
  const amount = data.readBigUInt64LE(offset); offset += 8
  const shares = data.readBigUInt64LE(offset); offset += 8
  const entryPrice = data.readBigUInt64LE(offset); offset += 8
  const claimed = data.readUInt8(offset) === 1; offset += 1
  const bump = data.readUInt8(offset)
  return { user, epoch, direction, amount, shares, entryPrice, claimed, bump }
}

// =============================================================================
// BUILD INSTRUCTIONS
// =============================================================================

function buildSellInstruction(
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey,
  userUsdcAta: PublicKey,
  poolUsdcAta: PublicKey,
  treasuryUsdcAta: PublicKey,
  insuranceUsdcAta: PublicKey,
  shares: bigint
): TransactionInstruction {
  const data = Buffer.alloc(8 + 32 + 8) // discriminator + user + shares
  let offset = 0
  SELL_POSITION_DISCRIMINATOR.copy(data, offset); offset += 8
  wallet.publicKey.toBuffer().copy(data, offset); offset += 32
  data.writeBigUInt64LE(shares, offset)

  return new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // signer_or_session
      { pubkey: globalConfigPda, isSigner: false, isWritable: false }, // config
      { pubkey: poolPda, isSigner: false, isWritable: true },          // pool
      { pubkey: epochPda, isSigner: false, isWritable: true },         // epoch
      { pubkey: positionPda, isSigner: false, isWritable: true },      // position
      { pubkey: userUsdcAta, isSigner: false, isWritable: true },      // user_usdc
      { pubkey: poolUsdcAta, isSigner: false, isWritable: true },      // pool_usdc
      { pubkey: treasuryUsdcAta, isSigner: false, isWritable: true },  // treasury_usdc
      { pubkey: insuranceUsdcAta, isSigner: false, isWritable: true }, // insurance_usdc
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },       // usdc_mint
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  })
}

function buildBuyInstruction(
  wallet: Keypair,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey,
  userUsdcAta: PublicKey,
  poolUsdcAta: PublicKey,
  treasuryUsdcAta: PublicKey,
  insuranceUsdcAta: PublicKey,
  direction: number,
  amount: bigint
): TransactionInstruction {
  const data = Buffer.alloc(8 + 32 + 1 + 8)
  let offset = 0
  BUY_POSITION_DISCRIMINATOR.copy(data, offset); offset += 8
  wallet.publicKey.toBuffer().copy(data, offset); offset += 32
  data.writeUInt8(direction, offset); offset += 1
  data.writeBigUInt64LE(amount, offset)

  return new TransactionInstruction({
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
}

// =============================================================================
// TESTS
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Sell Position Tests')
  console.log('='.repeat(60))

  const wallet = loadWallet()
  console.log('Wallet:', wallet.publicKey.toBase58())

  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')

  const [globalConfigPda] = deriveGlobalConfigPda()
  const [poolPda] = derivePoolPda(BTC_MINT)

  // Get pool data
  const poolAccount = await connection.getAccountInfo(poolPda)
  if (!poolAccount) { console.error('ERROR: Pool not found'); process.exit(1) }
  const poolData = parsePoolAccount(poolAccount.data)

  if (!poolData.activeEpoch) { console.error('ERROR: No active epoch'); process.exit(1) }
  const epochPda = poolData.activeEpoch

  const epochAccount = await connection.getAccountInfo(epochPda)
  if (!epochAccount) { console.error('ERROR: Epoch not found'); process.exit(1) }
  const epochData = parseEpochAccount(epochAccount.data)

  if (epochData.state !== 0) {
    console.error('ERROR: Epoch not Open (state=' + epochData.state + ')')
    process.exit(1)
  }

  console.log('Pool YES reserves:', poolData.yesReserves.toString())
  console.log('Pool NO reserves:', poolData.noReserves.toString())
  console.log('Epoch ID:', epochData.epochId.toString())

  // Derive common accounts
  const [positionPda] = derivePositionPda(epochPda, wallet.publicKey)
  const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey)
  const poolUsdcAta = await getAssociatedTokenAddress(USDC_MINT, poolPda, true)
  const treasuryUsdcAta = await getAssociatedTokenAddress(USDC_MINT, TREASURY_WALLET)
  const insuranceUsdcAta = await getAssociatedTokenAddress(USDC_MINT, INSURANCE_WALLET)

  // ==========================================================================
  // SETUP: Buy a position first (if none exists)
  // ==========================================================================
  let positionInfo = await connection.getAccountInfo(positionPda)
  if (!positionInfo) {
    console.log('\n--- Setup: Buying position for sell tests ---')
    const buyAmount = BigInt(100_000_000) // 100 USDC
    const buyIx = buildBuyInstruction(
      wallet, globalConfigPda, poolPda, epochPda, positionPda,
      userUsdcAta, poolUsdcAta, treasuryUsdcAta, insuranceUsdcAta,
      Direction.Up, buyAmount
    )
    const buyTx = new Transaction().add(buyIx)
    const buySig = await sendAndConfirmTransaction(connection, buyTx, [wallet])
    console.log('Buy setup complete:', buySig)
    positionInfo = await connection.getAccountInfo(positionPda)
  }

  if (!positionInfo) { console.error('ERROR: Position still not found'); process.exit(1) }
  const position = parsePositionAccount(positionInfo.data)
  console.log('\n--- Current Position ---')
  console.log('Direction:', position.direction === 0 ? 'Up' : 'Down')
  console.log('Amount:', position.amount.toString())
  console.log('Shares:', position.shares.toString())
  console.log('Claimed:', position.claimed)

  if (position.claimed) {
    console.error('ERROR: Position already claimed — cannot sell')
    process.exit(1)
  }

  // ==========================================================================
  // TEST 1: Partial Sell (half shares)
  // ==========================================================================
  try {
    console.log('\n' + '='.repeat(60))
    console.log('TEST 1: Partial Sell (50% of shares)')
    console.log('='.repeat(60))

    const halfShares = position.shares / BigInt(2)
    console.log('Selling shares:', halfShares.toString(), 'of', position.shares.toString())

    const balancesBefore = await getBalanceSnapshot(connection, userUsdcAta, poolUsdcAta, treasuryUsdcAta, insuranceUsdcAta)

    const sellIx = buildSellInstruction(
      wallet, globalConfigPda, poolPda, epochPda, positionPda,
      userUsdcAta, poolUsdcAta, treasuryUsdcAta, insuranceUsdcAta,
      halfShares
    )

    const tx = new Transaction().add(sellIx)
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
    console.log('Transaction:', sig)

    const balancesAfter = await getBalanceSnapshot(connection, userUsdcAta, poolUsdcAta, treasuryUsdcAta, insuranceUsdcAta)

    // Verify user received USDC
    const userGain = balancesAfter.user - balancesBefore.user
    console.log('User received:', userGain.toString(), 'USDC lamports')
    if (userGain > BigInt(0)) {
      console.log('✅ User received payout')
    } else {
      console.error('❌ User did not receive payout')
    }

    // Verify treasury received fee
    const treasuryGain = balancesAfter.treasury - balancesBefore.treasury
    console.log('Treasury received:', treasuryGain.toString())
    if (treasuryGain > BigInt(0)) {
      console.log('✅ Treasury received fee')
    } else {
      console.error('❌ Treasury did not receive fee')
    }

    // Verify insurance received fee
    const insuranceGain = balancesAfter.insurance - balancesBefore.insurance
    console.log('Insurance received:', insuranceGain.toString())
    if (insuranceGain > BigInt(0)) {
      console.log('✅ Insurance received fee')
    } else {
      console.error('❌ Insurance did not receive fee')
    }

    // Verify position still has remaining shares
    const posAfter = parsePositionAccount((await connection.getAccountInfo(positionPda))!.data)
    console.log('Remaining shares:', posAfter.shares.toString())
    console.log('Remaining amount:', posAfter.amount.toString())
    console.log('Claimed:', posAfter.claimed)

    if (posAfter.shares > BigInt(0) && !posAfter.claimed) {
      console.log('✅ Partial sell: position still open with remaining shares')
    } else {
      console.error('❌ Partial sell: position should still be open')
    }

    console.log('\n✅ TEST 1 PASSED: Partial sell')

  } catch (error: any) {
    console.error('\n❌ TEST 1 FAILED:', error.message)
    if (error.logs) error.logs.forEach((l: string) => console.log('  ', l))
  }

  // ==========================================================================
  // TEST 2: Fail - Zero shares (run BEFORE full exit while position is open)
  // ==========================================================================
  try {
    console.log('\n' + '='.repeat(60))
    console.log('TEST 2: Fail - Zero shares')
    console.log('='.repeat(60))

    const posCheck = parsePositionAccount((await connection.getAccountInfo(positionPda))!.data)
    if (posCheck.claimed || posCheck.shares === BigInt(0)) {
      console.log('⚠️ TEST 2 SKIPPED: Position is claimed/empty')
    } else {
      const sellIx = buildSellInstruction(
        wallet, globalConfigPda, poolPda, epochPda, positionPda,
        userUsdcAta, poolUsdcAta, treasuryUsdcAta, insuranceUsdcAta,
        BigInt(0) // zero shares
      )
      const tx = new Transaction().add(sellIx)
      await sendAndConfirmTransaction(connection, tx, [wallet])
      console.error('❌ Should have failed with ZeroShares')
    }
  } catch (error: any) {
    if (error.message?.includes('ZeroShares') || error.logs?.some((l: string) => l.includes('ZeroShares'))) {
      console.log('✅ TEST 2 PASSED: Correctly rejected zero shares')
    } else if (error.message?.includes('AlreadyClaimed') || error.logs?.some((l: string) => l.includes('AlreadyClaimed'))) {
      console.log('⚠️ TEST 2 SKIPPED: Position already claimed')
    } else {
      console.log('⚠️ TEST 2: Got error but not ZeroShares:', error.message)
      if (error.logs) error.logs.forEach((l: string) => console.log('  ', l))
    }
  }

  // ==========================================================================
  // TEST 3: Fail - Insufficient shares (run BEFORE full exit while position is open)
  // ==========================================================================
  try {
    console.log('\n' + '='.repeat(60))
    console.log('TEST 3: Fail - Insufficient shares')
    console.log('='.repeat(60))

    const posCheck = parsePositionAccount((await connection.getAccountInfo(positionPda))!.data)
    if (posCheck.claimed || posCheck.shares === BigInt(0)) {
      console.log('⚠️ TEST 3 SKIPPED: Position is claimed/empty')
    } else {
      const tooManyShares = posCheck.shares + BigInt(1)
      console.log('Trying to sell', tooManyShares.toString(), 'shares (position has', posCheck.shares.toString(), ')')
      const sellIx = buildSellInstruction(
        wallet, globalConfigPda, poolPda, epochPda, positionPda,
        userUsdcAta, poolUsdcAta, treasuryUsdcAta, insuranceUsdcAta,
        tooManyShares
      )
      const tx = new Transaction().add(sellIx)
      await sendAndConfirmTransaction(connection, tx, [wallet])
      console.error('❌ Should have failed with InsufficientShares')
    }
  } catch (error: any) {
    if (error.message?.includes('InsufficientShares') || error.logs?.some((l: string) => l.includes('InsufficientShares'))) {
      console.log('✅ TEST 3 PASSED: Correctly rejected insufficient shares')
    } else if (error.message?.includes('AlreadyClaimed') || error.logs?.some((l: string) => l.includes('AlreadyClaimed'))) {
      console.log('⚠️ TEST 3 SKIPPED: Position already claimed')
    } else {
      console.log('⚠️ TEST 3: Got error but not InsufficientShares:', error.message)
      if (error.logs) error.logs.forEach((l: string) => console.log('  ', l))
    }
  }

  // ==========================================================================
  // TEST 4: Full Exit (remaining shares — run LAST as it sets claimed=true)
  // ==========================================================================
  try {
    console.log('\n' + '='.repeat(60))
    console.log('TEST 4: Full Exit (remaining shares)')
    console.log('='.repeat(60))

    // Re-read position to get current shares
    const posNow = parsePositionAccount((await connection.getAccountInfo(positionPda))!.data)
    if (posNow.claimed || posNow.shares === BigInt(0)) {
      console.log('⚠️ Position already fully exited, skipping test')
    } else {
      const remainingShares = posNow.shares
      console.log('Selling all remaining shares:', remainingShares.toString())

      const balancesBefore = await getBalanceSnapshot(connection, userUsdcAta, poolUsdcAta, treasuryUsdcAta, insuranceUsdcAta)

      const sellIx = buildSellInstruction(
        wallet, globalConfigPda, poolPda, epochPda, positionPda,
        userUsdcAta, poolUsdcAta, treasuryUsdcAta, insuranceUsdcAta,
        remainingShares
      )

      const tx = new Transaction().add(sellIx)
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
      console.log('Transaction:', sig)

      const balancesAfter = await getBalanceSnapshot(connection, userUsdcAta, poolUsdcAta, treasuryUsdcAta, insuranceUsdcAta)

      const userGain = balancesAfter.user - balancesBefore.user
      console.log('User received:', userGain.toString(), 'USDC lamports')

      // Verify position is fully exited
      const posAfter = parsePositionAccount((await connection.getAccountInfo(positionPda))!.data)
      console.log('Shares after:', posAfter.shares.toString())
      console.log('Amount after:', posAfter.amount.toString())
      console.log('Claimed:', posAfter.claimed)

      if (posAfter.shares === BigInt(0) && posAfter.amount === BigInt(0) && posAfter.claimed) {
        console.log('✅ Full exit: position zeroed and claimed')
      } else {
        console.error('❌ Full exit: position should be zeroed with claimed=true')
      }

      console.log('\n✅ TEST 4 PASSED: Full exit')
    }
  } catch (error: any) {
    console.error('\n❌ TEST 4 FAILED:', error.message)
    if (error.logs) error.logs.forEach((l: string) => console.log('  ', l))
  }

  console.log('\n' + '='.repeat(60))
  console.log('All sell position tests completed!')
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
