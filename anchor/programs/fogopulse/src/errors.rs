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

    // Protocol state errors
    #[msg("Protocol is paused - no new operations allowed")]
    ProtocolPaused,

    #[msg("Protocol is frozen - emergency halt active")]
    ProtocolFrozen,

    // Pool state errors
    #[msg("Pool is paused - no new epochs allowed")]
    PoolPaused,

    #[msg("Pool is frozen - emergency halt active")]
    PoolFrozen,

    // Epoch errors
    #[msg("Cannot create epoch - active epoch exists")]
    EpochAlreadyActive,

    #[msg("Arithmetic overflow")]
    Overflow,

    // Oracle errors
    #[msg("Oracle verification failed - signature invalid or untrusted signer")]
    OracleVerificationFailed,

    #[msg("Oracle data invalid - failed to deserialize message")]
    OracleDataInvalid,

    #[msg("Oracle price missing - no price data in payload")]
    OraclePriceMissing,

    #[msg("Oracle data stale - publish time exceeds staleness threshold")]
    OracleDataStale,

    #[msg("Oracle confidence too wide - exceeds confidence threshold")]
    OracleConfidenceTooWide,

    #[msg("Oracle exponent missing - exponent property not found in payload")]
    OracleExponentMissing,

    // Session errors
    #[msg("Session extraction failed - invalid, expired, or unauthorized session")]
    SessionExtractionFailed,

    // Position errors
    #[msg("Invalid epoch reference")]
    InvalidEpoch,

    #[msg("Position already claimed")]
    AlreadyClaimed,

    // Placeholder for unimplemented instructions
    #[msg("Instruction not yet implemented")]
    NotImplemented,

    // Trading errors
    #[msg("Epoch is not in Open state")]
    EpochNotOpen,

    #[msg("Exceeds per-wallet position cap")]
    ExceedsWalletCap,

    #[msg("Exceeds per-side exposure cap")]
    ExceedsSideCap,

    #[msg("Insufficient token balance")]
    InsufficientBalance,

    #[msg("Cannot open opposite direction - hedging disabled")]
    InvalidDirection,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Token account owner does not match expected user")]
    TokenOwnerMismatch,

    #[msg("Token account mint does not match expected mint")]
    InvalidMint,

    #[msg("Trade amount below minimum required")]
    BelowMinimumTrade,

    #[msg("Trade amount exceeds maximum allowed")]
    AboveMaximumTrade,

    #[msg("Invalid epoch state for this operation")]
    InvalidEpochState,

    #[msg("Epoch has not reached end_time yet")]
    EpochNotEnded,

    #[msg("Epoch has not reached freeze_time yet")]
    EpochNotFrozen,

    // Payout errors
    #[msg("Position is not on the winning side")]
    PositionNotWinner,

    // Sell position errors
    #[msg("Position does not have enough shares to sell")]
    InsufficientShares,

    #[msg("Shares amount must be greater than zero")]
    ZeroShares,

    #[msg("Pool does not have sufficient reserves for this sell")]
    InsufficientPoolReserves,

    // LP errors
    #[msg("Pool has no liquidity")]
    PoolEmpty,

    #[msg("Deposit too small - would mint zero LP shares")]
    DepositTooSmall,

    #[msg("A withdrawal request is already pending")]
    WithdrawalAlreadyPending,

    #[msg("No pending withdrawal to process")]
    NoPendingWithdrawal,

    #[msg("Withdrawal cooldown period has not elapsed")]
    CooldownNotElapsed,

    #[msg("Withdrawal too small - would transfer zero USDC")]
    WithdrawalTooSmall,

    #[msg("Withdrawal cannot be processed during an active epoch - will be processed after settlement")]
    WithdrawalBlockedDuringEpoch,

    #[msg("Settlement timeout not yet reached")]
    SettlementTimeoutNotReached,

    #[msg("Invalid divisor - must be greater than 1")]
    InvalidDivisor,

    #[msg("Divisor too large - would zero out LP shares")]
    DivisorTooLarge,
}
