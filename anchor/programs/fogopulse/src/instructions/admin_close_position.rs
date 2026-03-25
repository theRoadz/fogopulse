//! Admin Close Position instruction — testnet utility to close position accounts
//!
//! Used to clean up orphaned position accounts after pool reinitialization.
//! When pools are reinitialized, epoch IDs reset to 0 but old position PDAs
//! remain on-chain, colliding with new epoch positions and blocking new trades.
//!
//! Admin-only, no session support.
//!
//! Uses UncheckedAccount for position because the old account may have a different
//! size than the current UserPosition struct.

use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;
use crate::state::GlobalConfig;

#[derive(Accounts)]
#[instruction(epoch_id: u64, user: Pubkey, direction: u8)]
pub struct AdminClosePosition<'info> {
    /// Admin authority - must match GlobalConfig.admin
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        constraint = global_config.admin == admin.key() @ FogoPulseError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    /// Pool - for epoch PDA seed derivation
    /// CHECK: Validated indirectly — epoch PDA is derived from pool.key() via seeds,
    /// and position PDA is derived from epoch.key(). The handler verifies position.owner == program_id.
    pub pool: UncheckedAccount<'info>,

    /// Epoch - derived from pool + epoch_id, used for position PDA seed
    /// CHECK: Used only for position PDA seed derivation
    #[account(
        seeds = [b"epoch", pool.key().as_ref(), &epoch_id.to_le_bytes()],
        bump,
    )]
    pub epoch: UncheckedAccount<'info>,

    /// Position account to close — using UncheckedAccount to handle size mismatches
    /// CHECK: Validated by seeds constraint below. Owner checked manually.
    #[account(
        mut,
        seeds = [b"position", epoch.key().as_ref(), user.as_ref(), &[direction]],
        bump,
    )]
    pub position: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<AdminClosePosition>, epoch_id: u64, user: Pubkey, direction: u8) -> Result<()> {
    let position_info = ctx.accounts.position.to_account_info();

    // Verify the account is owned by our program
    require!(
        position_info.owner == ctx.program_id,
        FogoPulseError::Unauthorized
    );

    // Transfer all lamports to admin (effectively closing the account)
    let admin_info = ctx.accounts.admin.to_account_info();
    let position_lamports = position_info.lamports();

    **position_info.try_borrow_mut_lamports()? = 0;
    **admin_info.try_borrow_mut_lamports()? = admin_info
        .lamports()
        .checked_add(position_lamports)
        .ok_or(FogoPulseError::Overflow)?;

    // Zero out the account data
    position_info.assign(&anchor_lang::solana_program::system_program::ID);
    position_info.realloc(0, false)?;

    msg!(
        "Position closed: pool={}, epoch_id={}, user={}, direction={}, {} lamports returned",
        ctx.accounts.pool.key(),
        epoch_id,
        user,
        direction,
        position_lamports
    );
    Ok(())
}
