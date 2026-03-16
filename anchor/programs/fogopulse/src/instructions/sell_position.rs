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
//! # Inverse CPMM Formula
//!
//! Sell uses the inverse of the buy formula:
//! - Buy:  shares = amount * opposite_reserves / same_reserves
//! - Sell: refund = shares * same_reserves / opposite_reserves
//!
//! # Pool PDA as Token Transfer Authority
//!
//! Unlike buy (where user is authority), sell transfers FROM pool TO user,
//! requiring pool PDA as signer via `CpiContext::new_with_signer`.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::USDC_MINT;
use crate::errors::FogoPulseError;
use crate::events::{FeesCollected, PositionSold};
use crate::session::extract_user;
use crate::state::{Direction, Epoch, EpochState, GlobalConfig, Pool, UserPosition};
use crate::utils::calculate_fee_split;

/// Sell Position accounts
///
/// Uses `CpiContext::new_with_signer` with pool PDA seeds for all token transfers
/// (pool → user, pool → treasury, pool → insurance).
///
/// CRITICAL: Uses Box<> for large accounts to prevent stack overflow.
#[derive(Accounts)]
#[instruction(user: Pubkey, shares: u64)]
pub struct SellPosition<'info> {
    /// The user OR a session account representing the user.
    /// Session validation is performed via extract_user().
    /// This enables gasless trading when using FOGO Sessions.
    #[account(mut)]
    pub signer_or_session: Signer<'info>,

    /// Global protocol configuration
    /// Used to check: paused, frozen, fee parameters
    #[account(
        seeds = [b"global_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, GlobalConfig>>,

    /// The pool being traded
    /// Used to check: paused, frozen, reserves; also PDA signer for transfers
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.active_epoch == Some(epoch.key()) @ FogoPulseError::InvalidEpoch,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// The epoch being traded in
    /// Must be in Open state
    #[account(
        mut,
        seeds = [b"epoch", pool.key().as_ref(), &epoch.epoch_id.to_le_bytes()],
        bump = epoch.bump,
        constraint = epoch.pool == pool.key() @ FogoPulseError::InvalidEpoch,
    )]
    pub epoch: Box<Account<'info, Epoch>>,

    /// User's existing position - derived from USER wallet, not session
    /// Must have shares to sell
    #[account(
        mut,
        seeds = [b"position", epoch.key().as_ref(), user.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, UserPosition>,

    /// User's USDC ATA - receives net_payout
    #[account(
        mut,
        constraint = user_usdc.owner == user @ FogoPulseError::TokenOwnerMismatch,
        constraint = user_usdc.mint == usdc_mint.key() @ FogoPulseError::InvalidMint,
    )]
    pub user_usdc: Box<Account<'info, TokenAccount>>,

    /// Pool's USDC ATA - source of all transfers
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
    )]
    pub pool_usdc: Box<Account<'info, TokenAccount>>,

    /// Treasury USDC token account - receives treasury_fee
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = config.treasury,
    )]
    pub treasury_usdc: Box<Account<'info, TokenAccount>>,

    /// Insurance USDC token account - receives insurance_fee
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = config.insurance,
    )]
    pub insurance_usdc: Box<Account<'info, TokenAccount>>,

    /// USDC mint - verified against constant
    #[account(address = USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Sell Position handler
