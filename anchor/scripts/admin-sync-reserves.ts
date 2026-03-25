/**
 * Admin Sync Reserves — One-time script to fix reserve/token accounting mismatch
 *
 * Story 7.32: claim_payout/claim_refund didn't reduce reserves, causing drift.
 * This script calls admin_sync_reserves for each pool to reconcile reserves
 * with actual USDC token balances.
 *
 * Usage: npx tsx scripts/admin-sync-reserves.ts
 *
 * Requires: WALLET_PATH env var or ~/.config/solana/fogo-testnet.json
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const RPC_URL = 'https://testnet.fogo.io'
const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')

// Asset mints — derive pool PDAs and ATAs from these
const ASSET_MINTS: Record<string, PublicKey> = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
}

function derivePoolPda(assetMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), assetMint.toBuffer()],
    PROGRAM_ID
  )[0]
}

// GlobalConfig PDA
const [GLOBAL_CONFIG_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('global_config')],
  PROGRAM_ID
)

// admin_sync_reserves instruction discriminator
// SHA256("global:admin_sync_reserves")[0..8]
import { createHash } from 'crypto'
const disc = createHash('sha256').update('global:admin_sync_reserves').digest().subarray(0, 8)

function loadWallet(): Keypair {
  const walletPath = process.env.WALLET_PATH ||
    path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')
  const raw = fs.readFileSync(walletPath, 'utf-8')
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)))
}

async function syncPool(conn: Connection, wallet: Keypair, poolName: string) {
  const assetMint = ASSET_MINTS[poolName]
  if (!assetMint) throw new Error(`Unknown pool: ${poolName}`)
  const poolPda = derivePoolPda(assetMint)
  const poolUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, poolPda, true)

  console.log(`\n=== ${poolName} Pool ===`)
  console.log(`  Pool: ${poolPda.toBase58()}`)
  console.log(`  Pool USDC: ${poolUsdcAta.toBase58()}`)

  // Build instruction data (just the discriminator, no args)
  const data = Buffer.from(disc)

  // Build instruction
  const ix = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },   // admin
      { pubkey: GLOBAL_CONFIG_PDA, isSigner: false, isWritable: false }, // global_config
      { pubkey: poolPda, isSigner: false, isWritable: true },           // pool
      { pubkey: poolUsdcAta, isSigner: false, isWritable: false },      // pool_usdc
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },        // usdc_mint
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associated_token_program
    ],
    data,
  }

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed')

  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message()

  const tx = new VersionedTransaction(messageV0)
  tx.sign([wallet])

  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })

  const confirmation = await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed'
  )

  if (confirmation.value.err) {
    console.error(`  FAILED: ${JSON.stringify(confirmation.value.err)}`)
    return
  }

  console.log(`  TX: ${sig}`)
  console.log(`  Explorer: https://explorer.fogo.io/tx/${sig}`)
  console.log(`  SUCCESS`)
}

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed')
  const wallet = loadWallet()
  console.log(`Admin wallet: ${wallet.publicKey.toBase58()}`)

  // Sync specified pools (or all affected)
  const poolsToSync = process.argv[2] ? process.argv.slice(2) : ['BTC', 'ETH', 'SOL', 'FOGO']

  for (const poolName of poolsToSync) {
    try {
      await syncPool(conn, wallet, poolName)
    } catch (err: any) {
      console.error(`  ERROR syncing ${poolName}: ${err.message}`)
      if (err.logs) {
        console.error('  Logs:', err.logs.join('\n  '))
      }
    }
  }

  console.log('\nDone!')
}

main().catch(console.error)
