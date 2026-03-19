/**
 * Claim Payout Script
 *
 * Claims winnings from a settled epoch for a winning position.
 * This script is for manual testing of the claim_payout instruction.
 *
 * ⚠️ SERVER/NODE.JS ONLY - This script uses Node.js-specific APIs (Buffer, fs, etc.)
 * Do NOT copy this code to browser/frontend without adapting for browser compatibility.
 * See project-context.md for browser-compatible PDA derivation patterns.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/claim-payout.ts --pool BTC --epoch 5
 *
 * Prerequisites:
 *   1. Pool must exist
 *   2. Epoch must be in Settled state with Up or Down outcome
 *   3. User must have a position in that epoch
 *   4. Position direction must match winning outcome (UP position for Up outcome, etc.)
 *   5. Position must not already be claimed
 *
 * Environment (via .env file or environment variables):
 *   WALLET_PATH - Path to user wallet keypair (default: ~/.config/solana/fogo-testnet.json)
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv'
import * as path from 'path'

// Try multiple .env locations
dotenv.config({ path: path.resolve(__dirname, '../.env') })  // anchor/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') })  // project root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })  // project root .env.local

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
} from '@solana/spl-token'
import * as fs from 'fs'
import * as os from 'os'

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

// claim_payout instruction discriminator (from IDL)
const CLAIM_PAYOUT_DISCRIMINATOR = Buffer.from([
  127, 240, 132, 62, 227, 198, 146, 133
])

// Outcome enum values
const OUTCOME = {
  Up: 0,
  Down: 1,
  Refunded: 2,
} as const

// Direction enum values
const DIRECTION = {
  Up: 0,
  Down: 1,
} as const

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

function deriveEpochPda(poolPda: PublicKey, epochId: bigint): [PublicKey, number] {
  const epochIdBuffer = Buffer.alloc(8)
  epochIdBuffer.writeBigUInt64LE(epochId)

  return PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), poolPda.toBuffer(), epochIdBuffer],
    PROGRAM_ID
  )
}

function derivePositionPda(epochPda: PublicKey, userPubkey: PublicKey, direction: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), epochPda.toBuffer(), userPubkey.toBuffer(), Buffer.from([direction])],
    PROGRAM_ID
  )
}

/**
 * Parse Epoch account data to check state and outcome
 */
function parseEpochAccount(data: Buffer): {
  pool: PublicKey
  epochId: bigint
  state: number
  outcome: number | null
  yesTotalAtSettlement: bigint | null
  noTotalAtSettlement: bigint | null
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

  // start_time (8 bytes)
  offset += 8
  // end_time (8 bytes)
  offset += 8
  // freeze_time (8 bytes)
  offset += 8
  // start_price (8 bytes)
  offset += 8
  // start_confidence (8 bytes)
  offset += 8
  // start_publish_time (8 bytes)
  offset += 8

  // settlement_price (Option<u64> = 1 + 8 bytes)
  offset += 9
  // settlement_confidence (Option<u64> = 1 + 8 bytes)
  offset += 9
  // settlement_publish_time (Option<i64> = 1 + 8 bytes)
  offset += 9

  // outcome (Option<Outcome> = 1 + 1 bytes if Some)
  const hasOutcome = data.readUInt8(offset) === 1
  offset += 1
  const outcome = hasOutcome ? data.readUInt8(offset) : null
  offset += hasOutcome ? 1 : 0

  // yes_total_at_settlement (Option<u64> = 1 + 8 bytes if Some)
  const hasYesTotal = data.readUInt8(offset) === 1
  offset += 1
  const yesTotalAtSettlement = hasYesTotal ? data.readBigUInt64LE(offset) : null
  offset += hasYesTotal ? 8 : 0

  // no_total_at_settlement (Option<u64> = 1 + 8 bytes if Some)
  const hasNoTotal = data.readUInt8(offset) === 1
  offset += 1
  const noTotalAtSettlement = hasNoTotal ? data.readBigUInt64LE(offset) : null

  return { pool, epochId, state, outcome, yesTotalAtSettlement, noTotalAtSettlement }
}

