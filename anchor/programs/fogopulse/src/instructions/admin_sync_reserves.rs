//! Admin Sync Reserves instruction — reconcile pool reserves with actual token balance
//!
//! One-time admin utility to fix reserve accounting drift caused by
//! claim_payout/claim_refund not reducing reserves (Story 7.32 bug).
//!
//! ## Behavior
//! Reads the actual USDC balance in the pool's token account and sets
//! `yes_reserves` and `no_reserves` to `balance / 2` each (50/50 split
//! matching post-settlement rebalancing).
//!
//! ## Access Control
//! Admin-only via `has_one` constraint on GlobalConfig.admin

use anchor_lang::prelude::*;

use crate::constants::USDC_MINT;
use crate::errors::FogoPulseError;
use crate::state::{GlobalConfig, Pool};

use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

/// Admin Sync Reserves accounts
#[derive(Accounts)]
pub struct AdminSyncReserves<'info> {
    /// Protocol admin - must match GlobalConfig.admin
    #[account(mut)]
    pub admin: Signer<'info>,

    /// GlobalConfig - validates admin authority and freeze check
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = admin @ FogoPulseError::Unauthorized,
        constraint = !global_config.frozen @ FogoPulseError::ProtocolFrozen,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// Pool to sync reserves for — must not be frozen or have an active epoch
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.is_frozen @ FogoPulseError::PoolFrozen,
    )]
    pub pool: Account<'info, Pool>,

    /// Pool's USDC token account — read balance to determine actual USDC
    #[account(
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
    )]
    pub pool_usdc: Account<'info, TokenAccount>,

    /// USDC mint - verified against constant
    #[account(address = USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/// Handler for admin_sync_reserves
///
/// Reads pool_usdc.amount and sets reserves to balance / 2 each.
pub fn handler(ctx: Context<AdminSyncReserves>) -> Result<()> {
    // Block during active epoch — reserves are in flux from trading
    require!(
        ctx.accounts.pool.active_epoch.is_none(),
        FogoPulseError::InvalidEpochState
    );

    let pool = &mut ctx.accounts.pool;
    let actual_balance = ctx.accounts.pool_usdc.amount;

    let yes_before = pool.yes_reserves;
    let no_before = pool.no_reserves;

    let half = actual_balance / 2;
    let remainder = actual_balance % 2;

    pool.yes_reserves = half + remainder;
    pool.no_reserves = half;

    msg!(
        "admin_sync_reserves: pool={}, actual_balance={}, yes_reserves: {} -> {}, no_reserves: {} -> {}",
        pool.key(),
        actual_balance,
        yes_before,
        pool.yes_reserves,
        no_before,
        pool.no_reserves,
    );

    Ok(())
}
