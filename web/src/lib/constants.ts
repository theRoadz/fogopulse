import { PublicKey } from '@solana/web3.js'

import type { Asset } from '@/types/assets'

// =============================================================================
// FOGO TESTNET RPC
// =============================================================================

export const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'

// =============================================================================
// PROGRAM ID
// =============================================================================

export const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')

// =============================================================================
// FOGO TESTNET USDC MINT
// =============================================================================

export const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')
export const USDC_DECIMALS = 6

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

// =============================================================================
// TRADING CONSTANTS — fallback defaults from on-chain GlobalConfig
// Canonical source: GlobalConfig account fetched via useGlobalConfig() hook.
// These are used as defaults when live config is unavailable.
// =============================================================================

export const TRADING_FEE_BPS = 180 // 1.8%
export const PER_WALLET_CAP_BPS = 500 // 5%
export const PER_SIDE_CAP_BPS = 3000 // 30%
export const EPOCH_DURATION_SECONDS = 300 // 5 minutes
export const FREEZE_WINDOW_SECONDS = 15
// =============================================================================
// FEE DISTRIBUTION — fallback defaults, see GlobalConfig for canonical values
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

// =============================================================================
// INITIALIZED ACCOUNTS (Story 1.11)
// =============================================================================

export const GLOBAL_CONFIG_PDA = new PublicKey('GGUyA3vgbtNvC5oigtNc4uu8Z36MBjANPAfcZvoGjans')

export const POOL_PDAS = {
  BTC: new PublicKey('5c4wcGimy5kSW8pa6yYpCLTy8RbfeMhDMkqzShUoJh3W'),
  ETH: new PublicKey('4reapQVB2dBZKeRnA3j6siCsR5NkPzyaLexsDejE7cNY'),
  SOL: new PublicKey('KK92JDHfEujRxEfbMny3UC4AmwuUQDVqaNAtH7X2RHN'),
  FOGO: new PublicKey('AVNWyL2YE8xRNSjHfuEfhnBEmnYKrKRcrPua9WnQTUXL'),
} as const

export const POOL_USDC_ATAS = {
  BTC: new PublicKey('7secVYnHhudPDG24PYBUzxaWEzNRTHpPfoQAZwgoX5wh'),
  ETH: new PublicKey('J2wvG4ukQQ6wURzJgddSpgwjgGdZkDvVAsFifPD3t1sH'),
  SOL: new PublicKey('EGbJvFHqnMRw7P4R1nnEqeFwYBJBeFBH4kdHXyUrqQF9'),
  FOGO: new PublicKey('J1DYCptjmChQ6r7kak7oGbJFjxpqaHsQmmrKUzvopBFG'),
} as const

// =============================================================================
// ASSET METADATA (UI)
// =============================================================================

export const ASSET_METADATA: Record<
  Asset,
  {
    label: string
    color: string
    feedId: string
  }
> = {
  BTC: {
    label: 'BTC',
    color: 'text-orange-500',
    feedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  },
  ETH: {
    label: 'ETH',
    color: 'text-blue-500',
    feedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  },
  SOL: {
    label: 'SOL',
    color: 'text-purple-500',
    feedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  },
  FOGO: {
    label: 'FOGO',
    color: 'text-primary',
    feedId: '0x245f89fb8084840bd098d661a026032ee21062270003426797c9196d2d8d4e43',
  },
} as const

export const PYTH_FEED_IDS = {
  BTC_USD: ASSET_METADATA.BTC.feedId,
  ETH_USD: ASSET_METADATA.ETH.feedId,
  SOL_USD: ASSET_METADATA.SOL.feedId,
  FOGO_USD: ASSET_METADATA.FOGO.feedId,
} as const

// =============================================================================
// WITHDRAWAL CONSTANTS
// =============================================================================

export const WITHDRAWAL_COOLDOWN_SECONDS = 60

// =============================================================================
// FAUCET CONSTANTS
// =============================================================================

/**
 * Amount of USDC to mint per faucet request (display units).
 * Intentionally higher than FAUCET_BALANCE_CAP so users get a meaningful
 * amount per mint but can't accumulate indefinitely (they must spend before
 * they can mint again).
 *
 * NOTE: Both constants are server-side only — they must NOT be imported
 * in 'use client' components to avoid leaking values to the browser bundle.
 */
export const FAUCET_MINT_AMOUNT = 1000
/** Maximum USDC balance allowed to use faucet (display units, server-side only) */
export const FAUCET_BALANCE_CAP = 500

// =============================================================================
// TANSTACK QUERY KEYS
// =============================================================================

export const QUERY_KEYS = {
  epoch: (asset: Asset) => ['epoch', asset] as const,
  pool: (asset: Asset) => ['pool', asset] as const,
  lastSettledEpoch: (asset: Asset) => ['lastSettledEpoch', asset] as const,
  settlementHistory: (asset: Asset) => ['settlementHistory', asset] as const,
  positions: (userPubkey?: string) =>
    userPubkey ? (['positions', userPubkey] as const) : (['positions'] as const),
  usdcBalance: (userPubkey?: string) =>
    userPubkey ? (['usdc-balance', userPubkey] as const) : (['usdc-balance'] as const),
  tradingHistory: (userPubkey?: string, asset?: string) =>
    userPubkey ? (['tradingHistory', userPubkey, asset] as const) : (['tradingHistory'] as const),
  lpShare: (asset: Asset, userPubkey?: string) =>
    userPubkey ? (['lpShare', asset, userPubkey] as const) : (['lpShare', asset] as const),
  feedback: (filters?: Record<string, string>) => ['feedback', filters] as const,
  feedbackDetail: (id: string) => ['feedback', id] as const,
  feedbackAdminCheck: (wallet?: string) => ['feedback-admin', wallet] as const,
  poolApy: (asset: Asset) => ['poolApy', asset] as const,
  globalConfig: () => ['globalConfig'] as const,
  adminSettings: () => ['admin-settings'] as const,
} as const

// =============================================================================
// FOGO EXPLORER URL
// =============================================================================

export const FOGO_EXPLORER_TX_URL = 'https://explorer.fogo.io/tx'

// =============================================================================
// ED25519 PROGRAM AND SYSVARS
// =============================================================================

export const ED25519_PROGRAM_ID = new PublicKey('Ed25519SigVerify111111111111111111111111111')
export const SYSVAR_CLOCK = new PublicKey('SysvarC1ock11111111111111111111111111111111')
export const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111')

// =============================================================================
// CREATE_EPOCH INSTRUCTION DISCRIMINATOR (from IDL)
// =============================================================================

export const CREATE_EPOCH_DISCRIMINATOR = new Uint8Array([115, 111, 36, 230, 59, 145, 168, 27])

// =============================================================================
// PYTH LAZER FEED IDS (NUMERIC - NOT hex strings like Hermes)
// =============================================================================

export const PYTH_LAZER_FEED_IDS: Record<Asset, number> = {
  BTC: 1, // BTC/USD
  ETH: 2, // ETH/USD
  SOL: 6, // SOL/USD
  FOGO: 2923, // FOGO/USD (confirmed stable on Pyth Lazer)
}
