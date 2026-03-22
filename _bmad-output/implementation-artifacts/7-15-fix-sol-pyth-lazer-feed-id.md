# Story 7.15: Fix SOL/USD Wrong Pyth Lazer Feed ID + Add Exponent Normalization

Status: done
Created: 2026-03-22
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a trader,
I want to see the correct SOL/USD price for epoch start and settlement,
so that my trades are settled against the actual SOL price, not a different token.

## Problem

SOL/USD start_price and settlement_price display as **$0.006312** instead of **~$88.72**. BTC and ETH markets show correct prices. The live Hermes streaming price (top-right corner) is correct — only on-chain stored prices from Pyth Lazer are broken.

### Root Cause

**Wrong Pyth Lazer feed ID.** In `web/src/lib/constants.ts:207`, the SOL feed ID is set to `5`:

```typescript
export const PYTH_LAZER_FEED_IDS: Record<Asset, number> = {
  BTC: 1,    // BTC/USD ✓
  ETH: 2,    // ETH/USD ✓
  SOL: 5,    // ← WRONG! Feed 5 is NEIRO/USD
  FOGO: 2923,
}
```

Verified via Pyth Lazer Symbols API (`history.pyth-lazer.dourolabs.app/history/v1/symbols`):

| Feed ID | Actual Asset |
|---------|-------------|
| 1 | BTC/USD |
| 2 | ETH/USD |
| 5 | **NEIRO/USD** (micro-cap token, ~$0.00006) |
| **6** | **SOL/USD** |

The live price (Pyth Hermes) works correctly because it uses a different identifier — the hex feed ID from `ASSET_METADATA.SOL.feedId`, which correctly points to SOL/USD.

### Secondary Issue: No Exponent Handling

Pyth Lazer exponents vary per feed (confirmed: BTC/ETH = `-8`, NEIRO = `-10`). The codebase:
1. Never subscribes to the `exponent` property from Pyth Lazer
2. Stores the raw price mantissa on-chain without normalization
3. Hardcodes `PYTH_PRICE_EXPONENT = -8` in the frontend (`web/src/lib/utils.ts:66`)

BTC/ETH happen to use `-8` so they work. If any future feed uses a different exponent, it will silently break.

### Diagnostic Evidence

Ran `anchor/scripts/check-pyth-exponent.ts` which connected to Pyth Lazer and confirmed:

```
=== BTC (Feed ID: 1) ===
  Exponent: -8          Actual USD: $69,326.61

=== ETH (Feed ID: 2) ===
  Exponent: -8          Actual USD: $2,119.12

=== SOL (Feed ID: 5) ===        ← Actually NEIRO!
  Exponent: -10         Actual USD: $0.000063
```

## Acceptance Criteria

1. **Given** a new SOL epoch is created, **When** viewing the market, **Then** start_price shows the actual SOL/USD price (~$89, not $0.006)
2. **Given** a SOL epoch is settled, **When** viewing settlement history, **Then** settlement_price shows the actual SOL/USD price
3. **Given** BTC or ETH epochs, **When** created/settled, **Then** behavior is unchanged (no regression)
4. **Given** any Pyth Lazer feed with a non-standard exponent, **When** an epoch is created/settled, **Then** the price is normalized to `-8` scale before on-chain storage

## Tasks / Subtasks

### Task 1: Fix SOL Pyth Lazer Feed ID (AC: #1-#3)

- [x] 1.1: **`web/src/lib/constants.ts:207`** — Change `SOL: 5` to `SOL: 6` in `PYTH_LAZER_FEED_IDS`

### Task 2: Add Exponent Normalization to Oracle (AC: #4)

- [x] 2.1: **`web/src/app/api/pyth-price/route.ts:105`** — Add `'exponent'` to `properties` array: `['price', 'confidence', 'exponent']`
- [x] 2.2: **`crank-bot/crank-bot.ts:484`** — Add `'exponent'` to properties (one-shot fetch)
- [x] 2.3: **`crank-bot/crank-bot.ts:586`** — Add `'exponent'` to properties (persistent PythPriceManager)
- [x] 2.4: **`anchor/scripts/create-test-epoch.ts:206`** — Add `'exponent'` to properties
- [x] 2.5: **`anchor/scripts/settle-epoch.ts:305`** — Add `'exponent'` to properties
- [x] 2.6: **`anchor/tests/settle-epoch.test.ts:325`** — Add `'exponent'` to properties
- [x] 2.7: **`anchor/programs/fogopulse/src/errors.rs`** — Add `OracleExponentMissing` error variant
- [x] 2.8: **`anchor/programs/fogopulse/src/utils/oracle.rs`** — Update `extract_price_and_confidence()` with `normalize_to_target()` helper

### Task 3: Cleanup

- [x] 3.1: Delete `anchor/scripts/check-pyth-exponent.ts` (diagnostic script — was never committed to git)

## Dev Notes

### Key Files

