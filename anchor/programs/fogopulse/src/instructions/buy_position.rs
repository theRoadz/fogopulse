//! Buy Position instruction - User opens or adds to a position in an epoch
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
//! PDA seeds: ["position", epoch, user_wallet]  // NOT signer_or_session
//! ```
//!
//! # FOGO Sessions Token Transfer Limitation
//!
//! **IMPORTANT**: When using FOGO Sessions, the session account CANNOT authorize SPL
//! token transfers from the user's token account. This is because token::transfer
//! requires the token account owner (user wallet) to sign, not a delegate.
//!
//! For true gasless UX, users must EITHER:
//! 1. Pre-approve the session account as a delegate on their token account, OR
//! 2. Sign the transaction directly (session handles rent/fees, user signs for transfer)
//!
//! Current implementation requires user wallet signature for the transfer.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{MIN_TRADE_AMOUNT, USDC_MINT};
use crate::errors::FogoPulseError;
use crate::events::{FeesCollected, PositionOpened};
use crate::session::extract_user;
use crate::state::{Direction, Epoch, EpochState, GlobalConfig, Pool, UserPosition};
use crate::utils::{
    calculate_entry_price, calculate_fee_split, calculate_shares, check_side_cap, check_wallet_cap,
};

/// Buy Position accounts
///
/// Uses `init_if_needed` pattern for UserPosition to handle both new and existing positions.
/// Token accounts use ATA pattern with pool PDA as owner for pool_usdc.
///
/// CRITICAL: Uses Box<> for large accounts to prevent stack overflow.
///
/// Fee distribution accounts (treasury_usdc, insurance_usdc) are included to enable
/// fee splitting during trade execution.
#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct BuyPosition<'info> {
    /// The user OR a session account representing the user.
    /// Session validation is performed via extract_user().
    /// This enables gasless trading when using FOGO Sessions.
    #[account(mut)]
    pub signer_or_session: Signer<'info>,

    /// Global protocol configuration
    /// Used to check: paused, frozen, allow_hedging, fee parameters
    #[account(
        seeds = [b"global_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, GlobalConfig>>,

    /// The pool being traded
    /// Used to check: paused, frozen, reserves, active_epoch
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.active_epoch == Some(epoch.key()) @ FogoPulseError::InvalidEpoch,
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// The epoch being traded in
    /// Must be in Open state
    #[account(
        mut,
        seeds = [b"epoch", pool.key().as_ref(), &epoch.epoch_id.to_le_bytes()],
        bump = epoch.bump,
        constraint = epoch.pool == pool.key() @ FogoPulseError::InvalidEpoch,
    )]
    pub epoch: Box<Account<'info, Epoch>>,

    /// User's position account - derived from USER wallet, not session
    /// Uses init_if_needed to handle both new and existing positions
    #[account(
        init_if_needed,
        payer = signer_or_session,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"position", epoch.key().as_ref(), user.as_ref()],
        bump,
    )]
    pub position: Account<'info, UserPosition>,

    /// User's USDC ATA - must be owned by the actual user wallet
    /// CRITICAL: When using FOGO Sessions, the session signer cannot authorize
    /// token transfers from user's ATA. User must either:
    /// 1. Sign directly (not using session), OR
    /// 2. Pre-approve a delegate for their token account
    #[account(
        mut,
        constraint = user_usdc.owner == user @ FogoPulseError::TokenOwnerMismatch,
        constraint = user_usdc.mint == USDC_MINT @ FogoPulseError::InvalidMint
    )]
    pub user_usdc: Box<Account<'info, TokenAccount>>,

    /// Pool's USDC ATA - owned by pool PDA
    /// Receives net_amount + lp_fee (trading exposure + auto-compounding LP fee)
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
    )]
    pub pool_usdc: Box<Account<'info, TokenAccount>>,

    /// Treasury USDC token account - receives 20% of fees
    /// Must be ATA of config.treasury
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = config.treasury,
    )]
    pub treasury_usdc: Box<Account<'info, TokenAccount>>,

    /// Insurance USDC token account - receives 10% of fees
    /// Must be ATA of config.insurance
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = config.insurance,
    )]
    pub insurance_usdc: Box<Account<'info, TokenAccount>>,

    /// USDC mint - verified against constant
    #[account(address = USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Buy Position handler
