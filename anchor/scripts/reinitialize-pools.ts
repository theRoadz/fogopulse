/**
 * Reinitialize Pools Script
 *
 * Closes existing pool accounts (to handle struct size changes) and recreates them.
 * Also recreates pool USDC ATAs if needed.
 *
 * Steps:
 * 1. Close all existing pool accounts using admin_close_pool
 * 2. Recreate pools using create_pool
 * 3. Recreate pool USDC ATAs if they don't exist
 *
 * Note: Initial liquidity should be deposited via the UI using deposit_liquidity.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/reinitialize-pools.ts
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
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
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

// Instruction discriminators (read from generated IDL)
const ADMIN_CLOSE_POOL_DISCRIMINATOR = getDiscriminator('admin_close_pool')
const ADMIN_CLOSE_EPOCH_DISCRIMINATOR = getDiscriminator('admin_close_epoch')
const ADMIN_CLOSE_LP_SHARE_DISCRIMINATOR = getDiscriminator('admin_close_lp_share')
const CREATE_POOL_DISCRIMINATOR = getDiscriminator('create_pool')

// LpShare account discriminator (from IDL)
const LP_SHARE_DISCRIMINATOR = Buffer.from([137, 210, 47, 236, 167, 57, 72, 145])

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
  // Read from the generated IDL
  const idlPath = path.resolve(__dirname, '../target/idl/fogopulse.json')
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'))
  const ix = idl.instructions.find((i: any) => i.name === name.replace('global:', ''))
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
  const epochIdBuf = Buffer.alloc(8)
  epochIdBuf.writeBigUInt64LE(epochId)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), poolPda.toBuffer(), epochIdBuf],
    PROGRAM_ID
  )
}

/**
 * Read next_epoch_id from a pool account's raw data.
 * Pool layout after 8-byte discriminator:
 *   asset_mint (32) + yes_reserves (8) + no_reserves (8) + total_lp_shares (8) + pending_withdrawal_shares (8) + next_epoch_id (8)
 */
function readNextEpochId(data: Buffer): bigint {
  // offset: 8 (disc) + 32 (asset_mint) + 8 + 8 + 8 + 8 = 72
  return data.readBigUInt64LE(72)
}

