# Story 7.8: Fix Hedging — Direction-Based Position PDAs

Status: done
Created: 2026-03-19
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a trader,
I want to place both Up and Down positions on the same epoch when hedging is enabled,
so that I can hedge my risk or change my prediction without waiting for the next epoch.

## Problem

When `allow_hedging = true` in GlobalConfig, users STILL cannot trade both Up and Down on the same epoch. The buy_position instruction fails with `InvalidDirection` error.

**Root cause:** Position PDA seeds are `["position", epoch, user]` — only ONE position account per user per epoch. The handler at `buy_position.rs:211-219` always rejects opposite-direction trades on existing positions, regardless of the `allow_hedging` flag. The comment at line 212 even says "Hedging requires separate position accounts" but no second account mechanism exists.

**Fix:** Add direction byte to PDA seeds: `["position", epoch, user, direction_byte]`. This creates two possible position accounts per user per epoch (one Up, one Down). Direction byte: `Up = 0`, `Down = 1` (Borsh serialization order of the `Direction` enum).

## Design Decisions

1. **`allow_hedging` enforcement: Client-side only.** The on-chain program structurally allows both directions via separate PDA seeds. The frontend checks the `allow_hedging` flag before showing the opposite-direction trade option. Rationale: hedging when disabled is economically self-punishing (double fees, zero net exposure). On-chain enforcement would require passing the opposite-direction position PDA as a remaining account on every buy, adding complexity for no real attack vector. Can add on-chain enforcement in v2 if needed.

2. **Cap calculations: No change needed.** `check_wallet_cap` operates per-position. With hedging, Up and Down positions are checked independently. A user with 4% Up + 4% Down passes both checks (each under the 5% cap). This is correct because hedged positions have zero net directional exposure.

3. **Migration: Force-close active epochs** before deploying to testnet. This is a breaking PDA seed change — existing position accounts will be orphaned. Force-closing ensures users can claim existing positions before the change.

## Acceptance Criteria

1. **Given** `allow_hedging = true` and an open epoch, **When** a user buys an Up position then buys a Down position on the same epoch, **Then** both transactions succeed and two separate position accounts are created
2. **Given** an existing Up position, **When** the user buys more Up on the same epoch, **Then** the position is added to (same behavior as before)
3. **Given** a user with both Up and Down positions, **When** the user sells one direction, **Then** the other direction's position is unaffected
4. **Given** a settled epoch with outcome Up, **When** a hedging user claims payout on their Up position, **Then** they receive winnings; their Down position is a separate loss (no claim)
5. **Given** a refunded epoch, **When** a hedging user has both positions, **Then** they can claim refund on EACH position separately (two transactions)
6. **Given** `allow_hedging = false`, **When** a user already has an Up position, **Then** the frontend prevents placing a Down position on the same epoch
7. **Given** the frontend, **When** position data is fetched for an epoch, **Then** both Up and Down positions are fetched and displayed if they exist
8. **Given** trading history, **When** a user hedged on an epoch, **Then** both positions appear as separate history entries

## Tasks / Subtasks

### Task 1: On-Chain Rust Changes (AC: #1-#5)

