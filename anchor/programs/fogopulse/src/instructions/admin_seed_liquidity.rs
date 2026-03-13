//! Admin Seed Liquidity instruction
//!
//! Admin-only instruction to seed initial liquidity into empty pools.
//! This is a temporary utility for testnet until LP provision (Epic 5) is implemented.
//!
//! ## Use Case
//! When pools are created with zero reserves, traders cannot trade because CPMM
//! requires liquidity. This instruction allows admin to inject initial USDC that
//! is split 50/50 between YES and NO reserves.
//!
//! ## Behavior
//! - Transfers USDC from admin wallet to pool vault
//! - Splits amount 50/50 between yes_reserves and no_reserves
//! - Works on both empty pools and pools with existing reserves
//!
//! ## Access Control
//! Admin-only via `has_one` constraint on GlobalConfig.admin

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{MIN_TRADE_AMOUNT, USDC_MINT};
use crate::errors::FogoPulseError;
use crate::events::LiquiditySeeded;
use crate::state::{GlobalConfig, Pool};

/// Admin Seed Liquidity accounts
#[derive(Accounts)]
pub struct AdminSeedLiquidity<'info> {
    /// Protocol admin - must match GlobalConfig.admin
    #[account(mut)]
    pub admin: Signer<'info>,

    /// GlobalConfig - validates admin authority
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = admin @ FogoPulseError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// Pool to receive liquidity
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// Pool's USDC ATA - owned by pool PDA
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
    )]
    pub pool_usdc: Account<'info, TokenAccount>,

    /// Admin's USDC ATA - source of liquidity
    #[account(
        mut,
        constraint = admin_usdc.owner == admin.key() @ FogoPulseError::TokenOwnerMismatch,
        constraint = admin_usdc.mint == USDC_MINT @ FogoPulseError::InvalidMint
    )]
    pub admin_usdc: Account<'info, TokenAccount>,

    /// USDC mint - verified against constant
    #[account(address = USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/// Handler for admin_seed_liquidity instruction
///
/// # Arguments
/// * `amount` - Total USDC amount to seed (will be split 50/50 between YES/NO)
///
/// # Flow
/// 1. Validate protocol is not frozen
/// 2. Validate pool is not frozen
/// 3. Validate amount > 0
/// 4. Transfer USDC from admin to pool vault
/// 5. Split amount 50/50 between yes_reserves and no_reserves
/// 6. Emit LiquiditySeeded event
pub fn handler(ctx: Context<AdminSeedLiquidity>, amount: u64) -> Result<()> {
    let global_config = &ctx.accounts.global_config;
    let pool = &mut ctx.accounts.pool;

    // 1. Protocol freeze check - emergency halt must still be respected
    // Note: We intentionally allow seeding during pause (admin recovery action)
    // Pause blocks user trading, but admin can still prepare pools for resume
    require!(
        !global_config.frozen,
        FogoPulseError::ProtocolFrozen
    );

    // 2. Pool freeze check - same rationale as above
    require!(
        !pool.is_frozen,
        FogoPulseError::PoolFrozen
    );

    // 3. Validate amount > 0 and meets minimum threshold
    require!(amount > 0, FogoPulseError::ZeroAmount);

    // Minimum amount = 2 * MIN_TRADE_AMOUNT to ensure meaningful 50/50 split
    // This prevents dust seeding that doesn't provide usable liquidity
    require!(
        amount >= MIN_TRADE_AMOUNT * 2,
        FogoPulseError::BelowMinimumTrade
    );

    // Store pre-seed values for event
    let yes_reserves_before = pool.yes_reserves;
    let no_reserves_before = pool.no_reserves;

    msg!(
        "admin_seed_liquidity: pool={}, amount={}, yes_before={}, no_before={}",
        pool.key(),
        amount,
        yes_reserves_before,
        no_reserves_before
    );

    // 4. Transfer USDC from admin to pool vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.admin_usdc.to_account_info(),
                to: ctx.accounts.pool_usdc.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        ),
        amount,
    )?;

    // 5. Split 50/50 between YES and NO reserves
    // For odd amounts, YES gets the extra unit (amount/2 + amount%2)
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

    msg!(
        "Liquidity seeded: yes_reserves={}, no_reserves={}",
        pool.yes_reserves,
        pool.no_reserves
    );

    // 6. Emit event
    emit!(LiquiditySeeded {
        pool: pool.key(),
        admin: ctx.accounts.admin.key(),
        amount,
        yes_reserves_before,
        no_reserves_before,
        yes_reserves_after: pool.yes_reserves,
        no_reserves_after: pool.no_reserves,
    });

    Ok(())
}
