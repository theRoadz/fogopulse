#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("Ht3NLQDkJG4BLgsnUnyuWD2393wULyP5nEXx8AyXhiGr");

#[program]
pub mod fogopulse {
    use super::*;

    pub fn initialize(
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
        instructions::initialize::handler(
            ctx,
            treasury,
            insurance,
            trading_fee_bps,
            lp_fee_share_bps,
            treasury_fee_share_bps,
            insurance_fee_share_bps,
            per_wallet_cap_bps,
            per_side_cap_bps,
            oracle_confidence_threshold_start_bps,
            oracle_confidence_threshold_settle_bps,
            oracle_staleness_threshold_start,
            oracle_staleness_threshold_settle,
            epoch_duration_seconds,
            freeze_window_seconds,
            allow_hedging,
        )
    }

    pub fn create_pool(ctx: Context<CreatePool>) -> Result<()> {
        instructions::create_pool::handler(ctx)
    }
}
