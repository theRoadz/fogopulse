use anchor_lang::prelude::*;
use crate::state::Direction;

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

#[event]
pub struct EpochCreated {
    /// Epoch account pubkey
    pub epoch: Pubkey,
    /// Parent pool
    pub pool: Pubkey,
    /// Sequential epoch identifier within pool
    pub epoch_id: u64,
    /// Oracle price at epoch creation
    pub start_price: u64,
    /// Oracle confidence at epoch creation
    pub start_confidence: u64,
    /// Oracle publish timestamp at epoch creation (from verified Pyth data)
    pub start_publish_time: i64,
    /// Unix timestamp when epoch begins
    pub start_time: i64,
    /// Unix timestamp when epoch ends
    pub end_time: i64,
}

#[event]
pub struct PositionOpened {
    /// Epoch account pubkey
    pub epoch: Pubkey,
    /// User wallet that opened the position
    pub user: Pubkey,
    /// Direction of the position (Up or Down)
    pub direction: Direction,
    /// Amount in USDC (lamports, 6 decimals)
    pub amount: u64,
    /// Shares received from CPMM calculation
    pub shares: u64,
    /// Entry price per share (for PnL calculations)
    pub entry_price: u64,
    /// Unix timestamp when position was opened
    pub timestamp: i64,
}
