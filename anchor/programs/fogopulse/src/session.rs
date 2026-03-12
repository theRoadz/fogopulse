//! Session extraction utilities for FOGO Sessions integration.
//!
//! This module provides a wrapper around the `fogo-sessions-sdk` to support dual-signature
//! pattern: instructions can accept either a direct wallet signature OR a session account
//! that delegates on behalf of a wallet.
//!
//! # When to Use Sessions
//!
//! **User-facing instructions** (trading, claiming, LP operations):
//! - `buy_position` - Users trade with session keys for gasless UX
//! - `sell_position` - Users exit positions with session keys
//! - `claim_payout` - Users claim winnings with session keys
//! - `claim_refund` - Users claim refunds with session keys
//! - `deposit_liquidity` - LPs deposit with session keys
//! - `withdraw_liquidity` - LPs withdraw with session keys
//!
//! For these instructions, use [`extract_user`] to get the actual user pubkey
//! regardless of whether they signed directly or through a session.
//!
//! # When NOT to Use Sessions
//!
//! **Admin instructions** (configuration, emergency controls):
//! - `initialize` - Requires admin wallet direct signature
//! - `create_pool` - Requires admin wallet direct signature
//! - `update_config` - Requires admin wallet direct signature
//! - `pause_pool` - Requires admin wallet direct signature
//! - `emergency_freeze` - Requires admin wallet direct signature
//!
//! **Permissionless instructions** (anyone can call):
//! - `create_epoch` - No signature validation needed (anyone can advance epochs)
//! - `advance_epoch` - No signature validation needed (anyone can advance epochs)
//!
//! # Example Usage
//!
//! ```rust,ignore
//! use crate::session::extract_user;
//!
//! // In a user-facing instruction handler:
//! pub fn handler(ctx: Context<BuyPosition>, ...) -> Result<()> {
//!     // Extract user pubkey - works with both direct signers and session accounts
//!     let user = extract_user(&ctx.accounts.signer_or_session)?;
//!
//!     // Use `user` as the actual wallet pubkey for:
//!     // - PDA derivation (UserPosition seeds)
//!     // - Token account ownership checks
//!     // - Event emission
//!
//!     Ok(())
//! }
//! ```
//!
//! # Account Pattern for User-facing Instructions
//!
//! ```rust,ignore
//! #[derive(Accounts)]
//! pub struct BuyPosition<'info> {
//!     /// The user OR a session account representing the user.
//!     /// Session validation is performed via extract_user().
//!     #[account(mut)]
//!     pub signer_or_session: Signer<'info>,
//!
//!     // ... other accounts
//! }
//! ```

use anchor_lang::prelude::*;
use fogo_sessions_sdk::session::{is_session, Session};

use crate::errors::FogoPulseError;

/// Extracts the user's pubkey from either a direct signer or a session account.
///
/// This function enables the dual-signature pattern required for FOGO Sessions:
/// - If the account is a valid session owned by Session Manager Program:
///   Returns the delegating wallet's pubkey (the actual user)
/// - If the account is a regular signer (not a session):
///   Returns the signer's pubkey directly
/// - If the account is an expired/invalid session:
///   Returns an error
///
/// # Arguments
///
/// * `signer_or_session` - Account info that is either a direct wallet signer
///   or a session account created by FOGO Session Manager
///
/// # Returns
///
/// * `Ok(Pubkey)` - The actual user's wallet pubkey
/// * `Err` - If session is invalid, expired, or not authorized for this program
///
/// # Example
///
/// ```rust,ignore
/// let user = extract_user(&ctx.accounts.signer_or_session)?;
/// // `user` is now the actual wallet pubkey, regardless of signature method
/// ```
pub fn extract_user(signer_or_session: &AccountInfo) -> Result<Pubkey> {
    Session::extract_user_from_signer_or_session(signer_or_session, &crate::ID)
        .map_err(|e| {
            msg!("Session extraction failed: {:?}", e);
            FogoPulseError::SessionExtractionFailed.into()
        })
}

/// Checks if the given account is a FOGO session account.
///
/// Use this when you need to handle session vs direct signer differently,
/// such as for token transfers that require program_signer PDA when using sessions.
///
/// # Arguments
///
/// * `account` - The account to check
///
/// # Returns
///
/// * `true` - Account is a valid session account
/// * `false` - Account is a regular signer
///
/// # Example
///
/// ```rust,ignore
/// use crate::session::check_is_session;
///
/// if check_is_session(&ctx.accounts.signer_or_session) {
///     // Use program_signer PDA for token transfer CPI
/// } else {
///     // Use direct signer for token transfer
/// }
/// ```
pub fn check_is_session(account: &AccountInfo) -> bool {
    is_session(account)
}
