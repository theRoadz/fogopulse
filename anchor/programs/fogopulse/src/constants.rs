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
