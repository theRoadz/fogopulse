//! Fee calculation utilities for FOGO Pulse trading
//!
//! Calculates trading fee splits according to configured ratios:
//! - LP fee: Stays in pool USDC (auto-compounding)
//! - Treasury fee: Transferred to treasury token account
//! - Insurance fee: Transferred to insurance token account
//!
//! # Rounding Strategy
//! - Total fee uses ceiling division (favors protocol over user)
//! - Fee splits use floor division with LP getting remainder (no dust loss)

use anchor_lang::prelude::*;

use crate::errors::FogoPulseError;
use crate::state::GlobalConfig;

/// Fee split calculation result - all amounts in lamports (USDC 6 decimals)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FeeSplit {
    /// Amount after fees - used for share calculation
    pub net_amount: u64,
    /// Total fee charged (trading_fee_bps of gross amount)
    pub total_fee: u64,
    /// LP portion of fee (stays in pool reserves)
    pub lp_fee: u64,
    /// Treasury portion of fee (transferred out)
    pub treasury_fee: u64,
    /// Insurance portion of fee (transferred out)
    pub insurance_fee: u64,
}

/// Validate that fee share percentages sum to 100% (10000 bps)
///
/// # Arguments
/// * `config` - GlobalConfig containing fee share parameters
///
/// # Returns
/// * `true` if lp_fee_share_bps + treasury_fee_share_bps + insurance_fee_share_bps == 10000
///
/// # Note
/// This is a diagnostic check. The fee calculation itself is resilient to misconfiguration
/// because LP fee is calculated as the remainder (total_fee - treasury - insurance).
pub fn validate_fee_shares(config: &GlobalConfig) -> bool {
    let total = config.lp_fee_share_bps as u32
        + config.treasury_fee_share_bps as u32
        + config.insurance_fee_share_bps as u32;
    total == 10000
}

