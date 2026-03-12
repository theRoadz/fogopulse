//! Claim Payout instruction - User claims winnings from a settled epoch
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
//! # Full Implementation (Epic 3)
//!
//! The complete implementation will:
//! 1. Extract user pubkey via session or direct signer
//! 2. Validate passed `user` matches extracted user (prevents PDA spoofing)
//! 3. Validate epoch is Settled with outcome (Up/Down, not Refunded)
//! 4. Validate user's position direction matches outcome
//! 5. Calculate payout amount from shares
//! 6. Transfer USDC from pool to user
//! 7. Mark position as claimed
//! 8. Emit PayoutClaimed event
//!
//! # Refund Case
//!
//! If epoch.outcome == Refunded (confidence bands overlap), use claim_refund instead.
//! claim_payout only handles winning positions.

use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::session::extract_user;
use crate::state::{Epoch, GlobalConfig, Pool, UserPosition};

/// Claim Payout accounts
///
/// Note: Token accounts for USDC transfer will be added in Epic 3.
/// This skeleton establishes the session extraction pattern.
///
/// # PDA Derivation
///
/// Position PDA uses `user` (the actual wallet pubkey), NOT `signer_or_session`.
/// This ensures the same position is accessed whether user signs directly or via session.
#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct ClaimPayout<'info> {
    /// The user OR a session account representing the user.
    /// Session validation is performed via extract_user().
    /// This enables gasless claims when using FOGO Sessions.
    #[account(mut)]
    pub signer_or_session: Signer<'info>,

    /// Global protocol configuration
    #[account(
        seeds = [b"global_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The pool containing the epoch
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// The settled epoch
    /// Must be in Settled state with Up or Down outcome
    #[account(
        seeds = [b"epoch", pool.key().as_ref(), &epoch.epoch_id.to_le_bytes()],
        bump = epoch.bump,
        constraint = epoch.pool == pool.key() @ FogoPulseError::InvalidEpoch,
    )]
    pub epoch: Account<'info, Epoch>,

    /// User's position to claim - derived from USER wallet, not session
    /// Must match outcome direction and not be already claimed
    #[account(
        mut,
        seeds = [b"position", epoch.key().as_ref(), user.as_ref()],
        bump = position.bump,
        constraint = !position.claimed @ FogoPulseError::AlreadyClaimed,
    )]
    pub position: Account<'info, UserPosition>,

    pub system_program: Program<'info, System>,
}

/// Handler stub - full implementation in Epic 3
///
/// # Arguments
/// * `user` - The actual user wallet pubkey (validated against extract_user)
pub fn handler(ctx: Context<ClaimPayout>, user: Pubkey) -> Result<()> {
    // Extract user pubkey - works with both direct signers and session accounts
    // This is the core FOGO Sessions pattern for user-facing instructions
    let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;

    // CRITICAL: Validate that the passed `user` matches the extracted user
    // This prevents attackers from passing arbitrary PDAs
    require!(
        user == extracted_user,
        FogoPulseError::Unauthorized
    );

    msg!("ClaimPayout: user={}", user);

    // TODO (Epic 3): Full implementation
    // 1. Validate epoch state is Settled
    // 2. Validate outcome is Up or Down (not Refunded)
    // 3. Validate position direction matches outcome
    // 4. Calculate payout amount
    // 5. Transfer USDC from pool to user
    // 6. Mark position as claimed
    // 7. Emit PayoutClaimed event

    Err(FogoPulseError::NotImplemented.into())
}
