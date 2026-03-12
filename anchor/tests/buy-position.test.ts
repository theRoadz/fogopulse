/**
 * Buy Position Integration Tests
 *
 * Tests the buy_position instruction for opening and adding to positions.
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
): Promise<string> {
  console.log('\n--- Test: Buy UP Position ---')

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

  // Check user USDC balance
  try {
    const userUsdcAccount = await getAccount(connection, userUsdcAta)
    console.log('User USDC balance:', userUsdcAccount.amount.toString())

    if (userUsdcAccount.amount < amount) {
      throw new Error(
        `Insufficient USDC balance: ${userUsdcAccount.amount} < ${amount}`
      )
    }
  } catch (error: any) {
    throw new Error(`Failed to get user USDC account: ${error.message}`)
  }

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

  // Build instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // signer_or_session
      { pubkey: globalConfigPda, isSigner: false, isWritable: false }, // config
      { pubkey: poolPda, isSigner: false, isWritable: true }, // pool
      { pubkey: epochPda, isSigner: false, isWritable: true }, // epoch
      { pubkey: positionPda, isSigner: false, isWritable: true }, // position
      { pubkey: userUsdcAta, isSigner: false, isWritable: true }, // user_usdc
      { pubkey: poolUsdcAta, isSigner: false, isWritable: true }, // pool_usdc
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

  console.log('Sending buy_position transaction...')

  const tx = new Transaction().add(instruction)
  const signature = await sendAndConfirmTransaction(connection, tx, [wallet])

  console.log('Transaction confirmed:', signature)
  return signature
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

  // Test buy position
  try {
    // Buy 1 USDC worth (1_000_000 lamports = 1 USDC with 6 decimals)
    const amount = BigInt(1_000_000)

    const signature = await testBuyPositionUp(
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

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
