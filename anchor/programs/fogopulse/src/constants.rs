//! FOGO-specific constants for Pyth Lazer integration
//!
//! CRITICAL: FOGO uses Ed25519 verification, NOT ECDSA.
//! FOGO's Pyth storage has zero ECDSA signers registered.

use anchor_lang::prelude::*;

/// FOGO Pyth Lazer Program ID
/// Address: pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt
pub const PYTH_PROGRAM_ID: Pubkey = pubkey!("pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt");

/// FOGO Pyth Lazer Storage Account
/// Contains the registered Ed25519 signers for FOGO
/// Address: 3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL
pub const PYTH_STORAGE_ID: Pubkey = pubkey!("3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL");

/// FOGO Pyth Lazer Treasury Account
/// Receives verification fees
/// Address: upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr
pub const PYTH_TREASURY_ID: Pubkey = pubkey!("upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr");

/// USDC Mint (FOGO Testnet)
/// This is the canonical USDC token on FOGO testnet
/// Address: 6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy
pub const USDC_MINT: Pubkey = pubkey!("6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy");

/// Minimum trade amount in USDC lamports (6 decimals)
/// 100_000 = $0.10 USDC - prevents dust position spam
pub const MIN_TRADE_AMOUNT: u64 = 100_000;
