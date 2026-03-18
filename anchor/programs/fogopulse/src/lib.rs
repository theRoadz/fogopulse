#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod session;
pub mod state;
pub mod utils;

pub use constants::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5");

#[program]
pub mod fogopulse {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        treasury: Pubkey,
        insurance: Pubkey,
        trading_fee_bps: u16,
        lp_fee_share_bps: u16,
        treasury_fee_share_bps: u16,
        insurance_fee_share_bps: u16,
        per_wallet_cap_bps: u16,
        per_side_cap_bps: u16,
        oracle_confidence_threshold_start_bps: u16,
        oracle_confidence_threshold_settle_bps: u16,
        oracle_staleness_threshold_start: i64,
        oracle_staleness_threshold_settle: i64,
        epoch_duration_seconds: i64,
        freeze_window_seconds: i64,
        allow_hedging: bool,
    ) -> Result<()> {
        instructions::initialize::handler(
            ctx,
            treasury,
            insurance,
            trading_fee_bps,
            lp_fee_share_bps,
            treasury_fee_share_bps,
            insurance_fee_share_bps,
            per_wallet_cap_bps,
            per_side_cap_bps,
            oracle_confidence_threshold_start_bps,
            oracle_confidence_threshold_settle_bps,
            oracle_staleness_threshold_start,
            oracle_staleness_threshold_settle,
            epoch_duration_seconds,
            freeze_window_seconds,
            allow_hedging,
        )
    }

    pub fn create_pool(ctx: Context<CreatePool>) -> Result<()> {
        instructions::create_pool::handler(ctx)
    }

    /// Create a new epoch for a pool with verified Pyth Lazer oracle data
    ///
    /// # Arguments
    /// * `pyth_message` - Signed Pyth Lazer message bytes (Ed25519 format)
    /// * `ed25519_instruction_index` - Index of Ed25519 verify instruction in transaction (typically 0)
    /// * `signature_index` - Index of signature within Ed25519 instruction (typically 0)
    ///
    /// # Transaction Structure (client-side)
    /// ```text
    /// Transaction:
    ///   [0] Ed25519 signature verification instruction (MUST be first)
    ///   [1] create_epoch instruction (contains pyth_message)
    /// ```
    pub fn create_epoch(
        ctx: Context<CreateEpoch>,
        pyth_message: Vec<u8>,
        ed25519_instruction_index: u8,
        signature_index: u8,
    ) -> Result<()> {
        instructions::create_epoch::handler(ctx, pyth_message, ed25519_instruction_index, signature_index)
    }

    /// Advance an epoch from Open to Frozen state
    ///
    /// Permissionless instruction - anyone can call to advance an epoch that
    /// has reached its freeze_time. This stops trading during the freeze window.
    ///
    /// # Requirements
    /// - Epoch must be in Open state
    /// - Current time >= epoch.freeze_time
    /// - Protocol and pool must not be frozen
    pub fn advance_epoch(ctx: Context<AdvanceEpoch>) -> Result<()> {
        instructions::advance_epoch::handler(ctx)
    }

    /// Settle an epoch with verified Pyth Lazer oracle data
    ///
    /// Permissionless instruction - anyone can call to settle an epoch that
    /// has reached its end_time and is in Frozen state.
    ///
    /// # Arguments
    /// * `pyth_message` - Signed Pyth Lazer message bytes (Ed25519 format)
    /// * `ed25519_instruction_index` - Index of Ed25519 verify instruction in transaction (typically 0)
    /// * `signature_index` - Index of signature within Ed25519 instruction (typically 0)
    ///
    /// # Transaction Structure (client-side)
    /// ```text
    /// Transaction:
    ///   [0] Ed25519 signature verification instruction (MUST be first)
    ///   [1] settle_epoch instruction (contains pyth_message)
    /// ```
    ///
    /// # Outcome Determination
    /// - If settlement_price == start_price: Refunded (tie)
    /// - If settlement_price > start_price: Up wins
    /// - If settlement_price < start_price: Down wins
    ///
    /// Note: Oracle data quality is gated by the BPS-based confidence threshold
    /// check. If settlement confidence is too wide, the instruction rejects
    /// (epoch stays in Settling state for crank retry).
    pub fn settle_epoch(
        ctx: Context<SettleEpoch>,
        pyth_message: Vec<u8>,
        ed25519_instruction_index: u8,
        signature_index: u8,
    ) -> Result<()> {
        instructions::settle_epoch::handler(ctx, pyth_message, ed25519_instruction_index, signature_index)
    }

    // =========================================================================
    // USER-FACING INSTRUCTIONS (with FOGO Sessions support)
    // =========================================================================
    // These instructions support both direct wallet signatures AND session accounts.
    // The `user` parameter is validated against extract_user() in each handler.
    // See src/session.rs for the session extraction pattern.

    /// Buy a position in an epoch
    ///
    /// Supports FOGO Sessions for gasless trading.
    pub fn buy_position(
        ctx: Context<BuyPosition>,
        user: Pubkey,
        direction: Direction,
        amount: u64,
    ) -> Result<()> {
        instructions::buy_position::handler(ctx, user, direction, amount)
    }

    /// Sell a position before epoch settlement
    ///
    /// Supports FOGO Sessions for gasless trading.
    pub fn sell_position(
        ctx: Context<SellPosition>,
        user: Pubkey,
        shares: u64,
    ) -> Result<()> {
        instructions::sell_position::handler(ctx, user, shares)
    }

    /// Claim payout from a winning position
    ///
    /// Supports FOGO Sessions for gasless claims.
    pub fn claim_payout(ctx: Context<ClaimPayout>, user: Pubkey) -> Result<()> {
        instructions::claim_payout::handler(ctx, user)
    }

    /// Claim refund from a refunded epoch
    ///
    /// Supports FOGO Sessions for gasless claims.
    /// Returns original stake when epoch outcome is Refunded (exact tie).
    pub fn claim_refund(ctx: Context<ClaimRefund>, user: Pubkey) -> Result<()> {
        instructions::claim_refund::handler(ctx, user)
    }

    // =========================================================================
    // LP INSTRUCTIONS (with FOGO Sessions support)
    // =========================================================================

    /// Deposit USDC into a pool to receive LP shares
    ///
    /// Supports FOGO Sessions for gasless deposits.
    /// Deposits are split 50/50 between YES and NO reserves.
    /// LP shares are minted proportionally to the pool's reserve value.
    pub fn deposit_liquidity(
        ctx: Context<DepositLiquidity>,
        user: Pubkey,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit_liquidity::handler(ctx, user, amount)
    }

    // =========================================================================
    // ADMIN INSTRUCTIONS
    // =========================================================================

    /// Force-close a stuck epoch (admin only)
    ///
    /// Emergency instruction to clear a stuck epoch when settlement
    /// is not yet implemented. Sets epoch state to Refunded and
    /// clears pool.active_epoch to allow new epoch creation.
    pub fn admin_force_close_epoch(ctx: Context<AdminForceCloseEpoch>) -> Result<()> {
        instructions::admin_force_close_epoch::handler(ctx)
    }

    /// Seed initial liquidity into a pool (admin only)
    ///
    /// Transfers USDC from admin wallet to pool vault and splits
    /// the amount 50/50 between YES and NO reserves. Used to bootstrap
    /// pools with initial liquidity for testnet trading.
    pub fn admin_seed_liquidity(ctx: Context<AdminSeedLiquidity>, amount: u64) -> Result<()> {
        instructions::admin_seed_liquidity::handler(ctx, amount)
    }

    /// Update protocol configuration (admin only)
    ///
    /// Allows admin to modify GlobalConfig parameters like oracle thresholds,
    /// fee settings, and feature flags. Only provided fields are updated.
    pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
        instructions::update_config::handler(ctx, params)
    }
}
