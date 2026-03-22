/**
 * FogoPulse Trade Bot Wallet Setup
 *
 * Generates bot wallet keypairs and funds them with SOL + USDC for trade simulation.
 * Master wallet must be the USDC mint authority on FOGO testnet.
 *
 * Usage:
 *   npx tsx setup-trade-bots.ts --count 5
 *   npx tsx setup-trade-bots.ts --count 3 --sol-per-bot 0.2 --usdc-per-bot 200
 *   npx tsx setup-trade-bots.ts --count 5 --wallets-dir ./my-wallets
 *
 * Environment:
 *   WALLET_PATH - Path to master wallet keypair (default: ~/.config/solana/fogo-testnet.json)
 *   RPC_URL - RPC URL (default: https://testnet.fogo.io)
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from '@solana/spl-token'

// Load environment variables
dotenv.config()

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_RPC_URL = 'https://testnet.fogo.io'
const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')
const USDC_DECIMALS = 6

// Defaults
const DEFAULT_COUNT = 5
const DEFAULT_SOL_PER_BOT = 0.1
const DEFAULT_USDC_PER_BOT = 100_000
const DEFAULT_WALLETS_DIR = './trade-bot-wallets'

// =============================================================================
// HELPERS
// =============================================================================

function loadWallet(walletPath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'))
  return Keypair.fromSecretKey(Uint8Array.from(secretKey))
}

function defaultWalletPath(): string {
  return path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FogoPulse Trade Bot Setup')
  console.log('='.repeat(60))
  console.log()

  // Parse CLI args
  const args = process.argv.slice(2)
  let count = DEFAULT_COUNT
  let solPerBot = DEFAULT_SOL_PER_BOT
  let usdcPerBot = DEFAULT_USDC_PER_BOT
  let walletsDir = DEFAULT_WALLETS_DIR

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10)
      if (isNaN(count) || count < 1) {
        console.error('ERROR: --count must be a positive integer')
        process.exit(1)
      }
      i++
    } else if (args[i] === '--sol-per-bot' && args[i + 1]) {
      solPerBot = parseFloat(args[i + 1])
      if (isNaN(solPerBot) || solPerBot <= 0) {
        console.error('ERROR: --sol-per-bot must be a positive number')
        process.exit(1)
      }
      i++
    } else if (args[i] === '--usdc-per-bot' && args[i + 1]) {
      usdcPerBot = parseFloat(args[i + 1])
      if (isNaN(usdcPerBot) || usdcPerBot <= 0) {
        console.error('ERROR: --usdc-per-bot must be a positive number')
        process.exit(1)
      }
      i++
    } else if (args[i] === '--wallets-dir' && args[i + 1]) {
      walletsDir = args[i + 1]
      i++
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: npx tsx setup-trade-bots.ts [options]')
      console.log()
      console.log('Options:')
      console.log('  --count N           Number of bot wallets (default: 5)')
      console.log('  --sol-per-bot X     SOL to fund each bot (default: 0.1)')
      console.log('  --usdc-per-bot Y    USDC to mint to each bot (default: 100000)')
      console.log('  --wallets-dir PATH  Directory for keypair files (default: ./trade-bot-wallets)')
      console.log('  --help, -h          Show this help')
      process.exit(0)
    }
  }

  // Load master wallet
  const walletPath = process.env.WALLET_PATH || defaultWalletPath()
  console.log('Loading master wallet from:', walletPath)
  const masterWallet = loadWallet(walletPath)
  console.log('Master wallet:', masterWallet.publicKey.toString())

  // Connect to RPC
  const rpcUrl = process.env.RPC_URL || DEFAULT_RPC_URL
  const connection = new Connection(rpcUrl, 'confirmed')
  console.log('RPC endpoint:', rpcUrl)

  // Check master wallet balance
  const masterBalance = await connection.getBalance(masterWallet.publicKey)
  const requiredSol = count * solPerBot + 0.01 // extra for tx fees
  console.log('Master SOL balance:', masterBalance / LAMPORTS_PER_SOL, 'SOL')
  console.log(`Required SOL: ~${requiredSol.toFixed(3)} SOL (${count} bots × ${solPerBot} SOL + fees)`)

  if (masterBalance < requiredSol * LAMPORTS_PER_SOL) {
    console.error(`ERROR: Insufficient SOL. Need at least ${requiredSol.toFixed(3)} SOL.`)
    process.exit(1)
  }

  // Ensure wallets directory exists
  if (!fs.existsSync(walletsDir)) {
    fs.mkdirSync(walletsDir, { recursive: true })
    console.log(`Created wallets directory: ${walletsDir}`)
  }

  console.log()
  console.log(`Setting up ${count} bot wallets in ${walletsDir}...`)
  console.log()

  const solLamports = Math.floor(solPerBot * LAMPORTS_PER_SOL)
  const usdcLamports = BigInt(Math.floor(usdcPerBot * 10 ** USDC_DECIMALS))

  // Summary table header
  const results: Array<{
    index: number
    pubkey: string
    created: boolean
    solBalance: number
    usdcBalance: number
  }> = []

  for (let i = 0; i < count; i++) {
    const keypairPath = path.join(walletsDir, `bot-${i}.json`)
    let botKeypair: Keypair
    let created = false

    // Load or generate keypair
    if (fs.existsSync(keypairPath)) {
      botKeypair = loadWallet(keypairPath)
      console.log(`[Bot-${i}] Loaded existing keypair: ${botKeypair.publicKey.toString()}`)
    } else {
      botKeypair = Keypair.generate()
      fs.writeFileSync(keypairPath, JSON.stringify(Array.from(botKeypair.secretKey)))
      created = true
      console.log(`[Bot-${i}] Generated new keypair: ${botKeypair.publicKey.toString()}`)
    }

    // Transfer SOL
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

      const transferIx = SystemProgram.transfer({
        fromPubkey: masterWallet.publicKey,
        toPubkey: botKeypair.publicKey,
        lamports: solLamports,
      })

      const messageV0 = new TransactionMessage({
        payerKey: masterWallet.publicKey,
        recentBlockhash: blockhash,
        instructions: [transferIx],
      }).compileToV0Message()

      const tx = new VersionedTransaction(messageV0)
      tx.sign([masterWallet])

      const sig = await connection.sendTransaction(tx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
      console.log(`[Bot-${i}] Transferred ${solPerBot} SOL (tx: ${sig.slice(0, 16)}...)`)
    } catch (err: any) {
      console.error(`[Bot-${i}] SOL transfer failed: ${err.message}`)
      continue
    }

    // Create USDC ATA + mint USDC
    try {
      const botUsdcAta = await getOrCreateAssociatedTokenAccount(
        connection,
        masterWallet,
        USDC_MINT,
        botKeypair.publicKey,
      )
      console.log(`[Bot-${i}] USDC ATA: ${botUsdcAta.address.toString()}`)

      await mintTo(
        connection,
        masterWallet,
        USDC_MINT,
        botUsdcAta.address,
        masterWallet, // mint authority
        usdcLamports,
      )
      console.log(`[Bot-${i}] Minted ${usdcPerBot} USDC`)

      // Read final balances
      const solBal = await connection.getBalance(botKeypair.publicKey)
      const usdcAccount = await getAccount(connection, botUsdcAta.address)
      const usdcBal = Number(usdcAccount.amount) / 10 ** USDC_DECIMALS

      results.push({
        index: i,
        pubkey: botKeypair.publicKey.toString(),
        created,
        solBalance: solBal / LAMPORTS_PER_SOL,
        usdcBalance: usdcBal,
      })
    } catch (err: any) {
      console.error(`[Bot-${i}] USDC setup failed: ${err.message}`)
    }

    console.log()
  }

  // Print summary table
  console.log('='.repeat(60))
  console.log('SETUP SUMMARY')
  console.log('='.repeat(60))
  console.log()
  console.log('Bot | Pubkey                                             | New | SOL     | USDC')
  console.log('----|----------------------------------------------------+-----+---------+---------')

  for (const r of results) {
    const pubShort = r.pubkey.slice(0, 8) + '...' + r.pubkey.slice(-6)
    const newFlag = r.created ? 'YES' : 'no '
    console.log(
      `  ${String(r.index).padStart(2)} | ${pubShort.padEnd(50)} | ${newFlag} | ${r.solBalance.toFixed(4).padStart(7)} | ${r.usdcBalance.toFixed(2).padStart(7)}`
    )
  }

  console.log()
  console.log(`Total bots configured: ${results.length}/${count}`)
  console.log(`Wallets directory: ${path.resolve(walletsDir)}`)
  console.log()
  console.log('Done! Start the trade bot with: npx tsx trade-bot.ts')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
