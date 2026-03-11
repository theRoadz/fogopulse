import { PublicKey } from '@solana/web3.js'

// =============================================================================
// PROGRAM ID
// =============================================================================

export const PROGRAM_ID = new PublicKey('Ht3NLQDkJG4BLgsnUnyuWD2393wULyP5nEXx8AyXhiGr')

// =============================================================================
// FOGO TESTNET USDC MINT
// =============================================================================

export const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')

// =============================================================================
// PYTH LAZER ADDRESSES (FOGO TESTNET)
// =============================================================================

export const PYTH_LAZER_PROGRAM = new PublicKey('pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt')
export const PYTH_LAZER_STORAGE = new PublicKey('3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL')
export const PYTH_LAZER_TREASURY = new PublicKey('upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr')

// =============================================================================
// ASSET MINTS (FOR PDA DERIVATION)
// =============================================================================

export const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

export type Asset = keyof typeof ASSET_MINTS

// =============================================================================
// TRADING CONSTANTS (FROM GLOBALCONFIG)
// =============================================================================

export const TRADING_FEE_BPS = 180 // 1.8%
export const PER_WALLET_CAP_BPS = 500 // 5%
export const PER_SIDE_CAP_BPS = 3000 // 30%
export const EPOCH_DURATION_SECONDS = 300 // 5 minutes
export const FREEZE_WINDOW_SECONDS = 15

// =============================================================================
// FEE DISTRIBUTION
// =============================================================================

export const LP_FEE_SHARE_BPS = 7000 // 70%
export const TREASURY_FEE_SHARE_BPS = 2000 // 20%
export const INSURANCE_FEE_SHARE_BPS = 1000 // 10%

// =============================================================================
// PDA SEEDS
// =============================================================================

export const SEEDS = {
  GLOBAL_CONFIG: Buffer.from('global_config'),
  POOL: Buffer.from('pool'),
  EPOCH: Buffer.from('epoch'),
  POSITION: Buffer.from('position'),
  LP_SHARE: Buffer.from('lp_share'),
} as const
