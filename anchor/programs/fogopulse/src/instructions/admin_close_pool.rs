//! Admin Close Pool instruction — testnet utility to close a pool account
//!
//! Used when the Pool struct changes size and accounts need to be recreated.
//! This instruction closes the pool account and returns rent to admin.
//! Admin-only, no session support.
//!
//! Uses UncheckedAccount for pool because the old account may have a different
//! size than the current Pool struct (which would cause Anchor deserialization failure).

use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;
use crate::state::GlobalConfig;

#[derive(Accounts)]
pub struct AdminClosePool<'info> {
    /// Admin authority - must match GlobalConfig.admin
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        constraint = global_config.admin == admin.key() @ FogoPulseError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    /// Pool account to close — using UncheckedAccount to handle size mismatches
    /// CHECK: Validated by seeds constraint below. Owner checked manually.
    #[account(
        mut,
        seeds = [b"pool", asset_mint.key().as_ref()],
        bump,
    )]
    pub pool: UncheckedAccount<'info>,

    /// Asset mint for PDA derivation
    /// CHECK: Used only for PDA seed derivation
    pub asset_mint: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<AdminClosePool>) -> Result<()> {
    let pool_info = ctx.accounts.pool.to_account_info();

    // Verify the account is owned by our program
    require!(
        pool_info.owner == ctx.program_id,
        FogoPulseError::Unauthorized
    );

    // Transfer all lamports to admin (effectively closing the account)
    let admin_info = ctx.accounts.admin.to_account_info();
    let pool_lamports = pool_info.lamports();

    **pool_info.try_borrow_mut_lamports()? = 0;
    **admin_info.try_borrow_mut_lamports()? = admin_info
        .lamports()
        .checked_add(pool_lamports)
        .ok_or(FogoPulseError::Overflow)?;

    // Zero out the account data
    pool_info.assign(&anchor_lang::solana_program::system_program::ID);
    pool_info.realloc(0, false)?;

    msg!("Pool account closed, {} lamports returned to admin", pool_lamports);
    Ok(())
}
