# Story 7.12: Fixed Trade Amount Presets + Admin-Configurable Max Trade Amount

Status: done
Created: 2026-03-21
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a protocol operator,
I want fixed trade amount presets and an on-chain max trade amount,
so that the UI is simpler and no user or script can exceed the configured maximum.

## Problem

The current quick-amount preset buttons use percentage-based values (25%, 50%, 75%, Max) calculated from the user's wallet balance. This is confusing for users with small balances and doesn't communicate clear dollar amounts.

More critically, there is **no maximum trade amount enforced on-chain**. The only constraints are:
- Minimum trade: $0.10 (`MIN_TRADE_AMOUNT = 100_000` lamports)
- Per-wallet cap: 5% of pool total (dynamic)
- Per-side cap: 30% deviation (dynamic)

Anyone calling `buy_position` directly via a script can pass any amount up to their balance. The protocol needs a hard, admin-configurable max trade amount stored in `GlobalConfig` and enforced in `buy_position`.

## Acceptance Criteria

1. **Given** I view the trade ticket, **When** I see the quick-amount buttons, **Then** they show $5, $10, $20, and Max (not percentages).
2. **Given** I click $10, **When** the amount is set, **Then** the input shows "10.00".
3. **Given** my balance is $8, **When** I view the buttons, **Then** $10 and $20 are disabled, $5 and Max are enabled.
4. **Given** I click Max, **When** my balance is $33.33, **Then** the input shows "33.33" (full balance rounded down to 2 decimals).
5. **Given** anyone calls `buy_position` on-chain with amount > `config.max_trade_amount`, **When** the instruction executes, **Then** it fails with `AboveMaximumTrade` error.
6. **Given** the admin panel, **When** I view the configuration, **Then** there is a "Max Trade Amount" field showing the current value in USDC lamports.
7. **Given** I am an admin, **When** I update `max_trade_amount` via `update_config`, **Then** the new limit takes effect immediately for all subsequent trades.
8. **Given** I enter an amount > $100 (default max) in the trade ticket, **When** I try to submit, **Then** a validation error is shown before the transaction is sent.

## Tasks / Subtasks

### Task 1: On-Chain — Add `max_trade_amount` to GlobalConfig (AC: #5, #7)

- [x] 1.1: Add `pub max_trade_amount: u64` field to `GlobalConfig` in `state/config.rs`
- [x] 1.2: Add `pub const DEFAULT_MAX_TRADE_AMOUNT: u64 = 100_000_000;` to `constants.rs`
- [x] 1.3: Add `AboveMaximumTrade` error variant to `errors.rs`
- [x] 1.4: Add `require!(amount <= config.max_trade_amount, FogoPulseError::AboveMaximumTrade)` to `buy_position.rs` after min check
- [x] 1.5: Add `max_trade_amount: u64` param to `initialize` instruction (`lib.rs` + `initialize.rs`)
- [x] 1.6: Add `pub max_trade_amount: Option<u64>` to `UpdateConfigParams` in `update_config.rs` with validation and apply logic
- [x] 1.7: Add `max_trade_amount` to `GlobalConfigInitialized` event in `events.rs`

### Task 2: Frontend — Admin Panel for Max Trade Amount (AC: #6, #7)

- [x] 2.1: Add `maxTradeAmount: number | null` to `UpdateConfigParams` in `web/src/lib/transactions/update-config.ts`
- [x] 2.2: Add `maxTradeAmount: BN` to `GlobalConfigData` in `web/src/hooks/use-global-config.ts`
- [x] 2.3: Add max trade amount input field to `web/src/components/admin/configuration-panel.tsx`

### Task 3: Frontend — Fixed Amount Preset Buttons (AC: #1, #2, #3, #4, #8)

