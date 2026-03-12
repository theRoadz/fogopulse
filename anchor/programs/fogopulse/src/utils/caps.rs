//! Cap validation utilities for trading limits
//!
//! Enforces per-wallet and per-side position limits to prevent
//! market manipulation and ensure fair participation.

use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;

/// Validate that a user's position doesn't exceed the per-wallet cap
///
/// # Arguments
/// * `user_amount` - Total position amount for this user after trade
/// * `pool_total` - Total reserves in pool after trade (yes + no)
/// * `cap_bps` - Maximum allowed percentage in basis points (e.g., 500 = 5%)
///
/// # Returns
/// * `Ok(())` if within cap limits
/// * `Err(ExceedsWalletCap)` if position exceeds allowed percentage
///
/// # Special Cases
/// * First trade (pool_total == 0): Always allowed
pub fn check_wallet_cap(user_amount: u64, pool_total: u64, cap_bps: u16) -> Result<()> {
    if pool_total == 0 {
        // First trade in epoch - no cap check needed
        return Ok(());
    }

    // Calculate max allowed: pool_total * cap_bps / 10000
    let max_allowed = pool_total
        .checked_mul(cap_bps as u64)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10000)
        .ok_or(FogoPulseError::Overflow)?;

    require!(user_amount <= max_allowed, FogoPulseError::ExceedsWalletCap);
    Ok(())
}

/// Validate that a side's total exposure doesn't exceed the per-side cap
///
/// # Arguments
/// * `side_total` - Total reserves on one side after trade (yes or no)
/// * `pool_total` - Total reserves in pool after trade (yes + no)
/// * `cap_bps` - Maximum allowed percentage in basis points (e.g., 3000 = 30%)
///
/// # Returns
/// * `Ok(())` if within cap limits
/// * `Err(ExceedsSideCap)` if side exposure exceeds allowed percentage
///
/// # Special Cases
/// * First trade (pool_total == 0): Always allowed
pub fn check_side_cap(side_total: u64, pool_total: u64, cap_bps: u16) -> Result<()> {
    if pool_total == 0 {
        // First trade in epoch - no cap check needed
        return Ok(());
    }

    // Calculate max side: pool_total * cap_bps / 10000
    let max_side = pool_total
        .checked_mul(cap_bps as u64)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10000)
        .ok_or(FogoPulseError::Overflow)?;

    require!(side_total <= max_side, FogoPulseError::ExceedsSideCap);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wallet_cap_first_trade() {
        // First trade should always pass
        let result = check_wallet_cap(1_000_000, 0, 500);
        assert!(result.is_ok());
    }

    #[test]
    fn test_wallet_cap_within_limit() {
        // 50 USDC position in 1000 USDC pool with 5% cap (max 50)
        let result = check_wallet_cap(50_000_000, 1_000_000_000, 500);
        assert!(result.is_ok());
    }

    #[test]
    fn test_wallet_cap_exceeds_limit() {
        // 60 USDC position in 1000 USDC pool with 5% cap (max 50)
        let result = check_wallet_cap(60_000_000, 1_000_000_000, 500);
        assert!(result.is_err());
    }

    #[test]
    fn test_side_cap_first_trade() {
        // First trade should always pass
        let result = check_side_cap(1_000_000, 0, 3000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_side_cap_within_limit() {
        // 300 USDC on one side in 1000 USDC pool with 30% cap
        let result = check_side_cap(300_000_000, 1_000_000_000, 3000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_side_cap_exceeds_limit() {
        // 400 USDC on one side in 1000 USDC pool with 30% cap
        let result = check_side_cap(400_000_000, 1_000_000_000, 3000);
        assert!(result.is_err());
    }
}
