use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::events::PoolPaused;
use crate::state::{GlobalConfig, Pool};

#[derive(Accounts)]
pub struct PausePool<'info> {
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

    /// Pool to pause — PDA with seeds ["pool", asset_mint]
    #[account(
        mut,
        seeds = [b"pool", pool.asset_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,
}

pub fn handler(ctx: Context<PausePool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    msg!("pause_pool: admin={}, pool={}, asset_mint={}",
        ctx.accounts.admin.key(), pool.key(), pool.asset_mint);

    // Idempotent — if already paused, succeed silently (no event)
    if !pool.is_paused {
        pool.is_paused = true;

        emit!(PoolPaused {
            pool: pool.key(),
            asset_mint: pool.asset_mint,
            admin: ctx.accounts.admin.key(),
        });
    }

    Ok(())
}
