//! Initialize instruction - One-time protocol setup by admin
//!
//! ## Session Exclusion (ADMIN-ONLY)
//!
//! This instruction does NOT use FOGO Sessions and requires direct admin wallet signature.
//!
//! **Rationale:** Protocol initialization is a one-time, high-privilege operation that:
//! - Creates the GlobalConfig singleton account
//! - Sets the admin pubkey (derived from actual signer, not session)
//! - Configures all protocol parameters (fees, caps, thresholds)
//! - Must be performed by the actual admin wallet, not a delegated session
//!
//! Session accounts enable gasless UX for repetitive user operations (trading, claiming).
//! Admin operations are rare, require maximum security, and should never be delegated.
//!
//! ## User-facing instructions that DO use sessions:
//! - `buy_position`, `sell_position`, `claim_payout`, `claim_refund`
//! - `deposit_liquidity`, `withdraw_liquidity`
//!
//! See `src/session.rs` for the session extraction pattern.

use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;
use crate::events::GlobalConfigInitialized;
use crate::state::GlobalConfig;

/// Initialize accounts - admin-only, no session support
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [b"global_config"],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    treasury: Pubkey,
    insurance: Pubkey,
    trading_fee_bps: u16,
    lp_fee_share_bps: u16,
    treasury_fee_share_bps: u16,
    insurance_fee_share_bps: u16,
    per_wallet_cap_bps: u16,
    per_side_cap_bps: u16,
    oracle_confidence_threshold_start_bps: u16,
    oracle_confidence_threshold_settle_bps: u16,
    oracle_staleness_threshold_start: i64,
    oracle_staleness_threshold_settle: i64,
    epoch_duration_seconds: i64,
    freeze_window_seconds: i64,
    allow_hedging: bool,
) -> Result<()> {
    // Validate trading fee is reasonable (max 10% = 1000 bps)
    require!(
        trading_fee_bps <= 1000,
        FogoPulseError::InvalidTradingFee
    );

    // Validate fee shares sum to 10000 bps (100%)
    require!(
        lp_fee_share_bps as u32 + treasury_fee_share_bps as u32 + insurance_fee_share_bps as u32 == 10000,
        FogoPulseError::InvalidFeeShare
    );

    // Validate cap values are within bounds
    require!(
        per_wallet_cap_bps <= 10000 && per_side_cap_bps <= 10000,
        FogoPulseError::InvalidCap
    );

    // Validate timing parameters: epoch must be at least 60s, freeze window must be less than epoch
    require!(
        epoch_duration_seconds >= 60 && freeze_window_seconds >= 0 && freeze_window_seconds < epoch_duration_seconds,
        FogoPulseError::InvalidTimingParams
    );

    // Validate oracle thresholds are reasonable (1-10000 bps)
    require!(
        oracle_confidence_threshold_start_bps >= 1 && oracle_confidence_threshold_start_bps <= 10000 &&
        oracle_confidence_threshold_settle_bps >= 1 && oracle_confidence_threshold_settle_bps <= 10000,
        FogoPulseError::InvalidOracleThreshold
    );

    let config = &mut ctx.accounts.global_config;

    config.admin = ctx.accounts.admin.key();
    config.treasury = treasury;
    config.insurance = insurance;
    config.trading_fee_bps = trading_fee_bps;
    config.lp_fee_share_bps = lp_fee_share_bps;
    config.treasury_fee_share_bps = treasury_fee_share_bps;
    config.insurance_fee_share_bps = insurance_fee_share_bps;
    config.per_wallet_cap_bps = per_wallet_cap_bps;
    config.per_side_cap_bps = per_side_cap_bps;
    config.oracle_confidence_threshold_start_bps = oracle_confidence_threshold_start_bps;
    config.oracle_confidence_threshold_settle_bps = oracle_confidence_threshold_settle_bps;
    config.oracle_staleness_threshold_start = oracle_staleness_threshold_start;
    config.oracle_staleness_threshold_settle = oracle_staleness_threshold_settle;
    config.epoch_duration_seconds = epoch_duration_seconds;
    config.freeze_window_seconds = freeze_window_seconds;
    config.allow_hedging = allow_hedging;
    config.paused = false;
    config.frozen = false;
    config.bump = ctx.bumps.global_config;

    emit!(GlobalConfigInitialized {
        admin: config.admin,
        treasury: config.treasury,
        insurance: config.insurance,
        trading_fee_bps: config.trading_fee_bps,
        lp_fee_share_bps: config.lp_fee_share_bps,
        treasury_fee_share_bps: config.treasury_fee_share_bps,
        insurance_fee_share_bps: config.insurance_fee_share_bps,
        per_wallet_cap_bps: config.per_wallet_cap_bps,
        per_side_cap_bps: config.per_side_cap_bps,
        oracle_confidence_threshold_start_bps: config.oracle_confidence_threshold_start_bps,
        oracle_confidence_threshold_settle_bps: config.oracle_confidence_threshold_settle_bps,
        oracle_staleness_threshold_start: config.oracle_staleness_threshold_start,
        oracle_staleness_threshold_settle: config.oracle_staleness_threshold_settle,
        epoch_duration_seconds: config.epoch_duration_seconds,
        freeze_window_seconds: config.freeze_window_seconds,
        allow_hedging: config.allow_hedging,
    });

    Ok(())
}