- [x] 3.1: Replace percentage presets with $5/$10/$20/Max in `web/src/components/trading/quick-amount-buttons.tsx`
- [x] 3.2: Update tests in `web/src/components/trading/quick-amount-buttons.test.tsx`
- [x] 3.3: Add `MAX_TRADE_AMOUNT = 100` to `web/src/types/trade.ts` (hardcoded fallback default)
- [x] 3.4: Add max validation to `web/src/stores/trade-store.ts` — `setAmount`/`validate` accept optional `maxTradeAmount` param for on-chain dynamic values
- [x] 3.5: Wire `useGlobalConfig()` into `trade-ticket.tsx` — reads on-chain `max_trade_amount`, passes to store and `QuickAmountButtons`
- [x] 3.6: `QuickAmountButtons` accepts `maxTradeAmount` prop — Max button caps at `min(balance, maxTradeAmount)`, fixed buttons disabled if they exceed limit

### Task 4: Fix Initialize Script + Build & Deploy (AC: #5, #7)

- [x] 4.1: Update `anchor/scripts/initialize-protocol.ts` — add `maxTradeAmount` param, increase buffer 121→129
- [x] 4.2: Fix `mock_config` in `utils/fees.rs` — add missing `max_trade_amount` field
- [x] 4.3: `anchor build` via WSL — compile program with new field (release + IDL both succeed)
- [x] 4.4: Copy IDL to `web/src/lib/fogopulse.json`
- [x] 4.5: Add temporary `admin_close_config` instruction to close old GlobalConfig (size mismatch)
- [x] 4.6: Deploy updated program to FOGO testnet
- [x] 4.7: Close old GlobalConfig account via `admin_close_config`
- [x] 4.8: Re-initialize GlobalConfig with `max_trade_amount: 100_000_000` ($100 USDC)

### Task 5: Dynamic Treasury/Insurance — Remove Hardcoded Wallets (Post-deploy fix)

During Task 4.8 re-initialization, treasury and insurance defaulted to the admin wallet, breaking fee
distribution. Instead of just fixing the constants, we remove them entirely — the frontend now reads
treasury/insurance from on-chain GlobalConfig and derives ATAs dynamically.

- [x] 5.1: Remove `TREASURY_WALLET`, `TREASURY_USDC_ATA`, `INSURANCE_WALLET`, `INSURANCE_USDC_ATA` from `web/src/lib/constants.ts`
- [x] 5.2: Update `buildBuyPositionInstruction` in `web/src/lib/transactions/buy.ts` — accept `treasuryWallet`/`insuranceWallet` params, derive ATAs via `getAssociatedTokenAddressSync`
- [x] 5.3: Update `buildSellPositionInstruction` in `web/src/lib/transactions/sell.ts` — same pattern
- [x] 5.4: Update `useBuyPosition` hook — add `useGlobalConfig()`, pass wallets to builder
- [x] 5.5: Update `useSellPosition` hook — add `useGlobalConfig()`, pass wallets to builder
- [x] 5.6: Revert `initialize-protocol.ts` to use admin wallet as default (wallets set via admin dashboard post-init)
- [x] 5.7: Update treasury/insurance on-chain via admin dashboard to dedicated wallets

## Dev Notes

### Key Files

**On-chain:**
- `anchor/programs/fogopulse/src/state/config.rs` — GlobalConfig struct (uses `#[derive(InitSpace)]`)
- `anchor/programs/fogopulse/src/constants.rs` — MIN_TRADE_AMOUNT already here
- `anchor/programs/fogopulse/src/errors.rs` — FogoPulseError enum
- `anchor/programs/fogopulse/src/instructions/buy_position.rs` — `config` loaded at line 191, min check at line 205
- `anchor/programs/fogopulse/src/instructions/initialize.rs` — handler sets all config fields
- `anchor/programs/fogopulse/src/instructions/update_config.rs` — UpdateConfigParams with Option fields, bitmask events
- `anchor/programs/fogopulse/src/lib.rs` — initialize() signature passes through to handler

**Frontend:**
- `web/src/components/trading/quick-amount-buttons.tsx` — current percentage-based QUICK_AMOUNTS array
- `web/src/components/admin/configuration-panel.tsx` — FormState, ValidationErrors, validateForm()
- `web/src/lib/transactions/update-config.ts` — UpdateConfigParams, toAnchorParams()
- `web/src/hooks/use-global-config.ts` — GlobalConfigData interface
- `web/src/stores/trade-store.ts` — trade validation logic
- `web/src/types/trade.ts` — MIN_TRADE_AMOUNT = 0.01

