//! Deposit Liquidity instruction - LP deposits USDC into a pool for LP shares
//!
//! This is a USER-FACING instruction that supports both:
//! - Direct wallet signatures
//! - FOGO Session accounts (for gasless UX)
//!
//! Use `session::extract_user()` to get the actual user pubkey.
//!
//! # Share Calculation
//!
//! - First deposit (total_lp_shares == 0): shares = amount (1:1 bootstrap)
//! - Subsequent: shares = (amount * total_lp_shares) / (yes_reserves + no_reserves)
//!
//! CRITICAL: Calculate shares BEFORE updating reserves, otherwise the
//! denominator changes and the user gets fewer shares than deserved.
//!
//! # No Trading Fees
//!
//! LP deposits do NOT incur trading fees. The 1.8% fee only applies to
//! buy/sell position operations. Deposits are a direct 1:1 USDC-to-reserves transfer.
//!
//! # Epoch State
//!
//! Deposits are allowed regardless of epoch state (Open, Frozen, Settling, Settled,
//! or no active epoch). No epoch constraint is applied.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{MIN_TRADE_AMOUNT, USDC_MINT};
use crate::errors::FogoPulseError;
use crate::events::LiquidityDeposited;
use crate::session::extract_user;
use crate::state::{GlobalConfig, LpShare, Pool};

/// Deposit Liquidity accounts
///
/// Uses `init_if_needed` pattern for LpShare to handle both new and existing LP positions.
/// Token accounts use ATA pattern with pool PDA as owner for pool_usdc.
///
/// CRITICAL: Uses Box<> for large accounts to prevent stack overflow.
#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct DepositLiquidity<'info> {
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

    /// The pool receiving liquidity
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// LP share account - derived from USER wallet, not session
    /// Uses init_if_needed to handle both new and existing LP positions
    #[account(
        init_if_needed,
        payer = signer_or_session,
        space = 8 + LpShare::INIT_SPACE,
        seeds = [b"lp_share", user.as_ref(), pool.key().as_ref()],
        bump,
    )]
    pub lp_share: Account<'info, LpShare>,

    /// Pool's USDC ATA - owned by pool PDA
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
    )]
    pub pool_usdc: Box<Account<'info, TokenAccount>>,

    /// User's USDC ATA - source of deposit
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

