//! Admin Force-Close Epoch instruction
//!
//! Emergency admin instruction to force-close a stuck epoch.
//! This is a temporary utility until full settlement (Epic 3) is implemented.
//!
//! ## Use Case
//! When an epoch passes its `end_time` but `settle_epoch` hasn't been implemented,
//! the epoch stays active forever and blocks new epoch creation. This instruction
//! allows an admin to clear the stuck epoch.
//!
//! ## Behavior
//! - Sets epoch state to `Refunded` (no outcome determined)
//! - Clears `pool.active_epoch` to allow new epoch creation
//! - Does NOT process payouts (positions remain as-is for future claim_refund)
//!
//! ## Access Control
//! Admin-only via `has_one` constraint on GlobalConfig.admin

use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::events::EpochForceClosed;
use crate::state::{Epoch, EpochState, GlobalConfig, Pool};

/// Admin Force-Close Epoch accounts
#[derive(Accounts)]
pub struct AdminForceCloseEpoch<'info> {
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

    /// Pool - must have this epoch as active
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.active_epoch == Some(epoch.key()) @ FogoPulseError::InvalidEpoch,
    )]
    pub pool: Account<'info, Pool>,

    /// Epoch - the stuck epoch to force-close
    #[account(
        mut,
        seeds = [b"epoch", pool.key().as_ref(), &epoch.epoch_id.to_le_bytes()],
        bump = epoch.bump,
    )]
    pub epoch: Account<'info, Epoch>,
}

/// Handler for admin_force_close_epoch instruction
pub fn handler(ctx: Context<AdminForceCloseEpoch>) -> Result<()> {
    let global_config = &ctx.accounts.global_config;
    let pool = &mut ctx.accounts.pool;
    let epoch = &mut ctx.accounts.epoch;

    // Protocol freeze check - emergency halt must still be respected
    // Note: We allow force-close during pause (admin recovery action)
    // but frozen state means ALL activity stops
    require!(
        !global_config.frozen,
        FogoPulseError::ProtocolFrozen
    );

    // Pool freeze check - same rationale
    require!(
        !pool.is_frozen,
        FogoPulseError::PoolFrozen
    );

    // Validate epoch state - can only force-close Open or Frozen epochs
    // Cannot force-close already Settled or Refunded epochs
    require!(
        epoch.state == EpochState::Open || epoch.state == EpochState::Frozen,
        FogoPulseError::InvalidEpochState
    );

    msg!(
        "admin_force_close_epoch: pool={}, epoch={}, epoch_id={}, prev_state={:?}",
        pool.key(),
        epoch.key(),
        epoch.epoch_id,
        epoch.state
    );

    // Mark epoch as refunded (no outcome determined, positions can claim refund)
    epoch.state = EpochState::Refunded;

    // Clear pool active epoch - allows new epoch creation
    pool.active_epoch = None;
    pool.active_epoch_state = 0;

    emit!(EpochForceClosed {
        epoch: epoch.key(),
        pool: pool.key(),
        epoch_id: epoch.epoch_id,
        admin: ctx.accounts.admin.key(),
    });

    Ok(())
}