### Migration Concern

Adding `max_trade_amount: u64` (8 bytes) to `GlobalConfig` changes `INIT_SPACE`. Since the account uses `init` with `space = 8 + GlobalConfig::INIT_SPACE`, existing deployed accounts will be too small. This requires either:
1. Redeploying and re-initializing (acceptable on testnet)
2. Account reallocation (production concern for later)

For testnet, option 1 is fine.

### Crank Bot Impact

The crank bot (`crank-bot/crank-bot.ts`) is NOT affected by this change:
- It passes `globalConfigPda` as a read-only account to `create_epoch`, `advance_epoch`, `settle_epoch`, `process_withdrawal`
- It does NOT call `buy_position`, `initialize`, or `update_config`
- It does NOT deserialize GlobalConfig data
- The PDA address doesn't change — only the account data layout grows
- After redeploy + re-initialize, crank bot works unchanged

### Initialize Script Fix

`anchor/scripts/initialize-protocol.ts` manually encodes the `initialize` instruction data. Adding `max_trade_amount: u64` requires:
- Buffer size: 121 → 129 bytes (+8 for u64)
- New param in PARAMS: `maxTradeAmount: 100_000_000` ($100 USDC)
- New encoding after `allowHedging` bool: `buffer.writeBigUInt64LE(maxTradeAmount, offset)`

### Build & Deploy Log

**Issue 1: IDL generation crashed with rustc ICE (Internal Compiler Error)**

First `anchor build` compiled the release `.so` successfully but the IDL build step (second compilation with `idl-build` feature) panicked:
```
thread 'rustc' panicked at slice index starts at 13 but ends at 12
query stack: typeck `utils::fees::tests::mock_config`
```

**Root cause:** The `mock_config()` test helper in `utils/fees.rs` constructs a `GlobalConfig` struct literal but was missing the new `max_trade_amount` field. The release build doesn't compile tests, so it passed — but the IDL build compiles in test mode, triggering the missing field error, which then triggered a rustc nightly ICE instead of a clean error message.

**Fix:** Added `max_trade_amount: 100_000_000` to the `mock_config()` helper in `utils/fees.rs`. Second `anchor build` succeeded for both release and IDL.

**Issue 2: Program deploy failed — account too small**

```
Error: AccountNotFound: pubkey=H7413S1o5DB8NY5xvwuRdriNGY9RnKWSAscRawyDY3PF
```

The new `.so` binary (726,640 bytes) was larger than the deployed program data account (724,328 bytes).

**Fix:** Extended the program account with `solana program extend D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5 10000`. Subsequent deploy succeeded.

**Issue 3: FOGO testnet RPC connection drops during deploy**

Multiple deploy attempts failed with TLS/connection errors:
```
Error: Data writes to account failed: RPC error: peer closed connection without sending TLS close_notify
Error: error sending request for url (https://testnet.fogo.io/)
```

Each failed deploy left orphaned buffer accounts consuming ~5 SOL each. These were cleaned up with `solana program close <buffer-address> --bypass-warning` before retrying.

**Fix:** Retried after brief wait. Deploy eventually succeeded on the 4th attempt.

**Issue 4: GlobalConfig account size mismatch — cannot re-initialize**

After deploying the new program, `initialize-protocol.ts` reported:
```
GlobalConfig already initialized!
Account size: 156 bytes
```

The old GlobalConfig account (156 bytes) was too small for the new layout (164 bytes = +8 bytes for `max_trade_amount: u64`). The `initialize` instruction uses Anchor's `init` constraint which requires the account to not exist — it cannot resize an existing account.

**Problem:** There was no on-chain instruction to close the GlobalConfig account. PDA accounts owned by programs cannot be closed via the Solana CLI directly — only the owning program can transfer lamports out and zero the account.

