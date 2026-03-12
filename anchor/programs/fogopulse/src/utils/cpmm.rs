//! CPMM (Constant Product Market Maker) calculations for share pricing
//!
//! Implements the constant product formula for calculating shares:
//! shares = amount * opposite_reserves / same_reserves
//!
//! Empty pool handling: First trade on a side gets 1:1 shares

use anchor_lang::prelude::*;
use crate::errors::FogoPulseError;

/// Calculate shares for a position purchase using CPMM formula
///
/// # Arguments
/// * `amount` - USDC amount being deposited (6 decimals)
/// * `same_reserves` - Current reserves on the side being bought (Up buying adds to yes_reserves)
/// * `opposite_reserves` - Current reserves on the opposite side
///
/// # Returns
/// * Number of shares to mint for this position
///
/// # Formula
/// * If same_reserves == 0 (first trade on side): shares = amount (1:1)
/// * Otherwise: shares = amount * opposite_reserves / same_reserves
pub fn calculate_shares(
    amount: u64,
    same_reserves: u64,
    opposite_reserves: u64,
) -> Result<u64> {
    if same_reserves == 0 {
        // First trade on this side - shares = amount (1:1 ratio)
        // NOTE: This handles both empty pool (both reserves 0) and first trade on
        // one side while the other has reserves. In either case, 1:1 is the correct
        // pricing since there's no existing liquidity on this side to price against.
        // The opposite_reserves value is intentionally ignored when same_reserves == 0.
        Ok(amount)
    } else {
        // Standard CPMM: shares = amount * opposite / same
        amount
            .checked_mul(opposite_reserves)
            .ok_or(FogoPulseError::Overflow)?
            .checked_div(same_reserves)
            .ok_or(FogoPulseError::Overflow)
            .map_err(|e| e.into())
    }
}

/// Calculate entry price per share in USDC lamports (6 decimals)
///
/// # Arguments
/// * `amount` - USDC amount deposited (6 decimals)
/// * `shares` - Number of shares received
///
/// # Returns
/// * Entry price in USDC per share (scaled by 1_000_000 for precision)
///
/// # Formula
/// entry_price = amount * 1_000_000 / shares
pub fn calculate_entry_price(amount: u64, shares: u64) -> Result<u64> {
    if shares == 0 {
        return Err(FogoPulseError::Overflow.into());
    }
    amount
        .checked_mul(1_000_000)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(shares)
        .ok_or(FogoPulseError::Overflow)
        .map_err(|e| e.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_first_trade_on_side() {
        // First trade on empty side should get 1:1 shares
        let shares = calculate_shares(1_000_000, 0, 0).unwrap();
        assert_eq!(shares, 1_000_000);
    }

    #[test]
    fn test_cpmm_formula() {
        // 100 USDC buy with 500 same reserves, 300 opposite reserves
        // shares = 100 * 300 / 500 = 60
        let shares = calculate_shares(100_000_000, 500_000_000, 300_000_000).unwrap();
        assert_eq!(shares, 60_000_000);
    }

    #[test]
    fn test_entry_price() {
        // 100 USDC for 60 shares = 1.667 USDC per share
        // = 1_666_666 (scaled)
        let price = calculate_entry_price(100_000_000, 60_000_000).unwrap();
        assert_eq!(price, 1_666_666);
    }

    #[test]
    fn test_entry_price_zero_shares() {
        let result = calculate_entry_price(100_000_000, 0);
        assert!(result.is_err());
    }
}
