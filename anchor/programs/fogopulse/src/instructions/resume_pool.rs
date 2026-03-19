use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::events::PoolResumed;
use crate::state::{GlobalConfig, Pool};

#[derive(Accounts)]
pub struct ResumePool<'info> {
    /// Admin signer — verified via GlobalConfig.has_one
    #[account(mut)]
    pub admin: Signer<'info>,

    /// GlobalConfig for admin verification
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = admin @ FogoPulseError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// Pool to resume — PDA with seeds ["pool", asset_mint]
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,
}

pub fn handler(ctx: Context<ResumePool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    msg!("resume_pool: admin={}, pool={}, asset_mint={}",
        ctx.accounts.admin.key(), pool.key(), pool.asset_mint);

    // Idempotent — if already unpaused, succeed silently (no event)
    if pool.is_paused {
        pool.is_paused = false;

        emit!(PoolResumed {
            pool: pool.key(),
            asset_mint: pool.asset_mint,
            admin: ctx.accounts.admin.key(),
        });
    }

    Ok(())
}
