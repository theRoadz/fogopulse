//! Oracle utility functions for Pyth Lazer integration
//!
//! This module provides shared helper functions for extracting price data
//! from verified Pyth Lazer messages. Used by both create_epoch and settle_epoch.

use anchor_lang::prelude::*;
use pyth_lazer_solana_contract::protocol::payload::{PayloadData, PayloadPropertyValue};

use crate::errors::FogoPulseError;

/// Target exponent for all stored prices. All Pyth Lazer prices are normalized
/// to this scale before storing on-chain, so the frontend can use a single
/// hardcoded exponent for display.
const TARGET_EXPONENT: i32 = -8;

/// Extract price and confidence from Pyth Lazer payload data, normalized to
/// `TARGET_EXPONENT` (-8) scale.
///
/// # Pyth Lazer Property Ordering
/// Pyth Lazer feed properties are ordered by the subscription request.
/// FogoPulse subscribes with: `["price", "confidence", "exponent"]`
/// Therefore:
/// - `properties[0]` = Price (required)
/// - `properties[1]` = Confidence (optional, defaults to 0)
/// - `properties[2]` = Exponent (required for normalization)
///
/// If Pyth changes this convention or we change subscription order,
/// this function must be updated accordingly.
pub fn extract_price_and_confidence(payload: &PayloadData) -> Result<(u64, u64)> {
    // Validate that we have at least one feed with properties
    require!(
        !payload.feeds.is_empty() && !payload.feeds[0].properties.is_empty(),
        FogoPulseError::OraclePriceMissing
    );

    let feed = &payload.feeds[0];

    // Extract price from first property (index 0 = price per subscription order)
    // Using into_inner().into() pattern from Pyth examples
    let price = match &feed.properties[0] {
        PayloadPropertyValue::Price(Some(p)) => {
            let price_val: i64 = p.into_inner().into();
            require!(price_val > 0, FogoPulseError::OraclePriceMissing);
            // Safe cast: we've validated price_val > 0, so it fits in u64
            u64::try_from(price_val).map_err(|_| FogoPulseError::Overflow)?
        }
        _ => return Err(FogoPulseError::OraclePriceMissing.into()),
    };

    // Extract confidence from second property (index 1 = confidence per subscription order)
    // Confidence is optional - default to 0 if not present or negative
    let confidence = if feed.properties.len() > 1 {
        match &feed.properties[1] {
            PayloadPropertyValue::Confidence(Some(c)) => {
                let conf_val: i64 = c.into_inner().into();
                if conf_val > 0 {
                    u64::try_from(conf_val).unwrap_or(0)
                } else {
                    0
                }
            }
            _ => 0,
        }
    } else {
        0
    };

    // Extract exponent from third property (index 2 = exponent per subscription order)
    // Normalize price and confidence to TARGET_EXPONENT (-8) scale
    let native_exponent: i32 = if feed.properties.len() > 2 {
        match &feed.properties[2] {
            PayloadPropertyValue::Exponent(exp) => i32::try_from(*exp).map_err(|_| FogoPulseError::Overflow)?,
            _ => return Err(FogoPulseError::OracleExponentMissing.into()),
        }
    } else {
        return Err(FogoPulseError::OracleExponentMissing.into());
    };

    let shift = native_exponent - TARGET_EXPONENT;
    let (normalized_price, normalized_confidence) = normalize_to_target(price, confidence, shift)?;

    // Guard against division truncating price to zero (e.g. very large exponent gaps)
    require!(normalized_price > 0, FogoPulseError::OraclePriceMissing);

    Ok((normalized_price, normalized_confidence))
}

/// Normalize price and confidence by applying an exponent shift.
/// - shift > 0: multiply by 10^shift (feed has fewer decimals than target)
/// - shift < 0: divide by 10^|shift| (feed has more decimals than target)
/// - shift == 0: no-op (BTC, ETH, SOL all use -8)
fn normalize_to_target(price: u64, confidence: u64, shift: i32) -> Result<(u64, u64)> {
    if shift == 0 {
        return Ok((price, confidence));
    }

    let abs_shift = shift.unsigned_abs();
    let factor = 10u64
        .checked_pow(abs_shift)
        .ok_or(FogoPulseError::Overflow)?;

    if shift > 0 {
        // Feed exponent is less negative than -8, scale up
        let p = price.checked_mul(factor).ok_or(FogoPulseError::Overflow)?;
        let c = confidence.checked_mul(factor).ok_or(FogoPulseError::Overflow)?;
        Ok((p, c))
    } else {
        // Feed exponent is more negative than -8, scale down
        // Division rounds toward zero; acceptable for price normalization
        Ok((price / factor, confidence / factor))
    }
}
