/**
 * Update Oracle Staleness Threshold
 *
 * Updates the oracle_staleness_threshold_start from 3 to 10 seconds
 * to allow more time for browser-based transaction signing.
 *
 * Run:
 *   cd anchor
 *   npx tsx scripts/update-staleness.ts
 *
 * Environment (via .env file or environment variables):
 *   WALLET_PATH - Path to admin wallet keypair (default: ~/.config/solana/fogo-testnet.json)
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
} from '@solana/web3.js'
import * as fs from 'fs'
import * as os from 'os'

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'

// GlobalConfig PDA
const [GLOBAL_CONFIG_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('global_config')],
  PROGRAM_ID
)

// update_config instruction discriminator (from IDL)
// anchor discriminator = first 8 bytes of sha256("global:update_config")
const UPDATE_CONFIG_DISCRIMINATOR = Buffer.from([
  29, 158, 252, 191, 10, 83, 219, 99
])

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

/**
 * Parse GlobalConfig account data
 */
function parseGlobalConfig(data: Buffer): {
  admin: PublicKey
  oracleStalenessThresholdStart: bigint
  oracleStalenessThresholdSettle: bigint
} {
  // Layout:
  // 8 bytes discriminator
  // 32 bytes admin
  // 32 bytes treasury
  // 32 bytes insurance
  // 2 bytes trading_fee_bps
  // 2 bytes lp_fee_share_bps
  // 2 bytes treasury_fee_share_bps
  // 2 bytes insurance_fee_share_bps
  // 2 bytes per_wallet_cap_bps
  // 2 bytes per_side_cap_bps
  // 2 bytes oracle_confidence_threshold_start_bps
  // 2 bytes oracle_confidence_threshold_settle_bps
  // 8 bytes oracle_staleness_threshold_start
  // 8 bytes oracle_staleness_threshold_settle

  let offset = 8 // skip discriminator
  const admin = new PublicKey(data.subarray(offset, offset + 32))
  offset += 32 + 32 + 32 // skip admin, treasury, insurance
  offset += 2 * 8 // skip 8 u16 fields

  const oracleStalenessThresholdStart = data.readBigInt64LE(offset)
  offset += 8
  const oracleStalenessThresholdSettle = data.readBigInt64LE(offset)

  return { admin, oracleStalenessThresholdStart, oracleStalenessThresholdSettle }
}

/**
 * Build update_config instruction data
 *
 * UpdateConfigParams has 17 Option fields. In Borsh:
 * - None = 0x00
 * - Some(value) = 0x01 + value bytes
 */
