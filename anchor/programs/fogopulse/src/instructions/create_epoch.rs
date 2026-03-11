use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::events::EpochCreated;
use crate::state::{Epoch, EpochState, GlobalConfig, Pool};

#[derive(Accounts)]
pub struct CreateEpoch<'info> {
    /// Anyone can call - permissionless for crank bots/keepers
    #[account(mut)]
    pub payer: Signer<'info>,

    /// GlobalConfig - boxed to prevent stack overflow
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    /// Pool - must have no active epoch
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// Epoch account to be created
    #[account(
        init,
        payer = payer,
        space = 8 + Epoch::INIT_SPACE,
        seeds = [b"epoch", pool.key().as_ref(), &pool.next_epoch_id.to_le_bytes()],
        bump
    )]
    pub epoch: Account<'info, Epoch>,

    /// Clock sysvar for timestamp
    pub clock: Sysvar<'info, Clock>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateEpoch>,
    start_price: u64,
    start_confidence: u64,
    start_publish_time: i64,
) -> Result<()> {
    let config = &ctx.accounts.global_config;
    let pool = &mut ctx.accounts.pool;
    let epoch = &mut ctx.accounts.epoch;
    let clock = &ctx.accounts.clock;

    // Protocol checks (before pool checks)
    require!(!config.frozen, FogoPulseError::ProtocolFrozen);
    require!(!config.paused, FogoPulseError::ProtocolPaused);

    // Pool checks
    require!(!pool.is_frozen, FogoPulseError::PoolFrozen);
    require!(!pool.is_paused, FogoPulseError::PoolPaused);

    // Epoch existence check - CRITICAL: only one active epoch per pool
    require!(
        pool.active_epoch.is_none(),
        FogoPulseError::EpochAlreadyActive
    );

    // Calculate timing (checked arithmetic to prevent overflow/underflow)
    let start_time = clock.unix_timestamp;
    let end_time = start_time
        .checked_add(config.epoch_duration_seconds)
        .ok_or(FogoPulseError::Overflow)?;
    let freeze_time = end_time
        .checked_sub(config.freeze_window_seconds)
        .ok_or(FogoPulseError::Overflow)?;

    // Initialize epoch
    epoch.pool = pool.key();
    epoch.epoch_id = pool.next_epoch_id;
    epoch.state = EpochState::Open;
    epoch.start_time = start_time;
    epoch.end_time = end_time;
    epoch.freeze_time = freeze_time;
    epoch.start_price = start_price;
    epoch.start_confidence = start_confidence;
    epoch.start_publish_time = start_publish_time;
    epoch.settlement_price = None;
    epoch.settlement_confidence = None;
    epoch.settlement_publish_time = None;
    epoch.outcome = None;
    epoch.bump = ctx.bumps.epoch;

    // Update pool state
    pool.active_epoch = Some(epoch.key());
    pool.active_epoch_state = EpochState::Open.as_pool_cache_u8();
    pool.next_epoch_id = pool
        .next_epoch_id
        .checked_add(1)
        .ok_or(FogoPulseError::Overflow)?;

    emit!(EpochCreated {
        epoch: epoch.key(),
        pool: pool.key(),
        epoch_id: epoch.epoch_id,
        start_price: epoch.start_price,
        start_confidence: epoch.start_confidence,
        start_time: epoch.start_time,
        end_time: epoch.end_time,
    });

    Ok(())
}
