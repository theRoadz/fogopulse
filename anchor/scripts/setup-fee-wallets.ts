/**
 * Setup Treasury and Insurance Wallets
 *
 * This script:
 * 1. Generates new keypairs for treasury and insurance (or loads existing)
 * 2. Funds them with FOGO from admin wallet
 * 3. Creates USDC ATAs for both
 * 4. Updates GlobalConfig with new treasury/insurance pubkeys
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/setup-fee-wallets.ts
 *
 * Prerequisites:
 *   - Admin wallet with FOGO balance (~0.05 SOL minimum)
 *   - Program deployed with update_config instruction
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
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
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
const GLOBAL_CONFIG_PDA = new PublicKey('GGUyA3vgbtNvC5oigtNc4uu8Z36MBjANPAfcZvoGjans')

// Amount to fund each wallet (0.01 SOL = 10_000_000 lamports)
const FUNDING_AMOUNT = 0.01 * LAMPORTS_PER_SOL

// update_config discriminator from IDL
const UPDATE_CONFIG_DISCRIMINATOR = Buffer.from([29, 158, 252, 191, 10, 83, 219, 99])

// Keys directory
const KEYS_DIR = path.join(__dirname, '..', 'keys')

// =============================================================================
// HELPERS
// =============================================================================

function loadAdminWallet(): Keypair {
  const walletPath =
    process.env.WALLET_PATH ||
    path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')

  console.log('Loading admin wallet from:', walletPath)

  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'))
  return Keypair.fromSecretKey(Uint8Array.from(secretKey))
}

function ensureKeysDirectory(): void {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true })
    console.log('Created keys directory:', KEYS_DIR)
  }
}

function loadOrCreateKeypair(name: string): Keypair {
  const keyPath = path.join(KEYS_DIR, `${name}.json`)

  if (fs.existsSync(keyPath)) {
    console.log(`Loading existing ${name} keypair from:`, keyPath)
    const secretKey = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
    return Keypair.fromSecretKey(Uint8Array.from(secretKey))
  }

  console.log(`Generating new ${name} keypair...`)
  const keypair = Keypair.generate()

  // Save to file
  fs.writeFileSync(keyPath, JSON.stringify(Array.from(keypair.secretKey)))
  console.log(`Saved ${name} keypair to:`, keyPath)

  return keypair
}

async function fundWallet(
  connection: Connection,
  fromWallet: Keypair,
  toPublicKey: PublicKey,
  amount: number,
  name: string
): Promise<void> {
  const balance = await connection.getBalance(toPublicKey)
  const balanceInSol = balance / LAMPORTS_PER_SOL

  if (balance >= amount) {
    console.log(`${name} already has ${balanceInSol.toFixed(4)} SOL, skipping funding`)
    return
  }

  console.log(`Funding ${name} with ${(amount / LAMPORTS_PER_SOL).toFixed(4)} SOL...`)

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromWallet.publicKey,
      toPubkey: toPublicKey,
      lamports: amount,
    })
  )

  const signature = await sendAndConfirmTransaction(connection, tx, [fromWallet])
  console.log(`Funded ${name}: ${signature}`)
}

async function createUsdcAta(
  connection: Connection,
  payer: Keypair,
  owner: PublicKey,
  name: string
): Promise<PublicKey> {
  console.log(`Creating/getting USDC ATA for ${name}...`)

  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    USDC_MINT,
    owner
  )

  console.log(`${name} USDC ATA: ${ata.address.toBase58()}`)
  return ata.address
}

/**
 * Build update_config instruction to update treasury and insurance
 *
 * UpdateConfigParams struct (all fields optional):
 * - treasury: Option<Pubkey>
 * - insurance: Option<Pubkey>
 * - trading_fee_bps: Option<u16>
 * - lp_fee_share_bps: Option<u16>
 * - treasury_fee_share_bps: Option<u16>
 * - insurance_fee_share_bps: Option<u16>
 * - per_wallet_cap_bps: Option<u16>
 * - per_side_cap_bps: Option<u16>
 * - oracle_confidence_threshold_start_bps: Option<u16>
 * - oracle_confidence_threshold_settle_bps: Option<u16>
 * - oracle_staleness_threshold_start: Option<i64>
 * - oracle_staleness_threshold_settle: Option<i64>
 * - epoch_duration_seconds: Option<i64>
 * - freeze_window_seconds: Option<i64>
 * - allow_hedging: Option<bool>
 * - paused: Option<bool>
 * - frozen: Option<bool>
 */
