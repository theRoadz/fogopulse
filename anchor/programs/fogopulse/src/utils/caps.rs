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
/// The cap is measured as maximum DEVIATION from balanced (50%), not absolute percentage.
/// This allows 50/50 seeded pools to function while still preventing extreme imbalance.
///
/// # Arguments
/// * `side_total` - Total reserves on one side after trade (yes or no)
/// * `pool_total` - Total reserves in pool (yes + no)
/// * `cap_bps` - Maximum allowed deviation from balanced in basis points (e.g., 3000 = 30%)
///
/// # Returns
/// * `Ok(())` if within cap limits
/// * `Err(ExceedsSideCap)` if side exposure exceeds allowed deviation
///
/// # Calculation
/// With cap_bps=3000 (30% deviation allowed):
/// - balanced_side = pool_total / 2
/// - max_deviation = balanced_side * 30% = balanced_side * 0.3
/// - max_allowed = balanced_side + max_deviation = 65% of pool
///
/// # Examples
/// - 50/50 pool: passes (0% deviation)
/// - 65/35 pool: passes (15% deviation, within 30% limit)
/// - 80/20 pool: fails (30% deviation exceeds limit)
///
/// # Special Cases
/// * First trade (pool_total == 0): Always allowed
pub fn check_side_cap(side_total: u64, pool_total: u64, cap_bps: u16) -> Result<()> {
    if pool_total == 0 {
        // First trade in epoch - no cap check needed
        return Ok(());
    }

    // Calculate balanced side (50% of pool)
    let balanced_side = pool_total / 2;

    // Cap is max DEVIATION from balanced, not max absolute percentage
    // With cap_bps=3000 (30%), deviation allowed is 30% of balanced side
    // e.g., balanced=10K, deviation=3K, max_allowed=13K (65% of total)
    let max_deviation = balanced_side
        .checked_mul(cap_bps as u64)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10000)
        .ok_or(FogoPulseError::Overflow)?;

    let max_allowed = balanced_side
        .checked_add(max_deviation)
        .ok_or(FogoPulseError::Overflow)?;

    require!(side_total <= max_allowed, FogoPulseError::ExceedsSideCap);
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
    fn test_side_cap_balanced_pool() {
        // 50/50 pool should always pass (deviation = 0)
        // 500 USDC on one side in 1000 USDC total pool with 30% deviation cap
        // balanced_side = 500, max_deviation = 150, max_allowed = 650
        let result = check_side_cap(500_000_000, 1_000_000_000, 3000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_side_cap_within_deviation() {
        // 600 USDC on one side in 1000 USDC total = 20% over balanced (100M above 500M)
        // With 30% cap: balanced=500, deviation=150, max_allowed=650
        // 600 < 650, so should pass (comfortably within limit)
        let result = check_side_cap(600_000_000, 1_000_000_000, 3000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_side_cap_exceeds_deviation() {
        // 700 USDC on one side in 1000 USDC total = 40% over balanced (200M above 500M)
        // With 30% cap: balanced=500, deviation=150, max_allowed=650
        // 700 > 650, so should fail
        let result = check_side_cap(700_000_000, 1_000_000_000, 3000);
        assert!(result.is_err());
    }

    #[test]
    fn test_side_cap_exactly_at_limit() {
        // Exactly at max deviation limit should pass
        // balanced=500, max_deviation=150, max_allowed=650
        let result = check_side_cap(650_000_000, 1_000_000_000, 3000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_side_cap_just_over_limit() {
        // Just 1 lamport over max deviation should fail
        // balanced=500, max_deviation=150, max_allowed=650
        let result = check_side_cap(650_000_001, 1_000_000_000, 3000);
        assert!(result.is_err());
    }
}