**Fix:** Created a temporary `admin_close_config` instruction following the existing `admin_close_pool` pattern:
1. Created `instructions/admin_close_config.rs` — uses `UncheckedAccount` for GlobalConfig (since Anchor can't deserialize the old-sized account into the new struct)
2. Manually validates admin by reading the first 32 bytes after the 8-byte discriminator (the `admin` pubkey field)
3. Transfers all lamports to admin and zeros the account data
4. Registered in `mod.rs` and `lib.rs`
5. Rebuilt and redeployed the program (with the new instruction)
6. Created `scripts/close-config.ts` utility script to call `admin_close_config`
7. Ran the script — old GlobalConfig closed successfully
8. Ran `initialize-protocol.ts` — new GlobalConfig created with 164 bytes and `max_trade_amount: 100_000_000`

**Deploy sequence (final):**
```
# 1. Build
wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && anchor build 2>&1"

# 2. Extend program account (binary grew)
wsl -e bash -l -c "solana program extend D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5 10000"

# 3. Deploy (may need retries due to FOGO testnet instability)
wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && solana program deploy target/deploy/fogopulse.so --program-id D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5"

# 4. Copy IDL
wsl -e bash -l -c "cp /mnt/d/dev/fogopulse/anchor/target/idl/fogopulse.json /mnt/d/dev/fogopulse/web/src/lib/fogopulse.json"

# 5. Close old GlobalConfig (size mismatch)
wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && npx tsx scripts/close-config.ts"

# 6. Re-initialize with new params
wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && npx tsx scripts/initialize-protocol.ts"

# 7. Recreate pools (GlobalConfig was re-initialized)
wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && npx tsx scripts/create-pools.ts"
```

**Transaction signatures:**
- Deploy: `3Scv8MKdNmFjFPDmnqPDUSHoJUGuTS1eN4PKanqvRSojy7YcUtPUpAtF4bXMfzh3uFNAfeTjBaG2zmQsoHDb56hC`
- Close GlobalConfig: `2sM1pnhc8fKJHwp3cPDim3R7XgdKzKTVJ3L2v615mXmiVrg7uX9K8hYdiTFZ5idavxfQ8LT4r3NJDPhJyijB3eBX`
- Re-initialize: `TiU7FcTwqoABaZqxutSoeycg2uNKjvi55xjH6VzmDakshpaH9gJ5xUUjbE51gzg8WQAUttMrznM5w8JUAKtmQHc`

### Production Migration Notes

For production deployment, this GlobalConfig close/reinitialize approach would cause downtime. A safer production migration would:
1. Add a `reallocate_config` admin instruction that uses `realloc` to grow the account by 8 bytes
2. Write the default `max_trade_amount` value into the new bytes
3. No downtime, no data loss, no pool recreation needed

## File List

**On-chain (modified):**
- `anchor/programs/fogopulse/src/state/config.rs` — Added `max_trade_amount: u64` field
- `anchor/programs/fogopulse/src/constants.rs` — Added `DEFAULT_MAX_TRADE_AMOUNT`
- `anchor/programs/fogopulse/src/errors.rs` — Added `AboveMaximumTrade` error
- `anchor/programs/fogopulse/src/instructions/buy_position.rs` — Added max trade amount check
- `anchor/programs/fogopulse/src/instructions/initialize.rs` — Added `max_trade_amount` param
- `anchor/programs/fogopulse/src/instructions/update_config.rs` — Added `max_trade_amount` to params, validation, apply, bitmask
- `anchor/programs/fogopulse/src/events.rs` — Added `max_trade_amount` to init event, documented bit 17
- `anchor/programs/fogopulse/src/lib.rs` — Added `max_trade_amount` to initialize signature
- `anchor/programs/fogopulse/src/utils/fees.rs` — Fixed `mock_config` test helper with new field
- `anchor/programs/fogopulse/src/instructions/admin_close_config.rs` — New: temporary instruction to close GlobalConfig for migration
- `anchor/programs/fogopulse/src/instructions/mod.rs` — Registered `admin_close_config`
- `anchor/scripts/initialize-protocol.ts` — Added `maxTradeAmount` param, buffer 121→129
- `anchor/scripts/close-config.ts` — New: utility script to call `admin_close_config`

**Frontend (modified):**
- `web/src/components/trading/quick-amount-buttons.tsx` — Replaced % presets with $5/$10/$20/Max
- `web/src/components/trading/quick-amount-buttons.test.tsx` — Updated tests for fixed amounts
- `web/src/types/trade.ts` — Added `MAX_TRADE_AMOUNT = 100`
- `web/src/stores/trade-store.ts` — Added max trade amount validation
- `web/src/stores/trade-store.test.ts` — Fixed exceeds-balance test for new max limit
- `web/src/lib/constants.ts` — Removed hardcoded treasury/insurance wallet constants
- `web/src/lib/fogopulse.json` — Updated IDL with new `max_trade_amount` field and `admin_close_config` instruction
- `web/src/lib/transactions/update-config.ts` — Added `maxTradeAmount` param + BN conversion
- `web/src/lib/transactions/buy.ts` — Accept `treasuryWallet`/`insuranceWallet` params, derive ATAs dynamically from GlobalConfig
- `web/src/lib/transactions/sell.ts` — Same dynamic treasury/insurance ATA pattern as buy.ts
- `web/src/hooks/use-global-config.ts` — Added `maxTradeAmount` to GlobalConfigData
- `web/src/hooks/use-buy-position.ts` — Added `useGlobalConfig()`, pass treasury/insurance wallets to builder
- `web/src/hooks/use-sell-position.ts` — Added `useGlobalConfig()`, pass treasury/insurance wallets to builder
- `web/src/components/admin/configuration-panel.tsx` — Added max trade amount input/validation/change detection
- `web/src/components/trading/trade-ticket.tsx` — Wired `useGlobalConfig()` to pass on-chain `maxTradeAmount` to store and QuickAmountButtons

**Sprint tracking:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Added 7-12 entry
- `_bmad-output/implementation-artifacts/7-12-fixed-trade-presets-max-trade-amount.md` — This story file

## Senior Developer Review (AI)

**Reviewer:** theRoad | **Date:** 2026-03-21 | **Outcome:** Approved with fixes applied

### Findings (9 total: 2 High, 4 Medium, 3 Low)

**Fixed (HIGH):**
- **H1:** Story File List missing 5 git-changed files (buy.ts, sell.ts, use-buy-position.ts, use-sell-position.ts, fogopulse.json) — **Fixed:** Updated File List
- **H2:** Hardcoded `MAX_TRADE_AMOUNT` in trade store doesn't reflect on-chain config changes — **Fixed:** `setAmount()` and `validate()` now accept optional `maxTradeAmount` param for dynamic on-chain values

**Fixed (MEDIUM):**
- **M1:** Duplicate `MAX_TRADE_AMOUNT_USDC` constant in constants.ts (unused) — **Fixed:** Removed
- **M3:** `rustc-ice-*.txt` crash dumps in working tree — **Fixed:** Added to .gitignore
- **M4:** No tests for max trade amount validation in trade-store — **Fixed:** Added 4 tests (setAmount + validate, default + custom max)

**Acknowledged (MEDIUM):**
- **M2:** `admin_close_config` instruction left in deployed code — acceptable for testnet, track for removal before mainnet

**Noted (LOW):**
- **L1:** `globalconfig-operations-guide.md` untracked — informational doc, can commit separately
- **L2:** Frontend `MIN_TRADE_AMOUNT` ($0.01) doesn't match on-chain ($0.10) — pre-existing, not in scope
- **L3:** `close-config.ts` utility script should be tracked for mainnet cleanup

### Change Log
- Updated story File List with 5 missing files + `trade-ticket.tsx`
- Made `trade-store.ts` `setAmount`/`validate` accept optional `maxTradeAmount` for dynamic on-chain values
- Added `maxTradeAmount` prop to `QuickAmountButtons` — Max caps at `min(balance, maxTradeAmount)`, fixed buttons disabled if exceeding limit
- Wired `useGlobalConfig()` into `trade-ticket.tsx` to read on-chain `max_trade_amount` and pass to store + buttons
- Removed unused `MAX_TRADE_AMOUNT_USDC` from `constants.ts`
- Added `rustc-ice-*.txt` to `.gitignore`
- Added 4 new tests to `trade-store.test.ts` + 3 new tests to `quick-amount-buttons.test.tsx` for max trade amount
- All 41 tests passing
