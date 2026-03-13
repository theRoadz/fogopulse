/**
 * Check Pool Liquidity Script
 *
 * Displays pool reserves, liquidity, and CPMM probabilities for all assets.
 *
 * Run from Windows:
 *   cd D:\dev\fogopulse\anchor
 *   npx tsx scripts/check-pool-liquidity.ts
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx scripts/check-pool-liquidity.ts
 *
 * Environment (via .env file or environment variables):
 *   WALLET_PATH - Path to admin wallet keypair (default: ~/.config/solana/fogo-testnet.json)
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as os from 'os'

// Try multiple .env locations
dotenv.config({ path: path.resolve(__dirname, '../.env') })  // anchor/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') })  // project root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })  // project root .env.local

import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'

// =============================================================================
// CONSTANTS
// =============================================================================

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'
const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')
const USDC_DECIMALS = 6
const USDC_DIVISOR = 10 ** USDC_DECIMALS

const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

type Asset = keyof typeof ASSET_MINTS

const POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188])

// =============================================================================
// HELPERS
// =============================================================================

function derivePoolPda(assetMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), assetMint.toBuffer()],
    PROGRAM_ID
  )
}

function decodePool(data: Buffer): {
  assetMint: PublicKey
  yesReserves: bigint
  noReserves: bigint
  totalLpShares: bigint
  nextEpochId: bigint
  activeEpoch: PublicKey | null
  activeEpochState: number
  isPaused: boolean
  isFrozen: boolean
} {
  let offset = 8 // Skip discriminator

  const assetMint = new PublicKey(data.subarray(offset, offset + 32)); offset += 32
  const yesReserves = data.readBigUInt64LE(offset); offset += 8
  const noReserves = data.readBigUInt64LE(offset); offset += 8
  const totalLpShares = data.readBigUInt64LE(offset); offset += 8
  const nextEpochId = data.readBigUInt64LE(offset); offset += 8

  // Option<Pubkey>
  const hasActiveEpoch = data.readUInt8(offset) !== 0; offset += 1
  let activeEpoch: PublicKey | null = null
  if (hasActiveEpoch) {
    activeEpoch = new PublicKey(data.subarray(offset, offset + 32))
  }
  offset += 32

  const activeEpochState = data.readUInt8(offset); offset += 1
  offset += 2 // wallet_cap_bps
  offset += 2 // side_cap_bps
  const isPaused = data.readUInt8(offset) !== 0; offset += 1
  const isFrozen = data.readUInt8(offset) !== 0

  return {
    assetMint, yesReserves, noReserves, totalLpShares, nextEpochId,
    activeEpoch, activeEpochState, isPaused, isFrozen
  }
}

function formatUsdc(amount: bigint): string {
  const value = Number(amount) / USDC_DIVISOR
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatNumber(amount: bigint): string {
  return new Intl.NumberFormat('en-US').format(Number(amount))
}

function calculateProbabilities(yesReserves: bigint, noReserves: bigint): { pUp: number; pDown: number } {
  const total = yesReserves + noReserves
  if (total === 0n) {
    return { pUp: 50, pDown: 50 }
  }
  // CPMM formula: pUp = noReserves / total
  const pUp = Math.round(Number((noReserves * 100n) / total))
  const pDown = 100 - pUp
  return { pUp, pDown }
}

// =============================================================================
// MAIN
// =============================================================================

interface PoolInfo {
  asset: Asset
  pda: string
  yesReserves: bigint
  noReserves: bigint
  totalLiquidity: bigint
  pUp: number
  pDown: number
  ataBalance: bigint
  exists: boolean
  isPaused: boolean
  isFrozen: boolean
}

async function main() {
  console.log('='.repeat(60))
  console.log('FOGO Pulse - Pool Liquidity Check')
  console.log('='.repeat(60))
  console.log()
  console.log('RPC:', FOGO_TESTNET_RPC)
  console.log()

  const connection = new Connection(FOGO_TESTNET_RPC, 'confirmed')
  const poolInfos: PoolInfo[] = []

  for (const [asset, assetMint] of Object.entries(ASSET_MINTS) as [Asset, PublicKey][]) {
    const [poolPda] = derivePoolPda(assetMint)

    console.log(`${asset} Pool (${poolPda.toBase58()})`)
    console.log('-'.repeat(60))

    const poolAccount = await connection.getAccountInfo(poolPda)

    if (!poolAccount) {
      console.log('  Pool not found!')
      console.log()
      poolInfos.push({
        asset,
        pda: poolPda.toBase58(),
        yesReserves: 0n,
        noReserves: 0n,
        totalLiquidity: 0n,
        pUp: 50,
        pDown: 50,
        ataBalance: 0n,
        exists: false,
        isPaused: false,
        isFrozen: false,
      })
      continue
    }

    // Verify discriminator
    const discriminator = poolAccount.data.subarray(0, 8)
    if (!discriminator.equals(POOL_DISCRIMINATOR)) {
      console.log('  Invalid pool discriminator!')
      console.log()
      continue
    }

    const pool = decodePool(poolAccount.data)
    const totalLiquidity = pool.yesReserves + pool.noReserves
    const { pUp, pDown } = calculateProbabilities(pool.yesReserves, pool.noReserves)

    console.log(`  YES Reserves: ${formatNumber(pool.yesReserves)} (${formatUsdc(pool.yesReserves)})`)
    console.log(`  NO Reserves:  ${formatNumber(pool.noReserves)} (${formatUsdc(pool.noReserves)})`)
    console.log(`  Total Liquidity: ${formatUsdc(totalLiquidity)}`)
    console.log(`  Probabilities: UP ${pUp}% / DOWN ${pDown}%`)

    // Get Pool USDC ATA balance
    let ataBalance = 0n
    try {
      const poolUsdcAta = await getAssociatedTokenAddress(USDC_MINT, poolPda, true)
      const ataAccount = await getAccount(connection, poolUsdcAta)
      ataBalance = ataAccount.amount
      console.log(`  Pool ATA Balance: ${formatUsdc(ataBalance)}`)
    } catch {
      console.log(`  Pool ATA Balance: N/A (ATA not found)`)
    }

    if (pool.isPaused) console.log(`  ⚠ Pool is PAUSED`)
    if (pool.isFrozen) console.log(`  ⚠ Pool is FROZEN`)

    console.log()

    poolInfos.push({
      asset,
      pda: poolPda.toBase58(),
      yesReserves: pool.yesReserves,
      noReserves: pool.noReserves,
      totalLiquidity,
      pUp,
      pDown,
      ataBalance,
      exists: true,
      isPaused: pool.isPaused,
      isFrozen: pool.isFrozen,
    })
  }

  // Summary table
  console.log('='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  console.log()
  console.log('Asset   UP%     DOWN%   Liquidity       ATA Balance')
  console.log('-'.repeat(55))

  for (const info of poolInfos) {
    if (!info.exists) {
      console.log(`${info.asset.padEnd(7)} -       -       (not found)`)
    } else {
      const upStr = `${info.pUp}%`.padEnd(7)
      const downStr = `${info.pDown}%`.padEnd(7)
      const liqStr = formatUsdc(info.totalLiquidity).padEnd(15)
      const ataStr = formatUsdc(info.ataBalance)
      console.log(`${info.asset.padEnd(7)} ${upStr} ${downStr} ${liqStr} ${ataStr}`)
    }
  }

  console.log()
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