interface LpShareInfo {
  pubkey: PublicKey
  user: PublicKey
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
    const shares = data.readBigUInt64LE(72)
    return { pubkey, user, shares }
  })
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Reinitialize Pools')
  console.log('='.repeat(60))
  console.log()

  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet:', wallet.publicKey.toBase58())

  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')

  const balance = await connection.getBalance(wallet.publicKey)
  console.log('Balance:', balance / 1e9, 'SOL')

  if (balance < 0.01 * 1e9) {
    console.error('ERROR: Insufficient SOL balance.')
    process.exit(1)
  }

  const [globalConfigPda] = deriveGlobalConfigPda()
  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())

  const globalConfigAccount = await connection.getAccountInfo(globalConfigPda)
  if (!globalConfigAccount) {
    console.error('ERROR: GlobalConfig not initialized. Run initialize-protocol.ts first.')
    process.exit(1)
  }

  console.log()

  // Step 0: Close orphaned epoch accounts (MUST happen before pool close)
  // After reinitialize, next_epoch_id resets to 0. If old epoch PDAs still exist,
  // create_epoch will fail with "account already in use" for epoch IDs 0..N.
  console.log('Step 0: Closing orphaned epoch accounts...')
  console.log('-'.repeat(40))

  let totalEpochsClosed = 0

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    const [poolPda] = derivePoolPda(assetMint)
    const poolAccount = await connection.getAccountInfo(poolPda)

    if (!poolAccount) {
      console.log(`  ${asset}: No pool account, skipping epoch cleanup`)
      continue
    }

    const nextEpochId = readNextEpochId(poolAccount.data)
    if (nextEpochId === 0n) {
      console.log(`  ${asset}: next_epoch_id=0, no epochs to close`)
      continue
    }

    console.log(`  ${asset}: Closing ${nextEpochId} epoch(s) (0..${nextEpochId - 1n})...`)

    let closed = 0
    let skipped = 0
    for (let id = 0n; id < nextEpochId; id++) {
      const [epochPda] = deriveEpochPda(poolPda, id)
      const epochAccount = await connection.getAccountInfo(epochPda)

      if (!epochAccount) {
        skipped++
        continue
      }

      try {
        const data = Buffer.alloc(8 + 8)
        ADMIN_CLOSE_EPOCH_DISCRIMINATOR.copy(data, 0)
        data.writeBigUInt64LE(id, 8)

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // admin
            { pubkey: globalConfigPda, isSigner: false, isWritable: false }, // global_config
            { pubkey: poolPda, isSigner: false, isWritable: false },         // pool
            { pubkey: epochPda, isSigner: false, isWritable: true },         // epoch
          ],
          programId: PROGRAM_ID,
          data,
        })

        const tx = new Transaction().add(ix)
        const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
        closed++
        totalEpochsClosed++

        // Log progress every 50 epochs
        if (closed % 50 === 0) {
          console.log(`    ${asset}: Closed ${closed} epochs so far... (last TX: ${sig.slice(0, 20)}...)`)
        }
      } catch (error: any) {
        console.error(`    ${asset}: Failed to close epoch ${id}: ${error.message}`)
      }
    }

    console.log(`  ${asset}: Closed ${closed} epochs, ${skipped} already gone`)
  }

  console.log(`  Total epoch accounts closed: ${totalEpochsClosed}`)
  console.log()

  // Step 1: Close existing pool accounts
  console.log('Step 1: Closing existing pool accounts...')
  console.log('-'.repeat(40))

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    const [poolPda] = derivePoolPda(assetMint)
    const poolAccount = await connection.getAccountInfo(poolPda)

    if (!poolAccount) {
      console.log(`  ${asset}: No existing pool account, skipping close`)
      continue
    }

    console.log(`  ${asset}: Closing pool (${poolAccount.data.length} bytes)...`)

    try {
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // admin
          { pubkey: globalConfigPda, isSigner: false, isWritable: false }, // global_config
          { pubkey: poolPda, isSigner: false, isWritable: true },          // pool
          { pubkey: assetMint, isSigner: false, isWritable: false },       // asset_mint
        ],
        programId: PROGRAM_ID,
        data: ADMIN_CLOSE_POOL_DISCRIMINATOR,
      })

      const tx = new Transaction().add(ix)
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
      console.log(`  ${asset}: Closed! TX: ${sig}`)
    } catch (error: any) {
      console.error(`  ${asset}: Failed to close: ${error.message}`)
      // If pool is the wrong size, Anchor constraints may fail.
      // Log the full error for debugging.
      if (error.logs) {
        error.logs.forEach((l: string) => console.log(`    ${l}`))
      }
    }
  }

  // Step 1.5: Close stale LpShare accounts
  console.log()
  console.log('Step 1.5: Closing stale LpShare accounts...')
  console.log('-'.repeat(40))

  let totalLpSharesClosed = 0

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    const [poolPda] = derivePoolPda(assetMint)
    const lpShares = await findLpSharesForPool(connection, poolPda)

    if (lpShares.length === 0) {
      console.log(`  ${asset}: No LpShare accounts found`)
      continue
    }

    console.log(`  ${asset}: Found ${lpShares.length} LpShare account(s)`)

    for (const lp of lpShares) {
      try {
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
        console.log(`    Closed LP for ${lp.user.toBase58().slice(0, 12)}... (${lp.shares} shares) TX: ${sig}`)
        totalLpSharesClosed++
      } catch (error: any) {
        console.error(`    Failed to close LP for ${lp.user.toBase58().slice(0, 12)}...: ${error.message}`)
      }
    }
  }

  console.log(`  Total LpShare accounts closed: ${totalLpSharesClosed}`)

  // Small delay to ensure accounts are confirmed closed
  console.log()
  console.log('Waiting 2 seconds for confirmation...')
  await new Promise(r => setTimeout(r, 2000))

  // Step 2: Recreate pool accounts
  console.log()
  console.log('Step 2: Creating new pool accounts...')
  console.log('-'.repeat(40))

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    const [poolPda] = derivePoolPda(assetMint)
    const existingPool = await connection.getAccountInfo(poolPda)

    if (existingPool) {
      console.log(`  ${asset}: Pool already exists (${existingPool.data.length} bytes), skipping`)
      continue
    }

    console.log(`  ${asset}: Creating pool...`)

    try {
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: globalConfigPda, isSigner: false, isWritable: false },
          { pubkey: assetMint, isSigner: false, isWritable: false },
          { pubkey: poolPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: CREATE_POOL_DISCRIMINATOR,
      })

      const tx = new Transaction().add(ix)
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
      console.log(`  ${asset}: Created! TX: ${sig}`)
    } catch (error: any) {
      console.error(`  ${asset}: Failed: ${error.message}`)
    }
  }

  // Step 3: Ensure USDC ATAs exist
  console.log()
  console.log('Step 3: Ensuring pool USDC ATAs exist...')
  console.log('-'.repeat(40))

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    const [poolPda] = derivePoolPda(assetMint)
    const poolUsdcAta = await getAssociatedTokenAddress(USDC_MINT, poolPda, true)

    const existingAta = await connection.getAccountInfo(poolUsdcAta)
    if (existingAta) {
      console.log(`  ${asset}: USDC ATA exists`)
      continue
    }

    console.log(`  ${asset}: Creating USDC ATA...`)

    try {
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          poolUsdcAta,
          poolPda,
          USDC_MINT
        )
      )

      const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
      console.log(`  ${asset}: USDC ATA created! TX: ${sig}`)
    } catch (error: any) {
      console.error(`  ${asset}: Failed: ${error.message}`)
    }
  }

  // Summary
  console.log()
  console.log('='.repeat(60))
  console.log('VERIFICATION')
  console.log('='.repeat(60))
  console.log()

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    const [poolPda] = derivePoolPda(assetMint)
    const poolAccount = await connection.getAccountInfo(poolPda)
    const poolUsdcAta = await getAssociatedTokenAddress(USDC_MINT, poolPda, true)
    const ataAccount = await connection.getAccountInfo(poolUsdcAta)

    console.log(`${asset}:`)
    console.log(`  Pool PDA:  ${poolPda.toBase58()}`)
    console.log(`  Pool size: ${poolAccount ? poolAccount.data.length + ' bytes' : 'NOT FOUND'}`)
    console.log(`  USDC ATA:  ${poolUsdcAta.toBase58()}`)
    console.log(`  ATA:       ${ataAccount ? 'EXISTS' : 'NOT FOUND'}`)
    console.log()
  }

  console.log('Done! Next steps:')
  console.log('  1. Copy IDL: cp target/idl/fogopulse.json ../web/src/lib/fogopulse.json')
  console.log('  2. Run verify-protocol.ts to confirm')
  console.log('  3. Deposit initial liquidity via UI using deposit_liquidity')
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
