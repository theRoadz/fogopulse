//! Settle Epoch instruction - Permissionless epoch settlement with Pyth oracle
//!
//! ## Session Exclusion (PERMISSIONLESS)
//!
//! This instruction does NOT use FOGO Sessions because it is PERMISSIONLESS.
//!
//! **Rationale:** Epoch settlement is designed to be callable by anyone:
//! - Keeper bots / crank services can automatically settle epochs
//! - No user identity verification needed - any wallet can pay the transaction fee
//! - The caller's identity is irrelevant to the operation
//! - No position or funds are associated with the caller
//!
//! Since there's no "user" whose identity matters, session extraction is not applicable.
//! The payer is simply whoever pays the transaction fee, not a user performing an action
//! on their account.
//!
//! ## Similar permissionless instructions (no session needed):
//! - `create_epoch` - Anyone can trigger epoch creation
//! - `settle_epoch` - Anyone can settle an expired epoch (this instruction)
//!
//! ## User-facing instructions that DO use sessions:
//! - `buy_position`, `sell_position`, `claim_payout`, `claim_refund`
//! - `deposit_liquidity`, `withdraw_liquidity`

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions as sysvar_instructions;

use pyth_lazer_solana_contract::protocol::message::SolanaMessage;
use pyth_lazer_solana_contract::protocol::payload::PayloadData;

use crate::constants::{PYTH_PROGRAM_ID, PYTH_STORAGE_ID, PYTH_TREASURY_ID};
use crate::errors::FogoPulseError;
use crate::events::{EpochRefunded, EpochSettled, PoolRebalanced};
use crate::state::{Epoch, EpochState, GlobalConfig, Outcome, Pool, RefundReason};
use crate::utils::oracle::extract_price_and_confidence;

/// Settle Epoch accounts - permissionless, no session needed
#[derive(Accounts)]
pub struct SettleEpoch<'info> {
    /// Anyone can call - permissionless for crank bots/keepers
    #[account(mut)]
    pub payer: Signer<'info>,

    /// GlobalConfig - for oracle thresholds and freeze checks
    /// IMPORTANT: Use Box<> to prevent stack overflow
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    /// Pool - must have this epoch as active
    /// IMPORTANT: Use Box<> to prevent stack overflow
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.active_epoch == Some(epoch.key()) @ FogoPulseError::InvalidEpoch,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// Epoch - must be in Frozen state and past end_time
    #[account(
        mut,
        seeds = [b"epoch", pool.key().as_ref(), &epoch.epoch_id.to_le_bytes()],
        bump = epoch.bump,
        constraint = epoch.pool == pool.key() @ FogoPulseError::InvalidEpoch,
        constraint = epoch.state == EpochState::Frozen @ FogoPulseError::InvalidEpochState,
    )]
    pub epoch: Account<'info, Epoch>,

    /// Clock sysvar for timestamp
    pub clock: Sysvar<'info, Clock>,

    /// Instructions sysvar for Ed25519 signature verification
    /// CHECK: Validated by address constraint
    #[account(address = sysvar_instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    /// Pyth Lazer Program (FOGO-specific)
    /// CHECK: Validated by address constraint
    #[account(address = PYTH_PROGRAM_ID)]
    pub pyth_program: AccountInfo<'info>,

    /// Pyth Storage account (contains registered signers)
    /// CHECK: Validated by address constraint
    #[account(address = PYTH_STORAGE_ID)]
    pub pyth_storage: AccountInfo<'info>,

    /// Pyth Treasury account (receives verification fees)
    /// CHECK: Validated by address constraint
    #[account(mut, address = PYTH_TREASURY_ID)]
    pub pyth_treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Handler for settle_epoch instruction with Pyth Lazer Ed25519 verification
