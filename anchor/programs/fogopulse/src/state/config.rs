use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    /// Admin authority - can update config, pause/freeze
    pub admin: Pubkey,
    /// Treasury account for fee collection (20% of fees)
    pub treasury: Pubkey,
    /// Insurance buffer account (10% of fees)
    pub insurance: Pubkey,

    // Fee parameters
    /// Trading fee in basis points (e.g., 180 = 1.8%)
    pub trading_fee_bps: u16,
    /// LP share of trading fees in basis points (e.g., 7000 = 70%)
    pub lp_fee_share_bps: u16,
    /// Treasury share of trading fees in basis points (e.g., 2000 = 20%)
    pub treasury_fee_share_bps: u16,
    /// Insurance share of trading fees in basis points (e.g., 1000 = 10%)
    pub insurance_fee_share_bps: u16,

    // Cap parameters
    /// Maximum position per wallet in basis points of pool (e.g., 500 = 5%)
    pub per_wallet_cap_bps: u16,
    /// Maximum exposure per side in basis points of pool (e.g., 3000 = 30%)
    pub per_side_cap_bps: u16,

    // Oracle thresholds
    /// Max confidence ratio for epoch start in basis points (e.g., 25 = 0.25%)
    pub oracle_confidence_threshold_start_bps: u16,
    /// Max confidence ratio for settlement in basis points (e.g., 80 = 0.8%)
    pub oracle_confidence_threshold_settle_bps: u16,
    /// Max oracle age in seconds for epoch start (e.g., 3)
    pub oracle_staleness_threshold_start: i64,
    /// Max oracle age in seconds for settlement (e.g., 10)
    pub oracle_staleness_threshold_settle: i64,

    // Timing parameters
    /// Epoch duration in seconds (e.g., 300 = 5 minutes)
    pub epoch_duration_seconds: i64,
    /// Freeze window before settlement in seconds (e.g., 15)
    pub freeze_window_seconds: i64,

    // Feature flags
    /// If true, users can hold both UP and DOWN positions in same epoch
    pub allow_hedging: bool,

    // Protocol state
    /// Pause new epoch creation globally
    pub paused: bool,
    /// Emergency freeze - halts ALL activity
    pub frozen: bool,

    // Trade limits
    /// Maximum trade amount in USDC lamports (6 decimals)
    /// e.g., 100_000_000 = $100 USDC. Admin-configurable via update_config.
    pub max_trade_amount: u64,

    /// Seconds after end_time before permissionless timeout force-close is allowed
    /// Default: 60 (1 minute). Must be > 0.
    pub settlement_timeout_seconds: i64,

    /// PDA bump seed
    pub bump: u8,
}
