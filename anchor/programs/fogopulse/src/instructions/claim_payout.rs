//! Claim Payout instruction - User claims winnings from a settled epoch
//!
//! This is a USER-FACING instruction that supports both:
//! - Direct wallet signatures
//! - FOGO Session accounts (for gasless UX)
//!
//! Use `session::extract_user()` to get the actual user pubkey.
//!
//! # FOGO Sessions PDA Pattern
//!
//! Position PDAs must be derived from the USER's wallet pubkey, not the session account.
//! Since PDA seeds are evaluated before the handler runs, we pass the `user` pubkey as
//! an instruction argument and validate it matches `extract_user()` in the handler.
//!
//! ```text
//! PDA seeds: ["position", epoch, user_wallet, direction_byte]  // NOT signer_or_session
//! ```
//!
//! # Payout Calculation
//!
//! Winners receive their original stake plus proportional share of the losing pool:
//! `payout = position.amount + (position.amount / winner_total) * loser_total`
//!
//! Settlement totals are captured in the Epoch struct before pool rebalancing to
//! enable accurate calculations.
//!
//! # Refund Case
//!
//! If epoch.outcome == Refunded (exact tie), use claim_refund instead.
//! claim_payout only handles winning positions.
//!
//! # Freeze vs Pause Behavior
//!
//! - Paused: Claims are ALLOWED (existing commitments must be honored)
//! - Frozen: Claims are BLOCKED (emergency halt)

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::USDC_MINT;
use crate::errors::FogoPulseError;
use crate::events::PayoutClaimed;
use crate::session::extract_user;
use crate::state::{Direction, Epoch, EpochState, GlobalConfig, Outcome, Pool, UserPosition};

/// Claim Payout accounts
///
/// # PDA Derivation
///
/// Position PDA uses `user` (the actual wallet pubkey), NOT `signer_or_session`.
/// This ensures the same position is accessed whether user signs directly or via session.
#[derive(Accounts)]
#[instruction(user: Pubkey, direction: Direction)]
pub struct ClaimPayout<'info> {
    /// The user OR a session account representing the user.
    /// Session validation is performed via extract_user().
    /// This enables gasless claims when using FOGO Sessions.
    #[account(mut)]
    pub signer_or_session: Signer<'info>,

    /// Global protocol configuration - for freeze checks
    #[account(
        seeds = [b"global_config"],
        bump = config.bump,
        constraint = !config.frozen @ FogoPulseError::ProtocolFrozen,
    )]
    pub config: Box<Account<'info, GlobalConfig>>,

    /// The pool - for freeze checks and token transfer authority
    /// Note: Not marked `mut` as pool state is not modified by claim_payout
    #[account(
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.is_frozen @ FogoPulseError::PoolFrozen,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// The settled epoch - must be in Settled state
    #[account(
        seeds = [b"epoch", pool.key().as_ref(), &epoch.epoch_id.to_le_bytes()],
        bump = epoch.bump,
        constraint = epoch.pool == pool.key() @ FogoPulseError::InvalidEpoch,
        constraint = epoch.state == EpochState::Settled @ FogoPulseError::InvalidEpochState,
    )]
    pub epoch: Box<Account<'info, Epoch>>,

    /// User's position to claim - derived from USER wallet, not session
    /// Must match outcome direction and not be already claimed
    #[account(
        mut,
        seeds = [b"position", epoch.key().as_ref(), user.as_ref(), &[direction as u8]],
        bump = position.bump,
        constraint = !position.claimed @ FogoPulseError::AlreadyClaimed,
    )]
    pub position: Box<Account<'info, UserPosition>>,

    /// Pool's USDC token account (source of payout)
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
    )]
    pub pool_usdc: Box<Account<'info, TokenAccount>>,

    /// User's USDC token account (payout destination)
    #[account(
        mut,
        constraint = user_usdc.owner == user @ FogoPulseError::TokenOwnerMismatch,
        constraint = user_usdc.mint == USDC_MINT @ FogoPulseError::InvalidMint,
    )]
    pub user_usdc: Box<Account<'info, TokenAccount>>,

    /// USDC mint - verified against constant
    #[account(address = USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Claim Payout handler