function buildUpdateConfigData(newStalenessStart: bigint): Buffer {
  const parts: Buffer[] = []

  // Discriminator
  parts.push(UPDATE_CONFIG_DISCRIMINATOR)

  // 17 Option fields in order:
  // 1. treasury: Option<Pubkey> - None
  parts.push(Buffer.from([0]))
  // 2. insurance: Option<Pubkey> - None
  parts.push(Buffer.from([0]))
  // 3. trading_fee_bps: Option<u16> - None
  parts.push(Buffer.from([0]))
  // 4. lp_fee_share_bps: Option<u16> - None
  parts.push(Buffer.from([0]))
  // 5. treasury_fee_share_bps: Option<u16> - None
  parts.push(Buffer.from([0]))
  // 6. insurance_fee_share_bps: Option<u16> - None
  parts.push(Buffer.from([0]))
  // 7. per_wallet_cap_bps: Option<u16> - None
  parts.push(Buffer.from([0]))
  // 8. per_side_cap_bps: Option<u16> - None
  parts.push(Buffer.from([0]))
  // 9. oracle_confidence_threshold_start_bps: Option<u16> - None
  parts.push(Buffer.from([0]))
  // 10. oracle_confidence_threshold_settle_bps: Option<u16> - None
  parts.push(Buffer.from([0]))
  // 11. oracle_staleness_threshold_start: Option<i64> - Some(10)
  const stalenessBuffer = Buffer.alloc(9)
  stalenessBuffer.writeUInt8(1, 0) // Some
  stalenessBuffer.writeBigInt64LE(newStalenessStart, 1)
  parts.push(stalenessBuffer)
  // 12. oracle_staleness_threshold_settle: Option<i64> - None
  parts.push(Buffer.from([0]))
  // 13. epoch_duration_seconds: Option<i64> - None
  parts.push(Buffer.from([0]))
  // 14. freeze_window_seconds: Option<i64> - None
  parts.push(Buffer.from([0]))
  // 15. allow_hedging: Option<bool> - None
  parts.push(Buffer.from([0]))
  // 16. paused: Option<bool> - None
  parts.push(Buffer.from([0]))
  // 17. frozen: Option<bool> - None
  parts.push(Buffer.from([0]))

  return Buffer.concat(parts)
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FogoPulse - Update Oracle Staleness Threshold')
  console.log('='.repeat(60))
  console.log('')

  // Load admin keypair
  const adminKeypair = loadWallet()
  console.log('Admin wallet:', adminKeypair.publicKey.toBase58())

  // Connect to FOGO testnet
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC:', FOGO_TESTNET_RPC)
  console.log('GlobalConfig PDA:', GLOBAL_CONFIG_PDA.toBase58())
  console.log('')

  // Fetch current config
  const configAccount = await connection.getAccountInfo(GLOBAL_CONFIG_PDA)
  if (!configAccount) {
    throw new Error('GlobalConfig account not found')
  }

  const configData = parseGlobalConfig(configAccount.data)
  console.log('Current values:')
  console.log('  admin:', configData.admin.toBase58())
  console.log('  oracle_staleness_threshold_start:', configData.oracleStalenessThresholdStart.toString(), 'seconds')
  console.log('  oracle_staleness_threshold_settle:', configData.oracleStalenessThresholdSettle.toString(), 'seconds')
  console.log('')

  // Verify admin
  if (!configData.admin.equals(adminKeypair.publicKey)) {
    throw new Error(`Admin mismatch! Config admin: ${configData.admin.toBase58()}, Your wallet: ${adminKeypair.publicKey.toBase58()}`)
  }

  // Check if already updated
  if (configData.oracleStalenessThresholdStart >= 10n) {
    console.log('✓ Already updated to 10+ seconds, no action needed.')
    return
  }

  // Build transaction
  console.log('Updating oracle_staleness_threshold_start to 10 seconds...')
  console.log('')

  const instructionData = buildUpdateConfigData(10n)

  const instruction = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: GLOBAL_CONFIG_PDA, isSigner: false, isWritable: true },
    ],
    data: instructionData,
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

  const messageV0 = new TransactionMessage({
    payerKey: adminKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message()

  const transaction = new VersionedTransaction(messageV0)
  transaction.sign([adminKeypair])

  // Send transaction
  try {
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })

    console.log('Transaction sent:', signature)
    console.log('Waiting for confirmation...')

    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed')

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    console.log('')
    console.log('✓ Transaction successful!')
    console.log('  Signature:', signature)
    console.log('  Explorer: https://explorer.fogo.io/tx/' + signature + '?cluster=testnet')
    console.log('')

    // Verify update
    const configAccountAfter = await connection.getAccountInfo(GLOBAL_CONFIG_PDA)
    if (configAccountAfter) {
      const configDataAfter = parseGlobalConfig(configAccountAfter.data)
      console.log('Updated values:')
      console.log('  oracle_staleness_threshold_start:', configDataAfter.oracleStalenessThresholdStart.toString(), 'seconds')
      console.log('  oracle_staleness_threshold_settle:', configDataAfter.oracleStalenessThresholdSettle.toString(), 'seconds')
    }
  } catch (error) {
    console.error('✗ Transaction failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)
