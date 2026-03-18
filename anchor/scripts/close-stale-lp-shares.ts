/**
 * Close Stale LpShare Accounts Script
 *
 * Finds and closes all LpShare accounts for a given pool using admin_close_lp_share.
 * Used after pool reinitialization when old LpShare accounts are orphaned.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/close-stale-lp-shares.ts
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

// LpShare account discriminator (from IDL)
const LP_SHARE_DISCRIMINATOR = Buffer.from([137, 210, 47, 236, 167, 57, 72, 145])

function getDiscriminator(name: string): Buffer {
  const idlPath = path.resolve(__dirname, '../target/idl/fogopulse.json')
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'))
  const ix = idl.instructions.find((i: any) => i.name === name)
  if (!ix) {
    throw new Error(`Instruction '${name}' not found in IDL. Did you rebuild?`)
  }
  return Buffer.from(ix.discriminator)
}

const ADMIN_CLOSE_LP_SHARE_DISCRIMINATOR = getDiscriminator('admin_close_lp_share')

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

interface LpShareInfo {
  pubkey: PublicKey
  user: PublicKey
  pool: PublicKey
  shares: bigint
}

async function findLpSharesForPool(
  connection: Connection,
  poolPda: PublicKey
): Promise<LpShareInfo[]> {
  // LpShare layout after 8-byte discriminator:
  //   user: Pubkey (32 bytes) at offset 8
  //   pool: Pubkey (32 bytes) at offset 40
  //   shares: u64 (8 bytes) at offset 72
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: LP_SHARE_DISCRIMINATOR.toString('base64'), encoding: 'base64' } },
      { memcmp: { offset: 40, bytes: poolPda.toBase58() } },
    ],
  })

  return accounts.map(({ pubkey, account }) => {
    const data = account.data
    const user = new PublicKey(data.subarray(8, 40))
    const pool = new PublicKey(data.subarray(40, 72))
    const shares = data.readBigUInt64LE(72)
    return { pubkey, user, pool, shares }
  })
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Close Stale LpShare Accounts')
  console.log('='.repeat(60))
  console.log()

  const wallet = loadWallet()
  console.log('Wallet:', wallet.publicKey.toBase58())

  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')

  const [globalConfigPda] = deriveGlobalConfigPda()
  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())
  console.log()

  let totalClosed = 0

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    const [poolPda] = derivePoolPda(assetMint)
    console.log(`${asset} Pool: ${poolPda.toBase58()}`)

    const lpShares = await findLpSharesForPool(connection, poolPda)

    if (lpShares.length === 0) {
      console.log(`  No LpShare accounts found`)
      console.log()
      continue
    }

    console.log(`  Found ${lpShares.length} LpShare account(s):`)

    for (const lp of lpShares) {
      console.log(`  - User: ${lp.user.toBase58().slice(0, 12)}... | Shares: ${lp.shares} | PDA: ${lp.pubkey.toBase58().slice(0, 12)}...`)

      try {
        // Build admin_close_lp_share instruction
        // Args: user (Pubkey)
        const data = Buffer.alloc(8 + 32)
        ADMIN_CLOSE_LP_SHARE_DISCRIMINATOR.copy(data, 0)
        lp.user.toBuffer().copy(data, 8)

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // admin
            { pubkey: globalConfigPda, isSigner: false, isWritable: false }, // global_config
            { pubkey: poolPda, isSigner: false, isWritable: false },         // pool
            { pubkey: lp.pubkey, isSigner: false, isWritable: true },        // lp_share
          ],
          programId: PROGRAM_ID,
          data,
        })

        const tx = new Transaction().add(ix)
        const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
        console.log(`    Closed! TX: ${sig}`)
        totalClosed++
      } catch (error: any) {
        console.error(`    Failed: ${error.message}`)
        if (error.logs) {
          error.logs.forEach((l: string) => console.log(`      ${l}`))
        }
      }
    }

    console.log()
  }

  console.log('='.repeat(60))
  console.log(`Total LpShare accounts closed: ${totalClosed}`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
