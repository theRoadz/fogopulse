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
        max_trade_amount: u64,
        settlement_timeout_seconds: i64,
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
            max_trade_amount,
            settlement_timeout_seconds,
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

    /// Process a pending LP withdrawal (permissionless, for crank bots)
    ///
    /// Unlike process_withdrawal which requires user/session signature,
    /// this instruction can be called by anyone. The withdrawal was already
    /// authorized by the user in request_withdrawal. USDC is sent to the
    /// user's token account (not the caller).
    pub fn crank_process_withdrawal(ctx: Context<CrankProcessWithdrawal>) -> Result<()> {
        instructions::crank_process_withdrawal::handler(ctx)
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
        direction: Direction,
        shares: u64,
    ) -> Result<()> {
        instructions::sell_position::handler(ctx, user, direction, shares)
    }

    /// Claim payout from a winning position
    ///
    /// Supports FOGO Sessions for gasless claims.
    pub fn claim_payout(ctx: Context<ClaimPayout>, user: Pubkey, direction: Direction) -> Result<()> {
        instructions::claim_payout::handler(ctx, user, direction)
    }

    /// Claim refund from a refunded epoch
    ///
    /// Supports FOGO Sessions for gasless claims.
    /// Returns original stake when epoch outcome is Refunded (exact tie).
    pub fn claim_refund(ctx: Context<ClaimRefund>, user: Pubkey, direction: Direction) -> Result<()> {
        instructions::claim_refund::handler(ctx, user, direction)
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

    /// Request withdrawal of LP shares from a pool
    ///
    /// Supports FOGO Sessions for gasless withdrawal requests.
    /// This only marks shares as pending — no token transfers occur.
    /// Use process_withdrawal to complete the withdrawal after cooldown.
    pub fn request_withdrawal(
        ctx: Context<RequestWithdrawal>,
        user: Pubkey,
        shares_amount: u64,
    ) -> Result<()> {
        instructions::request_withdrawal::handler(ctx, user, shares_amount)
    }

    /// Process a pending LP withdrawal after cooldown
    ///
    /// Supports FOGO Sessions for gasless withdrawal processing.
    /// Calculates USDC value from shares at current pool value,
    /// transfers USDC to user, and burns the LP shares.
    pub fn process_withdrawal(ctx: Context<ProcessWithdrawal>, user: Pubkey) -> Result<()> {
        instructions::process_withdrawal::handler(ctx, user)
    }

    // =========================================================================
    // ADMIN INSTRUCTIONS
    // =========================================================================

    /// Close a stale LpShare account (admin only, testnet utility)
    ///
    /// Used after pool reinitialization to clean up orphaned LpShare accounts.
    pub fn admin_close_lp_share(ctx: Context<AdminCloseLpShare>, user: Pubkey) -> Result<()> {
        instructions::admin_close_lp_share::handler(ctx, user)
    }

    /// Close an epoch account (admin only, testnet utility)
    ///
    /// Used to clean up orphaned epoch accounts after pool reinitialization.
    /// Returns rent to admin.
    pub fn admin_close_epoch(ctx: Context<AdminCloseEpoch>, epoch_id: u64) -> Result<()> {
        instructions::admin_close_epoch::handler(ctx, epoch_id)
    }

    /// Close a position account (admin only, testnet utility)
    ///
    /// Used to clean up orphaned position accounts after pool reinitialization.
    /// Old positions collide with new epoch PDAs and block new trades.
    pub fn admin_close_position(ctx: Context<AdminClosePosition>, epoch_id: u64, user: Pubkey, direction: u8) -> Result<()> {
        instructions::admin_close_position::handler(ctx, epoch_id, user, direction)
    }

    /// Close a pool account (admin only, testnet utility)
    ///
    /// Used when Pool struct size changes and accounts need to be recreated.
    /// Returns rent to admin.
    pub fn admin_close_pool(ctx: Context<AdminClosePool>) -> Result<()> {
        instructions::admin_close_pool::handler(ctx)
    }

    /// Close GlobalConfig account (admin only, testnet utility)
    /// Used when GlobalConfig struct size changes and account needs recreation.
    pub fn admin_close_config(ctx: Context<AdminCloseConfig>) -> Result<()> {
        instructions::admin_close_config::handler(ctx)
    }

    /// Force-close a stuck epoch (admin only)
    ///
    /// Emergency instruction to clear a stuck epoch when settlement
    /// is not yet implemented. Sets epoch state to Refunded and
    /// clears pool.active_epoch to allow new epoch creation.
    pub fn admin_force_close_epoch(ctx: Context<AdminForceCloseEpoch>) -> Result<()> {
        instructions::admin_force_close_epoch::handler(ctx)
    }

    /// Permissionless timeout force-close for stuck Frozen epochs
    ///
    /// When a Frozen epoch has been stuck past `end_time + settlement_timeout_seconds`,
    /// anyone can call this to force-close it as Refunded. No oracle data needed.
    pub fn timeout_force_close_epoch(ctx: Context<TimeoutForceCloseEpoch>) -> Result<()> {
        instructions::timeout_force_close_epoch::handler(ctx)
    }

    /// Pause a specific pool (admin only)
    ///
    /// Sets pool.is_paused = true, preventing new epoch creation
    /// and new trades. Existing epochs continue to settle normally.
    pub fn pause_pool(ctx: Context<PausePool>) -> Result<()> {
        instructions::pause_pool::handler(ctx)
    }

    /// Emergency freeze — halts ALL protocol activity
    ///
    /// Sets global_config.frozen = true. All instructions except
    /// this one are blocked when frozen.
    pub fn emergency_freeze(ctx: Context<EmergencyFreeze>) -> Result<()> {
        instructions::emergency_freeze::handler(ctx)
    }

    /// Resume a paused pool (admin only)
    ///
    /// Sets pool.is_paused = false, allowing new epoch creation
    /// and new trades to resume.
    pub fn resume_pool(ctx: Context<ResumePool>) -> Result<()> {
        instructions::resume_pool::handler(ctx)
    }

    /// Update protocol configuration (admin only)
    ///
    /// Allows admin to modify GlobalConfig parameters like oracle thresholds,
    /// fee settings, and feature flags. Only provided fields are updated.
    pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
        instructions::update_config::handler(ctx, params)
    }

    /// Sync pool reserves with actual USDC token balance (admin only)
    ///
    /// One-time utility to fix reserve accounting drift from Story 7.32 bug
    /// (claim_payout/claim_refund not reducing reserves). Reads actual pool
    /// USDC balance and sets reserves to balance/2 each.
    pub fn admin_sync_reserves(ctx: Context<AdminSyncReserves>) -> Result<()> {
        instructions::admin_sync_reserves::handler(ctx)
    }

    /// Normalize inflated LP shares by dividing by a divisor (admin only)
    ///
    /// One-time utility to fix LP share inflation from Story 7.32 reserve drift.
    /// Call once per LpShare account per pool with the same divisor.
    /// Preserves proportional ownership while bringing shares back to sane values.
    pub fn admin_normalize_lp_shares(ctx: Context<AdminNormalizeLpShares>, divisor: u64) -> Result<()> {
        instructions::admin_normalize_lp_shares::handler(ctx, divisor)
    }
}
