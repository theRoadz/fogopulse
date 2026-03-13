//! Update GlobalConfig instruction
//!
//! Admin instruction to modify protocol configuration parameters.
//! Only the admin wallet can call this instruction.
//!
//! ## Use Case
//! - Adjust oracle staleness thresholds
//! - Modify fee parameters
//! - Update treasury/insurance addresses
//! - Toggle feature flags
//!
//! ## Access Control
//! Admin-only via `has_one` constraint on GlobalConfig.admin

use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::events::ConfigUpdated;
use crate::state::GlobalConfig;

/// Parameters for updating config - all fields optional
/// Only provided fields will be updated
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateConfigParams {
    pub treasury: Option<Pubkey>,
    pub insurance: Option<Pubkey>,
    pub trading_fee_bps: Option<u16>,
    pub lp_fee_share_bps: Option<u16>,
    pub treasury_fee_share_bps: Option<u16>,
    pub insurance_fee_share_bps: Option<u16>,
    pub per_wallet_cap_bps: Option<u16>,
    pub per_side_cap_bps: Option<u16>,
    pub oracle_confidence_threshold_start_bps: Option<u16>,
    pub oracle_confidence_threshold_settle_bps: Option<u16>,
    pub oracle_staleness_threshold_start: Option<i64>,
    pub oracle_staleness_threshold_settle: Option<i64>,
    pub epoch_duration_seconds: Option<i64>,
    pub freeze_window_seconds: Option<i64>,
    pub allow_hedging: Option<bool>,
    pub paused: Option<bool>,
    pub frozen: Option<bool>,
}

/// Update Config accounts
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    /// Protocol admin - must match GlobalConfig.admin
    pub admin: Signer<'info>,

    /// GlobalConfig - the account to update
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = admin @ FogoPulseError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

