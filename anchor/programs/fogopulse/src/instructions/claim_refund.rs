//! Claim Refund instruction - User claims refund from a refunded epoch
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
//! # Refund vs Payout
//!
//! - claim_refund: For epochs in Refunded state (exact tie)
//!   Returns full original stake to ALL position holders
//! - claim_payout: For epochs in Settled state (Up or Down outcome)
//!   Returns proportional share only to WINNING position holders

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::USDC_MINT;
use crate::errors::FogoPulseError;
use crate::events::RefundClaimed;
use crate::session::extract_user;
use crate::state::{Direction, Epoch, EpochState, GlobalConfig, Pool, UserPosition};

/// Claim Refund accounts
///
/// # PDA Derivation
///
/// Position PDA uses `user` (the actual wallet pubkey), NOT `signer_or_session`.
/// This ensures the same position is accessed whether user signs directly or via session.
///
/// # Freeze vs Pause Behavior
///
/// - Paused: Claims are ALLOWED (existing commitments must be honored)
/// - Frozen: Claims are BLOCKED (emergency halt)
#[derive(Accounts)]
#[instruction(user: Pubkey, direction: Direction)]
pub struct ClaimRefund<'info> {
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

    /// The pool - for freeze checks, token transfer authority, and reserve updates
    /// Mutable: reserves are reduced when refunds leave the pool (Story 7.32)
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.is_frozen @ FogoPulseError::PoolFrozen,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// The refunded epoch - must be in Refunded state
    #[account(
        seeds = [b"epoch", pool.key().as_ref(), &epoch.epoch_id.to_le_bytes()],
        bump = epoch.bump,
        constraint = epoch.pool == pool.key() @ FogoPulseError::InvalidEpoch,
        constraint = epoch.state == EpochState::Refunded @ FogoPulseError::InvalidEpochState,
    )]
    pub epoch: Box<Account<'info, Epoch>>,

    /// User's position to refund - derived from USER wallet, not session
    /// Boxed to prevent stack overflow with 11 accounts
    #[account(
        mut,
        seeds = [b"position", epoch.key().as_ref(), user.as_ref(), &[direction as u8]],
        bump = position.bump,
        constraint = !position.claimed @ FogoPulseError::AlreadyClaimed,
    )]
    pub position: Box<Account<'info, UserPosition>>,

    /// Pool's USDC token account (source of refund)
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
    )]
    pub pool_usdc: Box<Account<'info, TokenAccount>>,

    /// User's USDC token account (refund destination)
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

/// Claim Refund handler
///
/// # Arguments
/// * `user` - The actual user wallet pubkey (validated against extract_user)
///
/// # Flow
/// 1. Extract and validate user via FOGO Sessions pattern
/// 2. Get position amount (original stake to refund)
/// 3. Transfer USDC from pool to user using PDA seeds
/// 4. Mark position as claimed
/// 5. Emit RefundClaimed event
pub fn handler(ctx: Context<ClaimRefund>, user: Pubkey, direction: Direction) -> Result<()> {
    // 1. Extract and validate user
    let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;
    require!(user == extracted_user, FogoPulseError::Unauthorized);

    // 2. Get position amount (original stake to refund)
    let position = &mut ctx.accounts.position;

    // Defense-in-depth: verify passed direction matches stored direction
    require!(
        position.direction == direction,
        FogoPulseError::InvalidDirection
    );

    let refund_amount = position.amount;

    // 3. Transfer USDC from pool to user
    let pool_seeds = &[
        b"pool".as_ref(),
        ctx.accounts.pool.asset_mint.as_ref(),
        &[ctx.accounts.pool.bump],
    ];

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
        refund_amount,
    )?;

    // 3b. Reduce pool reserves to reflect refund leaving the pool (Story 7.32, fixed in 7.38)
    // Subtract from total reserves first (exact deduction), then re-split 50/50.
    // This avoids the saturating_sub drift where one side clamps to 0 and under-deducts.
    let pool = &mut ctx.accounts.pool;
    let total_reserves = pool.yes_reserves
        .checked_add(pool.no_reserves)
        .ok_or(FogoPulseError::Overflow)?;
    let new_total = total_reserves
        .checked_sub(refund_amount)
        .ok_or(FogoPulseError::InsufficientPoolReserves)?;
    let half = new_total / 2;
    let remainder = new_total % 2;
    pool.yes_reserves = half + remainder;
    pool.no_reserves = half;

    // 4. Mark position as claimed
    position.claimed = true;

    // 5. Emit event
    emit!(RefundClaimed {
        epoch: ctx.accounts.epoch.key(),
        user,
        amount: refund_amount,
        yes_reserves_after: pool.yes_reserves,
        no_reserves_after: pool.no_reserves,
    });

    msg!("RefundClaimed: user={}, amount={}", user, refund_amount);

    Ok(())
}
