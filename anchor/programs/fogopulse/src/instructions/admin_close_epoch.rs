//! Admin Close Epoch instruction — testnet utility to close an epoch account
//!
//! Used to clean up orphaned epoch accounts after pool reinitialization.
//! When pools are closed and recreated, their `next_epoch_id` resets to 0,
//! but old epoch PDAs still exist on-chain, blocking new epoch creation.
//!
//! Admin-only, no session support.
//!
//! Uses UncheckedAccount for epoch because the old account may have a different
//! size than the current Epoch struct (which would cause Anchor deserialization failure).

use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;
use crate::state::GlobalConfig;

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct AdminCloseEpoch<'info> {
    /// Admin authority - must match GlobalConfig.admin
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        constraint = global_config.admin == admin.key() @ FogoPulseError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    /// Pool - for PDA seed derivation
    /// CHECK: Used only for epoch PDA seed derivation
    pub pool: UncheckedAccount<'info>,

    /// Epoch account to close — using UncheckedAccount to handle size mismatches
    /// CHECK: Validated by seeds constraint below. Owner checked manually.
    #[account(
        mut,
        seeds = [b"epoch", pool.key().as_ref(), &epoch_id.to_le_bytes()],
        bump,
    )]
    pub epoch: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<AdminCloseEpoch>, epoch_id: u64) -> Result<()> {
    let epoch_info = ctx.accounts.epoch.to_account_info();

    // Verify the account is owned by our program
    require!(
        epoch_info.owner == ctx.program_id,
        FogoPulseError::Unauthorized
    );

    // Transfer all lamports to admin (effectively closing the account)
    let admin_info = ctx.accounts.admin.to_account_info();
    let epoch_lamports = epoch_info.lamports();

    **epoch_info.try_borrow_mut_lamports()? = 0;
    **admin_info.try_borrow_mut_lamports()? = admin_info
        .lamports()
        .checked_add(epoch_lamports)
        .ok_or(FogoPulseError::Overflow)?;

    // Zero out the account data
    epoch_info.assign(&anchor_lang::solana_program::system_program::ID);
    epoch_info.realloc(0, false)?;

    msg!(
        "Epoch account closed: pool={}, epoch_id={}, {} lamports returned to admin",
        ctx.accounts.pool.key(),
        epoch_id,
        epoch_lamports
    );
    Ok(())
}
