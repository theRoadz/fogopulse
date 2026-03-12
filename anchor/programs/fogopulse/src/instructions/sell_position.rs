//! Sell Position instruction - User closes or reduces a position before epoch settlement
//!
//! This is a USER-FACING instruction that supports both:
//! - Direct wallet signatures
//! - FOGO Session accounts (for gasless UX)
//!
//! Use `session::extract_user()` to get the actual user pubkey.
//!
//! # FOGO Sessions PDA Pattern
//!
//! Position PDAs must be derived from the USER's wallet pubkey, not the session account.
//! Since PDA seeds are evaluated before the handler runs, we pass the `user` pubkey as
//! an instruction argument and validate it matches `extract_user()` in the handler.
//!
//! ```text
//! PDA seeds: ["position", epoch, user_wallet]  // NOT signer_or_session
//! ```
//!
//! # Full Implementation (Epic 4)
//!
//! The complete implementation will:
//! 1. Extract user pubkey via session or direct signer
//! 2. Validate passed `user` matches extracted user (prevents PDA spoofing)
//! 3. Validate epoch is Open (not Frozen/Settled)
//! 4. Check pool is not paused/frozen
//! 5. Validate user has position with sufficient shares
//! 6. Calculate CPMM refund amount
//! 7. Transfer USDC from pool to user
//! 8. Update/close UserPosition account
//! 9. Emit TradeExecuted event

use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::session::extract_user;
use crate::state::{Epoch, GlobalConfig, Pool, UserPosition};

/// Sell Position accounts
///
/// Note: Token accounts for USDC transfer will be added in Epic 4.
/// This skeleton establishes the session extraction pattern.
///
/// # PDA Derivation
///
/// Position PDA uses `user` (the actual wallet pubkey), NOT `signer_or_session`.
/// This ensures the same position is accessed whether user signs directly or via session.
#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct SellPosition<'info> {
    /// The user OR a session account representing the user.
    /// Session validation is performed via extract_user().
    /// This enables gasless trading when using FOGO Sessions.
    #[account(mut)]
    pub signer_or_session: Signer<'info>,

    /// Global protocol configuration
    /// Used to check: paused, frozen
    #[account(
        seeds = [b"global_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The pool being traded
    /// Used to check: paused, frozen, reserves
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// The epoch being traded in
    /// Must be in Open state
    #[account(
        mut,
        seeds = [b"epoch", pool.key().as_ref(), &epoch.epoch_id.to_le_bytes()],
        bump = epoch.bump,
        constraint = epoch.pool == pool.key() @ FogoPulseError::InvalidEpoch,
    )]
    pub epoch: Account<'info, Epoch>,

    /// User's existing position - derived from USER wallet, not session
    /// Must have shares to sell
    #[account(
        mut,
        seeds = [b"position", epoch.key().as_ref(), user.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, UserPosition>,

    pub system_program: Program<'info, System>,
}

/// Handler stub - full implementation in Epic 4
///
/// # Arguments
/// * `user` - The actual user wallet pubkey (validated against extract_user)
/// * `shares` - Number of shares to sell (use position.shares for full exit)
pub fn handler(ctx: Context<SellPosition>, user: Pubkey, _shares: u64) -> Result<()> {
    // Extract user pubkey - works with both direct signers and session accounts
    // This is the core FOGO Sessions pattern for user-facing instructions
    let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;

    // CRITICAL: Validate that the passed `user` matches the extracted user
    // This prevents attackers from passing arbitrary PDAs
    require!(
        user == extracted_user,
        FogoPulseError::Unauthorized
    );

    msg!("SellPosition: user={}", user);

    // TODO (Epic 4): Full implementation
    // 1. Validate epoch state is Open
    // 2. Check protocol and pool are not paused/frozen
    // 3. Validate position has sufficient shares
    // 4. Calculate CPMM refund amount
    // 5. Transfer USDC from pool to user
    // 6. Update/close UserPosition
    // 7. Emit TradeExecuted event

    Err(FogoPulseError::NotImplemented.into())
}
