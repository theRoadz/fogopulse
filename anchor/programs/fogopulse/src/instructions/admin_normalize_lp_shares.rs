//! Admin Normalize LP Shares instruction — fix inflated LP share counts
//!
//! One-time admin utility to normalize LP shares that became inflated due to
//! reserve accounting drift (Story 7.32 bug). Divides an individual LP share's
//! share count by a divisor and reduces the pool's totals accordingly.
//!
//! ## Usage Pattern
//! Call once per LpShare account per pool, using the same divisor for all
//! accounts in a pool. Each call adjusts both the individual `lp_share.shares`
//! and `pool.total_lp_shares`.
//!
//! ## Access Control
//! Admin-only via `has_one` constraint on GlobalConfig.admin

use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::state::{GlobalConfig, LpShare, Pool};

/// Admin Normalize LP Shares accounts
#[derive(Accounts)]
pub struct AdminNormalizeLpShares<'info> {
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

    /// Pool to normalize shares for — must not be frozen or have an active epoch
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.is_frozen @ FogoPulseError::PoolFrozen,
    )]
    pub pool: Account<'info, Pool>,

    /// LP share account to normalize — must belong to this pool
    #[account(
        mut,
        constraint = lp_share.pool == pool.key() @ FogoPulseError::Unauthorized,
    )]
    pub lp_share: Account<'info, LpShare>,
}

/// Handler for admin_normalize_lp_shares
///
/// Divides the LP share's share count by `divisor` and reduces pool totals.
///
/// # Arguments
/// * `divisor` - The divisor to apply (must be > 1)
pub fn handler(ctx: Context<AdminNormalizeLpShares>, divisor: u64) -> Result<()> {
    // 1. Validate divisor
    require!(divisor > 1, FogoPulseError::InvalidDivisor);

    // 2. Block during active epoch — shares are in flux from trading
    require!(
        ctx.accounts.pool.active_epoch.is_none(),
        FogoPulseError::InvalidEpochState
    );

    let pool = &mut ctx.accounts.pool;
    let lp_share = &mut ctx.accounts.lp_share;

    // 3. Normalize lp_share.shares
    let old_shares = lp_share.shares;
    let new_shares = old_shares / divisor;

    // Prevent zeroing out an LP position (divisor > shares)
    require!(new_shares > 0, FogoPulseError::DivisorTooLarge);
    let shares_reduction = old_shares - new_shares;

    lp_share.shares = new_shares;
    pool.total_lp_shares = pool.total_lp_shares.saturating_sub(shares_reduction);

    msg!(
        "admin_normalize_lp_shares: pool={}, lp_share_user={}, divisor={}, shares: {} -> {}, pool_total_lp_shares: {}",
        pool.key(),
        lp_share.user,
        divisor,
        old_shares,
        new_shares,
        pool.total_lp_shares,
    );

    // 4. Normalize pending_withdrawal if non-zero
    if lp_share.pending_withdrawal > 0 {
        let old_pending = lp_share.pending_withdrawal;
        let new_pending = old_pending / divisor;
        let pending_reduction = old_pending - new_pending;

        lp_share.pending_withdrawal = new_pending;
        pool.pending_withdrawal_shares = pool
            .pending_withdrawal_shares
            .saturating_sub(pending_reduction);

        msg!(
            "admin_normalize_lp_shares: pending_withdrawal: {} -> {}, pool_pending: {}",
            old_pending,
            new_pending,
            pool.pending_withdrawal_shares,
        );
    }

    Ok(())
}
