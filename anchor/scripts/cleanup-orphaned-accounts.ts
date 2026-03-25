/**
 * Cleanup Orphaned Accounts — Close old epoch + position accounts after pool reinitialize
 *
 * After reinitialize, epoch IDs reset to 0 but old epoch/position PDAs remain.
 * This script closes all orphaned epochs and their positions.
 *
 * Usage: npx tsx scripts/cleanup-orphaned-accounts.ts
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
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const RPC_URL = 'https://testnet.fogo.io'

const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

type Asset = keyof typeof ASSET_MINTS

// Read discriminators from IDL
function getDiscriminator(name: string): Buffer {
  const idlPath = path.resolve(__dirname, '../target/idl/fogopulse.json')
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'))
  const ix = idl.instructions.find((i: any) => i.name === name)
  if (!ix) throw new Error(`Instruction '${name}' not found in IDL`)
  return Buffer.from(ix.discriminator)
}

const ADMIN_CLOSE_EPOCH_DISC = getDiscriminator('admin_close_epoch')
const ADMIN_CLOSE_POSITION_DISC = getDiscriminator('admin_close_position')

// UserPosition discriminator
const POSITION_DISCRIMINATOR = Buffer.from([251, 248, 209, 245, 83, 234, 17, 27])

function loadWallet(): Keypair {
  const walletPath = process.env.WALLET_PATH ||
    path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')
  const raw = fs.readFileSync(walletPath, 'utf-8')
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)))
}

const [GLOBAL_CONFIG_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('global_config')],
  PROGRAM_ID
)

function derivePoolPda(assetMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), assetMint.toBuffer()],
    PROGRAM_ID
  )[0]
}

function deriveEpochPda(poolPda: PublicKey, epochId: bigint): PublicKey {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(epochId)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), poolPda.toBuffer(), buf],
    PROGRAM_ID
  )[0]
}

function derivePositionPda(epochPda: PublicKey, user: PublicKey, direction: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), epochPda.toBuffer(), user.toBuffer(), Buffer.from([direction])],
    PROGRAM_ID
  )[0]
}

/**
 * Find all position accounts for a given epoch by checking each known user.
 * Since getProgramAccounts may not work reliably on FOGO testnet,
 * we derive position PDAs for known users and check if they exist.
 */
async function findPositionsForEpoch(
  conn: Connection,
  epochPda: PublicKey,
  knownUsers: PublicKey[]
): Promise<{ pda: PublicKey; user: PublicKey; direction: number }[]> {
  const positions: { pda: PublicKey; user: PublicKey; direction: number }[] = []

  for (const user of knownUsers) {
    for (const direction of [0, 1]) { // Up=0, Down=1
      const pda = derivePositionPda(epochPda, user, direction)
      const info = await conn.getAccountInfo(pda)
      if (info && info.owner.equals(PROGRAM_ID)) {
        positions.push({ pda, user, direction })
      }
    }
  }

  return positions
}

/**
 * Try to find ALL position accounts using getProgramAccounts.
 * Falls back to known-user scanning if RPC doesn't support it.
 */
