//! Process Withdrawal instruction - Complete LP withdrawal after cooldown
//!
//! This is a USER-FACING instruction that supports both:
//! - Direct wallet signatures
//! - FOGO Session accounts (for gasless UX)
//!
//! # Two-Step Withdrawal Flow
//!
//! 1. request_withdrawal (Story 5.3): Marks shares as pending, records timestamp
//! 2. process_withdrawal (THIS): After cooldown, transfers USDC and burns shares
//!
//! # Pause/Freeze Behavior
//!
//! - Paused: BLOCKED (modifies pool reserves)
//! - Frozen: BLOCKED (emergency halt)

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{USDC_MINT, WITHDRAWAL_COOLDOWN_SECONDS};
use crate::errors::FogoPulseError;
use crate::events::WithdrawalProcessed;
use crate::session::extract_user;
use crate::state::{GlobalConfig, LpShare, Pool};

/// Process Withdrawal accounts
///
/// Follows claim_payout pattern for PDA-signed token transfers.
/// Pool is mutable because reserves are reduced on withdrawal.
///
/// Uses Box<> for GlobalConfig and Pool to follow established patterns.
#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct ProcessWithdrawal<'info> {
    /// The user OR a session account representing the user.
    /// Session validation is performed via extract_user().
    #[account(mut)]
    pub signer_or_session: Signer<'info>,

    /// Global protocol configuration
    /// Used to check: paused, frozen
    /// Frozen check at constraint level (fail-fast before handler), paused in handler
    #[account(
        seeds = [b"global_config"],
        bump = config.bump,
        constraint = !config.frozen @ FogoPulseError::ProtocolFrozen,
    )]
    pub config: Box<Account<'info, GlobalConfig>>,

    /// The pool this LP position belongs to — mutable for reserve updates
    /// Frozen check at constraint level (fail-fast before handler), paused in handler
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.is_frozen @ FogoPulseError::PoolFrozen,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// LP share account — must exist (user must have deposited first)
    #[account(
        mut,
        seeds = [b"lp_share", user.as_ref(), pool.key().as_ref()],
        bump = lp_share.bump,
    )]
    pub lp_share: Account<'info, LpShare>,

    /// Pool's USDC token account (source of withdrawal)
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
    )]
    pub pool_usdc: Box<Account<'info, TokenAccount>>,

    /// User's USDC token account (withdrawal destination)
    #[account(
        mut,
        constraint = user_usdc.owner == user @ FogoPulseError::TokenOwnerMismatch,
        constraint = user_usdc.mint == USDC_MINT @ FogoPulseError::InvalidMint,
    )]
    pub user_usdc: Box<Account<'info, TokenAccount>>,

    /// USDC mint - verified against constant
    #[account(address = USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Handler for process_withdrawal instruction
