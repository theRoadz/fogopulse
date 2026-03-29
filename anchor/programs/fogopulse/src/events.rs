use anchor_lang::prelude::*;
use crate::state::{Direction, Outcome, RefundReason};

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
    pub max_trade_amount: u64,
    pub settlement_timeout_seconds: i64,
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

#[event]
pub struct EpochForceClosed {
    /// Epoch account pubkey
    pub epoch: Pubkey,
    /// Parent pool
    pub pool: Pubkey,
    /// Sequential epoch identifier within pool
    pub epoch_id: u64,
    /// Admin who force-closed the epoch
    pub admin: Pubkey,
}

#[event]
pub struct EpochTimeoutForceClosed {
    /// Epoch account pubkey
    pub epoch: Pubkey,
    /// Parent pool
    pub pool: Pubkey,
    /// Sequential epoch identifier within pool
    pub epoch_id: u64,
    /// Permissionless caller who triggered the timeout force-close
    pub caller: Pubkey,
}

#[event]
pub struct ConfigUpdated {
    /// Admin who updated the config
    pub admin: Pubkey,
    /// GlobalConfig account pubkey
    pub config: Pubkey,
    /// Bitmask of which fields were updated (for efficient indexing)
    /// Bit positions: 0=treasury, 1=insurance, 2=trading_fee, 3=lp_fee,
    /// 4=treasury_fee, 5=insurance_fee, 6=wallet_cap, 7=side_cap,
    /// 8=confidence_start, 9=confidence_settle, 10=staleness_start,
    /// 11=staleness_settle, 12=epoch_duration, 13=freeze_window,
    /// 14=allow_hedging, 15=paused, 16=frozen, 17=max_trade_amount,
    /// 18=settlement_timeout_seconds
    pub fields_updated: u32,
}

#[event]
pub struct EpochSettled {
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
    /// Oracle price at settlement
    pub settlement_price: u64,
    /// Oracle confidence at settlement
    pub settlement_confidence: u64,
    /// Oracle publish timestamp at settlement
    pub settlement_publish_time: i64,
    /// Final outcome (Up, Down, or Refunded)
    pub outcome: Outcome,
}

#[event]
pub struct EpochRefunded {
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
    /// Oracle price at settlement
    pub settlement_price: u64,
    /// Oracle confidence at settlement
    pub settlement_confidence: u64,
    /// Reason for the refund
    pub refund_reason: RefundReason,
}

#[event]
pub struct EpochFrozen {
    /// Epoch account pubkey
    pub epoch: Pubkey,
    /// Parent pool
    pub pool: Pubkey,
    /// Sequential epoch identifier within pool
    pub epoch_id: u64,
    /// Timestamp when trading stopped
    pub freeze_time: i64,
}

#[event]
pub struct PoolRebalanced {
    /// Pool account pubkey
    pub pool: Pubkey,
    /// Epoch that triggered the rebalancing
    pub epoch: Pubkey,
    /// YES reserves before rebalancing
    pub yes_reserves_before: u64,
    /// NO reserves before rebalancing
    pub no_reserves_before: u64,
    /// YES reserves after rebalancing (gets remainder if odd total)
    pub yes_reserves_after: u64,
    /// NO reserves after rebalancing
    pub no_reserves_after: u64,
}

#[event]
pub struct RefundClaimed {
    /// Epoch account pubkey
    pub epoch: Pubkey,
    /// User who claimed the refund
    pub user: Pubkey,
    /// Refund amount in USDC lamports
    pub amount: u64,
    /// YES reserves after claim
    pub yes_reserves_after: u64,
    /// NO reserves after claim
    pub no_reserves_after: u64,
}

#[event]
pub struct PayoutClaimed {
    /// Epoch account pubkey
    pub epoch: Pubkey,
    /// User who claimed the payout
    pub user: Pubkey,
    /// Payout amount in USDC lamports (original stake + winnings)
    pub amount: u64,
    /// Direction of the winning position
    pub direction: Direction,
    /// YES reserves after claim
    pub yes_reserves_after: u64,
    /// NO reserves after claim
    pub no_reserves_after: u64,
}