async function findAllPositionUsers(conn: Connection): Promise<PublicKey[]> {
  try {
    const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: Buffer.from(POSITION_DISCRIMINATOR).toString('base64'), encoding: 'base64' as any } },
      ],
      dataSlice: { offset: 8, length: 32 }, // user pubkey
    })

    const users = new Set<string>()
    for (const { account } of accounts) {
      users.add(new PublicKey(account.data.subarray(0, 32)).toBase58())
    }
    return [...users].map(u => new PublicKey(u))
  } catch {
    console.log('  getProgramAccounts failed, using known wallets only')
    return []
  }
}

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed')
  const wallet = loadWallet()
  console.log(`Admin: ${wallet.publicKey.toBase58()}`)

  // Known users (admin + trade bot wallets)
  const knownUsers: PublicKey[] = [wallet.publicKey]

  // Try to discover more users from on-chain data
  const discoveredUsers = await findAllPositionUsers(conn)
  if (discoveredUsers.length > 0) {
    console.log(`Discovered ${discoveredUsers.length} unique position holders from on-chain`)
    for (const u of discoveredUsers) {
      if (!knownUsers.some(k => k.equals(u))) {
        knownUsers.push(u)
      }
    }
  }

  // Also add trade bot wallets if they exist in the wallets dir
  const tradeBotDir = path.resolve(__dirname, '../../crank-bot/trade-bot-wallets')
  if (fs.existsSync(tradeBotDir)) {
    const files = fs.readdirSync(tradeBotDir).filter(f => f.endsWith('.json'))
    for (const f of files) {
      try {
        const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(tradeBotDir, f), 'utf8'))))
        if (!knownUsers.some(k => k.equals(kp.publicKey))) {
          knownUsers.push(kp.publicKey)
        }
      } catch {}
    }
    console.log(`Loaded ${files.length} trade bot wallets`)
  }

  console.log(`Total known users to scan: ${knownUsers.length}`)
  console.log()

  // Max epoch IDs per pool (from before reinitialize)
  // Read from pool if possible, otherwise use hardcoded max
  const MAX_EPOCH_IDS: Record<string, number> = {
    BTC: 360,
    ETH: 437,
    SOL: 435,
    FOGO: 434,
  }

  let totalEpochsClosed = 0
  let totalPositionsClosed = 0

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    const poolPda = derivePoolPda(assetMint)
    const maxEpoch = MAX_EPOCH_IDS[asset] || 500

    console.log(`=== ${asset} (${maxEpoch} epochs to scan) ===`)

    let epochsClosed = 0
    let positionsClosed = 0

    // Batch close instructions (up to 4 per transaction to stay within tx size limits)
    const BATCH_SIZE = 4
    let pendingIxs: TransactionInstruction[] = []

    async function flushBatch() {
      if (pendingIxs.length === 0) return
      const tx = new Transaction()
      for (const ix of pendingIxs) tx.add(ix)
      try {
        await sendAndConfirmTransaction(conn, tx, [wallet])
      } catch (err: any) {
        // If batch fails, retry individually
        for (const ix of pendingIxs) {
          try {
            const singleTx = new Transaction().add(ix)
            await sendAndConfirmTransaction(conn, singleTx, [wallet])
          } catch (innerErr: any) {
            console.log(`    Failed individual ix: ${innerErr.message}`)
          }
        }
      }
      pendingIxs = []
    }

    for (let id = 0; id < maxEpoch; id++) {
      const epochPda = deriveEpochPda(poolPda, BigInt(id))
      const epochInfo = await conn.getAccountInfo(epochPda)

      if (!epochInfo) continue // already closed or never existed

      // Find and close positions for this epoch
      const positions = await findPositionsForEpoch(conn, epochPda, knownUsers)

      for (const pos of positions) {
        const data = Buffer.alloc(8 + 8 + 32 + 1)
        ADMIN_CLOSE_POSITION_DISC.copy(data, 0)
        data.writeBigUInt64LE(BigInt(id), 8)
        pos.user.toBuffer().copy(data, 16)
        data.writeUInt8(pos.direction, 48)

        pendingIxs.push(new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: GLOBAL_CONFIG_PDA, isSigner: false, isWritable: false },
            { pubkey: poolPda, isSigner: false, isWritable: false },
            { pubkey: epochPda, isSigner: false, isWritable: false },
            { pubkey: pos.pda, isSigner: false, isWritable: true },
          ],
          programId: PROGRAM_ID,
          data,
        }))
        positionsClosed++
        totalPositionsClosed++

        if (pendingIxs.length >= BATCH_SIZE) await flushBatch()
      }

      // Close the epoch itself
      const data = Buffer.alloc(8 + 8)
      ADMIN_CLOSE_EPOCH_DISC.copy(data, 0)
      data.writeBigUInt64LE(BigInt(id), 8)

      pendingIxs.push(new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: GLOBAL_CONFIG_PDA, isSigner: false, isWritable: false },
          { pubkey: poolPda, isSigner: false, isWritable: false },
          { pubkey: epochPda, isSigner: false, isWritable: true },
        ],
        programId: PROGRAM_ID,
        data,
      }))
      epochsClosed++
      totalEpochsClosed++

      if (pendingIxs.length >= BATCH_SIZE) await flushBatch()

      // Progress log
      if ((epochsClosed + positionsClosed) % 50 === 0 && epochsClosed > 0) {
        console.log(`  ${asset}: Progress — ${epochsClosed} epochs, ${positionsClosed} positions closed...`)
      }
    }

    // Flush remaining
    await flushBatch()

    console.log(`  ${asset}: Done — ${epochsClosed} epochs, ${positionsClosed} positions closed`)
    console.log()
  }

  console.log(`\nTotal: ${totalEpochsClosed} epochs, ${totalPositionsClosed} positions closed`)
}

main().catch(console.error)