function buildUpdateConfigInstruction(
  adminPubkey: PublicKey,
  treasuryPubkey: PublicKey,
  insurancePubkey: PublicKey
): TransactionInstruction {
  // Build instruction data
  // Discriminator (8 bytes) + UpdateConfigParams
  // Option encoding: 0 = None, 1 = Some followed by value

  const data = Buffer.alloc(8 + 200) // Generous buffer
  let offset = 0

  // Discriminator
  UPDATE_CONFIG_DISCRIMINATOR.copy(data, offset)
  offset += 8

  // treasury: Option<Pubkey> - Some(treasuryPubkey)
  data.writeUInt8(1, offset) // Some
  offset += 1
  treasuryPubkey.toBuffer().copy(data, offset)
  offset += 32

  // insurance: Option<Pubkey> - Some(insurancePubkey)
  data.writeUInt8(1, offset) // Some
  offset += 1
  insurancePubkey.toBuffer().copy(data, offset)
  offset += 32

  // All other fields: None
  // trading_fee_bps: None
  data.writeUInt8(0, offset)
  offset += 1

  // lp_fee_share_bps: None
  data.writeUInt8(0, offset)
  offset += 1

  // treasury_fee_share_bps: None
  data.writeUInt8(0, offset)
  offset += 1

  // insurance_fee_share_bps: None
  data.writeUInt8(0, offset)
  offset += 1

  // per_wallet_cap_bps: None
  data.writeUInt8(0, offset)
  offset += 1

  // per_side_cap_bps: None
  data.writeUInt8(0, offset)
  offset += 1

  // oracle_confidence_threshold_start_bps: None
  data.writeUInt8(0, offset)
  offset += 1

  // oracle_confidence_threshold_settle_bps: None
  data.writeUInt8(0, offset)
  offset += 1

  // oracle_staleness_threshold_start: None
  data.writeUInt8(0, offset)
  offset += 1

  // oracle_staleness_threshold_settle: None
  data.writeUInt8(0, offset)
  offset += 1

  // epoch_duration_seconds: None
  data.writeUInt8(0, offset)
  offset += 1

  // freeze_window_seconds: None
  data.writeUInt8(0, offset)
  offset += 1

  // allow_hedging: None
  data.writeUInt8(0, offset)
  offset += 1

  // paused: None
  data.writeUInt8(0, offset)
  offset += 1

  // frozen: None
  data.writeUInt8(0, offset)
  offset += 1

  // max_trade_amount: None
  data.writeUInt8(0, offset)
  offset += 1

  // settlement_timeout_seconds: None
  data.writeUInt8(0, offset)
  offset += 1

  // Trim buffer to actual size
  const trimmedData = data.subarray(0, offset)

  return new TransactionInstruction({
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: false }, // admin
      { pubkey: GLOBAL_CONFIG_PDA, isSigner: false, isWritable: true }, // global_config
    ],
    programId: PROGRAM_ID,
    data: trimmedData,
  })
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Setup Treasury & Insurance Wallets')
  console.log('='.repeat(60))

  // Ensure keys directory exists
  ensureKeysDirectory()

  // Load admin wallet
  const adminWallet = loadAdminWallet()
  console.log('Admin wallet:', adminWallet.publicKey.toBase58())

  // Setup connection
  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  console.log('RPC endpoint:', FOGO_TESTNET_RPC)

  // Check admin balance
  const adminBalance = await connection.getBalance(adminWallet.publicKey)
  console.log('Admin balance:', adminBalance / LAMPORTS_PER_SOL, 'SOL')

  if (adminBalance < FUNDING_AMOUNT * 3) {
    console.error('ERROR: Insufficient admin balance for funding')
    process.exit(1)
  }

  // Step 1: Load or create keypairs
  console.log('\n--- Step 1: Load/Create Keypairs ---')
  const treasuryKeypair = loadOrCreateKeypair('treasury-wallet')
  const insuranceKeypair = loadOrCreateKeypair('insurance-wallet')

  console.log('Treasury wallet:', treasuryKeypair.publicKey.toBase58())
  console.log('Insurance wallet:', insuranceKeypair.publicKey.toBase58())

  // Step 2: Fund wallets
  console.log('\n--- Step 2: Fund Wallets ---')
  await fundWallet(
    connection,
    adminWallet,
    treasuryKeypair.publicKey,
    FUNDING_AMOUNT,
    'Treasury'
  )
  await fundWallet(
    connection,
    adminWallet,
    insuranceKeypair.publicKey,
    FUNDING_AMOUNT,
    'Insurance'
  )

  // Step 3: Create USDC ATAs
  console.log('\n--- Step 3: Create USDC ATAs ---')
  const treasuryUsdcAta = await createUsdcAta(
    connection,
    adminWallet,
    treasuryKeypair.publicKey,
    'Treasury'
  )
  const insuranceUsdcAta = await createUsdcAta(
    connection,
    adminWallet,
    insuranceKeypair.publicKey,
    'Insurance'
  )

  // Step 4: Update GlobalConfig
  console.log('\n--- Step 4: Update GlobalConfig ---')
  const updateConfigIx = buildUpdateConfigInstruction(
    adminWallet.publicKey,
    treasuryKeypair.publicKey,
    insuranceKeypair.publicKey
  )

  const tx = new Transaction().add(updateConfigIx)
  console.log('Sending update_config transaction...')

  try {
    const signature = await sendAndConfirmTransaction(connection, tx, [adminWallet])
    console.log('GlobalConfig updated:', signature)
  } catch (error: any) {
    console.error('Failed to update GlobalConfig:', error.message)
    if (error.logs) {
      console.log('\nProgram logs:')
      error.logs.forEach((log: string) => console.log('  ', log))
    }
    process.exit(1)
  }

  // Step 5: Verify
  console.log('\n--- Step 5: Verification ---')
  const treasuryBalance = await connection.getBalance(treasuryKeypair.publicKey)
  const insuranceBalance = await connection.getBalance(insuranceKeypair.publicKey)

  console.log('Treasury SOL balance:', treasuryBalance / LAMPORTS_PER_SOL, 'SOL')
  console.log('Insurance SOL balance:', insuranceBalance / LAMPORTS_PER_SOL, 'SOL')

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('SETUP COMPLETE')
  console.log('='.repeat(60))
  console.log('\nNew Wallet Addresses:')
  console.log(`  Treasury Wallet:  ${treasuryKeypair.publicKey.toBase58()}`)
  console.log(`  Insurance Wallet: ${insuranceKeypair.publicKey.toBase58()}`)
  console.log('\nUSDC ATAs:')
  console.log(`  Treasury USDC ATA:  ${treasuryUsdcAta.toBase58()}`)
  console.log(`  Insurance USDC ATA: ${insuranceUsdcAta.toBase58()}`)
  console.log('\nKeypairs saved to:')
  console.log(`  ${path.join(KEYS_DIR, 'treasury-wallet.json')}`)
  console.log(`  ${path.join(KEYS_DIR, 'insurance-wallet.json')}`)
  console.log('\n--- Update Frontend Constants ---')
  console.log('Add to web/src/lib/constants.ts:')
  console.log(`  TREASURY_WALLET = new PublicKey('${treasuryKeypair.publicKey.toBase58()}')`)
  console.log(`  TREASURY_USDC_ATA = new PublicKey('${treasuryUsdcAta.toBase58()}')`)
  console.log(`  INSURANCE_WALLET = new PublicKey('${insuranceKeypair.publicKey.toBase58()}')`)
  console.log(`  INSURANCE_USDC_ATA = new PublicKey('${insuranceUsdcAta.toBase58()}')`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
