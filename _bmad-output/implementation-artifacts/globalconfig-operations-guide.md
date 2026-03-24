# GlobalConfig Operations Guide

A comprehensive reference for initializing, updating, migrating, and troubleshooting the GlobalConfig account on FogoPulse.

---

## Table of Contents

1. [GlobalConfig Overview](#1-globalconfig-overview)
2. [Updating Config via Admin Dashboard](#2-updating-config-via-admin-dashboard)
3. [Updating Config via CLI Script](#3-updating-config-via-cli-script)
4. [Adding a New Field to GlobalConfig](#4-adding-a-new-field-to-globalconfig)
5. [Re-Initializing GlobalConfig (Testnet)](#5-re-initializing-globalconfig-testnet)
6. [Changing Treasury or Insurance Wallets](#6-changing-treasury-or-insurance-wallets)
7. [Verification](#7-verification)
8. [Troubleshooting](#8-troubleshooting)
9. [Field Reference](#9-field-reference)

---

## 1. GlobalConfig Overview

GlobalConfig is a PDA account storing all protocol-wide parameters. There is exactly one per deployment.

**PDA Derivation:**
```
seeds: [b"global_config"]
program: D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5
```

**Key Files:**
| File | Purpose |
|------|---------|
| `anchor/programs/fogopulse/src/state/config.rs` | On-chain struct definition |
| `anchor/programs/fogopulse/src/instructions/initialize.rs` | One-time creation |
| `anchor/programs/fogopulse/src/instructions/update_config.rs` | Admin updates |
| `anchor/programs/fogopulse/src/instructions/admin_close_config.rs` | Close for migration (testnet) |
| `web/src/components/admin/configuration-panel.tsx` | Admin dashboard UI |
| `web/src/hooks/use-global-config.ts` | Frontend hook (fetches + WebSocket) |
| `web/src/lib/transactions/update-config.ts` | Frontend transaction builder |
| `anchor/scripts/verify-protocol.ts` | Verify on-chain values |
| `anchor/scripts/initialize-protocol.ts` | Initialize script |
| `anchor/scripts/setup-fee-wallets.ts` | Create dedicated treasury/insurance wallets + ATAs |

---

## 2. Updating Config via Admin Dashboard

The simplest and recommended way to update any GlobalConfig field.

**Steps:**
1. Connect admin wallet at `/admin`
2. Navigate to Configuration Panel
3. Edit desired fields
4. The UI validates all inputs in real-time:
   - Fee shares must sum to exactly 10000 bps
   - Trading fee max 1000 bps (10%)
   - Epoch duration min 60 seconds
   - Freeze window must be less than epoch duration
   - Max trade amount min 100,000 lamports ($0.10)
5. Click "Update Config" — a confirmation dialog shows all changed fields
6. Sign the transaction in your wallet
7. The `useGlobalConfig` hook auto-refetches (WebSocket + 5s polling)

**What happens behind the scenes:**
- Only changed fields are sent as `Some(value)`, unchanged fields are sent as `None`
- On-chain `update_config` validates all provided values before applying any
- A `ConfigUpdated` event is emitted with a bitmask of which fields changed

---

## 3. Updating Config via CLI Script

For automation or when the frontend is unavailable.

**Existing example:** `anchor/scripts/update-staleness.ts`

**Pattern:**
```typescript
// 1. Load admin keypair
const adminKeypair = loadWallet()

// 2. Fetch current config to verify admin
const configAccount = await connection.getAccountInfo(GLOBAL_CONFIG_PDA)
const currentAdmin = new PublicKey(configAccount.data.subarray(8, 40))

// 3. Build update_config instruction data
//    19 Option fields in Borsh order:
//    None = 0x00, Some(value) = 0x01 + value_bytes
const parts = [UPDATE_CONFIG_DISCRIMINATOR]
parts.push(Buffer.from([0]))  // 1. treasury: None
parts.push(Buffer.from([0]))  // 2. insurance: None
// ... set fields 3-19 as None or Some as needed

// 4. Send transaction
```

**Update Config Discriminator:** `[29, 158, 252, 191, 10, 83, 219, 99]`

**Option encoding for each field type:**

| Type | None | Some |
|------|------|------|
| `Pubkey` | `[0]` (1 byte) | `[1] + pubkey_bytes` (33 bytes) |
| `u16` | `[0]` (1 byte) | `[1] + u16_le` (3 bytes) |
| `i64` | `[0]` (1 byte) | `[1] + i64_le` (9 bytes) |
| `u64` | `[0]` (1 byte) | `[1] + u64_le` (9 bytes) |
| `bool` | `[0]` (1 byte) | `[1] + [0 or 1]` (2 bytes) |

**Field order (must match `UpdateConfigParams` struct):**
1. treasury (Pubkey)
2. insurance (Pubkey)
3. trading_fee_bps (u16)
4. lp_fee_share_bps (u16)
5. treasury_fee_share_bps (u16)
6. insurance_fee_share_bps (u16)
7. per_wallet_cap_bps (u16)
8. per_side_cap_bps (u16)
9. oracle_confidence_threshold_start_bps (u16)
10. oracle_confidence_threshold_settle_bps (u16)
11. oracle_staleness_threshold_start (i64)
12. oracle_staleness_threshold_settle (i64)
13. epoch_duration_seconds (i64)
14. freeze_window_seconds (i64)
15. allow_hedging (bool)
16. paused (bool)
17. frozen (bool)
18. max_trade_amount (u64)
19. settlement_timeout_seconds (i64)

---

## 4. Adding a New Field to GlobalConfig

This is the most complex operation. Adding a field changes the account size, which means existing accounts can't be deserialized by the new program.

### Checklist

**On-Chain Changes:**
- [ ] Add field to `GlobalConfig` struct in `state/config.rs` (order matters for Borsh)
- [ ] Add constant/default in `constants.rs` if applicable
- [ ] Add error variant in `errors.rs` if new validation needed
- [ ] Add parameter to `initialize` instruction in `initialize.rs` + `lib.rs`
- [ ] Add `Option<T>` field to `UpdateConfigParams` in `update_config.rs`
- [ ] Add validation, apply logic, and bitmask bit in `update_config.rs`
- [ ] Add field to `GlobalConfigInitialized` event in `events.rs`
- [ ] Update `mock_config()` in `utils/fees.rs` (test helper) — **this one is easy to miss and causes ICE crashes**
- [ ] Build: `cd /mnt/d/dev/fogopulse/anchor && anchor build`

**Deploy (Testnet — close + reinitialize):**
- [ ] Deploy program first (before closing config): `solana program deploy target/deploy/fogopulse.so --program-id <PROGRAM_ID>`
- [ ] Extend program account if binary grew: `solana program extend <PROGRAM_ID> <BYTES>`
- [ ] Close old GlobalConfig: `npx tsx scripts/close-config.ts`
- [ ] Re-initialize: `npx tsx scripts/initialize-protocol.ts`
- [ ] Setup fee wallets: `npx tsx scripts/setup-fee-wallets.ts`
- [ ] Restore oracle staleness overrides: `npx tsx scripts/update-staleness.ts`

> **Important: Pools do NOT need recreation.** Pool accounts only reference GlobalConfig at runtime via PDA seeds. If only GlobalConfig changed (new fields, re-init), existing pools remain valid. Only recreate pools if the Pool struct itself changed. Verified during Story 7.28 migration (2026-03-24).

**Frontend Changes:**
- [ ] Copy IDL: `cp anchor/target/idl/fogopulse.json web/src/lib/fogopulse.json`
- [ ] Add field to `GlobalConfigData` in `web/src/hooks/use-global-config.ts`
- [ ] Add to `UpdateConfigParams` in `web/src/lib/transactions/update-config.ts`
- [ ] Add `BN` wrapping in `toAnchorParams()` if field is i64/u64
- [ ] Add UI input + validation in `web/src/components/admin/configuration-panel.tsx`
- [ ] Update `initialize-protocol.ts` — adjust buffer size and encoding
- [ ] Add constant to `web/src/lib/constants.ts` if needed for frontend logic

### Common Pitfalls

1. **`mock_config()` in `utils/fees.rs`** — If you forget to add the new field here, `anchor build` may crash with an Internal Compiler Error (ICE) instead of a clean error. The release build passes (doesn't compile tests) but IDL build fails.

2. **Account size mismatch** — After deploying, the old GlobalConfig has fewer bytes than the new struct expects. Anchor's `init` constraint requires the account to not exist. You must close the old account first via `admin_close_config`.

3. **Pool recreation is usually NOT needed** — Pools reference GlobalConfig at runtime, not at creation time (except for `wallet_cap_bps` and `side_cap_bps` which are copied at pool creation). If only GlobalConfig fields changed, pools are unaffected. Only recreate pools if the Pool struct layout changed.

4. **Treasury/Insurance reset** — `initialize-protocol.ts` defaults treasury and insurance to the admin wallet. After re-initialization, run `setup-fee-wallets.ts` to restore dedicated wallets. The script handles ATA creation and `update_config` in one step.

5. **Fee wallet ATAs** — If treasury/insurance wallets change, their USDC ATAs must exist. Run `setup-fee-wallets.ts` or ensure ATAs are created before trading resumes.

6. **Oracle staleness overrides** — `initialize-protocol.ts` uses default staleness values (3s start, 15s settle). If you previously overrode these (e.g., 10s start), re-run `update-staleness.ts` after re-initialization.

7. **Deploy order matters** — Deploy the new program binary BEFORE closing GlobalConfig. If you close config first, the old program is gone and you can't use `admin_close_config` if something goes wrong. The new program can deserialize the old (smaller) account for the close instruction since `admin_close_config` doesn't read the full struct.

### Production Migration (Future)

For production, avoid close + reinitialize. Instead:
1. Add a `reallocate_config` instruction using Anchor's `realloc` constraint
2. Grow the account by the needed bytes
3. Write default values into the new space
4. Zero downtime, no data loss, no pool recreation needed

---

## 5. Re-Initializing GlobalConfig (Testnet)

When you need a fresh start (e.g., after adding fields).

```bash
# From WSL:
cd /mnt/d/dev/fogopulse/anchor

# 1. Build the new program
anchor build

# 2. Deploy new program binary (do this BEFORE closing config)
solana program deploy target/deploy/fogopulse.so \
  --url https://testnet.fogo.io \
  --keypair ~/.config/solana/fogo-testnet.json \
  --program-id D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5

# 3. Close existing GlobalConfig
npx tsx scripts/close-config.ts

# 4. Re-initialize with defaults
npx tsx scripts/initialize-protocol.ts

# 5. Setup fee wallets (restores treasury/insurance + creates ATAs)
npx tsx scripts/setup-fee-wallets.ts

# 6. Restore any config overrides (e.g., oracle staleness)
npx tsx scripts/update-staleness.ts

# 7. Copy IDL to frontend
cp target/idl/fogopulse.json ../web/src/lib/fogopulse.json

# 8. Verify
npx tsx scripts/verify-protocol.ts
```

> **Note:** Pools do NOT need recreation unless the Pool struct changed. Existing pools, LP shares, and USDC balances survive a GlobalConfig re-init.

**After re-initialization, always:**
- Verify with `npx tsx scripts/verify-protocol.ts`
- Confirm treasury/insurance are set to dedicated wallets (not admin)
- Ensure fee wallet ATAs exist
- Test a buy + sell trade

---

## 6. Changing Treasury or Insurance Wallets

Treasury and insurance wallets determine where trading fees are distributed. Changing them requires care.

### Prerequisites

Before changing a wallet address:
1. The new wallet must have a USDC Associated Token Account (ATA) already created
2. The new wallet needs a small SOL balance for rent-exemption

### Creating the ATA

Option A — Run `setup-fee-wallets.ts` (handles everything):
```bash
cd /mnt/d/dev/fogopulse/anchor
npx tsx scripts/setup-fee-wallets.ts
```

Option B — Manual via `spl-token`:
```bash
spl-token create-account <USDC_MINT> --owner <NEW_WALLET> --fee-payer <ADMIN>
```

### Updating the Wallet

Use the admin dashboard Configuration Panel — edit the treasury or insurance address field and submit.

### How the Frontend Handles It

The frontend reads treasury/insurance from on-chain GlobalConfig via `useGlobalConfig()` and derives ATAs dynamically using `getAssociatedTokenAddressSync()`. **No code changes needed when wallets change.**

Relevant flow:
1. `useGlobalConfig()` fetches `config.treasury` and `config.insurance` from on-chain
2. `useBuyPosition` / `useSellPosition` hooks pass these to transaction builders
3. `buildBuyPositionInstruction` / `buildSellPositionInstruction` derive ATAs:
   ```typescript
   const treasuryUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, treasuryWallet)
   const insuranceUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, insuranceWallet)
   ```
4. On-chain program validates with `associated_token::authority = config.treasury`

### Common Mistake

If the USDC ATA for the new wallet doesn't exist, trades will fail with `AccountNotInitialized` or `ConstraintTokenOwner`. Always create the ATA before updating the wallet address.

---

## 7. Verification

### Quick Check — Admin Dashboard

Navigate to `/admin` and check the Configuration Panel. All current values are displayed.

### Script Verification

```bash
cd /mnt/d/dev/fogopulse/anchor
npx tsx scripts/verify-protocol.ts
```

This outputs:
- Admin, treasury, insurance addresses
- All fee parameters
- All timing/oracle parameters
- Paused/frozen status
- Pool account verification for all 4 assets

### On-Chain Binary Layout

For manual inspection, GlobalConfig account data is laid out as:

```
Offset    Size    Field
0-7       8       Discriminator
8-39      32      admin (Pubkey)
40-71     32      treasury (Pubkey)
72-103    32      insurance (Pubkey)
104-105   2       trading_fee_bps (u16)
106-107   2       lp_fee_share_bps (u16)
108-109   2       treasury_fee_share_bps (u16)
110-111   2       insurance_fee_share_bps (u16)
112-113   2       per_wallet_cap_bps (u16)
114-115   2       per_side_cap_bps (u16)
116-117   2       oracle_confidence_threshold_start_bps (u16)
118-119   2       oracle_confidence_threshold_settle_bps (u16)
120-127   8       oracle_staleness_threshold_start (i64)
128-135   8       oracle_staleness_threshold_settle (i64)
136-143   8       epoch_duration_seconds (i64)
144-151   8       freeze_window_seconds (i64)
152       1       allow_hedging (bool)
153       1       paused (bool)
154       1       frozen (bool)
155-162   8       max_trade_amount (u64)
163-170   8       settlement_timeout_seconds (i64)
171       1       bump (u8)
```

Total: 172 bytes (8 discriminator + 164 data)

---

## 8. Troubleshooting

### `ConstraintTokenOwner` on trade

**Cause:** Treasury or insurance USDC ATA doesn't match the wallet stored in GlobalConfig.

**Fix:** Either the ATA doesn't exist (create it via `setup-fee-wallets.ts`) or the wallet in GlobalConfig is wrong (update via admin dashboard).

### `anchor build` ICE (Internal Compiler Error)

**Cause:** Usually a missing field in `mock_config()` test helper in `utils/fees.rs`.

**Fix:** Add the new field to the `GlobalConfig` struct literal in `mock_config()`.

### Account size mismatch after deploy

**Cause:** New field made the struct larger than the existing account.

**Fix (testnet):** Close old config with `close-config.ts`, then re-initialize. See [Section 5](#5-re-initializing-globalconfig-testnet).

### Fee shares validation error

**Cause:** `lp_fee_share_bps + treasury_fee_share_bps + insurance_fee_share_bps != 10000`

**Fix:** When updating any fee share, the sum of all three (including unchanged ones) must equal 10000. Update them together if needed.

### Program deploy fails — account too small

**Cause:** New program binary is larger than the deployed program data account.

**Fix:** `solana program extend <PROGRAM_ID> <EXTRA_BYTES>` (e.g., 10000 bytes buffer).

### FOGO testnet deploy connection drops

**Cause:** Testnet RPC instability.

**Fix:** Retry after a brief wait. Clean up orphaned buffer accounts with `solana program close <BUFFER_ADDRESS> --bypass-warning`.

---

## 9. Field Reference

### Current Default Values (Testnet)

| Field | Value | Display |
|-------|-------|---------|
| trading_fee_bps | 180 | 1.8% |
| lp_fee_share_bps | 7000 | 70% |
| treasury_fee_share_bps | 2000 | 20% |
| insurance_fee_share_bps | 1000 | 10% |
| per_wallet_cap_bps | 500 | 5% |
| per_side_cap_bps | 3000 | 30% |
| epoch_duration_seconds | 300 | 5 minutes |
| freeze_window_seconds | 15 | 15 seconds |
| oracle_confidence_threshold_start_bps | 25 | 0.25% |
| oracle_confidence_threshold_settle_bps | 80 | 0.8% |
| oracle_staleness_threshold_start | 10 | 10 seconds |
| oracle_staleness_threshold_settle | 15 | 15 seconds |
| allow_hedging | false | — |
| paused | false | — |
| frozen | false | — |
| max_trade_amount | 100,000,000 | $100 USDC |
| settlement_timeout_seconds | 60 | 60 seconds |

### Validation Constraints

| Field | Min | Max | Notes |
|-------|-----|-----|-------|
| trading_fee_bps | 0 | 1000 | 10% max |
| fee shares (each) | 0 | 10000 | All three must sum to 10000 |
| per_wallet_cap_bps | 0 | 10000 | — |
| per_side_cap_bps | 0 | 10000 | — |
| oracle_confidence_*_bps | 1 | 10000 | — |
| oracle_staleness_* | 1 | — | Must be positive |
| epoch_duration_seconds | 60 | — | Must be > freeze_window |
| freeze_window_seconds | 0 | — | Must be < epoch_duration |
| max_trade_amount | 100,000 | — | $0.10 USDC minimum |
| settlement_timeout_seconds | 1 | — | Must be positive |

### ConfigUpdated Event Bitmask

| Bit | Field |
|-----|-------|
| 0 | treasury |
| 1 | insurance |
| 2 | trading_fee_bps |
| 3 | lp_fee_share_bps |
| 4 | treasury_fee_share_bps |
| 5 | insurance_fee_share_bps |
| 6 | per_wallet_cap_bps |
| 7 | per_side_cap_bps |
| 8 | oracle_confidence_threshold_start_bps |
| 9 | oracle_confidence_threshold_settle_bps |
| 10 | oracle_staleness_threshold_start |
| 11 | oracle_staleness_threshold_settle |
| 12 | epoch_duration_seconds |
| 13 | freeze_window_seconds |
| 14 | allow_hedging |
| 15 | paused |
| 16 | frozen |
| 17 | max_trade_amount |
| 18 | settlement_timeout_seconds |