///
/// # Arguments
/// * `user` - The actual user wallet pubkey (validated against extract_user)
///
/// # Flow
/// 1. Extract and validate user via FOGO Sessions pattern
/// 2. Validate epoch outcome is Up or Down (not Refunded)
/// 3. Validate position direction matches winning outcome
/// 4. Calculate payout amount using proportional formula
/// 5. Transfer USDC from pool to user using PDA seeds
/// 6. Mark position as claimed
/// 7. Emit PayoutClaimed event
pub fn handler(ctx: Context<ClaimPayout>, user: Pubkey, direction: Direction) -> Result<()> {
    // 1. Extract and validate user via FOGO Sessions pattern
    let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;
    require!(user == extracted_user, FogoPulseError::Unauthorized);

    // 2. Validate epoch outcome is Up or Down (not Refunded)
    let epoch = &ctx.accounts.epoch;
    let outcome = epoch.outcome.ok_or(FogoPulseError::InvalidEpochState)?;
    require!(
        outcome != Outcome::Refunded,
        FogoPulseError::InvalidEpochState
    );

    // 3. Validate position direction matches winning outcome
    let position = &mut ctx.accounts.position;

    // Defense-in-depth: verify passed direction matches stored direction
    require!(
        position.direction == direction,
        FogoPulseError::InvalidDirection
    );

    let is_winner = match outcome {
        Outcome::Up => position.direction == Direction::Up,
        Outcome::Down => position.direction == Direction::Down,
        Outcome::Refunded => false,
    };
    require!(is_winner, FogoPulseError::PositionNotWinner);

    // 4. Calculate payout amount using proportional formula
    // Get settlement totals (captured before pool rebalancing)
    let yes_total = epoch
        .yes_total_at_settlement
        .ok_or(FogoPulseError::InvalidEpochState)?;
    let no_total = epoch
        .no_total_at_settlement
        .ok_or(FogoPulseError::InvalidEpochState)?;

    // Determine winner/loser totals based on outcome
    let (winner_total, loser_total) = match outcome {
        Outcome::Up => (yes_total, no_total),
        Outcome::Down => (no_total, yes_total),
        _ => return Err(FogoPulseError::InvalidEpochState.into()),
    };

    // Guard against invalid state: winner_total must be > 0
    // (if user has a position, there must be at least their stake in winner pool)
    require!(winner_total > 0, FogoPulseError::InvalidEpochState);

    // Calculate payout: original stake + proportional share of losing pool
    // winnings = (position.amount / winner_total) * loser_total
    // Using u128 to prevent overflow
    let payout_amount = if loser_total == 0 {
        // Edge case: no losers, just return original stake
        position.amount
    } else {
        let winnings = (position.amount as u128)
            .checked_mul(loser_total as u128)
            .ok_or(FogoPulseError::Overflow)?
            .checked_div(winner_total as u128)
            .ok_or(FogoPulseError::Overflow)? as u64;

        position
            .amount
            .checked_add(winnings)
            .ok_or(FogoPulseError::Overflow)?
    };

    // 5. Transfer USDC from pool to user
    let pool = &ctx.accounts.pool;
    let pool_seeds = &[b"pool".as_ref(), pool.asset_mint.as_ref(), &[pool.bump]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_usdc.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[pool_seeds],
        ),
        payout_amount,
    )?;

    // 6. Mark position as claimed (idempotent - constraint prevents double-claim)
    position.claimed = true;

    // 7. Emit event
    emit!(PayoutClaimed {
        epoch: ctx.accounts.epoch.key(),
        user,
        amount: payout_amount,
        direction: position.direction,
    });

    msg!(
        "PayoutClaimed: user={}, amount={}, direction={:?}",
        user,
        payout_amount,
        position.direction
    );

    Ok(())
}