///
/// # Arguments
/// * `pyth_message` - Signed Pyth Lazer message bytes (Ed25519 format)
/// * `ed25519_instruction_index` - Index of Ed25519 verify instruction (typically 0)
/// * `signature_index` - Index of signature within Ed25519 instruction (typically 0)
pub fn handler(
    ctx: Context<SettleEpoch>,
    pyth_message: Vec<u8>,
    ed25519_instruction_index: u8,
    signature_index: u8,
) -> Result<()> {
    let config = &ctx.accounts.global_config;
    let pool = &mut ctx.accounts.pool;
    let epoch = &mut ctx.accounts.epoch;
    let clock = &ctx.accounts.clock;

    // ==========================================================
    // FREEZE CHECKS (settlement blocked during emergency freeze)
    // ==========================================================
    // Note: Paused checks are NOT included - settlement must continue during pause
    // Only Frozen (emergency halt) should stop settlement
    require!(!config.frozen, FogoPulseError::ProtocolFrozen);
    require!(!pool.is_frozen, FogoPulseError::PoolFrozen);

    // ==========================================================
    // TIMING VALIDATION
    // ==========================================================
    // Epoch must have reached end_time before settlement can occur
    require!(
        clock.unix_timestamp >= epoch.end_time,
        FogoPulseError::EpochNotEnded
    );

    // ==========================================================
    // TRANSITION TO SETTLING STATE (prevents race conditions)
    // ==========================================================
    // If two settle_epoch calls arrive concurrently:
    // - First call: Frozen → Settling → Settled ✓
    // - Second call: Settling != Frozen → InvalidEpochState ✗
    epoch.state = EpochState::Settling;

    // ==========================================================
    // PYTH LAZER VERIFICATION (Ed25519 format - FOGO specific)
    // ==========================================================

    // Build CPI accounts for verify_message
    let cpi_accounts = pyth_lazer_solana_contract::cpi::accounts::VerifyMessage {
        payer: ctx.accounts.payer.to_account_info(),
        storage: ctx.accounts.pyth_storage.to_account_info(),
        treasury: ctx.accounts.pyth_treasury.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        instructions_sysvar: ctx.accounts.instructions_sysvar.to_account_info(),
    };

    // Invoke Pyth Lazer program to verify the Ed25519 signature
    // CRITICAL: Ed25519 instruction MUST be first in transaction (index 0)
    let cpi_ctx = CpiContext::new(ctx.accounts.pyth_program.to_account_info(), cpi_accounts);
    pyth_lazer_solana_contract::cpi::verify_message(
        cpi_ctx,
        pyth_message.clone(),
        ed25519_instruction_index.into(),
        signature_index.into(),
    )
    .map_err(|_| FogoPulseError::OracleVerificationFailed)?;

    // ==========================================================
    // DESERIALIZE VERIFIED ORACLE DATA
    // ==========================================================

    // Deserialize the Solana message to extract payload
    let solana_message = SolanaMessage::deserialize_slice(&pyth_message)
        .map_err(|_| FogoPulseError::OracleDataInvalid)?;

    // Deserialize the payload data to get price information
    let payload_data = PayloadData::deserialize_slice_le(&solana_message.payload)
        .map_err(|_| FogoPulseError::OracleDataInvalid)?;

    // Extract price and confidence from payload (validation included in helper)
    let (settlement_price, settlement_confidence) = extract_price_and_confidence(&payload_data)?;

    // Extract timestamp (microseconds -> seconds)
    let settlement_publish_time = (payload_data.timestamp_us.as_micros() / 1_000_000) as i64;

    // ==========================================================
    // VALIDATE ORACLE DATA QUALITY
    // ==========================================================

    // Staleness check: settlement price must be within threshold of epoch end_time
    // Using unsigned_abs() since publish_time can be slightly before or after end_time
    let time_from_end = (settlement_publish_time - epoch.end_time).unsigned_abs();
    require!(
        time_from_end <= config.oracle_staleness_threshold_settle as u64,
        FogoPulseError::OracleDataStale
    );

    // Confidence check: reject if confidence band is too wide relative to price
    // confidence_threshold_bps represents max acceptable confidence as % of price
    // e.g., 80 bps = 0.8% → confidence must be <= price * 0.008
    let max_confidence = (settlement_price as u128)
        .checked_mul(config.oracle_confidence_threshold_settle_bps as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10_000)
        .ok_or(FogoPulseError::Overflow)? as u64;
    require!(
        settlement_confidence <= max_confidence,
        FogoPulseError::OracleConfidenceTooWide
    );

    // ==========================================================
    // RECORD SETTLEMENT DATA
    // ==========================================================
    epoch.settlement_price = Some(settlement_price);
    epoch.settlement_confidence = Some(settlement_confidence);
    epoch.settlement_publish_time = Some(settlement_publish_time);

    // ==========================================================
    // DETERMINE OUTCOME
    // ==========================================================
    // Priority order:
    // 1. Exact tie (settlement_price == start_price) → Refund with Tie reason
    // 2. Clear winner → Up or Down
    //
    // Note: Oracle data quality is already gated by the BPS-based confidence
    // threshold check above (lines 194-205). If settlement confidence passes
    // that threshold, the price is trustworthy for outcome determination.

    let start_price = epoch.start_price;
    let start_confidence = epoch.start_confidence;

    let (outcome, refund_reason): (Outcome, Option<RefundReason>) =
        if settlement_price == start_price {
            // Exact tie - settlement equals start price
            (Outcome::Refunded, Some(RefundReason::Tie))
        } else if settlement_price > start_price {
            // UP wins - settlement price higher than start
            (Outcome::Up, None)
        } else {
            // DOWN wins - settlement price lower than start
            (Outcome::Down, None)
        };

    // ==========================================================
    // UPDATE EPOCH STATE
    // ==========================================================
    epoch.outcome = Some(outcome);
    epoch.state = match outcome {
        Outcome::Refunded => EpochState::Refunded,
        _ => EpochState::Settled,
    };

    // ==========================================================
    // CLEAR POOL ACTIVE EPOCH
    // ==========================================================
    // Allow next epoch creation by clearing the active epoch reference
    pool.active_epoch = None;
    pool.active_epoch_state = 0; // 0 = None (no active epoch)

    // ==========================================================
    // CAPTURE SETTLEMENT TOTALS (before rebalancing)
    // ==========================================================
    // These are needed for accurate payout calculations in claim_payout
    // Must be captured BEFORE rebalancing to preserve original pool state
    epoch.yes_total_at_settlement = Some(pool.yes_reserves);
    epoch.no_total_at_settlement = Some(pool.no_reserves);

    // ==========================================================
    // AUTO-REBALANCE POOL RESERVES
    // ==========================================================
    // After settlement, rebalance reserves to 50:50 to ensure fair
    // CPMM pricing for the next epoch. This prevents traders from
    // exploiting imbalanced reserves where shares = amount * opposite / same
    // creates unfair advantages for the scarce-side.

    let yes_reserves_before = pool.yes_reserves;
    let no_reserves_before = pool.no_reserves;

    let total_reserves = pool
        .yes_reserves
        .checked_add(pool.no_reserves)
        .ok_or(FogoPulseError::Overflow)?;

    // Rebalance full reserves to 50:50 — no reservation needed for pending
    // withdrawals because process_withdrawal calculates payouts from total
    // reserves post-settlement and requires active_epoch == None.
    // (Previous reservation logic subtracted reserved_usdc but never wrote it
    // back, causing fund loss — fixed in Story 7.29)
    let balanced_amount = total_reserves / 2;
    let remainder = total_reserves % 2;

    pool.yes_reserves = balanced_amount
        .checked_add(remainder)
        .ok_or(FogoPulseError::Overflow)?;
    pool.no_reserves = balanced_amount;

    msg!(
        "Pool rebalanced: before=({}, {}), after=({}, {})",
        yes_reserves_before,
        no_reserves_before,
        pool.yes_reserves,
        pool.no_reserves
    );

    // ==========================================================
    // EMIT EVENTS
    // ==========================================================
    // Event order: EpochSettled (primary) -> EpochRefunded (if applicable) -> PoolRebalanced
    // This ordering ensures indexers see the main settlement event first.

    // Always emit EpochSettled for all terminal outcomes
    emit!(EpochSettled {
        epoch: epoch.key(),
        pool: pool.key(),
        epoch_id: epoch.epoch_id,
        start_price,
        start_confidence,
        settlement_price,
        settlement_confidence,
        settlement_publish_time,
        outcome,
    });

    // Additionally emit EpochRefunded for refund outcomes (provides detailed diagnostics)
    if let Some(reason) = refund_reason {
        emit!(EpochRefunded {
            epoch: epoch.key(),
            pool: pool.key(),
            epoch_id: epoch.epoch_id,
            start_price,
            start_confidence,
            settlement_price,
            settlement_confidence,
            refund_reason: reason,
        });
    }

    // Emit pool rebalancing event after settlement events
    emit!(PoolRebalanced {
        pool: pool.key(),
        epoch: epoch.key(),
        yes_reserves_before,
        no_reserves_before,
        yes_reserves_after: pool.yes_reserves,
        no_reserves_after: pool.no_reserves,
    });

    Ok(())
}
