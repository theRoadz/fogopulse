use anchor_lang::prelude::*;

#[error_code]
pub enum FogoPulseError {
    /// Used by admin-only instructions (update_config, pause, freeze)
    #[msg("Unauthorized - admin signature required")]
    Unauthorized,

    /// Reserved for explicit re-initialization checks if needed
    #[msg("GlobalConfig already initialized")]
    AlreadyInitialized,

    #[msg("Invalid fee share - must sum to 10000 bps")]
    InvalidFeeShare,

    #[msg("Invalid cap value - must be between 0 and 10000 bps")]
    InvalidCap,

    #[msg("Invalid trading fee - must be between 0 and 1000 bps (10%)")]
    InvalidTradingFee,

    #[msg("Invalid timing parameters - freeze window must be less than epoch duration, epoch must be at least 60 seconds")]
    InvalidTimingParams,

    #[msg("Invalid oracle threshold - must be between 1 and 10000 bps")]
    InvalidOracleThreshold,
}
