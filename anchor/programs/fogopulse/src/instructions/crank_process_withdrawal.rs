//! Crank Process Withdrawal instruction - Permissionless LP withdrawal processing
//!
//! ## Permissionless Design
//!
//! This instruction does NOT use FOGO Sessions because it is PERMISSIONLESS.
//! Anyone (typically a crank bot) can call this to process pending LP withdrawals
//! after epoch settlement.
//!
//! **Rationale:**
//! - The withdrawal was already authorized by the user in `request_withdrawal`
//! - USDC is sent to the user's token account, not the caller
//! - The caller's identity is irrelevant — they just pay the TX fee
//! - This enables automated withdrawal processing between epochs
//!
//! ## Similar permissionless instructions (no session needed):
//! - `create_epoch` - Anyone can trigger epoch creation
//! - `settle_epoch` - Anyone can settle an expired epoch
//! - `crank_process_withdrawal` - Anyone can process a pending withdrawal (this)
//!
//! ## User-facing variant:
//! - `process_withdrawal` - Requires user/session signature (for manual withdrawal)

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{USDC_MINT, WITHDRAWAL_COOLDOWN_SECONDS};
use crate::errors::FogoPulseError;
use crate::events::WithdrawalProcessed;
use crate::state::{GlobalConfig, LpShare, Pool};

/// Crank Process Withdrawal accounts - permissionless, no session needed
///
/// Follows settle_epoch pattern for permissionless access.
/// User is derived from lp_share.user (PDA-verified, trustworthy).
#[derive(Accounts)]
pub struct CrankProcessWithdrawal<'info> {
    /// Anyone can call - permissionless for crank bots/keepers
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Global protocol configuration
    /// Frozen check at constraint level (fail-fast before handler)
    #[account(
        seeds = [b"global_config"],
        bump = config.bump,
        constraint = !config.frozen @ FogoPulseError::ProtocolFrozen,
    )]
    pub config: Box<Account<'info, GlobalConfig>>,

    /// The pool this LP position belongs to — mutable for reserve updates
    /// Frozen check at constraint level (fail-fast before handler)
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.is_frozen @ FogoPulseError::PoolFrozen,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// LP share account — user is derived from this account's data.
    /// The `user` field is trusted because the PDA is program-owned.
    #[account(
        mut,
        seeds = [b"lp_share", lp_share.user.as_ref(), pool.key().as_ref()],
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
    /// Owner verified against lp_share.user — USDC goes to LP, not caller
    #[account(
        mut,
        constraint = user_usdc.owner == lp_share.user @ FogoPulseError::TokenOwnerMismatch,
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

/// Handler for crank_process_withdrawal instruction
///
/// Identical logic to process_withdrawal but without session extraction.
/// The user is derived from lp_share.user instead of being validated via sessions.
///
/// # Flow
/// 1. Check protocol and pool not paused
/// 2. Block during active epoch
/// 3. Validate pending withdrawal exists
/// 4. Validate cooldown elapsed
/// 5. Calculate USDC value from shares
/// 6. Transfer USDC from pool to user
/// 7. Update reserves, burn shares, reset pending state
/// 8. Emit event
pub fn handler(ctx: Context<CrankProcessWithdrawal>) -> Result<()> {
    let config = &ctx.accounts.config;
    let user = ctx.accounts.lp_share.user;

    msg!(
        "crank_process_withdrawal: pool={}, user={}",
        ctx.accounts.pool.key(),
        user
    );

    // 1. Check protocol not paused (frozen checks are in account constraints)
    require!(!config.paused, FogoPulseError::ProtocolPaused);

    // 2. Check pool not paused (frozen checks are in account constraints)
    require!(!ctx.accounts.pool.is_paused, FogoPulseError::PoolPaused);

    // 3. Block withdrawals during active epoch
    require!(
        ctx.accounts.pool.active_epoch.is_none(),
        FogoPulseError::WithdrawalBlockedDuringEpoch
    );

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
        "crank_process_withdrawal: pending_shares={}, pool_value={}, usdc_out={}",
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

    // 8b. Decrement pending withdrawal shares
    pool.pending_withdrawal_shares = pool.pending_withdrawal_shares
        .saturating_sub(pending_shares);

    // 9. Reduce reserves 50/50 (inverse of deposit split)
    let half_out = usdc_out / 2;
    let yes_reduction = half_out + (usdc_out % 2);
    let no_reduction = half_out;

    pool.yes_reserves = pool.yes_reserves
        .checked_sub(yes_reduction)
        .ok_or(FogoPulseError::InsufficientPoolReserves)?;
    pool.no_reserves = pool.no_reserves
        .checked_sub(no_reduction)
        .ok_or(FogoPulseError::InsufficientPoolReserves)?;

    // 10. Proportionally reduce deposited_amount (using pre-burn shares)
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
        "crank_process_withdrawal complete: usdc_out={}, total_lp_shares={}, yes_reserves={}, no_reserves={}",
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