- [x] 1.1: **`buy_position.rs`** — Update `#[instruction]` macro from `#[instruction(user: Pubkey)]` to `#[instruction(user: Pubkey, direction: Direction)]`
- [x]1.2: **`buy_position.rs`** — Add direction byte to PDA seeds: `seeds = [b"position", epoch.key().as_ref(), user.as_ref(), &[direction as u8]]`
- [x]1.3: **`buy_position.rs`** — Remove the direction check block at lines 207-219 (the `if !is_new_position { require!(position.direction == direction ...) }` block). PDA seeds now separate directions, making this check impossible to trigger. Keep `is_new_position` variable for init logic at line 346.
- [x]1.4: **`buy_position.rs`** — Update module doc comments (lines 11-17) to reflect new PDA seeds
- [x]1.5: **`sell_position.rs`** — Update `#[instruction]` from `#[instruction(user: Pubkey, shares: u64)]` to `#[instruction(user: Pubkey, direction: Direction, shares: u64)]`
- [x]1.6: **`sell_position.rs`** — Add direction byte to PDA seeds at line 88
- [x]1.7: **`sell_position.rs`** — Update handler signature from `handler(ctx, user, shares)` to `handler(ctx, user, direction: Direction, shares: u64)`. Add defense-in-depth assertion: `require!(position.direction == direction, FogoPulseError::InvalidDirection)` after the `!position.claimed` check
- [x]1.8: **`sell_position.rs`** — Update module doc comments to reflect new PDA seeds
- [x]1.9: **`claim_payout.rs`** — Update `#[instruction]` from `#[instruction(user: Pubkey)]` to `#[instruction(user: Pubkey, direction: Direction)]`
- [x]1.10: **`claim_payout.rs`** — Add direction byte to PDA seeds at line 92
- [x]1.11: **`claim_payout.rs`** — Update handler signature from `handler(ctx, user)` to `handler(ctx, user, direction: Direction)`. Add defense-in-depth: `require!(position.direction == direction, FogoPulseError::InvalidDirection)` after line 150
- [x]1.12: **`claim_payout.rs`** — Update module doc comments
- [x]1.13: **`claim_refund.rs`** — Update `#[instruction]` from `#[instruction(user: Pubkey)]` to `#[instruction(user: Pubkey, direction: Direction)]`
- [x]1.14: **`claim_refund.rs`** — Add direction byte to PDA seeds at line 86
- [x]1.15: **`claim_refund.rs`** — Update handler signature from `handler(ctx, user)` to `handler(ctx, user, direction: Direction)`
- [x]1.16: **`claim_refund.rs`** — Update module doc comments
- [x]1.17: **`state/position.rs`** — Update PDA seeds comment at line 14 to `["position", epoch.key(), user.key(), direction_byte]`

### Task 2: Build & IDL (AC: #1)

- [x]2.1: Build program in WSL: `cd /mnt/d/dev/fogopulse/anchor && anchor build`
- [x]2.2: Copy generated IDL to frontend: `cp target/idl/fogopulse.json ../web/src/lib/fogopulse.json`

### Task 3: Frontend Core — PDA & Transaction Builders (AC: #1, #3, #4, #5)

- [x]3.1: **`web/src/lib/pda.ts`** — Add `direction: 'up' | 'down'` parameter to `derivePositionPda`. Add `Buffer.from([direction === 'up' ? 0 : 1])` as 4th seed.
- [x]3.2: **`web/src/lib/transactions/buy.ts`** — Pass `direction` to `derivePositionPda` at line 115. Direction is already available in `BuildBuyPositionParams`.
- [x]3.3: **`web/src/lib/transactions/sell.ts`** — Add `direction: 'up' | 'down'` to `BuildSellPositionParams`. Pass to `derivePositionPda` at line 59. Add direction to instruction args: `.sellPosition(userPubkey, toAnchorDirection(direction), new BN(shares.toString()))`. Add `toAnchorDirection` helper (copy from buy.ts).
- [x]3.4: **`web/src/lib/transactions/claim.ts`** — Add `direction: 'up' | 'down'` to `BuildClaimInstructionParams`. Pass to `derivePositionPda` at lines 47/83. Add direction to instruction args: `.claimPayout(userPubkey, toAnchorDirection(direction))` and `.claimRefund(userPubkey, toAnchorDirection(direction))`. Add `toAnchorDirection` helper.

### Task 4: Frontend Hooks (AC: #6, #7, #8)

- [x]4.1: **`web/src/hooks/use-user-position.ts`** — Add `direction: 'up' | 'down'` parameter to `useUserPosition(epochPda, direction)`. Pass to `derivePositionPda`. Update query key to `['position', epochPda, publicKey, direction]`.
- [x]4.2: **`web/src/hooks/use-sell-position.ts`** — Add `direction: 'up' | 'down'` to `SellPositionParams`. Pass through to `buildSellPositionInstruction`.
- [x]4.3: **`web/src/hooks/use-claim-position.ts`** — Add `direction: 'up' | 'down'` to `ClaimPositionParams`. Pass through to claim builder functions.
- [x]4.4: **`web/src/hooks/use-user-positions-batch.ts`** — Derive TWO PDAs per epoch (up + down). Fetch both. Update return type to include both directions per epoch.
- [x]4.5: **`web/src/hooks/use-trading-history.ts`** — Derive both up/down position PDAs per settled epoch. Fetch both, produce separate `TradingHistoryEntry` records for each non-null position.
- [x]4.6: **`web/src/hooks/use-multi-asset-positions.ts`** — Adapt to new `useUserPositionsBatch` return shape.

