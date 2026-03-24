/**
 * Initialize Protocol Script
 *
 * Creates the GlobalConfig account on FOGO testnet with testnet parameters.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/initialize-protocol.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'

// Initialize instruction discriminator (from IDL)
const INITIALIZE_DISCRIMINATOR = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237])

// GlobalConfig initialization parameters (from story Dev Notes)
const PARAMS = {
  // Fee parameters
  tradingFeeBps: 180,           // 1.8% trading fee
  lpFeeShareBps: 7000,          // 70% to LP
  treasuryFeeShareBps: 2000,    // 20% to treasury
  insuranceFeeShareBps: 1000,   // 10% to insurance

  // Cap parameters
  perWalletCapBps: 500,         // 5% max position per wallet
  perSideCapBps: 3000,          // 30% max exposure per side

  // Timing parameters
  epochDurationSeconds: 300,    // 5 minutes
  freezeWindowSeconds: 15,      // 15 seconds freeze before settlement

  // Oracle thresholds
  oracleConfidenceThresholdStartBps: 25,   // 0.25% max confidence ratio for epoch start
  oracleConfidenceThresholdSettleBps: 80,  // 0.8% max confidence ratio for settlement
  oracleStalenessThresholdStart: 3,        // 3 seconds max age for start
  oracleStalenessThresholdSettle: 15,      // 15 seconds max age for settlement

  // Other
  allowHedging: false,          // MVP: users can only hold ONE direction per epoch

  // Trade limits
  maxTradeAmount: 100_000_000,  // $100 USDC max trade (in lamports, 6 decimals)

  // Settlement timeout
  settlementTimeoutSeconds: 60, // 60 seconds after end_time before permissionless force-close
}

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

/**
 * Encode initialize instruction data
 * Args order from IDL:
 * - treasury: pubkey
 * - insurance: pubkey
 * - trading_fee_bps: u16
 * - lp_fee_share_bps: u16
 * - treasury_fee_share_bps: u16
 * - insurance_fee_share_bps: u16
 * - per_wallet_cap_bps: u16
 * - per_side_cap_bps: u16
 * - oracle_confidence_threshold_start_bps: u16
 * - oracle_confidence_threshold_settle_bps: u16
 * - oracle_staleness_threshold_start: i64
 * - oracle_staleness_threshold_settle: i64
 * - epoch_duration_seconds: i64
 * - freeze_window_seconds: i64
 * - allow_hedging: bool
 * - max_trade_amount: u64
 * - settlement_timeout_seconds: i64
 */