#[event]
pub struct PositionSold {
    /// Epoch account pubkey
    pub epoch: Pubkey,
    /// User who sold the position
    pub user: Pubkey,
    /// Direction of the position (Up or Down)
    pub direction: Direction,
    /// Number of shares sold
    pub shares_sold: u64,
    /// Gross refund before fees
    pub gross_refund: u64,
    /// Net payout after fees (sent to user)
    pub net_payout: u64,
    /// Remaining shares after sell (0 if full exit)
    pub remaining_shares: u64,
    /// Remaining amount after sell (0 if full exit)
    pub remaining_amount: u64,
    /// Whether this was a full exit (all shares sold)
    pub is_full_exit: bool,
    /// Unix timestamp of the sell
    pub timestamp: i64,
}

#[event]
pub struct FeesCollected {
    /// Epoch where fees were collected
    pub epoch: Pubkey,
    /// User who paid the fees (trader)
    pub user: Pubkey,
    /// Original trade amount before fees
    pub gross_amount: u64,
    /// Amount after fees (used for share calculation)
    pub net_amount: u64,
    /// Total fee charged (trading_fee_bps of gross amount)
    pub total_fee: u64,
    /// LP portion of fee (stays in pool USDC, auto-compounds)
    pub lp_fee: u64,
    /// Treasury portion of fee (transferred to treasury)
    pub treasury_fee: u64,
    /// Insurance portion of fee (transferred to insurance)
    pub insurance_fee: u64,
}

#[event]
pub struct PoolPaused {
    /// Pool account pubkey
    pub pool: Pubkey,
    /// Asset mint this pool tracks
    pub asset_mint: Pubkey,
    /// Admin who paused the pool
    pub admin: Pubkey,
}

#[event]
pub struct PoolResumed {
    /// Pool account pubkey
    pub pool: Pubkey,
    /// Asset mint this pool tracks
    pub asset_mint: Pubkey,
    /// Admin who resumed the pool
    pub admin: Pubkey,
}

#[event]
pub struct ProtocolFrozen {
    /// Admin who triggered the freeze
    pub admin: Pubkey,
    /// Unix timestamp when protocol was frozen
    pub timestamp: i64,
}

#[event]
pub struct WithdrawalRequested {
    /// Pool account pubkey
    pub pool: Pubkey,
    /// User who requested withdrawal
    pub user: Pubkey,
    /// Number of LP shares requested for withdrawal
    pub shares_amount: u64,
    /// Total LP shares user holds (including pending)
    pub total_shares: u64,
    /// Unix timestamp of the request
    pub timestamp: i64,
}

#[event]
pub struct LiquidityDeposited {
    /// Pool account pubkey
    pub pool: Pubkey,
    /// User who deposited liquidity
    pub user: Pubkey,
    /// USDC amount deposited
    pub amount: u64,
    /// LP shares minted for this deposit
    pub shares_minted: u64,
    /// Total LP shares in pool after deposit
    pub total_lp_shares_after: u64,
    /// YES reserves after deposit
    pub yes_reserves_after: u64,
    /// NO reserves after deposit
    pub no_reserves_after: u64,
}

#[event]
pub struct WithdrawalProcessed {
    /// Pool account pubkey
    pub pool: Pubkey,
    /// User who processed withdrawal
    pub user: Pubkey,
    /// Number of LP shares burned
    pub shares_burned: u64,
    /// USDC amount transferred to user
    pub usdc_amount: u64,
    /// Total LP shares in pool after withdrawal
    pub total_lp_shares_after: u64,
    /// YES reserves after withdrawal
    pub yes_reserves_after: u64,
    /// NO reserves after withdrawal
    pub no_reserves_after: u64,
}
