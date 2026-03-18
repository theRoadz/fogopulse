//! Create Pool instruction - Admin creates new trading pool for an asset
//!
//! ## Session Exclusion (ADMIN-ONLY)
//!
//! This instruction does NOT use FOGO Sessions and requires direct admin wallet signature.
//!
//! **Rationale:** Pool creation is a privileged admin operation that:
//! - Creates a new Pool account for a specific asset
//! - Requires verification against GlobalConfig.admin
//! - Determines which assets can be traded on the protocol
//! - Must be performed by the actual admin wallet, not a delegated session
//!
//! Session accounts enable gasless UX for repetitive user operations (trading, claiming).
//! Admin operations are rare, require maximum security, and should never be delegated.
//!
//! ## User-facing instructions that DO use sessions:
//! - `buy_position`, `sell_position`, `claim_payout`, `claim_refund`
//! - `deposit_liquidity`, `withdraw_liquidity`
//!
//! See `src/session.rs` for the session extraction pattern.

use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;
use crate::events::PoolCreated;
use crate::state::{GlobalConfig, Pool};

/// Create Pool accounts - admin-only, no session support
#[derive(Accounts)]
pub struct CreatePool<'info> {
    /// Admin authority - must match GlobalConfig.admin
    /// NOT using session extraction: admin operations require direct wallet signature
    #[account(mut)]
    pub admin: Signer<'info>,

    /// GlobalConfig account - boxed to prevent stack overflow
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        constraint = global_config.admin == admin.key() @ FogoPulseError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    /// Asset mint this pool will track (e.g., BTC mint address)
    /// CHECK: No validation needed - pubkey used only for PDA derivation and storage.
    /// Admin is trusted to pass valid SPL token mints. Invalid mints create unusable
    /// pools but pose no security risk (they're simply useless).
    pub asset_mint: UncheckedAccount<'info>,

    /// Pool account to be created
    #[account(
        init,
        payer = admin,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", asset_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreatePool>) -> Result<()> {
    let config = &ctx.accounts.global_config;
    let pool = &mut ctx.accounts.pool;

    // Check protocol state - no pool creation when paused or frozen
    require!(!config.frozen, FogoPulseError::ProtocolFrozen);
    require!(!config.paused, FogoPulseError::ProtocolPaused);

    // Initialize pool with values from GlobalConfig
    pool.asset_mint = ctx.accounts.asset_mint.key();
    pool.yes_reserves = 0;
    pool.no_reserves = 0;
    pool.total_lp_shares = 0;
    pool.pending_withdrawal_shares = 0;
    pool.next_epoch_id = 0;
    pool.active_epoch = None;
    pool.active_epoch_state = 0; // 0 = None
    pool.wallet_cap_bps = config.per_wallet_cap_bps;
    pool.side_cap_bps = config.per_side_cap_bps;
    pool.is_paused = false;
    pool.is_frozen = false;
    pool.bump = ctx.bumps.pool;

    emit!(PoolCreated {
        pool: pool.key(),
        asset_mint: pool.asset_mint,
        wallet_cap_bps: pool.wallet_cap_bps,
        side_cap_bps: pool.side_cap_bps,
    });

    Ok(())
}
