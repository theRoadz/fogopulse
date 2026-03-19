use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::events::ProtocolFrozen;
use crate::state::GlobalConfig;

#[derive(Accounts)]
pub struct EmergencyFreeze<'info> {
    /// Admin signer — verified via GlobalConfig.has_one
    #[account(mut)]
    pub admin: Signer<'info>,

    /// GlobalConfig — admin verification AND target to freeze
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = admin @ FogoPulseError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handler(ctx: Context<EmergencyFreeze>) -> Result<()> {
    let config = &mut ctx.accounts.global_config;
    let clock = Clock::get()?;

    msg!("emergency_freeze: admin={}, frozen_before={}",
        ctx.accounts.admin.key(), config.frozen);

    // Idempotent — if already frozen, succeed silently (no event)
    if !config.frozen {
        config.frozen = true;

        emit!(ProtocolFrozen {
            admin: ctx.accounts.admin.key(),
            timestamp: clock.unix_timestamp,
        });
    }

    Ok(())
}
