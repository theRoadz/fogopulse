//! Create Epoch instruction - Permissionless epoch creation with Pyth oracle
//!
//! ## Session Exclusion (PERMISSIONLESS)
//!
//! This instruction does NOT use FOGO Sessions because it is PERMISSIONLESS.
//!
//! **Rationale:** Epoch creation is designed to be callable by anyone:
//! - Keeper bots / crank services can automatically create epochs
//! - No user identity verification needed - any wallet can pay the transaction fee
//! - The caller's identity is irrelevant to the operation
//! - No position or funds are associated with the caller
//!
//! Since there's no "user" whose identity matters, session extraction is not applicable.
//! The payer is simply whoever pays the transaction fee, not a user performing an action
//! on their account.
//!
//! ## Similar permissionless instructions (no session needed):
//! - `advance_epoch` - Anyone can trigger epoch settlement and advance
//! - `settle_epoch` - Anyone can settle an expired epoch
//!
//! ## User-facing instructions that DO use sessions:
//! - `buy_position`, `sell_position`, `claim_payout`, `claim_refund`
//! - `deposit_liquidity`, `withdraw_liquidity`
//!
//! See `src/session.rs` for the session extraction pattern.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions as sysvar_instructions;

use pyth_lazer_solana_contract::protocol::message::SolanaMessage;
use pyth_lazer_solana_contract::protocol::payload::{PayloadData, PayloadPropertyValue};

use crate::constants::{PYTH_PROGRAM_ID, PYTH_STORAGE_ID, PYTH_TREASURY_ID};
use crate::errors::FogoPulseError;
use crate::events::EpochCreated;
use crate::state::{Epoch, EpochState, GlobalConfig, Pool};

/// Create Epoch accounts - permissionless, no session needed
#[derive(Accounts)]
pub struct CreateEpoch<'info> {
    /// Anyone can call - permissionless for crank bots/keepers
    /// NOT using session extraction: no user identity matters here
    #[account(mut)]
    pub payer: Signer<'info>,

    /// GlobalConfig - boxed to prevent stack overflow
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    /// Pool - must have no active epoch
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// Epoch account to be created
    #[account(
        init,
        payer = payer,
        space = 8 + Epoch::INIT_SPACE,
        seeds = [b"epoch", pool.key().as_ref(), &pool.next_epoch_id.to_le_bytes()],
        bump
    )]
    pub epoch: Account<'info, Epoch>,

    /// Clock sysvar for timestamp
    pub clock: Sysvar<'info, Clock>,

    /// Instructions sysvar for Ed25519 signature verification
    /// CHECK: This is the instructions sysvar, validated by address constraint
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