/**
 * Parse UserPosition account data
 */
function parsePositionAccount(data: Buffer): {
  user: PublicKey
  epoch: PublicKey
  direction: number
  amount: bigint
  shares: bigint
  claimed: boolean
} {
  // Skip discriminator (8 bytes)
  let offset = 8

  // user (32 bytes)
  const user = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  // epoch (32 bytes)
  const epoch = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32

  // direction (1 byte enum)
  const direction = data.readUInt8(offset)
  offset += 1

  // amount (8 bytes, u64)
  const amount = data.readBigUInt64LE(offset)
  offset += 8

  // shares (8 bytes, u64)
  const shares = data.readBigUInt64LE(offset)
  offset += 8

  // entry_price (8 bytes, u64)
  offset += 8

  // claimed (1 byte bool)
  const claimed = data.readUInt8(offset) === 1

  return { user, epoch, direction, amount, shares, claimed }
}

/**
 * Get epoch state name
 */
function getEpochStateName(state: number): string {
  const states = ['Open', 'Frozen', 'Settling', 'Settled', 'Refunded']
  return states[state] || 'Unknown'
}

/**
 * Get outcome name
 */
function getOutcomeName(outcome: number | null): string {
  if (outcome === null) return 'None'
  const outcomes = ['Up', 'Down', 'Refunded']
  return outcomes[outcome] || 'Unknown'
}

/**
 * Get direction name
 */
function getDirectionName(direction: number): string {
  return direction === DIRECTION.Up ? 'Up' : 'Down'
}

/**
 * Check if position is a winner
 */
function isWinner(direction: number, outcome: number | null): boolean {
  if (outcome === null || outcome === OUTCOME.Refunded) return false
  return (outcome === OUTCOME.Up && direction === DIRECTION.Up) ||
         (outcome === OUTCOME.Down && direction === DIRECTION.Down)
}

/**
 * Calculate expected payout
 */
function calculatePayout(
  positionAmount: bigint,
  yesTotalAtSettlement: bigint | null,
  noTotalAtSettlement: bigint | null,
  outcome: number | null,
  direction: number,
): bigint {
  if (!yesTotalAtSettlement || !noTotalAtSettlement || outcome === null) {
    return 0n
  }

  const [winnerTotal, loserTotal] = outcome === OUTCOME.Up
    ? [yesTotalAtSettlement, noTotalAtSettlement]
    : [noTotalAtSettlement, yesTotalAtSettlement]

  if (loserTotal === 0n) {
    return positionAmount // No losers, just return stake
  }

  // winnings = (position.amount * loser_total) / winner_total
  const winnings = (positionAmount * loserTotal) / winnerTotal

  return positionAmount + winnings
}

/**
 * Build claim_payout instruction
 */
