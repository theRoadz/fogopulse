use anchor_lang::prelude::*;

/// Epoch state machine - tracks the lifecycle of a trading epoch
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default, Debug)]
pub enum EpochState {
    /// Trading allowed
    #[default]
    Open,
    /// In freeze window, no trades allowed
    Frozen,
    /// Settlement in progress
    Settling,
    /// Outcome determined, payouts available
    Settled,
    /// Oracle failed, all positions refunded
    Refunded,
}

impl EpochState {
    /// Convert to u8 for Pool.active_epoch_state cache field
    /// 0 = None (no active epoch), 1 = Open, 2 = Frozen, etc.
    pub const fn as_pool_cache_u8(&self) -> u8 {
        match self {
            EpochState::Open => 1,
            EpochState::Frozen => 2,
            EpochState::Settling => 3,
            EpochState::Settled => 4,
            EpochState::Refunded => 5,
        }
    }
}

/// Final outcome of an epoch after settlement
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum Outcome {
    /// Settlement price > Start price
    #[default]
    Up,
    /// Settlement price < Start price
    Down,
    /// Confidence bands overlap or prices tied - all refunded
    Refunded,
}

/// Reason for epoch refund (for event logging)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RefundReason {
    /// Confidence bands overlap - outcome too uncertain
    ConfidenceOverlap,
    /// Settlement price exactly equals start price
    Tie,
}

/// Epoch account - represents a time-bounded trading period within a pool
#[account]
#[derive(InitSpace)]
pub struct Epoch {
    /// Parent pool reference
    pub pool: Pubkey,

    /// Sequential identifier within pool (0, 1, 2, ...)
    pub epoch_id: u64,

    /// Current epoch state
    pub state: EpochState,

    /// Unix timestamp when epoch begins
    pub start_time: i64,

    /// Unix timestamp when epoch ends
    pub end_time: i64,

    /// When trading stops (end_time - freeze_window_seconds)
    pub freeze_time: i64,

    /// Oracle price at epoch creation
    pub start_price: u64,

    /// Oracle confidence at epoch creation
    pub start_confidence: u64,

    /// Oracle publish timestamp at epoch creation
    pub start_publish_time: i64,

    /// Oracle price at settlement (None until settled)
    pub settlement_price: Option<u64>,

    /// Oracle confidence at settlement
    pub settlement_confidence: Option<u64>,

    /// Oracle publish timestamp at settlement
    pub settlement_publish_time: Option<i64>,

    /// Final outcome (Up, Down, or Refunded)
    pub outcome: Option<Outcome>,

    /// PDA bump seed
    pub bump: u8,
}
