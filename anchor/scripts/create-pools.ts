/**
 * Create Pools Script
 *
 * Creates BTC, ETH, SOL, and FOGO pool accounts on FOGO testnet,
 * along with their USDC Associated Token Accounts.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/create-pools.ts
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

// Create pool instruction discriminator (from IDL)
const CREATE_POOL_DISCRIMINATOR = Buffer.from([233, 146, 209, 142, 207, 104, 64, 188])

// Asset mints for pool derivation
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

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Create Pools')
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

  // Derive GlobalConfig PDA and verify it exists
  const [globalConfigPda] = deriveGlobalConfigPda()
  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())

  const globalConfigAccount = await connection.getAccountInfo(globalConfigPda)
  if (!globalConfigAccount) {
    console.error('ERROR: GlobalConfig not initialized. Run initialize-protocol.ts first.')
    process.exit(1)
  }
  console.log('GlobalConfig exists: YES')

  console.log()
  console.log('Creating pools for assets: BTC, ETH, SOL, FOGO')
  console.log('-'.repeat(60))

  const poolResults: {
    asset: Asset
    poolPda: PublicKey
    poolUsdcAta: PublicKey
    poolCreated: boolean
    ataCreated: boolean
    poolTxSig?: string
    ataTxSig?: string
  }[] = []

  // Process each asset
  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    console.log()
    console.log(`Processing ${asset}...`)

    // Derive Pool PDA
    const [poolPda, poolBump] = derivePoolPda(assetMint)
    console.log(`  Pool PDA: ${poolPda.toBase58()}`)
    console.log(`  Pool bump: ${poolBump}`)

    // Derive Pool USDC ATA
    const poolUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      poolPda,
      true // allowOwnerOffCurve = true (REQUIRED for PDA owners)
    )
    console.log(`  Pool USDC ATA: ${poolUsdcAta.toBase58()}`)

    const result: typeof poolResults[0] = {
      asset,
      poolPda,
      poolUsdcAta,
      poolCreated: false,
      ataCreated: false,
    }

    // Check if pool already exists
    const existingPool = await connection.getAccountInfo(poolPda)
    if (existingPool) {
      console.log(`  Pool already exists, skipping creation`)
      result.poolCreated = true
    } else {
      // Create pool using raw instruction
      console.log(`  Creating pool...`)
      try {
        // create_pool has no args, just the discriminator
        const data = CREATE_POOL_DISCRIMINATOR

        const instruction = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // admin
            { pubkey: globalConfigPda, isSigner: false, isWritable: false }, // global_config
            { pubkey: assetMint, isSigner: false, isWritable: false },       // asset_mint
            { pubkey: poolPda, isSigner: false, isWritable: true },          // pool
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          ],
          programId: PROGRAM_ID,
          data,
        })

        const tx = new Transaction().add(instruction)
        const signature = await sendAndConfirmTransaction(connection, tx, [wallet])

        console.log(`  Pool created! TX: ${signature}`)
        result.poolCreated = true
        result.poolTxSig = signature
      } catch (error: any) {
        console.error(`  Failed to create pool: ${error.message}`)
        poolResults.push(result)
        continue
      }
    }

    // Check if USDC ATA already exists
    const existingAta = await connection.getAccountInfo(poolUsdcAta)
    if (existingAta) {
      console.log(`  USDC ATA already exists, skipping creation`)
      result.ataCreated = true
    } else {
      // Create USDC ATA for pool
      console.log(`  Creating USDC ATA...`)
      try {
        const tx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,  // payer
            poolUsdcAta,       // associatedToken
            poolPda,           // owner (the pool PDA)
            USDC_MINT          // mint
          )
        )

        const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
        console.log(`  USDC ATA created! TX: ${sig}`)
        result.ataCreated = true
        result.ataTxSig = sig
      } catch (error: any) {
        console.error(`  Failed to create USDC ATA: ${error.message}`)
      }
    }

    poolResults.push(result)
  }

  // Summary
  console.log()
  console.log('='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  console.log()

  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())
  console.log('USDC Mint:', USDC_MINT.toBase58())
  console.log()

  for (const result of poolResults) {
    console.log(`${result.asset}:`)
    console.log(`  Asset Mint:     ${ASSET_MINTS[result.asset].toBase58()}`)
    console.log(`  Pool PDA:       ${result.poolPda.toBase58()}`)
    console.log(`  Pool USDC ATA:  ${result.poolUsdcAta.toBase58()}`)
    console.log(`  Pool Created:   ${result.poolCreated ? 'YES' : 'FAILED'}`)
    console.log(`  ATA Created:    ${result.ataCreated ? 'YES' : 'FAILED'}`)
    if (result.poolTxSig) {
      console.log(`  Pool TX:        ${result.poolTxSig}`)
    }
    if (result.ataTxSig) {
      console.log(`  ATA TX:         ${result.ataTxSig}`)
    }
    console.log()
  }

  // Check for failures
  const poolFailures = poolResults.filter(r => !r.poolCreated)
  const ataFailures = poolResults.filter(r => !r.ataCreated)

  if (poolFailures.length > 0 || ataFailures.length > 0) {
    console.log('WARNINGS:')
    if (poolFailures.length > 0) {
      console.log(`  ${poolFailures.length} pool(s) failed to create:`, poolFailures.map(r => r.asset).join(', '))
    }
    if (ataFailures.length > 0) {
      console.log(`  ${ataFailures.length} ATA(s) failed to create:`, ataFailures.map(r => r.asset).join(', '))
    }
    console.log()
  }

  console.log('Next steps:')
  console.log('  1. Run verify-protocol.ts to confirm all accounts')
  console.log('  2. Update web/src/lib/constants.ts with addresses')
  console.log('  3. Update docs/fogo-testnet-setup.md with addresses')
  console.log()
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
