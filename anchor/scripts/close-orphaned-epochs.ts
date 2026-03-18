/**
 * Close Orphaned Epochs Script
 *
 * After pool reinitialization, old epoch accounts still exist on-chain
 * (their PDAs are derived from the same pool address). This script finds
 * and closes them using admin_close_epoch, freeing the PDA addresses
 * so new epochs can be created.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/close-orphaned-epochs.ts
 *   npx tsx scripts/close-orphaned-epochs.ts --max 20   # probe up to epoch ID 20
 */

import {
  Connection,
  Keypair,
  PublicKey,
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

const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

type Asset = keyof typeof ASSET_MINTS

// =============================================================================
// HELPERS
// =============================================================================

function getDiscriminator(name: string): Buffer {
  const idlPath = path.resolve(__dirname, '../target/idl/fogopulse.json')
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'))
  const ix = idl.instructions.find((i: any) => i.name === name)
  if (!ix) {
    throw new Error(`Instruction '${name}' not found in IDL. Did you rebuild?`)
  }
  return Buffer.from(ix.discriminator)
}

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

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Close Orphaned Epochs')
  console.log('='.repeat(60))
  console.log()

  // Parse args
  const args = process.argv.slice(2)
  const maxIdx = args.indexOf('--max')
  const maxEpochId = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : 10

  const ADMIN_CLOSE_EPOCH_DISCRIMINATOR = getDiscriminator('admin_close_epoch')

  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet:', wallet.publicKey.toBase58())

  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')

  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Balance:', balance / 1e9, 'SOL')
  console.log(`Probing epoch IDs 0..${maxEpochId - 1} per pool`)
  console.log()

  const [globalConfigPda] = deriveGlobalConfigPda()

  let totalClosed = 0

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    const [poolPda] = derivePoolPda(assetMint)
    console.log(`${asset} (pool: ${poolPda.toBase58()}):`)

    // Read pool to find active epoch (so we don't close it)
    const poolAccount = await connection.getAccountInfo(poolPda)
    let activeEpochPda: PublicKey | null = null
    if (poolAccount) {
      // active_epoch is at offset: 8(disc) + 32(mint) + 8+8+8+8+8(five u64s) + 1(option tag) = 81
      const optionTag = poolAccount.data.readUInt8(80)
      if (optionTag === 1) {
        activeEpochPda = new PublicKey(poolAccount.data.subarray(81, 113))
        console.log(`  Active epoch: ${activeEpochPda.toBase58()}`)
      }
    }

    let closedForPool = 0

    for (let id = 0; id < maxEpochId; id++) {
      const epochId = BigInt(id)
      const [epochPda] = deriveEpochPda(poolPda, epochId)

      const epochAccount = await connection.getAccountInfo(epochPda)
      if (!epochAccount) {
        continue
      }

      // SAFETY: never close the pool's active epoch
      if (activeEpochPda && epochPda.equals(activeEpochPda)) {
        console.log(`  Epoch ${id}: SKIPPING (currently active epoch for this pool)`)
        continue
      }

      // Check it's owned by our program
      if (!epochAccount.owner.equals(PROGRAM_ID)) {
        console.log(`  Epoch ${id}: Skipping (owned by ${epochAccount.owner.toBase58()})`)
        continue
      }

      console.log(`  Epoch ${id}: Found (${epochAccount.data.length} bytes), closing...`)

      // Build admin_close_epoch instruction
      // Data: discriminator (8 bytes) + epoch_id (u64 LE, 8 bytes)
      const data = Buffer.alloc(16)
      ADMIN_CLOSE_EPOCH_DISCRIMINATOR.copy(data, 0)
      data.writeBigUInt64LE(epochId, 8)

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },   // admin
          { pubkey: globalConfigPda, isSigner: false, isWritable: false },   // global_config
          { pubkey: poolPda, isSigner: false, isWritable: false },           // pool
          { pubkey: epochPda, isSigner: false, isWritable: true },           // epoch
        ],
        programId: PROGRAM_ID,
        data,
      })

      try {
        const tx = new Transaction().add(ix)
        const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
        console.log(`  Epoch ${id}: Closed! TX: ${sig}`)
        closedForPool++
        totalClosed++
      } catch (err: any) {
        console.log(`  Epoch ${id}: Failed: ${err.message?.slice(0, 120)}`)
      }
    }

    if (closedForPool === 0) {
      console.log('  No orphaned epochs found')
    }
    console.log()
  }

  console.log('='.repeat(60))
  console.log(`Done! Closed ${totalClosed} orphaned epoch accounts.`)
  console.log()
  console.log('Next steps:')
  console.log('  npx tsx scripts/create-test-epoch.ts --pool BTC')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