/// Handler for deposit_liquidity instruction
///
/// # Arguments
/// * `user` - The actual user wallet pubkey (validated against session extraction)
/// * `amount` - Total USDC amount to deposit (will be split 50/50 between YES/NO reserves)
///
/// # Flow
/// 1. Extract and validate user via FOGO Sessions
/// 2. Check protocol and pool not paused/frozen
/// 3. Validate amount > 0 and meets minimum
/// 4. Calculate LP shares to mint (BEFORE updating reserves)
/// 5. Transfer USDC from user to pool vault
/// 6. Split deposit 50/50 between yes_reserves and no_reserves
/// 7. Update pool.total_lp_shares
/// 8. Initialize or update LpShare account
/// 9. Emit LiquidityDeposited event
pub fn handler(ctx: Context<DepositLiquidity>, user: Pubkey, amount: u64) -> Result<()> {
    // 1. Extract and validate user
    let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;
    require!(user == extracted_user, FogoPulseError::Unauthorized);

    let config = &ctx.accounts.config;
    let pool = &mut ctx.accounts.pool;

    msg!(
        "deposit_liquidity: pool={}, user={}, amount={}",
        pool.key(),
        user,
        amount
    );

    // 2. Check protocol not paused/frozen
    require!(!config.paused, FogoPulseError::ProtocolPaused);
    require!(!config.frozen, FogoPulseError::ProtocolFrozen);

    // 3. Check pool not paused/frozen
    require!(!pool.is_paused, FogoPulseError::PoolPaused);
    require!(!pool.is_frozen, FogoPulseError::PoolFrozen);

    // 4. Validate amount > 0 and meets minimum threshold
    require!(amount > 0, FogoPulseError::ZeroAmount);
    // Minimum amount = 2 * MIN_TRADE_AMOUNT to ensure meaningful 50/50 split
    require!(
        amount >= MIN_TRADE_AMOUNT * 2,
        FogoPulseError::BelowMinimumTrade
    );

    // 5. Calculate shares_minted BEFORE updating reserves (order is critical)
    let shares_minted: u64;

    if pool.total_lp_shares == 0 {
        // First-ever deposit to pool: 1:1 ratio for bootstrap
        shares_minted = amount;
    } else {
        // Proportional shares based on current pool value (reserves only, not surplus)
        let pool_value = pool
            .yes_reserves
            .checked_add(pool.no_reserves)
            .ok_or(FogoPulseError::Overflow)?;

        // Guard against division by zero (shouldn't happen if total_lp_shares > 0)
        require!(pool_value > 0, FogoPulseError::PoolEmpty);

        shares_minted = (amount as u128)
            .checked_mul(pool.total_lp_shares as u128)
            .ok_or(FogoPulseError::Overflow)?
            .checked_div(pool_value as u128)
            .ok_or(FogoPulseError::Overflow)? as u64;
    }

    // Validate shares_minted > 0 (reject dust deposits that round to zero shares)
    require!(shares_minted > 0, FogoPulseError::DepositTooSmall);

    msg!(
        "deposit_liquidity: shares_minted={}, yes_reserves={}, no_reserves={}",
        shares_minted,
        pool.yes_reserves,
        pool.no_reserves
    );

    // 6. Transfer USDC from user to pool vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.pool_usdc.to_account_info(),
                authority: ctx.accounts.signer_or_session.to_account_info(),
            },
        ),
        amount,
    )?;

    // 7. Split deposit 50/50 between YES and NO reserves
    let half_amount = amount / 2;
    let yes_addition = half_amount + (amount % 2); // YES gets remainder for odd amounts
    let no_addition = half_amount;

    pool.yes_reserves = pool
        .yes_reserves
        .checked_add(yes_addition)
        .ok_or(FogoPulseError::Overflow)?;

    pool.no_reserves = pool
        .no_reserves
        .checked_add(no_addition)
        .ok_or(FogoPulseError::Overflow)?;

    // 8. Update pool.total_lp_shares
    pool.total_lp_shares = pool
        .total_lp_shares
        .checked_add(shares_minted)
        .ok_or(FogoPulseError::Overflow)?;

    // 9. Initialize or update LpShare account
    let lp_share = &mut ctx.accounts.lp_share;

    // Check if this is a freshly initialized account (user is default pubkey)
    let is_new = lp_share.user == Pubkey::default();

    if is_new {
        lp_share.user = user;
        lp_share.pool = pool.key();
        lp_share.shares = shares_minted;
        lp_share.deposited_amount = amount;
        lp_share.pending_withdrawal = 0;
        lp_share.withdrawal_requested_at = None;
        lp_share.bump = ctx.bumps.lp_share;
    } else {
        // Existing LP - increment shares and deposited amount
        lp_share.shares = lp_share
            .shares
            .checked_add(shares_minted)
            .ok_or(FogoPulseError::Overflow)?;
        lp_share.deposited_amount = lp_share
            .deposited_amount
            .checked_add(amount)
            .ok_or(FogoPulseError::Overflow)?;
    }

    msg!(
        "deposit_liquidity complete: yes_reserves={}, no_reserves={}, total_lp_shares={}",
        pool.yes_reserves,
        pool.no_reserves,
        pool.total_lp_shares
    );

    // 10. Emit LiquidityDeposited event
    emit!(LiquidityDeposited {
        pool: pool.key(),
        user,
        amount,
        shares_minted,
        total_lp_shares_after: pool.total_lp_shares,
        yes_reserves_after: pool.yes_reserves,
        no_reserves_after: pool.no_reserves,
    });

    Ok(())
}
