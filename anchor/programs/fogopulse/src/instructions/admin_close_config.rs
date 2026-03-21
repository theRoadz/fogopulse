//! Admin Close Config instruction — testnet utility to close GlobalConfig account
//!
//! Used when the GlobalConfig struct changes size and the account needs to be recreated.
//! This instruction closes the GlobalConfig account and returns rent to admin.
//! Admin-only, no session support.
//!
//! Uses UncheckedAccount for global_config because the old account may have a different
//! size than the current GlobalConfig struct (which would cause Anchor deserialization failure).

use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;

#[derive(Accounts)]
pub struct AdminCloseConfig<'info> {
    /// Admin authority — verified manually against account data
    #[account(mut)]
    pub admin: Signer<'info>,

    /// GlobalConfig account to close — using UncheckedAccount to handle size mismatches
    /// CHECK: Validated by seeds constraint. Admin checked manually from raw account data.
    #[account(
        mut,
        seeds = [b"global_config"],
        bump,
    )]
    pub global_config: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<AdminCloseConfig>) -> Result<()> {
    let config_info = ctx.accounts.global_config.to_account_info();

    // Verify the account is owned by our program
    require!(
        config_info.owner == ctx.program_id,
        FogoPulseError::Unauthorized
    );

    // Verify admin: first 32 bytes after 8-byte discriminator is the admin pubkey
    let data = config_info.try_borrow_data()?;
    require!(data.len() >= 40, FogoPulseError::Unauthorized);
    let stored_admin = Pubkey::try_from(&data[8..40])
        .map_err(|_| error!(FogoPulseError::Unauthorized))?;
    require!(
        stored_admin == ctx.accounts.admin.key(),
        FogoPulseError::Unauthorized
    );
    drop(data);

    // Transfer all lamports to admin (effectively closing the account)
    let admin_info = ctx.accounts.admin.to_account_info();
    let config_lamports = config_info.lamports();

    **config_info.try_borrow_mut_lamports()? = 0;
    **admin_info.try_borrow_mut_lamports()? = admin_info
        .lamports()
        .checked_add(config_lamports)
        .ok_or(FogoPulseError::Overflow)?;

    // Zero out the account data
    config_info.assign(&anchor_lang::solana_program::system_program::ID);
    config_info.realloc(0, false)?;

    msg!("GlobalConfig account closed, {} lamports returned to admin", config_lamports);
    Ok(())
}