function encodeInitializeData(
  treasury: PublicKey,
  insurance: PublicKey,
  tradingFeeBps: number,
  lpFeeShareBps: number,
  treasuryFeeShareBps: number,
  insuranceFeeShareBps: number,
  perWalletCapBps: number,
  perSideCapBps: number,
  oracleConfidenceThresholdStartBps: number,
  oracleConfidenceThresholdSettleBps: number,
  oracleStalenessThresholdStart: bigint,
  oracleStalenessThresholdSettle: bigint,
  epochDurationSeconds: bigint,
  freezeWindowSeconds: bigint,
  allowHedging: boolean,
  maxTradeAmount: bigint,
  settlementTimeoutSeconds: bigint
): Buffer {
  // Calculate total size:
  // 8 (discriminator) + 32 (treasury) + 32 (insurance) +
  // 2*8 (8 u16s) + 8*4 (4 i64s) + 1 (bool) + 8 (u64) + 8 (i64) = 137
  const buffer = Buffer.alloc(137)
  let offset = 0

  // Discriminator
  INITIALIZE_DISCRIMINATOR.copy(buffer, offset)
  offset += 8

  // Treasury pubkey (32 bytes)
  treasury.toBuffer().copy(buffer, offset)
  offset += 32

  // Insurance pubkey (32 bytes)
  insurance.toBuffer().copy(buffer, offset)
  offset += 32

  // u16 values (little endian)
  buffer.writeUInt16LE(tradingFeeBps, offset); offset += 2
  buffer.writeUInt16LE(lpFeeShareBps, offset); offset += 2
  buffer.writeUInt16LE(treasuryFeeShareBps, offset); offset += 2
  buffer.writeUInt16LE(insuranceFeeShareBps, offset); offset += 2
  buffer.writeUInt16LE(perWalletCapBps, offset); offset += 2
  buffer.writeUInt16LE(perSideCapBps, offset); offset += 2
  buffer.writeUInt16LE(oracleConfidenceThresholdStartBps, offset); offset += 2
  buffer.writeUInt16LE(oracleConfidenceThresholdSettleBps, offset); offset += 2

  // i64 values (little endian)
  buffer.writeBigInt64LE(oracleStalenessThresholdStart, offset); offset += 8
  buffer.writeBigInt64LE(oracleStalenessThresholdSettle, offset); offset += 8
  buffer.writeBigInt64LE(epochDurationSeconds, offset); offset += 8
  buffer.writeBigInt64LE(freezeWindowSeconds, offset); offset += 8

  // bool
  buffer.writeUInt8(allowHedging ? 1 : 0, offset); offset += 1

  // u64 (max_trade_amount)
  buffer.writeBigUInt64LE(maxTradeAmount, offset); offset += 8

  // i64 (settlement_timeout_seconds)
  buffer.writeBigInt64LE(settlementTimeoutSeconds, offset)

  return buffer
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Initialize Protocol')
  console.log('='.repeat(60))
  console.log()

  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet public key:', wallet.publicKey.toBase58())

  // Setup connection
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC endpoint:', FOGO_TESTNET_RPC)

  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Wallet balance:', balance / 1e9, 'SOL')

  if (balance < 0.01 * 1e9) {
    console.error('ERROR: Insufficient SOL balance. Get SOL from https://faucet.fogo.io/')
    process.exit(1)
  }

  // Derive GlobalConfig PDA
  const [globalConfigPda, globalConfigBump] = deriveGlobalConfigPda()
  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())
  console.log('GlobalConfig bump:', globalConfigBump)

  // Check if GlobalConfig already exists
  const existingAccount = await connection.getAccountInfo(globalConfigPda)
  if (existingAccount) {
    console.log()
    console.log('GlobalConfig already initialized!')
    console.log('Account size:', existingAccount.data.length, 'bytes')
    console.log('Owner:', existingAccount.owner.toBase58())
    console.log()
    console.log('Skipping initialization. Use verify-protocol.ts to inspect current values.')
    return
  }

  // For initialization, use deployer wallet as admin, treasury, and insurance.
  // Treasury and insurance can be updated to dedicated wallets via the admin dashboard after init.
  const admin = wallet.publicKey
  const treasury = wallet.publicKey
  const insurance = wallet.publicKey

  console.log()
  console.log('Initialization Parameters:')
  console.log('-'.repeat(40))
  console.log('Admin:', admin.toBase58())
  console.log('Treasury:', treasury.toBase58())
  console.log('Insurance:', insurance.toBase58())
  console.log('Trading Fee:', PARAMS.tradingFeeBps, 'bps (', PARAMS.tradingFeeBps / 100, '%)')
  console.log('LP Fee Share:', PARAMS.lpFeeShareBps, 'bps (', PARAMS.lpFeeShareBps / 100, '%)')
  console.log('Treasury Fee Share:', PARAMS.treasuryFeeShareBps, 'bps (', PARAMS.treasuryFeeShareBps / 100, '%)')
  console.log('Insurance Fee Share:', PARAMS.insuranceFeeShareBps, 'bps (', PARAMS.insuranceFeeShareBps / 100, '%)')
  console.log('Per Wallet Cap:', PARAMS.perWalletCapBps, 'bps (', PARAMS.perWalletCapBps / 100, '%)')
  console.log('Per Side Cap:', PARAMS.perSideCapBps, 'bps (', PARAMS.perSideCapBps / 100, '%)')
  console.log('Epoch Duration:', PARAMS.epochDurationSeconds, 'seconds (', PARAMS.epochDurationSeconds / 60, 'minutes)')
  console.log('Freeze Window:', PARAMS.freezeWindowSeconds, 'seconds')
  console.log('Oracle Confidence Start:', PARAMS.oracleConfidenceThresholdStartBps, 'bps (', PARAMS.oracleConfidenceThresholdStartBps / 100, '%)')
  console.log('Oracle Confidence Settle:', PARAMS.oracleConfidenceThresholdSettleBps, 'bps (', PARAMS.oracleConfidenceThresholdSettleBps / 100, '%)')
  console.log('Oracle Staleness Start:', PARAMS.oracleStalenessThresholdStart, 'seconds')
  console.log('Oracle Staleness Settle:', PARAMS.oracleStalenessThresholdSettle, 'seconds')
  console.log('Allow Hedging:', PARAMS.allowHedging)
  console.log('Max Trade Amount:', PARAMS.maxTradeAmount, 'lamports ($' + (PARAMS.maxTradeAmount / 1_000_000) + ' USDC)')
  console.log('Settlement Timeout:', PARAMS.settlementTimeoutSeconds, 'seconds')
  console.log('-'.repeat(40))
  console.log()

  // Validate fee shares sum to 10000
  const feeSum = PARAMS.lpFeeShareBps + PARAMS.treasuryFeeShareBps + PARAMS.insuranceFeeShareBps
  if (feeSum !== 10000) {
    console.error('ERROR: Fee shares must sum to 10000, got:', feeSum)
    process.exit(1)
  }
  console.log('Fee share validation: PASSED (sum = 10000)')
  console.log()

  // Build instruction data
  const data = encodeInitializeData(
    treasury,
    insurance,
    PARAMS.tradingFeeBps,
    PARAMS.lpFeeShareBps,
    PARAMS.treasuryFeeShareBps,
    PARAMS.insuranceFeeShareBps,
    PARAMS.perWalletCapBps,
    PARAMS.perSideCapBps,
    PARAMS.oracleConfidenceThresholdStartBps,
    PARAMS.oracleConfidenceThresholdSettleBps,
    BigInt(PARAMS.oracleStalenessThresholdStart),
    BigInt(PARAMS.oracleStalenessThresholdSettle),
    BigInt(PARAMS.epochDurationSeconds),
    BigInt(PARAMS.freezeWindowSeconds),
    PARAMS.allowHedging,
    BigInt(PARAMS.maxTradeAmount),
    BigInt(PARAMS.settlementTimeoutSeconds)
  )

  // Build instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // admin
      { pubkey: globalConfigPda, isSigner: false, isWritable: true },   // global_config
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    programId: PROGRAM_ID,
    data,
  })

  // Build and send transaction
  console.log('Sending initialize transaction...')

  try {
    const tx = new Transaction().add(instruction)
    const signature = await sendAndConfirmTransaction(connection, tx, [wallet])

    console.log()
    console.log('SUCCESS!')
    console.log('Transaction signature:', signature)
    console.log()
    console.log('GlobalConfig initialized at:', globalConfigPda.toBase58())
    console.log()
    console.log('Next steps:')
    console.log('  1. Run create-pools.ts to create pool accounts')
    console.log('  2. Run verify-protocol.ts to confirm setup')
    console.log()
  } catch (error) {
    console.error()
    console.error('FAILED to initialize GlobalConfig:')
    console.error(error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