///
/// # Arguments
/// * `user` - The actual user wallet pubkey (validated against extract_user)
/// * `direction` - Up or Down prediction
/// * `amount` - USDC amount in lamports (6 decimals) - GROSS amount before fees
///
/// # Flow
/// 1. Extract and validate user
/// 2. Validate epoch state is Open
/// 3. Check protocol and pool are not paused/frozen
/// 4. Validate amount > 0
/// 5. Check hedging rules if position exists
/// 6. Calculate fee split (total_fee, lp_fee, treasury_fee, insurance_fee)
/// 7. Calculate CPMM shares using NET amount (after fees)
/// 8. Validate caps (per-wallet, per-side) using NET amount
/// 9. Transfer treasury_fee from user to treasury
/// 10. Transfer insurance_fee from user to insurance
/// 11. Transfer net_amount + lp_fee to pool
/// 12. Update pool reserves with NET amount only (lp_fee auto-compounds in pool USDC)
/// 13. Initialize/update UserPosition with NET amount
/// 14. Emit FeesCollected event
/// 15. Emit PositionOpened event
pub fn handler(
    ctx: Context<BuyPosition>,
    user: Pubkey,
    direction: Direction,
    amount: u64,
) -> Result<()> {
    // 1. Extract user pubkey - works with both direct signers and session accounts
    let extracted_user = extract_user(&ctx.accounts.signer_or_session)?;

    // CRITICAL: Validate that the passed `user` matches the extracted user
    require!(user == extracted_user, FogoPulseError::Unauthorized);

    // 2. Validate epoch state is Open
    require!(
        ctx.accounts.epoch.state == EpochState::Open,
        FogoPulseError::EpochNotOpen
    );

    // 3. Check protocol/pool not paused/frozen
    let config = &ctx.accounts.config;
    require!(
        !config.paused && !config.frozen,
        FogoPulseError::ProtocolPaused
    );

    let pool = &mut ctx.accounts.pool;
    require!(
        !pool.is_paused && !pool.is_frozen,
        FogoPulseError::PoolPaused
    );

    // 4. Validate amount > 0 and >= minimum trade amount
    require!(amount > 0, FogoPulseError::ZeroAmount);
    require!(amount >= MIN_TRADE_AMOUNT, FogoPulseError::BelowMinimumTrade);

    // 5. Check hedging rules and direction consistency
    let position = &mut ctx.accounts.position;
    let is_new_position = position.user == Pubkey::default();

    if !is_new_position {
        // Existing position - always require same direction to prevent data corruption
        // Even if hedging is allowed, mixing directions in one position account would
        // corrupt the shares/amount tracking. Hedging requires separate position accounts.
        require!(
            position.direction == direction,
            FogoPulseError::InvalidDirection
        );
    }

    // 6. Calculate fee split
    let fee_split = calculate_fee_split(amount, config)?;

    msg!(
        "FeeSplit: gross={}, net={}, total_fee={}, lp={}, treasury={}, insurance={}",
        amount,
        fee_split.net_amount,
        fee_split.total_fee,
        fee_split.lp_fee,
        fee_split.treasury_fee,
        fee_split.insurance_fee
    );

    // 7. Calculate shares using CPMM formula with NET amount (after fees)
    let (same_reserves, opposite_reserves) = match direction {
        Direction::Up => (pool.yes_reserves, pool.no_reserves),
        Direction::Down => (pool.no_reserves, pool.yes_reserves),
    };

    let shares = calculate_shares(fee_split.net_amount, same_reserves, opposite_reserves)?;
    let entry_price = calculate_entry_price(fee_split.net_amount, shares)?;

    // 8. Calculate new totals and validate caps using NET amount
    let new_user_amount = if is_new_position {
        fee_split.net_amount
    } else {
        position
            .amount
            .checked_add(fee_split.net_amount)
            .ok_or(FogoPulseError::Overflow)?
    };

    // Use CURRENT pool total for cap calculations (before this trade)
    // This allows first trades to pass (pool_total == 0 skips cap check)
    let pool_total = pool
        .yes_reserves
        .checked_add(pool.no_reserves)
        .ok_or(FogoPulseError::Overflow)?;

    // Check per-wallet cap against current pool total
    // When pool_total == 0 (first trade), check is skipped
    check_wallet_cap(new_user_amount, pool_total, pool.wallet_cap_bps)?;

    // Check per-side cap against current pool total using NET amount
    // When pool_total == 0 (first trade), check is skipped
    let new_side_total = match direction {
        Direction::Up => pool
            .yes_reserves
            .checked_add(fee_split.net_amount)
            .ok_or(FogoPulseError::Overflow)?,
        Direction::Down => pool
            .no_reserves
            .checked_add(fee_split.net_amount)
            .ok_or(FogoPulseError::Overflow)?,
    };
    check_side_cap(new_side_total, pool_total, pool.side_cap_bps)?;

    // 9. Transfer treasury fee from user to treasury
    if fee_split.treasury_fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.signer_or_session.to_account_info(),
                },
            ),
            fee_split.treasury_fee,
        )?;
    }

    // 10. Transfer insurance fee from user to insurance
    if fee_split.insurance_fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.insurance_usdc.to_account_info(),
                    authority: ctx.accounts.signer_or_session.to_account_info(),
                },
            ),
            fee_split.insurance_fee,
        )?;
    }

    // 11. Transfer net_amount + lp_fee to pool
    // The lp_fee stays in pool_usdc but is NOT added to reserves
    // This creates "surplus" in pool_usdc that increases LP share value (auto-compounding)
    let pool_transfer_amount = fee_split
        .net_amount
        .checked_add(fee_split.lp_fee)
        .ok_or(FogoPulseError::Overflow)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.pool_usdc.to_account_info(),
                authority: ctx.accounts.signer_or_session.to_account_info(),
            },
        ),
        pool_transfer_amount,
    )?;

    // 12. Update pool reserves with NET amount only (trading exposure)
    // The lp_fee stays in pool_usdc but is NOT added to reserves
    match direction {
        Direction::Up => {
            pool.yes_reserves = pool
                .yes_reserves
                .checked_add(fee_split.net_amount)
                .ok_or(FogoPulseError::Overflow)?
        }
        Direction::Down => {
            pool.no_reserves = pool
                .no_reserves
                .checked_add(fee_split.net_amount)
                .ok_or(FogoPulseError::Overflow)?
        }
    }

    // 13. Update position with NET amount
    if is_new_position {
        // Initialize new position
        position.user = user;
        position.epoch = ctx.accounts.epoch.key();
        position.direction = direction;
        position.amount = fee_split.net_amount; // NET amount, not gross
        position.shares = shares;
        position.entry_price = entry_price;
        position.claimed = false;
        position.bump = ctx.bumps.position;
    } else {
        // Add to existing position - recalculate weighted average entry price
        let total_amount = position
            .amount
            .checked_add(fee_split.net_amount)
            .ok_or(FogoPulseError::Overflow)?;
        let total_shares = position
            .shares
            .checked_add(shares)
            .ok_or(FogoPulseError::Overflow)?;
        position.entry_price = calculate_entry_price(total_amount, total_shares)?;
        position.amount = total_amount;
        position.shares = total_shares;
    }

    // 14. Emit FeesCollected event
    emit!(FeesCollected {
        epoch: ctx.accounts.epoch.key(),
        user,
        gross_amount: amount,
        net_amount: fee_split.net_amount,
        total_fee: fee_split.total_fee,
        lp_fee: fee_split.lp_fee,
        treasury_fee: fee_split.treasury_fee,
        insurance_fee: fee_split.insurance_fee,
    });

    // 15. Emit PositionOpened event
    let clock = Clock::get()?;
    emit!(PositionOpened {
        epoch: ctx.accounts.epoch.key(),
        user,
        direction,
        amount: fee_split.net_amount, // Report NET amount in position
        shares,
        entry_price,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "PositionOpened: user={}, direction={:?}, gross={}, net={}, shares={}",
        user,
        direction,
        amount,
        fee_split.net_amount,
        shares
    );

    Ok(())
}