/// Handler for create_epoch instruction with Pyth Lazer Ed25519 verification
///
/// # Arguments
/// * `pyth_message` - Signed Pyth Lazer message bytes (Ed25519 format)
/// * `ed25519_instruction_index` - Index of Ed25519 verify instruction (typically 0)
/// * `signature_index` - Index of signature within Ed25519 instruction (typically 0)
pub fn handler(
    ctx: Context<CreateEpoch>,
    pyth_message: Vec<u8>,
    ed25519_instruction_index: u8,
    signature_index: u8,
) -> Result<()> {
    let config = &ctx.accounts.global_config;
    let pool = &mut ctx.accounts.pool;
    let epoch = &mut ctx.accounts.epoch;
    let clock = &ctx.accounts.clock;

    // Protocol checks (before pool checks)
    require!(!config.frozen, FogoPulseError::ProtocolFrozen);
    require!(!config.paused, FogoPulseError::ProtocolPaused);

    // Pool checks
    require!(!pool.is_frozen, FogoPulseError::PoolFrozen);
    require!(!pool.is_paused, FogoPulseError::PoolPaused);

    // Epoch existence check - CRITICAL: only one active epoch per pool
    require!(
        pool.active_epoch.is_none(),
        FogoPulseError::EpochAlreadyActive
    );

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

    // Validate that we have at least one feed with properties
    require!(
        !payload_data.feeds.is_empty() && !payload_data.feeds[0].properties.is_empty(),
        FogoPulseError::OraclePriceMissing
    );

    // Extract price from first feed's first property
    let (start_price, start_confidence) = extract_price_and_confidence(&payload_data)?;

    // Extract timestamp (microseconds -> seconds)
    let start_publish_time = (payload_data.timestamp_us.as_micros() / 1_000_000) as i64;

    // ==========================================================
    // VALIDATE ORACLE DATA QUALITY
    // ==========================================================

    // Staleness check: reject if oracle data is too old
    let oracle_age = clock
        .unix_timestamp
        .checked_sub(start_publish_time)
        .ok_or(FogoPulseError::Overflow)?;
    require!(
        oracle_age <= config.oracle_staleness_threshold_start,
        FogoPulseError::OracleDataStale
    );

    // Confidence check: reject if confidence band is too wide relative to price
    // confidence_threshold_bps represents max acceptable confidence as % of price
    // e.g., 100 bps = 1% → confidence must be <= price * 0.01
    let max_confidence = (start_price as u128)
        .checked_mul(config.oracle_confidence_threshold_start_bps as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10_000)
        .ok_or(FogoPulseError::Overflow)? as u64;
    require!(
        start_confidence <= max_confidence,
        FogoPulseError::OracleConfidenceTooWide
    );

    // ==========================================================
    // INITIALIZE EPOCH WITH VERIFIED ORACLE DATA
    // ==========================================================

    // Calculate timing (checked arithmetic to prevent overflow/underflow)
    let start_time = clock.unix_timestamp;
    let end_time = start_time
        .checked_add(config.epoch_duration_seconds)
        .ok_or(FogoPulseError::Overflow)?;
    let freeze_time = end_time
        .checked_sub(config.freeze_window_seconds)
        .ok_or(FogoPulseError::Overflow)?;

    // Initialize epoch with verified oracle data
    epoch.pool = pool.key();
    epoch.epoch_id = pool.next_epoch_id;
    epoch.state = EpochState::Open;
    epoch.start_time = start_time;
    epoch.end_time = end_time;
    epoch.freeze_time = freeze_time;
    epoch.start_price = start_price;
    epoch.start_confidence = start_confidence;
    epoch.start_publish_time = start_publish_time;
    epoch.settlement_price = None;
    epoch.settlement_confidence = None;
    epoch.settlement_publish_time = None;
    epoch.outcome = None;
    epoch.bump = ctx.bumps.epoch;

    // Update pool state
    pool.active_epoch = Some(epoch.key());
    pool.active_epoch_state = EpochState::Open.as_pool_cache_u8();
    pool.next_epoch_id = pool
        .next_epoch_id
        .checked_add(1)
        .ok_or(FogoPulseError::Overflow)?;

    emit!(EpochCreated {
        epoch: epoch.key(),
        pool: pool.key(),
        epoch_id: epoch.epoch_id,
        start_price: epoch.start_price,
        start_confidence: epoch.start_confidence,
        start_publish_time: epoch.start_publish_time,
        start_time: epoch.start_time,
        end_time: epoch.end_time,
    });

    Ok(())
}

/// Extract price and confidence from Pyth Lazer payload data
///
/// # Pyth Lazer Property Ordering
/// Pyth Lazer feed properties are ordered by the subscription request.
/// FogoPulse subscribes with: `["price", "confidence"]`
/// Therefore:
/// - `properties[0]` = Price (required)
/// - `properties[1]` = Confidence (optional, defaults to 0)
///
/// If Pyth changes this convention or we change subscription order,
/// this function must be updated accordingly.
fn extract_price_and_confidence(payload: &PayloadData) -> Result<(u64, u64)> {
    let feed = &payload.feeds[0];

    // Extract price from first property (index 0 = price per subscription order)
    // Using into_inner().into() pattern from Pyth examples
    let price = match &feed.properties[0] {
        PayloadPropertyValue::Price(Some(p)) => {
            let price_val: i64 = p.into_inner().into();
            require!(price_val > 0, FogoPulseError::OraclePriceMissing);
            // Safe cast: we've validated price_val > 0, so it fits in u64
            u64::try_from(price_val).map_err(|_| FogoPulseError::Overflow)?
        }
        _ => return Err(FogoPulseError::OraclePriceMissing.into()),
    };

    // Extract confidence from second property (index 1 = confidence per subscription order)
    // Confidence is optional - default to 0 if not present or negative
    let confidence = if feed.properties.len() > 1 {
        match &feed.properties[1] {
            PayloadPropertyValue::Confidence(Some(c)) => {
                let conf_val: i64 = c.into_inner().into();
                if conf_val > 0 {
                    u64::try_from(conf_val).unwrap_or(0)
                } else {
                    0
                }
            }
            _ => 0,
        }
    } else {
        0
    };

    Ok((price, confidence))
}

// Unit tests for extract_price_and_confidence removed:
// pyth-lazer-protocol types (PayloadData, PayloadFeedData, etc.) are not
// designed for manual construction in tests. The API changed between versions
// and internal types like TimestampUs, Price are not easily constructible.
//
// Oracle price extraction is tested via integration tests with real Pyth
// message payloads in the tests/ directory.