- `web/src/lib/constants.ts:207` — SOL feed ID fix (critical one-liner)
- `anchor/programs/fogopulse/src/utils/oracle.rs` — Exponent normalization
- `anchor/programs/fogopulse/src/errors.rs` — New error variant
- `web/src/app/api/pyth-price/route.ts:105` — Subscription properties
- `crank-bot/crank-bot.ts:484,586` — Crank bot subscriptions

### Two Separate Pyth Systems

The codebase uses two different Pyth price systems:
- **Pyth Hermes** (live streaming to frontend) — uses hex feed IDs from `ASSET_METADATA[asset].feedId`, delivers `price + expo` via SSE. Frontend correctly applies exponent.
- **Pyth Lazer** (on-chain settlement) — uses numeric feed IDs from `PYTH_LAZER_FEED_IDS[asset]`, delivers signed binary payloads via WebSocket. The feed ID mismatch only affects this system.

### No Account Struct Changes

The exponent normalization normalizes all prices to `-8` scale before storing as `u64`. This means:
- No changes to Epoch account struct
- No migration needed
- Frontend `PYTH_PRICE_EXPONENT = -8` and `scalePrice()` remain correct
- `create_epoch.rs` and `settle_epoch.rs` are unchanged — they call `extract_price_and_confidence()` which now returns normalized values

### Historical Data

Old SOL epochs will still show wrong prices (they contain NEIRO prices). This is acceptable on testnet.

## Dev Agent Record

### Implementation Notes

- **Feed ID fix**: Changed `SOL: 5` to `SOL: 6` in all locations — `PYTH_LAZER_FEED_IDS` (constants.ts), `VALID_FEED_IDS` (pyth-price route.ts), crank-bot, create-test-epoch, settle-epoch, and settle-epoch test
- **Exponent normalization**: Added `normalize_to_target()` helper in `oracle.rs` that computes `shift = native_exponent - TARGET_EXPONENT` and applies `10^|shift|` scaling using checked arithmetic
- **No account struct changes**: All prices normalized to `-8` scale before storing, so Epoch account and frontend display code unchanged
- **Build verified**: `anchor build` succeeds with only pre-existing deprecation warnings (no new errors)
- **Deploy verified**: Program upgraded on FOGO testnet, SOL epoch creation confirmed working with correct price
- For BTC/ETH/SOL (all exponent `-8`): `shift = 0`, normalization is a no-op (backward compatible)
- **Post-deploy fix**: Initial deploy hit `OracleExponentMissing` because the Next.js API route had a stale `VALID_FEED_IDS` set still containing `5` instead of `6`, returning 400 for SOL requests. Fixed and server restarted.

## File List

- `web/src/lib/constants.ts` — Modified: SOL feed ID 5 → 6 in `PYTH_LAZER_FEED_IDS`
- `web/src/app/api/pyth-price/route.ts` — Modified: SOL feed ID 5 → 6 in `VALID_FEED_IDS`, added 'exponent' to subscription properties
- `anchor/programs/fogopulse/src/utils/oracle.rs` — Modified: extract exponent from properties[2], normalize to -8 scale via `normalize_to_target()`
- `anchor/programs/fogopulse/src/errors.rs` — Modified: added `OracleExponentMissing` error variant
- `crank-bot/crank-bot.ts` — Modified: SOL feed ID 5 → 6, added 'exponent' to subscription properties (2 locations)
- `anchor/scripts/create-test-epoch.ts` — Modified: SOL feed ID 5 → 6, added 'exponent' to subscription properties
- `anchor/scripts/settle-epoch.ts` — Modified: SOL feed ID 5 → 6, added 'exponent' to subscription properties
- `anchor/tests/settle-epoch.test.ts` — Modified: SOL feed ID 5 → 6, added 'exponent' to subscription properties
- `web/src/lib/fogopulse.json` — Modified: IDL rebuilt after adding `OracleExponentMissing` error (error codes shifted)
- `_bmad-output/implementation-artifacts/7-15-fix-sol-pyth-lazer-feed-id.md` — Story file (this file)

## Change Log

- 2026-03-22: Story created after diagnostic confirmed feed ID 5 = NEIRO/USD, not SOL/USD. SOL/USD is feed ID 6.
- 2026-03-22: All tasks completed. Fixed SOL feed ID across all locations, added exponent normalization to oracle.rs, updated all 6 subscription sites to include 'exponent' property. Build verified.
- 2026-03-22: Deployed to FOGO testnet. Post-deploy fix: updated `VALID_FEED_IDS` in API route (was still rejecting feed ID 6). SOL epoch creation confirmed working.
- 2026-03-22: Code review fixes — (1) Added post-normalization zero-price guard in oracle.rs to prevent silent truncation, (2) Safe exponent cast via `i32::try_from` instead of lossy `as`, (3) Added `fogopulse.json` to File List, (4) Updated `project-context.md` subscription properties to include 'exponent'.
