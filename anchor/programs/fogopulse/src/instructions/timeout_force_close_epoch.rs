//! Permissionless Timeout Force-Close Epoch instruction
//!
//! When a Frozen epoch has been stuck past `end_time + settlement_timeout_seconds`,
//! anyone can call this to force-close it as Refunded. No oracle data needed.
//!
//! ## Use Case
//! Settlement requires a Pyth Lazer oracle message timestamped within the staleness
//! threshold of `epoch.end_time`. Once this window passes, settlement is permanently
//! impossible. This instruction provides a permissionless escape hatch.
//!
//! ## Behavior
//! - Sets epoch state to `Refunded` (no outcome determined)
//! - Clears `pool.active_epoch` to allow new epoch creation
//! - Does NOT process payouts (positions remain as-is for future claim_refund)
//!
//! ## Access Control
//! Permissionless - anyone can call after the timeout has elapsed.

use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::events::EpochTimeoutForceClosed;
use crate::state::{Epoch, EpochState, GlobalConfig, Pool};

/// Timeout Force-Close Epoch accounts
#[derive(Accounts)]
pub struct TimeoutForceCloseEpoch<'info> {
    /// Permissionless caller - pays for transaction fees
    #[account(mut)]
    pub payer: Signer<'info>,

    /// GlobalConfig - provides settlement_timeout_seconds
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
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

    /// Clock sysvar for timestamp check
    /// Note: Could use Clock::get()? instead to save an account slot,
    /// but kept as explicit account for consistency with deployed program.
    pub clock: Sysvar<'info, Clock>,
}

/// Handler for timeout_force_close_epoch instruction
pub fn handler(ctx: Context<TimeoutForceCloseEpoch>) -> Result<()> {
    let global_config = &ctx.accounts.global_config;
    let pool = &mut ctx.accounts.pool;
    let epoch = &mut ctx.accounts.epoch;
    let clock = &ctx.accounts.clock;

    // Protocol freeze check
    require!(
        !global_config.frozen,
        FogoPulseError::ProtocolFrozen
    );

    // Pool freeze check
    require!(
        !pool.is_frozen,
        FogoPulseError::PoolFrozen
    );

    // Only Frozen epochs can be timeout force-closed
    // Open epochs need admin_force_close_epoch (admin decision)
    require!(
        epoch.state == EpochState::Frozen,
        FogoPulseError::InvalidEpochState
    );

    // Check that the settlement timeout has elapsed
    // Use checked_add to prevent overflow if settlement_timeout_seconds is very large
    let timeout_deadline = epoch.end_time
        .checked_add(global_config.settlement_timeout_seconds)
        .ok_or(FogoPulseError::Overflow)?;
    require!(
        clock.unix_timestamp >= timeout_deadline,
        FogoPulseError::SettlementTimeoutNotReached
    );

    msg!(
        "timeout_force_close_epoch: pool={}, epoch={}, epoch_id={}, caller={}",
        pool.key(),
        epoch.key(),
        epoch.epoch_id,
        ctx.accounts.payer.key()
    );

    // Mark epoch as refunded (no outcome determined, positions can claim refund)
    epoch.state = EpochState::Refunded;

    // Clear pool active epoch - allows new epoch creation
    pool.active_epoch = None;
    pool.active_epoch_state = 0;

    emit!(EpochTimeoutForceClosed {
        epoch: epoch.key(),
        pool: pool.key(),
        epoch_id: epoch.epoch_id,
        caller: ctx.accounts.payer.key(),
    });

    Ok(())
}
