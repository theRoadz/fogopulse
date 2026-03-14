//! Advance Epoch instruction - Permissionless epoch state transition
//!
//! ## Session Exclusion (PERMISSIONLESS)
//!
//! This instruction does NOT use FOGO Sessions because it is PERMISSIONLESS.
//!
//! **Rationale:** Epoch advancement is designed to be callable by anyone:
//! - Keeper bots / crank services can automatically advance epochs
//! - No user identity verification needed - any wallet can pay the transaction fee
//! - The caller's identity is irrelevant to the operation
//! - No position or funds are associated with the caller
//!
//! ## Purpose
//!
//! Transitions an epoch from `Open` to `Frozen` state when `freeze_time` is reached.
//! This stops trading during the freeze window before settlement.
//!
//! ## Similar permissionless instructions (no session needed):
//! - `create_epoch` - Anyone can create a new epoch
//! - `settle_epoch` - Anyone can settle an expired epoch

use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::events::EpochFrozen;
use crate::state::{Epoch, EpochState, GlobalConfig, Pool};

/// Advance Epoch accounts - permissionless, no session needed
#[derive(Accounts)]
pub struct AdvanceEpoch<'info> {
    /// Anyone can call - permissionless for crank bots/keepers
    #[account(mut)]
    pub payer: Signer<'info>,

    /// GlobalConfig - for freeze checks
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    /// Pool - must have this epoch as active
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.active_epoch == Some(epoch.key()) @ FogoPulseError::InvalidEpoch,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// Epoch - must be in Open state
    #[account(
        mut,
        seeds = [b"epoch", pool.key().as_ref(), &epoch.epoch_id.to_le_bytes()],
        bump = epoch.bump,
        constraint = epoch.pool == pool.key() @ FogoPulseError::InvalidEpoch,
        constraint = epoch.state == EpochState::Open @ FogoPulseError::InvalidEpochState,
    )]
    pub epoch: Account<'info, Epoch>,

    /// Clock sysvar for timestamp
    pub clock: Sysvar<'info, Clock>,
}

/// Handler for advance_epoch instruction
///
/// Transitions epoch from Open → Frozen when freeze_time is reached.
/// No oracle data required - purely time-based.
pub fn handler(ctx: Context<AdvanceEpoch>) -> Result<()> {
    let config = &ctx.accounts.global_config;
    let pool = &mut ctx.accounts.pool;
    let epoch = &mut ctx.accounts.epoch;
    let clock = &ctx.accounts.clock;

    // Protocol freeze checks
    require!(!config.frozen, FogoPulseError::ProtocolFrozen);
    require!(!pool.is_frozen, FogoPulseError::PoolFrozen);

    // Timing validation: freeze_time must have been reached
    require!(
        clock.unix_timestamp >= epoch.freeze_time,
        FogoPulseError::EpochNotFrozen
    );

    // State transition: Open → Frozen
    epoch.state = EpochState::Frozen;

    // Update pool cache
    pool.active_epoch_state = EpochState::Frozen.as_pool_cache_u8();

    // Emit event
    emit!(EpochFrozen {
        epoch: epoch.key(),
        pool: pool.key(),
        epoch_id: epoch.epoch_id,
        freeze_time: epoch.freeze_time,
    });

    Ok(())
}
