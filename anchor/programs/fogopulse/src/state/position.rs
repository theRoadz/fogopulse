use anchor_lang::prelude::*;

/// Direction of a user's position prediction
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default, Debug)]
pub enum Direction {
    /// Prediction: settlement price > start price
    #[default]
    Up,
    /// Prediction: settlement price < start price
    Down,
}

/// UserPosition account - tracks a user's position within a specific epoch
/// PDA Seeds: ["position", epoch.key(), user.key(), direction_byte]
#[account]
#[derive(InitSpace, Debug)]
pub struct UserPosition {
    /// Wallet address of the position holder
    pub user: Pubkey,

    /// Reference to the epoch this position is in
    pub epoch: Pubkey,

    /// Direction of the prediction (Up or Down)
    pub direction: Direction,

    /// Position size in USDC (lamports, 6 decimals)
    pub amount: u64,

    /// Shares received from CPMM calculation
    pub shares: u64,

    /// Price paid per share at entry (for PnL calculations)
    pub entry_price: u64,

    /// Whether payout or refund has been claimed
    pub claimed: bool,

    /// PDA bump seed
    pub bump: u8,
}
