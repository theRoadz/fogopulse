//! Request Withdrawal instruction - LP requests withdrawal of shares from a pool
//!
//! This is a USER-FACING instruction that supports both:
//! - Direct wallet signatures
//! - FOGO Session accounts (for gasless UX)
//!
//! This is a READ-ONLY state change — no token transfers occur.
//! It only marks shares as pending withdrawal on the LpShare account.
//! The actual USDC transfer happens in process_withdrawal (Story 5.4).
//!
//! # Two-Step Withdrawal Flow
//!
//! 1. request_withdrawal (THIS): Marks shares as pending, records timestamp
//! 2. process_withdrawal (Story 5.4): After cooldown, transfers USDC and burns shares

use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::events::WithdrawalRequested;
use crate::session::extract_user;
use crate::state::{GlobalConfig, LpShare, Pool};

/// Request Withdrawal accounts
///
/// Simplified compared to deposit_liquidity — no token accounts needed
/// since this instruction only updates LpShare state (no transfers).
///
/// Uses Box<> for GlobalConfig and Pool to follow established patterns.
#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct RequestWithdrawal<'info> {
    /// The user OR a session account representing the user.
    /// Session validation is performed via extract_user().
    #[account(mut)]
    pub signer_or_session: Signer<'info>,

    /// Global protocol configuration
    /// Used to check: paused, frozen
    #[account(
        seeds = [b"global_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, GlobalConfig>>,

    /// The pool this LP position belongs to — mutable to update pending_withdrawal_shares
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// LP share account — must exist (user must have deposited first)
    /// NOT init_if_needed — requires existing deposit
    #[account(
        mut,
        seeds = [b"lp_share", user.as_ref(), pool.key().as_ref()],
        bump = lp_share.bump,
    )]
    pub lp_share: Account<'info, LpShare>,
}

/// Handler for request_withdrawal instruction
///
/// # Arguments
/// * `user` - The actual user wallet pubkey (validated against session extraction)
/// * `shares_amount` - Number of LP shares to request for withdrawal
///
/// # Flow
/// 1. Extract and validate user via FOGO Sessions
/// 2. Check protocol and pool not paused/frozen
/// 3. Validate shares_amount (> 0, <= available shares, no existing pending request)
/// 4. Set pending_withdrawal and withdrawal_requested_at
/// 5. Emit WithdrawalRequested event
pub fn handler(ctx: Context<RequestWithdrawal>, user: Pubkey, shares_amount: u64) -> Result<()> {
    // 1. Extract and validate user
    let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;
    require!(user == extracted_user, FogoPulseError::Unauthorized);

    let config = &ctx.accounts.config;
    let pool = &mut ctx.accounts.pool;
    let lp_share = &mut ctx.accounts.lp_share;

    msg!(
        "request_withdrawal: pool={}, user={}, shares_amount={}",
        pool.key(),
        user,
        shares_amount
    );

    // 2. Check protocol not paused/frozen
    require!(!config.paused, FogoPulseError::ProtocolPaused);
    require!(!config.frozen, FogoPulseError::ProtocolFrozen);

    // 3. Check pool not paused/frozen
    require!(!pool.is_paused, FogoPulseError::PoolPaused);
    require!(!pool.is_frozen, FogoPulseError::PoolFrozen);

    // 4. Validate shares_amount
    require!(shares_amount > 0, FogoPulseError::ZeroShares);
    require!(
        shares_amount <= lp_share.shares,
        FogoPulseError::InsufficientShares
    );

    // 5. Check no existing pending withdrawal
    require!(
        lp_share.pending_withdrawal == 0,
        FogoPulseError::WithdrawalAlreadyPending
    );

    // 6. Set pending withdrawal state
    let clock = Clock::get()?;
    lp_share.pending_withdrawal = shares_amount;
    lp_share.withdrawal_requested_at = Some(clock.unix_timestamp);

    // 7. Add shares to pool pending withdrawal total
    pool.pending_withdrawal_shares = pool.pending_withdrawal_shares
        .checked_add(shares_amount)
        .ok_or(FogoPulseError::Overflow)?;

    msg!(
        "request_withdrawal complete: pending_withdrawal={}, withdrawal_requested_at={}",
        lp_share.pending_withdrawal,
        clock.unix_timestamp
    );

    // 8. Emit event
    emit!(WithdrawalRequested {
        pool: pool.key(),
        user,
        shares_amount,
        total_shares: lp_share.shares,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