### Task 5: Frontend UI Components (AC: #6, #7, #8)

- [x]5.1: **`web/src/components/trading/your-position.tsx`** — Fetch both Up and Down positions for the current epoch using `useUserPosition(epochPda, 'up')` and `useUserPosition(epochPda, 'down')`. Display both if they exist.
- [x]5.2: **`web/src/components/trading/claim-button.tsx`** — Pass `direction` to `useClaimPosition` mutation.
- [x]5.3: **`web/src/components/trading/trading-history-row.tsx`** — Pass `direction` to claim mutation.
- [x]5.4: **`web/src/components/trading/settlement-history-list.tsx`** — Adapt to new batch positions shape (may show two rows per epoch for hedged positions).

### Task 6: Anchor Scripts (AC: #4, #5)

- [x]6.1: **`anchor/scripts/claim-payout.ts`** — Update PDA derivation to include direction byte + update instruction args
- [x]6.2: **`anchor/scripts/claim-refund.ts`** — Update PDA derivation to include direction byte + update instruction args

### Task 7: Build Verification

- [x]7.1: `cd /mnt/d/dev/fogopulse/anchor && anchor build` — compiles cleanly
- [x]7.2: `cd /mnt/d/dev/fogopulse/web && npm run build` — TypeScript compilation passes with zero errors

### Task 8: Pre-Deploy & Testnet Verification (AC: #1-#5)

- [ ] 8.1: Force-close all active epochs across all pools (BTC, ETH, SOL, FOGO) using `admin_force_close_epoch`
- [ ] 8.2: Deploy updated program to FOGO testnet via `anchor upgrade`
- [ ] 8.3: Create fresh epochs on all pools
- [ ] 8.4: Manual test: buy Up position on epoch, then buy Down position on same epoch — both succeed
- [ ] 8.5: Manual test: sell one direction, verify other direction unaffected
- [ ] 8.6: Verify trading history shows both positions as separate entries

## DO NOT (Anti-patterns)

- **DO NOT** add on-chain enforcement of `allow_hedging` flag — enforcement is client-side only (design decision)
- **DO NOT** change the `UserPosition` struct — no field changes needed, same `INIT_SPACE`
- **DO NOT** modify `utils/caps.rs` — cap checks are per-position, which is correct for hedging
- **DO NOT** modify `admin_force_close_epoch.rs` — it does not reference position PDAs
- **DO NOT** use Jest/Vitest/Mocha for on-chain tests — use plain tsx scripts with `main()` (match existing pattern)
- **DO NOT** derive GlobalConfig PDA dynamically in frontend — use `GLOBAL_CONFIG_PDA` constant
- **DO NOT** change the `Direction` enum — its Borsh serialization order (Up=0, Down=1) is the direction byte

## REUSE THESE (Existing Code)

| What | Import From | Purpose |
|------|-------------|---------|
| `derivePositionPda()` | `web/src/lib/pda.ts` | Core function to modify — add direction param |
| `toAnchorDirection()` | `web/src/lib/transactions/buy.ts` | Direction enum converter — reuse in sell.ts and claim.ts |
| `useProgram()` | `web/src/hooks/use-program.ts` | Anchor program instance |
| `POOL_PDAS`, `GLOBAL_CONFIG_PDA` | `web/src/lib/constants.ts` | Pre-derived PDA constants |
| `parseDirection()` | `web/src/hooks/use-user-position.ts` | Parse Anchor direction enum to string |
| `buildBuyPositionInstruction` | `web/src/lib/transactions/buy.ts` | Reference pattern for direction handling |
| `admin-force-close-epoch.test.ts` | `anchor/tests/` | Test pattern reference |

## Dev Notes

### PDA Seed Change Detail

**Before:** `["position", epoch.key(), user.key()]` — 1 position per (epoch, user)
**After:** `["position", epoch.key(), user.key(), direction_byte]` — 1 position per (epoch, user, direction)

