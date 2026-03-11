use anchor_lang::prelude::*;

#[event]
pub struct GlobalConfigInitialized {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub insurance: Pubkey,
    pub trading_fee_bps: u16,
    pub lp_fee_share_bps: u16,
    pub treasury_fee_share_bps: u16,
    pub insurance_fee_share_bps: u16,
    pub per_wallet_cap_bps: u16,
    pub per_side_cap_bps: u16,
    pub oracle_confidence_threshold_start_bps: u16,
    pub oracle_confidence_threshold_settle_bps: u16,
    pub oracle_staleness_threshold_start: i64,
    pub oracle_staleness_threshold_settle: i64,
    pub epoch_duration_seconds: i64,
    pub freeze_window_seconds: i64,
    pub allow_hedging: bool,
}

#[event]
pub struct PoolCreated {
    /// Pool account pubkey
    pub pool: Pubkey,
    /// Asset mint this pool tracks
    pub asset_mint: Pubkey,
    /// Max position per wallet in basis points (copied from GlobalConfig)
    pub wallet_cap_bps: u16,
    /// Max exposure per side in basis points (copied from GlobalConfig)
    pub side_cap_bps: u16,
}
