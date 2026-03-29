/**
 * Admin Normalize LP Shares — Fix inflated LP share counts
 *
 * Story 7.37: LP shares are massively inflated (quintillions) due to
 * reserve accounting drift from Story 7.32 bug. This script normalizes
 * shares back to sane values (target: 1 share ≈ 1 USDC lamport).
 *
 * Usage: npx tsx scripts/admin-normalize-lp-shares.ts [POOL...]
 *
 * Examples:
 *   npx tsx scripts/admin-normalize-lp-shares.ts          # All pools
 *   npx tsx scripts/admin-normalize-lp-shares.ts ETH      # ETH only
 *   npx tsx scripts/admin-normalize-lp-shares.ts BTC FOGO # BTC and FOGO
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
import { createHash } from 'crypto'

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const RPC_URL = 'https://testnet.fogo.io'
const USDC_DECIMALS = 6
const USDC_DIVISOR = 10 ** USDC_DECIMALS

const ASSET_MINTS: Record<string, PublicKey> = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
}

// Pool discriminator (from IDL)
const POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188])

// LpShare account size: 8 (discriminator) + 98 (INIT_SPACE) = 106
// See: state/lp.rs LpShare struct — update if struct fields change
const LP_SHARE_ACCOUNT_SIZE = 106
// LpShare layout: [0..8] discriminator, [8..40] user, [40..72] pool
const LP_SHARE_POOL_OFFSET = 40

// Instruction discriminator
const DISC = createHash('sha256')
  .update('global:admin_normalize_lp_shares')
  .digest()
  .subarray(0, 8)

// GlobalConfig PDA
const [GLOBAL_CONFIG_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('global_config')],
  PROGRAM_ID
)

// =============================================================================
// HELPERS
// =============================================================================

function derivePoolPda(assetMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), assetMint.toBuffer()],
    PROGRAM_ID
  )[0]
}

function loadWallet(): Keypair {
  const walletPath =
    process.env.WALLET_PATH ||
    path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')
  const raw = fs.readFileSync(walletPath, 'utf-8')
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)))
}

function decodePool(data: Buffer): {
  yesReserves: bigint
  noReserves: bigint
  totalLpShares: bigint
  pendingWithdrawalShares: bigint
  hasActiveEpoch: boolean
} {
  let offset = 8 // Skip discriminator
  offset += 32 // asset_mint
  const yesReserves = data.readBigUInt64LE(offset); offset += 8
  const noReserves = data.readBigUInt64LE(offset); offset += 8
  const totalLpShares = data.readBigUInt64LE(offset); offset += 8
  const pendingWithdrawalShares = data.readBigUInt64LE(offset); offset += 8
  offset += 8 // next_epoch_id
  const hasActiveEpoch = data.readUInt8(offset) !== 0
  return { yesReserves, noReserves, totalLpShares, pendingWithdrawalShares, hasActiveEpoch }
}

function decodeLpShare(data: Buffer): {
  user: PublicKey
  pool: PublicKey
  shares: bigint
  pendingWithdrawal: bigint
} {
  let offset = 8 // Skip discriminator
  const user = new PublicKey(data.subarray(offset, offset + 32)); offset += 32
  const pool = new PublicKey(data.subarray(offset, offset + 32)); offset += 32
  const shares = data.readBigUInt64LE(offset); offset += 8
  offset += 8 // deposited_amount
  const pendingWithdrawal = data.readBigUInt64LE(offset)
  return { user, pool, shares, pendingWithdrawal }
}

function formatUsdc(lamports: bigint): string {
  return '$' + (Number(lamports) / USDC_DIVISOR).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// =============================================================================
// MAIN
// =============================================================================

async function normalizePool(
  conn: Connection,
  wallet: Keypair,
  poolName: string
) {
  const assetMint = ASSET_MINTS[poolName]
  if (!assetMint) throw new Error(`Unknown pool: ${poolName}`)
  const poolPda = derivePoolPda(assetMint)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`${poolName} Pool (${poolPda.toBase58()})`)
  console.log('='.repeat(60))

  // 1. Read pool state
  const poolAccount = await conn.getAccountInfo(poolPda)
  if (!poolAccount) {
    console.log('  Pool not found!')
    return
  }
  const pool = decodePool(poolAccount.data)

  if (pool.hasActiveEpoch) {
    console.log('  SKIPPING — active epoch exists. Settle or force-close first.')
    return
  }

  const poolValue = pool.yesReserves + pool.noReserves
  if (poolValue === 0n) {
    console.log('  SKIPPING — pool has zero reserves')
    return
  }

  // 2. Calculate divisor (target: total_lp_shares ≈ pool_value)
  const divisor = pool.totalLpShares / poolValue
  if (divisor <= 1n) {
    console.log(`  SKIPPING — shares already normalized (divisor=${divisor})`)
    return
  }

  console.log(`  Reserves: ${formatUsdc(poolValue)}`)
  console.log(`  Total LP Shares: ${pool.totalLpShares}`)
  console.log(`  Target LP Shares: ~${poolValue}`)
  console.log(`  Divisor: ${divisor}`)

  // 3. Find all LP share accounts for this pool (server-side filtered by size + pool)
  const poolLpShares = (await conn.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { dataSize: LP_SHARE_ACCOUNT_SIZE },
      { memcmp: { offset: LP_SHARE_POOL_OFFSET, bytes: poolPda.toBase58() } },
    ],
  })).map(({ pubkey, account }) => ({
    pubkey,
    ...decodeLpShare(account.data),
  }))

  console.log(`  LP Share accounts: ${poolLpShares.length}`)

  // 4. Normalize each LP share
  for (const lp of poolLpShares) {
    const newShares = lp.shares / divisor
    console.log(
      `\n  Normalizing: ${lp.pubkey.toBase58().slice(0, 12)}... (user: ${lp.user.toBase58().slice(0, 12)}...)`
    )
    console.log(`    shares: ${lp.shares} -> ${newShares}`)
    if (lp.pendingWithdrawal > 0n) {
      console.log(`    pending: ${lp.pendingWithdrawal} -> ${lp.pendingWithdrawal / divisor}`)
    }

    // Build instruction data: discriminator (8) + divisor (8)
    const data = Buffer.alloc(8 + 8)
    DISC.copy(data, 0)
    data.writeBigUInt64LE(divisor, 8)

    const ix = {
      programId: PROGRAM_ID,
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: GLOBAL_CONFIG_PDA, isSigner: false, isWritable: false },
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: lp.pubkey, isSigner: false, isWritable: true },
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
      console.error(`    FAILED: ${JSON.stringify(confirmation.value.err)}`)
      return
    }

    console.log(`    TX: ${sig}`)
    console.log(`    SUCCESS`)
  }

  // 5. Verify final state
  const poolAfter = await conn.getAccountInfo(poolPda)
  if (poolAfter) {
    const after = decodePool(poolAfter.data)
    const newPoolValue = after.yesReserves + after.noReserves
    console.log(`\n  VERIFICATION:`)
    console.log(`    Reserves (unchanged): ${formatUsdc(newPoolValue)}`)
    console.log(`    Total LP Shares: ${after.totalLpShares}`)
    console.log(`    Ratio: 1 share ≈ $${(Number(newPoolValue) / Number(after.totalLpShares) / USDC_DIVISOR).toFixed(6)}`)
  }
}

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed')
  const wallet = loadWallet()
  console.log(`Admin wallet: ${wallet.publicKey.toBase58()}`)

  const poolsToNormalize = process.argv[2]
    ? process.argv.slice(2)
    : ['BTC', 'ETH', 'SOL', 'FOGO']

  for (const poolName of poolsToNormalize) {
    try {
      await normalizePool(conn, wallet, poolName)
    } catch (err: any) {
      console.error(`  ERROR normalizing ${poolName}: ${err.message}`)
      if (err.logs) {
        console.error('  Logs:', err.logs.join('\n  '))
      }
    }
  }

  console.log('\nDone!')
}

main().catch(console.error)