///
/// # Arguments
/// * `user` - The actual user wallet pubkey (validated against session extraction)
///
/// # Flow
/// 1. Extract and validate user via FOGO Sessions
/// 2. Check protocol and pool not paused/frozen
/// 3. Validate pending withdrawal exists
/// 4. Validate cooldown elapsed
/// 5. Calculate USDC value from shares using u128 math
/// 6. Validate usdc_out > 0
/// 7. Transfer USDC from pool to user using PDA signer seeds
/// 8. Reduce reserves 50/50
/// 9. Proportionally reduce deposited_amount
/// 10. Burn shares from pool and lp_share
/// 11. Reset pending withdrawal state
/// 12. Emit WithdrawalProcessed event
pub fn handler(ctx: Context<ProcessWithdrawal>, user: Pubkey) -> Result<()> {
    // 1. Extract and validate user
    let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;
    require!(user == extracted_user, FogoPulseError::Unauthorized);

    let config = &ctx.accounts.config;

    msg!(
        "process_withdrawal: pool={}, user={}",
        ctx.accounts.pool.key(),
        user
    );

    // 2. Check protocol not paused (frozen checks are in account constraints)
    require!(!config.paused, FogoPulseError::ProtocolPaused);

    // 3. Check pool not paused (frozen checks are in account constraints)
    require!(!ctx.accounts.pool.is_paused, FogoPulseError::PoolPaused);

    // 4. Validate pending withdrawal exists
    let pending_shares = ctx.accounts.lp_share.pending_withdrawal;
    require!(pending_shares > 0, FogoPulseError::NoPendingWithdrawal);

    // 5. Validate cooldown elapsed
    let clock = Clock::get()?;
    let requested_at = ctx.accounts.lp_share.withdrawal_requested_at
        .ok_or(FogoPulseError::NoPendingWithdrawal)?;
    require!(
        clock.unix_timestamp >= requested_at + WITHDRAWAL_COOLDOWN_SECONDS,
        FogoPulseError::CooldownNotElapsed
    );

    // 6. Calculate USDC value using u128 math
    let pool_value = ctx.accounts.pool.yes_reserves
        .checked_add(ctx.accounts.pool.no_reserves)
        .ok_or(FogoPulseError::Overflow)?;

    // Guard against division by zero (pool must have shares to withdraw against)
    require!(ctx.accounts.pool.total_lp_shares > 0, FogoPulseError::PoolEmpty);

    let usdc_out = (pending_shares as u128)
        .checked_mul(pool_value as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(ctx.accounts.pool.total_lp_shares as u128)
        .ok_or(FogoPulseError::Overflow)? as u64;

    // 7. Validate usdc_out > 0
    require!(usdc_out > 0, FogoPulseError::WithdrawalTooSmall);

    // Capture values needed for deposited_amount reduction before mutable borrow
    let shares_before = ctx.accounts.lp_share.shares;
    let deposited_amount_before = ctx.accounts.lp_share.deposited_amount;

    msg!(
        "process_withdrawal: pending_shares={}, pool_value={}, usdc_out={}",
        pending_shares,
        pool_value,
        usdc_out
    );

    // 8. Transfer USDC from pool to user using PDA signer seeds
    let pool = &ctx.accounts.pool;
    let pool_seeds = &[b"pool".as_ref(), pool.asset_mint.as_ref(), &[pool.bump]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_usdc.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[pool_seeds],
        ),
        usdc_out,
    )?;

    // Now take mutable borrows for state updates
    let pool = &mut ctx.accounts.pool;
    let lp_share = &mut ctx.accounts.lp_share;

    // 9. Reduce reserves 50/50 (inverse of deposit split)
    let half_out = usdc_out / 2;
    let yes_reduction = half_out + (usdc_out % 2); // YES loses remainder (matches deposit pattern)
    let no_reduction = half_out;

    pool.yes_reserves = pool.yes_reserves
        .checked_sub(yes_reduction)
        .ok_or(FogoPulseError::InsufficientPoolReserves)?;
    pool.no_reserves = pool.no_reserves
        .checked_sub(no_reduction)
        .ok_or(FogoPulseError::InsufficientPoolReserves)?;

    // 10. Proportionally reduce deposited_amount (using pre-burn shares)
    // Guard: shares_before must be > 0 to avoid division by zero
    require!(shares_before > 0, FogoPulseError::Overflow);
    let deposited_reduction = (pending_shares as u128)
        .checked_mul(deposited_amount_before as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(shares_before as u128)
        .ok_or(FogoPulseError::Overflow)? as u64;

    lp_share.deposited_amount = lp_share.deposited_amount
        .checked_sub(deposited_reduction)
        .ok_or(FogoPulseError::Overflow)?;

    // 11. Burn shares from pool and lp_share
    pool.total_lp_shares = pool.total_lp_shares
        .checked_sub(pending_shares)
        .ok_or(FogoPulseError::Overflow)?;
    lp_share.shares = lp_share.shares
        .checked_sub(pending_shares)
        .ok_or(FogoPulseError::Overflow)?;

    // 12. Reset pending withdrawal state
    lp_share.pending_withdrawal = 0;
    lp_share.withdrawal_requested_at = None;

    msg!(
        "process_withdrawal complete: usdc_out={}, total_lp_shares={}, yes_reserves={}, no_reserves={}",
        usdc_out,
        pool.total_lp_shares,
        pool.yes_reserves,
        pool.no_reserves
    );

    // 13. Emit event
    emit!(WithdrawalProcessed {
        pool: pool.key(),
        user,
        shares_burned: pending_shares,
        usdc_amount: usdc_out,
        total_lp_shares_after: pool.total_lp_shares,
        yes_reserves_after: pool.yes_reserves,
        no_reserves_after: pool.no_reserves,
    });

    Ok(())
}
