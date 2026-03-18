use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    /// Asset mint this pool tracks (e.g., BTC mint address)
    pub asset_mint: Pubkey,

    /// YES token reserves (USDC backing YES positions)
    pub yes_reserves: u64,
    /// NO token reserves (USDC backing NO positions)
    pub no_reserves: u64,
    /// Total LP shares issued for this pool
    pub total_lp_shares: u64,
    /// Total LP shares pending withdrawal across all LPs (updated on request/process)
    pub pending_withdrawal_shares: u64,

    /// Counter for next epoch creation (starts at 0)
    pub next_epoch_id: u64,

    /// Current active epoch PDA, or None if no active epoch
    pub active_epoch: Option<Pubkey>,
    /// Cached state: 0=None, 1=Open, 2=Frozen
    pub active_epoch_state: u8,

    /// Max position per wallet in basis points (copied from GlobalConfig at creation)
    pub wallet_cap_bps: u16,
    /// Max exposure per side in basis points (copied from GlobalConfig at creation)
    pub side_cap_bps: u16,

    /// Pool-level pause flag (blocks new trades/epochs)
    pub is_paused: bool,
    /// Pool-level freeze flag (emergency halt)
    pub is_frozen: bool,

    /// PDA bump seed
    pub bump: u8,
}