/// Handler for update_config instruction
pub fn handler(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
    let config = &mut ctx.accounts.global_config;

    msg!(
        "update_config: admin={}, config={}",
        ctx.accounts.admin.key(),
        config.key()
    );

    // =======================================================================
    // VALIDATION: Validate params before applying any changes
    // =======================================================================

    // Validate trading_fee_bps (max 10% = 1000 bps)
    if let Some(v) = params.trading_fee_bps {
        require!(v <= 1000, FogoPulseError::InvalidTradingFee);
    }

    // Validate fee shares sum to 10000 if any are being updated
    let new_lp = params.lp_fee_share_bps.unwrap_or(config.lp_fee_share_bps);
    let new_treasury = params.treasury_fee_share_bps.unwrap_or(config.treasury_fee_share_bps);
    let new_insurance = params.insurance_fee_share_bps.unwrap_or(config.insurance_fee_share_bps);
    if params.lp_fee_share_bps.is_some()
        || params.treasury_fee_share_bps.is_some()
        || params.insurance_fee_share_bps.is_some()
    {
        require!(
            new_lp + new_treasury + new_insurance == 10000,
            FogoPulseError::InvalidFeeShare
        );
    }

    // Validate cap values (0-10000 bps)
    if let Some(v) = params.per_wallet_cap_bps {
        require!(v <= 10000, FogoPulseError::InvalidCap);
    }
    if let Some(v) = params.per_side_cap_bps {
        require!(v <= 10000, FogoPulseError::InvalidCap);
    }

    // Validate oracle thresholds (1-10000 bps)
    if let Some(v) = params.oracle_confidence_threshold_start_bps {
        require!(v >= 1 && v <= 10000, FogoPulseError::InvalidOracleThreshold);
    }
    if let Some(v) = params.oracle_confidence_threshold_settle_bps {
        require!(v >= 1 && v <= 10000, FogoPulseError::InvalidOracleThreshold);
    }

    // Validate staleness thresholds (must be positive)
    if let Some(v) = params.oracle_staleness_threshold_start {
        require!(v > 0, FogoPulseError::InvalidOracleThreshold);
    }
    if let Some(v) = params.oracle_staleness_threshold_settle {
        require!(v > 0, FogoPulseError::InvalidOracleThreshold);
    }

    // Validate timing params: epoch_duration > freeze_window, epoch >= 60s
    let new_epoch_duration = params.epoch_duration_seconds.unwrap_or(config.epoch_duration_seconds);
    let new_freeze_window = params.freeze_window_seconds.unwrap_or(config.freeze_window_seconds);
    if params.epoch_duration_seconds.is_some() || params.freeze_window_seconds.is_some() {
        require!(
            new_epoch_duration >= 60 && new_freeze_window < new_epoch_duration,
            FogoPulseError::InvalidTimingParams
        );
    }

    // =======================================================================
    // APPLY CHANGES: All validations passed, now update config
    // =======================================================================

    // Update each field if provided
    if let Some(v) = params.treasury {
        msg!("  treasury: {} -> {}", config.treasury, v);
        config.treasury = v;
    }
    if let Some(v) = params.insurance {
        msg!("  insurance: {} -> {}", config.insurance, v);
        config.insurance = v;
    }
    if let Some(v) = params.trading_fee_bps {
        msg!("  trading_fee_bps: {} -> {}", config.trading_fee_bps, v);
        config.trading_fee_bps = v;
    }
    if let Some(v) = params.lp_fee_share_bps {
        msg!("  lp_fee_share_bps: {} -> {}", config.lp_fee_share_bps, v);
        config.lp_fee_share_bps = v;
    }
    if let Some(v) = params.treasury_fee_share_bps {
        msg!("  treasury_fee_share_bps: {} -> {}", config.treasury_fee_share_bps, v);
        config.treasury_fee_share_bps = v;
    }
    if let Some(v) = params.insurance_fee_share_bps {
        msg!("  insurance_fee_share_bps: {} -> {}", config.insurance_fee_share_bps, v);
        config.insurance_fee_share_bps = v;
    }
    if let Some(v) = params.per_wallet_cap_bps {
        msg!("  per_wallet_cap_bps: {} -> {}", config.per_wallet_cap_bps, v);
        config.per_wallet_cap_bps = v;
    }
    if let Some(v) = params.per_side_cap_bps {
        msg!("  per_side_cap_bps: {} -> {}", config.per_side_cap_bps, v);
        config.per_side_cap_bps = v;
    }
    if let Some(v) = params.oracle_confidence_threshold_start_bps {
        msg!("  oracle_confidence_threshold_start_bps: {} -> {}", config.oracle_confidence_threshold_start_bps, v);
        config.oracle_confidence_threshold_start_bps = v;
    }
    if let Some(v) = params.oracle_confidence_threshold_settle_bps {
        msg!("  oracle_confidence_threshold_settle_bps: {} -> {}", config.oracle_confidence_threshold_settle_bps, v);
        config.oracle_confidence_threshold_settle_bps = v;
    }
    if let Some(v) = params.oracle_staleness_threshold_start {
        msg!("  oracle_staleness_threshold_start: {} -> {}", config.oracle_staleness_threshold_start, v);
        config.oracle_staleness_threshold_start = v;
    }
    if let Some(v) = params.oracle_staleness_threshold_settle {
        msg!("  oracle_staleness_threshold_settle: {} -> {}", config.oracle_staleness_threshold_settle, v);
        config.oracle_staleness_threshold_settle = v;
    }
    if let Some(v) = params.epoch_duration_seconds {
        msg!("  epoch_duration_seconds: {} -> {}", config.epoch_duration_seconds, v);
        config.epoch_duration_seconds = v;
    }
    if let Some(v) = params.freeze_window_seconds {
        msg!("  freeze_window_seconds: {} -> {}", config.freeze_window_seconds, v);
        config.freeze_window_seconds = v;
    }
    if let Some(v) = params.allow_hedging {
        msg!("  allow_hedging: {} -> {}", config.allow_hedging, v);
        config.allow_hedging = v;
    }
    if let Some(v) = params.paused {
        msg!("  paused: {} -> {}", config.paused, v);
        config.paused = v;
    }
    if let Some(v) = params.frozen {
        msg!("  frozen: {} -> {}", config.frozen, v);
        config.frozen = v;
    }

    // Build bitmask of updated fields for event
    let mut fields_updated: u32 = 0;
    if params.treasury.is_some() { fields_updated |= 1 << 0; }
    if params.insurance.is_some() { fields_updated |= 1 << 1; }
    if params.trading_fee_bps.is_some() { fields_updated |= 1 << 2; }
    if params.lp_fee_share_bps.is_some() { fields_updated |= 1 << 3; }
    if params.treasury_fee_share_bps.is_some() { fields_updated |= 1 << 4; }
    if params.insurance_fee_share_bps.is_some() { fields_updated |= 1 << 5; }
    if params.per_wallet_cap_bps.is_some() { fields_updated |= 1 << 6; }
    if params.per_side_cap_bps.is_some() { fields_updated |= 1 << 7; }
    if params.oracle_confidence_threshold_start_bps.is_some() { fields_updated |= 1 << 8; }
    if params.oracle_confidence_threshold_settle_bps.is_some() { fields_updated |= 1 << 9; }
    if params.oracle_staleness_threshold_start.is_some() { fields_updated |= 1 << 10; }
    if params.oracle_staleness_threshold_settle.is_some() { fields_updated |= 1 << 11; }
    if params.epoch_duration_seconds.is_some() { fields_updated |= 1 << 12; }
    if params.freeze_window_seconds.is_some() { fields_updated |= 1 << 13; }
    if params.allow_hedging.is_some() { fields_updated |= 1 << 14; }
    if params.paused.is_some() { fields_updated |= 1 << 15; }
    if params.frozen.is_some() { fields_updated |= 1 << 16; }

    emit!(ConfigUpdated {
        admin: ctx.accounts.admin.key(),
        config: config.key(),
        fields_updated,
    });

    Ok(())
}
