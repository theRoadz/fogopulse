//! Admin Close LpShare instruction — testnet utility to close stale LpShare accounts
//!
//! Used after pool reinitialization when old LpShare accounts reference
//! pools that have been recreated with fresh state.
//! Admin-only, no session support.

use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;
use crate::state::{GlobalConfig, LpShare};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct AdminCloseLpShare<'info> {
    /// Admin authority - must match GlobalConfig.admin
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        constraint = global_config.admin == admin.key() @ FogoPulseError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    /// Pool reference — used only for PDA derivation
    /// CHECK: Used only for PDA seed derivation
    pub pool: UncheckedAccount<'info>,

    /// LpShare account to close — rent returned to admin
    #[account(
        mut,
        close = admin,
        seeds = [b"lp_share", user.as_ref(), pool.key().as_ref()],
        bump = lp_share.bump,
    )]
    pub lp_share: Account<'info, LpShare>,
}

pub fn handler(_ctx: Context<AdminCloseLpShare>, _user: Pubkey) -> Result<()> {
    msg!("LpShare account closed");
    Ok(())
}