///
/// # Arguments
/// * `user` - The actual user wallet pubkey (validated against extract_user)
/// * `shares` - Number of shares to sell (use position.shares for full exit)
///
/// # Flow
/// 1. Extract and validate user
/// 2. Validate epoch state is Open
/// 3. Check protocol and pool are not paused/frozen
/// 4. Validate shares > 0
/// 5. Validate position has sufficient shares
/// 6. Validate position not already claimed
/// 7. Determine direction-specific reserves
/// 8. Calculate gross refund via inverse CPMM
/// 9. Calculate fee split
/// 10. Validate net_payout > 0
/// 11. Transfer treasury_fee from pool to treasury (pool PDA signer)
/// 12. Transfer insurance_fee from pool to insurance (pool PDA signer)
/// 13. Transfer net_payout from pool to user (pool PDA signer)
/// 14. Update pool reserves
/// 15. Update position (partial reduction or full exit with claimed=true)
/// 16. Emit FeesCollected + PositionSold events
pub fn handler(ctx: Context<SellPosition>, user: Pubkey, shares: u64) -> Result<()> {
    // 1. Extract user pubkey - works with both direct signers and session accounts
    let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;
    require!(user == extracted_user, FogoPulseError::Unauthorized);

    // 2. Validate epoch state is Open
    require!(
        ctx.accounts.epoch.state == EpochState::Open,
        FogoPulseError::EpochNotOpen
    );

    // 3. Check protocol/pool not paused/frozen
    let config = &ctx.accounts.config;
    require!(
        !config.paused && !config.frozen,
        FogoPulseError::ProtocolPaused
    );

    require!(
        !ctx.accounts.pool.is_paused && !ctx.accounts.pool.is_frozen,
        FogoPulseError::PoolPaused
    );

    // 4. Validate shares > 0
    require!(shares > 0, FogoPulseError::ZeroShares);

    // 5. Validate position has sufficient shares
    require!(
        ctx.accounts.position.shares >= shares,
        FogoPulseError::InsufficientShares
    );

    // 6. Validate position not already claimed
    require!(!ctx.accounts.position.claimed, FogoPulseError::AlreadyClaimed);

    // 7. Determine direction-specific reserves
    let direction = ctx.accounts.position.direction;
    let (same_reserves, opposite_reserves) = match direction {
        Direction::Up => (ctx.accounts.pool.yes_reserves, ctx.accounts.pool.no_reserves),
        Direction::Down => (ctx.accounts.pool.no_reserves, ctx.accounts.pool.yes_reserves),
    };

    // 8. Calculate gross refund via inverse CPMM
    let gross_refund = crate::utils::calculate_refund(shares, same_reserves, opposite_reserves)?;
    require!(gross_refund > 0, FogoPulseError::InsufficientPoolReserves);

    // 9. Calculate fee split
    let fee_split = calculate_fee_split(gross_refund, config)?;

    // 10. Validate net_payout > 0 (prevent zero-payout sells where fees consume entire refund)
    let net_payout = fee_split.net_amount;
    require!(net_payout > 0, FogoPulseError::InsufficientPoolReserves);

    // Save position state for event emission and update logic
    let position_shares = ctx.accounts.position.shares;
    let position_amount = ctx.accounts.position.amount;
    let is_full_exit = shares == position_shares;

    msg!(
        "SellPosition: user={}, shares={}, gross_refund={}, net_payout={}, fees={}",
        user,
        shares,
        gross_refund,
        net_payout,
        fee_split.total_fee
    );

    // Pool PDA signer seeds (same pattern as claim_payout.rs)
    let pool_seeds = &[
        b"pool".as_ref(),
        ctx.accounts.pool.asset_mint.as_ref(),
        &[ctx.accounts.pool.bump],
    ];

    // 11. Transfer treasury_fee from pool to treasury
    if fee_split.treasury_fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_usdc.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[pool_seeds],
            ),
            fee_split.treasury_fee,
        )?;
    }

    // 12. Transfer insurance_fee from pool to insurance
    if fee_split.insurance_fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_usdc.to_account_info(),
                    to: ctx.accounts.insurance_usdc.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[pool_seeds],
            ),
            fee_split.insurance_fee,
        )?;
    }

    // 13. Transfer net_payout from pool to user
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
        net_payout,
    )?;

    // 14. Update pool reserves: same_reserves -= net_payout
    // (matching buy convention: only net amount changes reserves, lp_fee stays in pool)
    let pool = &mut ctx.accounts.pool;
    match direction {
        Direction::Up => {
            pool.yes_reserves = pool
                .yes_reserves
                .checked_sub(net_payout)
                .ok_or(FogoPulseError::InsufficientPoolReserves)?;
        }
        Direction::Down => {
            pool.no_reserves = pool
                .no_reserves
                .checked_sub(net_payout)
                .ok_or(FogoPulseError::InsufficientPoolReserves)?;
        }
    }

    // 15. Update position
    let position = &mut ctx.accounts.position;
    if is_full_exit {
        // Full exit: zero out and mark claimed
        position.shares = 0;
        position.amount = 0;
        position.claimed = true; // Prevents spurious claim_payout/claim_refund
        // Do NOT close account (consistent with claim_payout/claim_refund pattern)
    } else {
        // Partial sell: reduce proportionally
        let amount_reduction = (position_amount as u128)
            .checked_mul(shares as u128)
            .ok_or(FogoPulseError::Overflow)?
            .checked_div(position_shares as u128)
            .ok_or(FogoPulseError::Overflow)? as u64;
        position.shares -= shares;
        position.amount -= amount_reduction;
        // entry_price unchanged (average cost basis preserved)
    }

    // 16. Emit events
    emit!(FeesCollected {
        epoch: ctx.accounts.epoch.key(),
        user,
        gross_amount: gross_refund,
        net_amount: net_payout,
        total_fee: fee_split.total_fee,
        lp_fee: fee_split.lp_fee,
        treasury_fee: fee_split.treasury_fee,
        insurance_fee: fee_split.insurance_fee,
    });

    let clock = Clock::get()?;
    emit!(PositionSold {
        epoch: ctx.accounts.epoch.key(),
        user,
        direction,
        shares_sold: shares,
        gross_refund,
        net_payout,
        remaining_shares: ctx.accounts.position.shares,
        remaining_amount: ctx.accounts.position.amount,
        is_full_exit,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