Direction byte is derived from Borsh enum order:
- `Direction::Up` = `0u8`
- `Direction::Down` = `1u8`

Rust usage: `&[direction as u8]`
TypeScript usage: `Buffer.from([direction === 'up' ? 0 : 1])`

### Anchor `#[instruction]` Macro

The `#[instruction]` attribute extracts instruction args positionally for use in account constraints (seeds). Only args used in seeds/constraints need to be listed. The order MUST match the handler signature.

**buy_position:** `#[instruction(user: Pubkey, direction: Direction)]` — both used in PDA seeds
**sell_position:** `#[instruction(user: Pubkey, direction: Direction, shares: u64)]` — user + direction in PDA seeds (shares not used in constraints but must be listed because it comes after direction positionally — actually Anchor only requires listing up to the last constraint-used arg, so `#[instruction(user: Pubkey, direction: Direction)]` suffices even though handler takes `shares` after)
**claim_payout/claim_refund:** `#[instruction(user: Pubkey, direction: Direction)]` — both used in PDA seeds

### Breaking Change

This changes PDA seeds. Existing testnet position accounts will be orphaned (old seeds won't match new program). Mitigation: force-close active epochs before deploying so users can claim first.

### `sell_position.rs` Handler Direction Param

The sell handler currently reads direction from the position account itself (`position.direction` at line 193). Adding `direction` as an instruction argument is needed for PDA derivation (seeds must be known before handler runs). The defense-in-depth assertion `require!(position.direction == direction)` ensures consistency between the passed direction and the stored direction.

### Files Modified (19 total)

**On-Chain (5):**
- `anchor/programs/fogopulse/src/instructions/buy_position.rs`
- `anchor/programs/fogopulse/src/instructions/sell_position.rs`
- `anchor/programs/fogopulse/src/instructions/claim_payout.rs`
- `anchor/programs/fogopulse/src/instructions/claim_refund.rs`
- `anchor/programs/fogopulse/src/state/position.rs`

**Frontend Transaction Builders (3):**
- `web/src/lib/pda.ts`
- `web/src/lib/transactions/buy.ts`
- `web/src/lib/transactions/sell.ts`
- `web/src/lib/transactions/claim.ts`

**Frontend Hooks (6):**
- `web/src/hooks/use-user-position.ts`
- `web/src/hooks/use-sell-position.ts`
- `web/src/hooks/use-claim-position.ts`
- `web/src/hooks/use-user-positions-batch.ts`
- `web/src/hooks/use-trading-history.ts`
- `web/src/hooks/use-multi-asset-positions.ts`

**Frontend UI Components (4):**
- `web/src/components/trading/your-position.tsx`
- `web/src/components/trading/claim-button.tsx`
- `web/src/components/trading/trading-history-row.tsx`
- `web/src/components/trading/settlement-history-list.tsx`

**Other (2):**
- `web/src/lib/fogopulse.json` (regenerated IDL)
- `anchor/scripts/claim-payout.ts` + `claim-refund.ts`

### References

- [Source: anchor/programs/fogopulse/src/instructions/buy_position.rs] — Primary file with PDA seed change
- [Source: anchor/programs/fogopulse/src/instructions/sell_position.rs] — Sell instruction
- [Source: anchor/programs/fogopulse/src/instructions/claim_payout.rs] — Claim payout instruction
- [Source: anchor/programs/fogopulse/src/instructions/claim_refund.rs] — Claim refund instruction
- [Source: anchor/programs/fogopulse/src/state/position.rs] — UserPosition struct
- [Source: anchor/programs/fogopulse/src/state/config.rs] — GlobalConfig with allow_hedging flag
- [Source: web/src/lib/pda.ts] — Frontend PDA derivation
- [Source: web/src/lib/transactions/buy.ts] — Buy transaction builder pattern
- [Source: web/src/lib/transactions/sell.ts] — Sell transaction builder
- [Source: web/src/lib/transactions/claim.ts] — Claim transaction builders
- [Source: web/src/hooks/use-user-position.ts] — Position data hook

## Change Log

- 2026-03-19: Implemented direction-based position PDAs for hedging support (Tasks 1-7)
- 2026-03-19: Code review fixes — your-position.tsx renders both hedged positions; settlement-history-list.tsx shows separate rows per hedged direction; claim-refund.ts pool isWritable corrected; sell_position doc comments fixed; use-claim-position.ts positionsBatch invalidation added

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Completion Notes List

- Updated 4 on-chain instructions (buy_position, sell_position, claim_payout, claim_refund) to include direction byte in PDA seeds
- Updated `lib.rs` instruction dispatchers with new direction parameters
- Added defense-in-depth direction assertions in sell_position, claim_payout, claim_refund
- Removed old hedging check block in buy_position (lines 207-219) — no longer needed with direction-based PDAs
- Updated frontend `derivePositionPda` in `pda.ts` to accept direction parameter
- Updated all 3 transaction builders (buy, sell, claim) to pass direction to PDA derivation and instruction args
- Updated 6 hooks (use-user-position, use-sell-position, use-claim-position, use-user-positions-batch, use-trading-history, use-multi-asset-positions)
- Updated 4 UI components (your-position, claim-button, trading-history-row, settlement-history-list)
- Updated settlement-status-panel to render ClaimButton for both directions
- Updated use-trade-preview to pass selected direction to useUserPosition
- Updated 2 anchor scripts (claim-payout.ts, claim-refund.ts) with direction-based PDA derivation
- Regenerated IDL and copied to frontend
- Updated project-context.md PDA seeds documentation
- Anchor build: compiles cleanly (warnings only — pre-existing, not from this change)
- Frontend build: TypeScript compilation passes with zero errors
- Task 8 (testnet deploy) remains for manual execution

### File List

**On-Chain (6 modified):**
- `anchor/programs/fogopulse/src/instructions/buy_position.rs` — PDA seeds + removed direction check block
- `anchor/programs/fogopulse/src/instructions/sell_position.rs` — PDA seeds + direction param + defense assertion
- `anchor/programs/fogopulse/src/instructions/claim_payout.rs` — PDA seeds + direction param + defense assertion
- `anchor/programs/fogopulse/src/instructions/claim_refund.rs` — PDA seeds + direction param + defense assertion + Direction import
- `anchor/programs/fogopulse/src/state/position.rs` — Doc comment update
- `anchor/programs/fogopulse/src/lib.rs` — Updated handler dispatchers with direction param

**Frontend Core (4 modified):**
- `web/src/lib/pda.ts` — Added direction param to derivePositionPda
- `web/src/lib/transactions/buy.ts` — Pass direction to PDA
- `web/src/lib/transactions/sell.ts` — Added direction param, toAnchorDirection helper
- `web/src/lib/transactions/claim.ts` — Added direction param, toAnchorDirection helper

**Frontend Hooks (7 modified):**
- `web/src/hooks/use-user-position.ts` — Added direction param with default 'up'
- `web/src/hooks/use-sell-position.ts` — Added direction to SellPositionParams
- `web/src/hooks/use-claim-position.ts` — Added direction to ClaimPositionParams
- `web/src/hooks/use-user-positions-batch.ts` — Derives both direction PDAs, exports positionKey helper
- `web/src/hooks/use-trading-history.ts` — Fetches both directions per epoch
- `web/src/hooks/use-multi-asset-positions.ts` — Adapted to composite key lookup
- `web/src/hooks/use-trade-preview.ts` — Passes selected direction to useUserPosition

**Frontend UI (4 modified):**
- `web/src/components/trading/your-position.tsx` — Fetches both Up and Down positions
- `web/src/components/trading/claim-button.tsx` — Added direction prop
- `web/src/components/trading/trading-history-row.tsx` — Passes direction to claim mutation
- `web/src/components/trading/settlement-history-list.tsx` — Uses composite key lookup for both directions
- `web/src/components/trading/settlement-status-panel.tsx` — Renders ClaimButton for both directions

**Other (4 modified):**
- `web/src/lib/fogopulse.json` — Regenerated IDL
- `anchor/scripts/claim-payout.ts` — Direction-based PDA + instruction data
- `anchor/scripts/claim-refund.ts` — Direction-based PDA + instruction data
- `_bmad-output/project-context.md` — Updated PDA seeds documentation
