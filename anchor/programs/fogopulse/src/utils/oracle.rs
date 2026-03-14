//! Oracle utility functions for Pyth Lazer integration
//!
//! This module provides shared helper functions for extracting price data
//! from verified Pyth Lazer messages. Used by both create_epoch and settle_epoch.

use anchor_lang::prelude::*;
use pyth_lazer_solana_contract::protocol::payload::{PayloadData, PayloadPropertyValue};

use crate::errors::FogoPulseError;

/// Extract price and confidence from Pyth Lazer payload data
///
/// # Pyth Lazer Property Ordering
/// Pyth Lazer feed properties are ordered by the subscription request.
/// FogoPulse subscribes with: `["price", "confidence"]`
/// Therefore:
/// - `properties[0]` = Price (required)
/// - `properties[1]` = Confidence (optional, defaults to 0)
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

    Ok((price, confidence))
}