/// Calculate fee split from trade amount using configured ratios
///
/// # Arguments
/// * `amount` - Gross trade amount in USDC lamports
/// * `config` - GlobalConfig containing fee parameters
///
/// # Returns
/// * `FeeSplit` with net_amount and fee breakdown
///
/// # Errors
/// * `Overflow` - If any arithmetic operation overflows
///
/// # Fee Calculation
/// 1. Total fee = ceil(amount * trading_fee_bps / 10_000)
/// 2. Treasury fee = floor(total_fee * treasury_fee_share_bps / 10_000)
/// 3. Insurance fee = floor(total_fee * insurance_fee_share_bps / 10_000)
/// 4. LP fee = total_fee - treasury_fee - insurance_fee (remainder)
///
/// # Note
/// Fee shares should sum to 10000 bps (100%). Use `validate_fee_shares()` to verify.
/// If misconfigured, LP fee will absorb the difference (may be more or less than configured).
///
/// # Example (100 USDC, 1.8% fee, 70/20/10 split)
/// ```text
/// gross_amount = 100_000_000 lamports
/// total_fee = ceil(100_000_000 * 180 / 10_000) = 1_800_000
/// treasury_fee = floor(1_800_000 * 2000 / 10_000) = 360_000
/// insurance_fee = floor(1_800_000 * 1000 / 10_000) = 180_000
/// lp_fee = 1_800_000 - 360_000 - 180_000 = 1_260_000
/// net_amount = 100_000_000 - 1_800_000 = 98_200_000
/// ```
pub fn calculate_fee_split(amount: u64, config: &GlobalConfig) -> Result<FeeSplit> {
    // Handle zero amount edge case
    if amount == 0 {
        return Ok(FeeSplit {
            net_amount: 0,
            total_fee: 0,
            lp_fee: 0,
            treasury_fee: 0,
            insurance_fee: 0,
        });
    }

    // Calculate total fee using ceiling division (favors protocol)
    // total_fee = ceil(amount * trading_fee_bps / 10_000)
    // Ceiling division: (a + b - 1) / b = ceil(a / b)
    let fee_numerator = (amount as u128)
        .checked_mul(config.trading_fee_bps as u128)
        .ok_or(FogoPulseError::Overflow)?;

    // Add 9999 for ceiling division (10000 - 1)
    let total_fee = fee_numerator
        .checked_add(9999)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10_000)
        .ok_or(FogoPulseError::Overflow)? as u64;

    // Net amount after fees
    let net_amount = amount
        .checked_sub(total_fee)
        .ok_or(FogoPulseError::Overflow)?;

    // If total_fee is 0, return all zeros for fee portions
    if total_fee == 0 {
        return Ok(FeeSplit {
            net_amount: amount,
            total_fee: 0,
            lp_fee: 0,
            treasury_fee: 0,
            insurance_fee: 0,
        });
    }

    // Split total_fee according to configured ratios using floor division
    // Note: lp + treasury + insurance should sum to 10000 bps (100%)
    let treasury_fee = (total_fee as u128)
        .checked_mul(config.treasury_fee_share_bps as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10_000)
        .ok_or(FogoPulseError::Overflow)? as u64;

    let insurance_fee = (total_fee as u128)
        .checked_mul(config.insurance_fee_share_bps as u128)
        .ok_or(FogoPulseError::Overflow)?
        .checked_div(10_000)
        .ok_or(FogoPulseError::Overflow)? as u64;

    // LP fee is the remainder (ensures no dust loss)
    let lp_fee = total_fee
        .checked_sub(treasury_fee)
        .ok_or(FogoPulseError::Overflow)?
        .checked_sub(insurance_fee)
        .ok_or(FogoPulseError::Overflow)?;

    Ok(FeeSplit {
        net_amount,
        total_fee,
        lp_fee,
        treasury_fee,
        insurance_fee,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create a mock config for testing
    fn mock_config(
        trading_fee_bps: u16,
        lp_fee_share_bps: u16,
        treasury_fee_share_bps: u16,
        insurance_fee_share_bps: u16,
    ) -> GlobalConfig {
        GlobalConfig {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            insurance: Pubkey::default(),
            trading_fee_bps,
            lp_fee_share_bps,
            treasury_fee_share_bps,
            insurance_fee_share_bps,
            per_wallet_cap_bps: 500,
            per_side_cap_bps: 3000,
            oracle_confidence_threshold_start_bps: 25,
            oracle_confidence_threshold_settle_bps: 80,
            oracle_staleness_threshold_start: 3,
            oracle_staleness_threshold_settle: 10,
            epoch_duration_seconds: 300,
            freeze_window_seconds: 15,
            allow_hedging: false,
            paused: false,
            frozen: false,
            max_trade_amount: 100_000_000,
            bump: 0,
        }
    }

    #[test]
    fn test_standard_100_usdc_trade() {
        // 100 USDC = 100_000_000 lamports (6 decimals)
        // 1.8% fee = 180 bps
        // 70/20/10 split = 7000/2000/1000 bps
        let config = mock_config(180, 7000, 2000, 1000);
        let amount = 100_000_000u64; // 100 USDC

        let result = calculate_fee_split(amount, &config).unwrap();

        assert_eq!(result.total_fee, 1_800_000); // 1.8 USDC
        assert_eq!(result.net_amount, 98_200_000); // 98.2 USDC
        assert_eq!(result.treasury_fee, 360_000); // 0.36 USDC
        assert_eq!(result.insurance_fee, 180_000); // 0.18 USDC
        assert_eq!(result.lp_fee, 1_260_000); // 1.26 USDC

        // Verify: all fees sum to total_fee
        assert_eq!(
            result.lp_fee + result.treasury_fee + result.insurance_fee,
            result.total_fee
        );
        // Verify: net + total = amount
        assert_eq!(result.net_amount + result.total_fee, amount);
    }

    #[test]
    fn test_minimum_trade_amount() {
        // Minimum trade: 100_000 lamports (0.1 USDC)
        let config = mock_config(180, 7000, 2000, 1000);
        let amount = 100_000u64;

        let result = calculate_fee_split(amount, &config).unwrap();

        // total_fee = ceil(100_000 * 180 / 10_000) = ceil(1800) = 1800
        assert_eq!(result.total_fee, 1800);
        assert_eq!(result.net_amount, 98_200);

        // treasury_fee = floor(1800 * 2000 / 10_000) = 360
        assert_eq!(result.treasury_fee, 360);
        // insurance_fee = floor(1800 * 1000 / 10_000) = 180
        assert_eq!(result.insurance_fee, 180);
        // lp_fee = 1800 - 360 - 180 = 1260
        assert_eq!(result.lp_fee, 1260);

        // Verify integrity
        assert_eq!(
            result.lp_fee + result.treasury_fee + result.insurance_fee,
            result.total_fee
        );
    }

    #[test]
    fn test_very_small_amount_rounding() {
        // Very small amount where fees might round weirdly
        // 1000 lamports (0.001 USDC)
        let config = mock_config(180, 7000, 2000, 1000);
        let amount = 1000u64;

        let result = calculate_fee_split(amount, &config).unwrap();

        // total_fee = ceil(1000 * 180 / 10_000) = ceil(18) = 18
        assert_eq!(result.total_fee, 18);
        assert_eq!(result.net_amount, 982);

        // treasury_fee = floor(18 * 2000 / 10_000) = 3
        assert_eq!(result.treasury_fee, 3);
        // insurance_fee = floor(18 * 1000 / 10_000) = 1
        assert_eq!(result.insurance_fee, 1);
        // lp_fee = 18 - 3 - 1 = 14 (gets the rounding remainder)
        assert_eq!(result.lp_fee, 14);

        // Verify no dust
        assert_eq!(
            result.lp_fee + result.treasury_fee + result.insurance_fee,
            result.total_fee
        );
    }

    #[test]
    fn test_ceiling_division_for_fees() {
        // Amount that doesn't divide evenly
        // 555_555 lamports, 180 bps
        let config = mock_config(180, 7000, 2000, 1000);
        let amount = 555_555u64;

        let result = calculate_fee_split(amount, &config).unwrap();

        // total_fee = ceil(555_555 * 180 / 10_000) = ceil(9999.99) = 10000
        // Actually: 555_555 * 180 = 99_999_900, /10_000 = 9999.99 -> ceil = 10000
        assert_eq!(result.total_fee, 10000);
        assert_eq!(result.net_amount, 545_555);

        // Verify user pays slightly more due to ceiling
        assert!(result.net_amount + result.total_fee == amount);
    }

    #[test]
    fn test_large_amount_no_overflow() {
        // Very large amount: 1 billion USDC
        let config = mock_config(180, 7000, 2000, 1000);
        let amount = 1_000_000_000_000_000u64; // 1 billion USDC in lamports

        let result = calculate_fee_split(amount, &config).unwrap();

        // total_fee = ceil(1_000_000_000_000_000 * 180 / 10_000) = 18_000_000_000_000
        assert_eq!(result.total_fee, 18_000_000_000_000);
        assert_eq!(result.net_amount, 982_000_000_000_000);

        // Verify integrity
        assert_eq!(
            result.lp_fee + result.treasury_fee + result.insurance_fee,
            result.total_fee
        );
        assert_eq!(result.net_amount + result.total_fee, amount);
    }

    #[test]
    fn test_zero_amount() {
        let config = mock_config(180, 7000, 2000, 1000);
        let result = calculate_fee_split(0, &config).unwrap();

        assert_eq!(result.net_amount, 0);
        assert_eq!(result.total_fee, 0);
        assert_eq!(result.lp_fee, 0);
        assert_eq!(result.treasury_fee, 0);
        assert_eq!(result.insurance_fee, 0);
    }

    #[test]
    fn test_zero_trading_fee() {
        // Edge case: trading fee is 0
        let config = mock_config(0, 7000, 2000, 1000);
        let amount = 100_000_000u64;

        let result = calculate_fee_split(amount, &config).unwrap();

        assert_eq!(result.total_fee, 0);
        assert_eq!(result.net_amount, amount);
        assert_eq!(result.lp_fee, 0);
        assert_eq!(result.treasury_fee, 0);
        assert_eq!(result.insurance_fee, 0);
    }

    #[test]
    fn test_different_fee_splits() {
        // Test 50/30/20 split instead of 70/20/10
        let config = mock_config(200, 5000, 3000, 2000); // 2% fee, 50/30/20
        let amount = 100_000_000u64;

        let result = calculate_fee_split(amount, &config).unwrap();

        // total_fee = 2_000_000 (2% of 100 USDC)
        assert_eq!(result.total_fee, 2_000_000);
        // treasury_fee = 2_000_000 * 3000 / 10_000 = 600_000
        assert_eq!(result.treasury_fee, 600_000);
        // insurance_fee = 2_000_000 * 2000 / 10_000 = 400_000
        assert_eq!(result.insurance_fee, 400_000);
        // lp_fee = 2_000_000 - 600_000 - 400_000 = 1_000_000
        assert_eq!(result.lp_fee, 1_000_000);
    }

    #[test]
    fn test_fee_split_sums_correctly() {
        // Property test: fees always sum correctly
        let config = mock_config(180, 7000, 2000, 1000);

        for amount in [1, 100, 1000, 12345, 100_000_000, 999_999_999_999] {
            let result = calculate_fee_split(amount, &config).unwrap();

            // All fee portions sum to total_fee
            assert_eq!(
                result.lp_fee + result.treasury_fee + result.insurance_fee,
                result.total_fee,
                "Fee portions don't sum to total for amount {}",
                amount
            );

            // Net + total = original amount
            assert_eq!(
                result.net_amount + result.total_fee,
                amount,
                "Net + fee doesn't equal original for amount {}",
                amount
            );
        }
    }
}
