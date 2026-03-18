use anchor_lang::prelude::*;

/// LpShare account - tracks a user's LP position within a specific pool
/// PDA Seeds: ["lp_share", user.key(), pool.key()]
#[account]
#[derive(InitSpace, Debug)]
pub struct LpShare {
    /// Wallet address of the LP
    pub user: Pubkey,

    /// Reference to the pool this LP position is in
    pub pool: Pubkey,

    /// LP shares currently owned (proportional to pool value)
    pub shares: u64,

    /// Total USDC deposited over time (for tracking, not share calculation)
    pub deposited_amount: u64,

    /// Shares pending withdrawal (locked during cooldown)
    pub pending_withdrawal: u64,

    /// Timestamp when withdrawal was requested (None if no pending withdrawal)
    pub withdrawal_requested_at: Option<i64>,

    /// PDA bump seed
    pub bump: u8,
}

// Compile-time size check: LpShare Borsh-serialized data must be 98 bytes (106 with 8-byte discriminator)
// Uses Anchor's InitSpace derive which calculates Borsh serialization size, not Rust mem layout
const _: () = assert!(
    LpShare::INIT_SPACE == 98,
    "LpShare account size changed from expected 98 bytes"
);