function buildClaimPayoutInstruction(
  signerOrSession: PublicKey,
  globalConfigPda: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  positionPda: PublicKey,
  poolUsdcAta: PublicKey,
  userUsdcAta: PublicKey,
  userPubkey: PublicKey,
  direction: number,
): TransactionInstruction {
  // Instruction data: discriminator + user pubkey + direction byte
  const data = Buffer.concat([
    CLAIM_PAYOUT_DISCRIMINATOR,
    userPubkey.toBuffer(),
    Buffer.from([direction]),
  ])

  const keys = [
    { pubkey: signerOrSession, isSigner: true, isWritable: true },
    { pubkey: globalConfigPda, isSigner: false, isWritable: false },
    { pubkey: poolPda, isSigner: false, isWritable: false },  // Pool not modified by claim_payout
    { pubkey: epochPda, isSigner: false, isWritable: false },
    { pubkey: positionPda, isSigner: false, isWritable: true },
    { pubkey: poolUsdcAta, isSigner: false, isWritable: true },
    { pubkey: userUsdcAta, isSigner: false, isWritable: true },
    { pubkey: USDC_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
  ]

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  })
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('============================================================')
  console.log('FOGO Pulse - Claim Payout')
  console.log('============================================================')
  console.log()

  // Parse args
  const args = process.argv.slice(2)
  let selectedPool: Asset = 'BTC'
  let epochId: bigint | null = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pool' && args[i + 1]) {
      const poolArg = args[i + 1].toUpperCase() as Asset
      if (poolArg in ASSET_MINTS) {
        selectedPool = poolArg
      } else {
        console.error(`Invalid pool: ${args[i + 1]}. Must be one of: ${Object.keys(ASSET_MINTS).join(', ')}`)
        process.exit(1)
      }
      i++
    }
    if (args[i] === '--epoch' && args[i + 1]) {
      epochId = BigInt(args[i + 1])
      i++
    }
  }

  if (epochId === null) {
    console.error('ERROR: --epoch argument is required')
    console.error('Usage: npx tsx scripts/claim-payout.ts --pool BTC --epoch 5')
    process.exit(1)
  }

  console.log('Selected pool:', selectedPool)
  console.log('Epoch ID:', epochId.toString())

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
    console.error('ERROR: Insufficient balance. Need at least 0.001 SOL for transaction fees.')
    process.exit(1)
  }

  // Derive PDAs
  const [globalConfigPda] = deriveGlobalConfigPda()
  const assetMint = ASSET_MINTS[selectedPool]
  const [poolPda] = derivePoolPda(assetMint)
  const [epochPda] = deriveEpochPda(poolPda, epochId)
  // Try both directions to find user's position
  const [upPositionPda] = derivePositionPda(epochPda, wallet.publicKey, DIRECTION.Up)
  const [downPositionPda] = derivePositionPda(epochPda, wallet.publicKey, DIRECTION.Down)

  console.log()
  console.log('PDAs:')
  console.log('  GlobalConfig:', globalConfigPda.toString())
  console.log(`  ${selectedPool} Pool:`, poolPda.toString())
  console.log('  Epoch:', epochPda.toString())
  console.log('  Position (Up):', upPositionPda.toString())
  console.log('  Position (Down):', downPositionPda.toString())

  // Fetch pool account to verify it exists
  const poolAccountInfo = await connection.getAccountInfo(poolPda)
  if (!poolAccountInfo) {
    console.error('ERROR: Pool account not found. Has the pool been created?')
    process.exit(1)
  }

  // Fetch epoch account to check state and outcome
  const epochAccountInfo = await connection.getAccountInfo(epochPda)
  if (!epochAccountInfo) {
    console.error(`ERROR: Epoch ${epochId} not found for ${selectedPool} pool.`)
    process.exit(1)
  }

  const epochData = parseEpochAccount(epochAccountInfo.data)
  const stateName = getEpochStateName(epochData.state)
  const outcomeName = getOutcomeName(epochData.outcome)

  console.log()
  console.log('Epoch:')
  console.log('  State:', stateName)
  console.log('  Outcome:', outcomeName)
  console.log('  YES total at settlement:', epochData.yesTotalAtSettlement ? `${Number(epochData.yesTotalAtSettlement) / 1e6} USDC` : 'N/A')
  console.log('  NO total at settlement:', epochData.noTotalAtSettlement ? `${Number(epochData.noTotalAtSettlement) / 1e6} USDC` : 'N/A')

  if (epochData.state !== 3) {  // 3 = Settled
    console.error(`ERROR: Epoch is in ${stateName} state. Must be Settled to claim payout.`)
    if (epochData.state === 4) {
      console.error('Tip: This epoch was Refunded. Use claim-refund.ts instead.')
    }
    process.exit(1)
  }

  if (epochData.outcome === OUTCOME.Refunded) {
    console.error('ERROR: Epoch outcome is Refunded. Use claim-refund.ts instead.')
    process.exit(1)
  }

  // Fetch position accounts (try both directions)
  let positionPda: PublicKey
  let positionAccountInfo = await connection.getAccountInfo(upPositionPda)
  if (positionAccountInfo) {
    positionPda = upPositionPda
  } else {
    positionAccountInfo = await connection.getAccountInfo(downPositionPda)
    if (positionAccountInfo) {
      positionPda = downPositionPda
    } else {
      console.error('ERROR: No position found for this wallet in this epoch (checked both Up and Down).')
      process.exit(1)
    }
  }

  const positionData = parsePositionAccount(positionAccountInfo.data)
  const directionName = getDirectionName(positionData.direction)

  console.log()
  console.log('Position:')
  console.log('  User:', positionData.user.toString())
  console.log('  Direction:', directionName)
  console.log('  Amount:', Number(positionData.amount) / 1e6, 'USDC')
  console.log('  Shares:', Number(positionData.shares))
  console.log('  Claimed:', positionData.claimed)

  if (positionData.claimed) {
    console.error('ERROR: Position has already been claimed.')
    process.exit(1)
  }

  // Check if position is a winner
  if (!isWinner(positionData.direction, epochData.outcome)) {
    console.error(`ERROR: Position is not a winner. Direction=${directionName}, Outcome=${outcomeName}`)
    console.error('Only winning positions can claim payouts.')
    process.exit(1)
  }

  // Calculate expected payout
  const expectedPayout = calculatePayout(
    positionData.amount,
    epochData.yesTotalAtSettlement,
    epochData.noTotalAtSettlement,
    epochData.outcome,
    positionData.direction,
  )

  console.log()
  console.log('Expected payout:', Number(expectedPayout) / 1e6, 'USDC')

  // Get token accounts
  const poolUsdcAta = await getAssociatedTokenAddress(USDC_MINT, poolPda, true)
  const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey)

  console.log()
  console.log('Token Accounts:')
  console.log('  Pool USDC:', poolUsdcAta.toString())
  console.log('  User USDC:', userUsdcAta.toString())

  // Verify user USDC ATA exists
  const userUsdcInfo = await connection.getAccountInfo(userUsdcAta)
  if (!userUsdcInfo) {
    console.error('ERROR: User USDC token account does not exist. Create it first.')
    process.exit(1)
  }

  // Build instruction
  console.log()
  console.log('Building claim_payout instruction...')

  const claimPayoutIx = buildClaimPayoutInstruction(
    wallet.publicKey,
    globalConfigPda,
    poolPda,
    epochPda,
    positionPda,
    poolUsdcAta,
    userUsdcAta,
    wallet.publicKey,
    positionData.direction,
  )

  // Build transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [claimPayoutIx],
  }).compileToV0Message()

  const transaction = new VersionedTransaction(messageV0)
  transaction.sign([wallet])

  // Submit transaction
  console.log('Submitting transaction...')

  try {
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })

    console.log('Transaction signature:', signature)
    console.log(`Explorer: https://explorer.fogo.io/tx/${signature}?cluster=testnet`)

    // Wait for confirmation
    console.log('Waiting for confirmation...')
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed')

    if (confirmation.value.err) {
      console.error('Transaction failed:', confirmation.value.err)
      process.exit(1)
    }

    console.log()
    console.log('SUCCESS! Payout claimed.')
    console.log('Original stake:', Number(positionData.amount) / 1e6, 'USDC')
    console.log('Expected payout:', Number(expectedPayout) / 1e6, 'USDC')

  } catch (error: unknown) {
    console.error('Transaction error:', error)

    // Try to get more details
    if (error instanceof Error && 'logs' in error) {
      console.error('Transaction logs:', (error as { logs: string[] }).logs)
    }

    process.exit(1)
  }
}

main().catch(console.error)
