# Story 4.6: Add Cap Warning Indicators

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want warnings when I'm approaching position limits,
So that I know before my trade might be rejected.

## Acceptance Criteria

1. **Given** the trade ticket with an entered amount **When** the amount approaches per-wallet cap **Then** a warning indicator appears (yellow/orange) explaining the per-wallet cap is being approached and showing remaining capacity

2. **Given** the trade ticket with an entered amount **When** the amount approaches per-side cap **Then** a warning indicator appears (yellow/orange) explaining the per-side cap is being approached and showing remaining capacity

3. **Given** the trade ticket with an entered amount **When** the per-wallet cap would be exceeded **Then** the trade button is disabled and an error message explains why the trade cannot proceed

4. **Given** the trade ticket with an entered amount **When** the per-side cap would be exceeded **Then** the trade button is disabled and an error message explains why the trade cannot proceed

5. **Given** a cap warning is displayed **When** the user views the warning **Then** the remaining capacity before hitting the cap is shown in USDC

6. **Given** both per-wallet and per-side caps are approached simultaneously **When** the user views warnings **Then** both warnings are displayed with the most restrictive cap highlighted

7. **Given** FR13 (view cap warnings) **Then** this story satisfies FR13 completely

## Tasks / Subtasks

- [x] Task 1: Create cap calculation utility functions (AC: #1, #2, #3, #4, #5)
  - [x] 1.1: Create `calculateWalletCapRemaining()` in `web/src/lib/cap-utils.ts` — mirrors on-chain `check_wallet_cap()` logic
  - [x] 1.2: Create `calculateSideCapRemaining()` in `web/src/lib/cap-utils.ts` — mirrors on-chain `check_side_cap()` logic with deviation-from-50% math
  - [x] 1.3: Create `getCapStatus()` that returns `{ walletCap: CapInfo, sideCap: CapInfo }` with remaining amounts and warning/error states
  - [x] 1.4: Write unit tests in `web/src/lib/cap-utils.test.ts` covering: normal range, warning threshold (>80%), exceeded, first-trade edge case, zero-pool edge case. Reference Rust test vectors in `anchor/programs/fogopulse/src/utils/caps.rs` (lines 92-166, 8 test cases) to ensure frontend parity with on-chain validation

- [x] Task 2: Update `useTradePreview` hook to compute real cap status (AC: #1, #2, #5)
  - [x] 2.1: Replace hardcoded `isNearCap = false` (line ~175 in `web/src/hooks/use-trade-preview.ts`) with real cap calculations using pool data and user's existing position
  - [x] 2.2: Add `capStatus` field to `TradePreviewData` interface (defined in `web/src/hooks/use-trade-preview.ts` lines 27-71, NOT in types/trade.ts) with wallet and side cap details; keep `isNearCap` as a computed boolean derived from `capStatus` for backward compatibility
  - [x] 2.3: Use the existing `useUserPosition` hook (`web/src/hooks/use-user-position.ts`) to fetch user's current epoch position amount for cumulative wallet cap check
  - [x] 2.4: Write unit tests for hook cap integration

- [x] Task 3: Create `CapWarningBanner` component (AC: #1, #2, #5, #6)
  - [x] 3.1: Create `web/src/components/trading/cap-warning-banner.tsx` — displays warning/error banners for cap status
  - [x] 3.2: Warning state (>80% of cap): yellow/amber banner with remaining capacity in USDC
  - [x] 3.3: Error state (exceeds cap): red banner with explanation of which cap is hit
  - [x] 3.4: When both caps triggered, show both with most restrictive highlighted
  - [x] 3.5: Write component tests in `web/src/components/trading/cap-warning-banner.test.tsx`

- [x] Task 4: Integrate cap warnings into TradeTicket component (AC: #1, #2, #3, #4, #6)
  - [x] 4.1: Add `CapWarningBanner` to trade ticket layout — insert between TradePreview (~line 251) and the action button (~line 254) in `web/src/components/trading/trade-ticket.tsx`
  - [x] 4.2: Disable confirm/trade button when any cap is exceeded
  - [x] 4.3: Add cap exceeded validation to trade button via `getTradeButtonState()` in `trade-ticket.tsx` (component-level, not store-level — store lacks pool/cap context)
  - [x] 4.4: Write integration tests for trade ticket with cap scenarios

- [x] Task 5: Update existing tests and ensure no regressions (AC: #1-#6)
  - [x] 5.1: Update existing trade-preview tests to account for new `capStatus` field on `TradePreviewData` (interface lives in `web/src/hooks/use-trade-preview.ts`, NOT `web/src/types/trade.ts`)
  - [x] 5.2: Ensure no regressions in existing trade ticket and trade execution tests

## Dev Notes

### Critical Cap Math (MUST match on-chain logic exactly)

**Per-Wallet Cap** (`anchor/programs/fogopulse/src/utils/caps.rs` - `check_wallet_cap()`):
- `max_allowed = pool_total * wallet_cap_bps / 10000`
- `pool_total = yes_reserves + no_reserves` (current pool state BEFORE trade)
- Check: `existing_position + new_net_amount <= max_allowed`
- Special case: First trade when `pool_total == 0` always passes
- Default: `PER_WALLET_CAP_BPS = 500` (5%)

**Per-Side Cap** (`anchor/programs/fogopulse/src/utils/caps.rs` - `check_side_cap()`):
- This is a DEVIATION from 50% balance check, NOT absolute percentage
- `balanced_side = pool_total / 2`
- `max_deviation = balanced_side * side_cap_bps / 10000`
- `max_allowed = balanced_side + max_deviation`
- Check: `target_side_after_trade <= max_allowed`
- With 30% cap on $1000 pool: max per side = $500 + ($500 * 30% = $150) = $650
- Default: `PER_SIDE_CAP_BPS = 3000` (30%)

**CRITICAL: Net amount vs Gross amount distinction:**
- UI trade ticket shows **gross** amounts (what user types)
- On-chain caps check against **net** amounts (after 1.8% fee deduction)
- Cap calculation in frontend MUST use net amount: `netAmount = grossAmount - fee`
- Fee formula: `fee = (grossAmount * 180n + 9999n) / 10000n` (ceiling division, matches on-chain)

**CRITICAL: Cap math uses integer truncation, NOT ceiling division:**
- Cap formulas use standard integer division: `pool_total * cap_bps / 10000` (truncates)
- In JS BigInt: `poolTotal * BigInt(capBps) / 10000n` — this naturally truncates, matching Rust
- Do NOT confuse with fee calculation which uses ceiling division — caps are truncating division

**Warning threshold:** Show yellow/amber warning when trade uses >80% of remaining cap capacity. Show red/error when cap would be exceeded.

### Existing Code Integration Points

**Pool data already available:**
- `usePool()` hook returns `pool.walletCapBps` and `pool.sideCapBps`
- Pool reserves (`pool.yesReserves`, `pool.noReserves`) available for total calculation
- Pool data refreshes via WebSocket subscription + 2s polling fallback

**Trade preview already has placeholder:**
- `web/src/hooks/use-trade-preview.ts` line ~175: `const isNearCap = false` — replace this
- `TradePreviewData` interface is defined in `web/src/hooks/use-trade-preview.ts` (lines 27-71), NOT in `web/src/types/trade.ts`
- Already has `isNearCap: boolean` field (line 70) — extend to full `capStatus` and keep `isNearCap` as computed shorthand

**User position for wallet cap — hook already exists:**
- `web/src/hooks/use-user-position.ts` exports `useUserPosition()` and `UserPositionData`
- Returns user's position amount and shares for a given epoch
- Use this directly — do NOT re-fetch or create a new hook

**Constants already defined:**
- `web/src/lib/constants.ts`: `PER_WALLET_CAP_BPS = 500`, `PER_SIDE_CAP_BPS = 3000`

**On-chain buy instruction cap check** (`anchor/programs/fogopulse/src/instructions/buy_position.rs` lines 260-276):
- Caps checked using NET amount (post-fee)
- Pool totals are CURRENT state (pre-trade)
- Both `check_wallet_cap()` and `check_side_cap()` called before trade execution

### UI/UX Requirements

**From UX specification:**
- Cap warnings are part of form validation flow
- Real-time validation as user enters/changes amount
- "Amount exceeds cap" error with clear feedback
- Prevention strategy: input validation prevents submission

**Design tokens:**
- Warning (amber): `#f59e0b` / Tailwind `text-amber-500`, `bg-amber-500/10`, `border-amber-500/20`
- Error (red): `#ef4444` / Tailwind `text-red-500`, `bg-red-500/10`, `border-red-500/20`
- Use shadcn/ui `Alert` component with `variant="warning"` or `variant="destructive"`

**Banner content format:**
- Warning: "Approaching [wallet/side] cap — [X.XX] USDC remaining"
- Error: "Trade exceeds [wallet/side] cap. Maximum additional: [X.XX] USDC"
- When both: Stack both banners, highlight the more restrictive one

### Project Structure Notes

- All new files follow `kebab-case` naming convention
- Component tests co-located: `cap-warning-banner.test.tsx` next to `cap-warning-banner.tsx`
- Utility tests co-located: `cap-utils.test.ts` next to `cap-utils.ts`
- `TradePreviewData` interface lives in `web/src/hooks/use-trade-preview.ts` — modify it there, do NOT duplicate in types/trade.ts
- Use BigInt for all USDC calculations (matches existing pattern in `trade-preview.ts`)

### References

- [Source: anchor/programs/fogopulse/src/utils/caps.rs] — On-chain cap validation (check_wallet_cap, check_side_cap)
- [Source: anchor/programs/fogopulse/src/instructions/buy_position.rs#L260-276] — Cap check integration in buy instruction
- [Source: anchor/programs/fogopulse/src/state/config.rs] — GlobalConfig with per_wallet_cap_bps, per_side_cap_bps
- [Source: anchor/programs/fogopulse/src/state/pool.rs] — Pool with wallet_cap_bps, side_cap_bps
- [Source: web/src/hooks/use-trade-preview.ts#L175] — Hardcoded isNearCap=false placeholder
- [Source: web/src/hooks/use-pool.ts] — Pool data fetching with cap BPS fields
- [Source: web/src/lib/constants.ts] — PER_WALLET_CAP_BPS=500, PER_SIDE_CAP_BPS=3000
- [Source: web/src/lib/trade-preview.ts] — Trade preview calculations with BigInt math
- [Source: web/src/components/trading/trade-ticket.tsx] — Trade ticket component to integrate with
- [Source: web/src/stores/trade-store.ts] — Trade state management and validation
- [Source: web/src/types/trade.ts] — TradeDirection, TradeTicketState, MIN_TRADE_AMOUNT (NOT where TradePreviewData lives)
- [Source: web/src/hooks/use-user-position.ts] — Existing useUserPosition hook for fetching user's epoch position
- [Source: _bmad-output/planning-artifacts/prd.md#FR13] — Cap warnings functional requirement
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — Form validation and cap warning UX
- [Source: _bmad-output/planning-artifacts/architecture.md] — Cap enforcement architecture

### Previous Story Intelligence (Story 4.5)

**Patterns established:**
- Frontend-only stories reuse existing hooks and on-chain instructions
- Calculation functions extracted to `web/src/lib/trade-preview.ts` as pure functions with BigInt
- Component tests use Vitest + React Testing Library (co-located)
- State coordination via `ui-store.ts` for cross-component communication
- Code review fixes: Always add `useMemo` for expensive calculations, use `formatUsdcAmount()` for display

**Key learnings from 4.5:**
- CPMM formula must use ceiling division for fees: `(gross * 180n + 9999n) / 10000n`
- Edge case handling: `oppositeReserves === 0n` needs special refund path
- Format shares with `formatUsdcAmount()` for consistent display
- Remove unused props to keep interfaces clean

### Git Intelligence

**Recent commit patterns:**
- Commit format: `feat(Story X.Y): Description with code review fixes`
- Epic 4 stories have been frontend-focused since Story 4.2
- All stories include comprehensive test coverage
- Code review fixes applied in same commit

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Pre-existing test failures (5 suites, 12 tests) confirmed identical before and after changes — zero regressions
- Task 4.3 note: Cap exceeded validation handled at component level via `getTradeButtonState()` rather than in `trade-store.ts`, as the store lacks pool/cap data context. This is architecturally correct — the store handles balance validation, the component handles cap validation.
- Bugfix: `your-position.tsx` had `useMemo` (sellReturn) after early returns, violating Rules of Hooks. Moved `useMemo` before early returns with null-safe access on `position`.

### Completion Notes List

- **Task 1**: Created `web/src/lib/cap-utils.ts` with `calculateWalletCapRemaining()`, `calculateSideCapRemaining()`, `calculateNetAmountLamports()`, and `getCapStatus()`. All use BigInt math with truncating division matching on-chain Rust logic. 25 unit tests pass covering all Rust test vectors + warning thresholds + edge cases.
- **Task 2**: Updated `useTradePreview` hook — replaced hardcoded `isNearCap = false` with real cap calculations. Added `capStatus: CapStatus` to `TradePreviewData` interface. Integrated `useUserPosition` hook for cumulative wallet cap checking. `isNearCap` kept as computed boolean derived from `capStatus.hasWarning` for backward compatibility.
- **Task 3**: Created `CapWarningBanner` component using shadcn/ui Alert with `warning` and `destructive` variants. Displays per-wallet and per-side warnings with remaining USDC capacity. Most restrictive cap highlighted with ring. 8 component tests pass.
- **Task 4**: Integrated `CapWarningBanner` into TradeTicket between TradePreview and action button. Added `capExceeded` state to `getTradeButtonState()` — button shows "Cap Exceeded" text when any cap is exceeded. 17 existing trade-ticket tests continue to pass.
- **Task 5**: Updated `use-trade-preview.test.tsx` and `trade-preview.test.tsx` with `useUserPosition` mock and additional constants (`PER_WALLET_CAP_BPS`, `PER_SIDE_CAP_BPS`). Updated `trade-ticket.test.tsx` with `useTradePreview` and `CapWarningBanner` mocks. Full test suite: 675/687 pass (same 12 pre-existing failures).

### Change Log

- 2026-03-17: Implemented Story 4.6 — Cap warning indicators for trade ticket
- 2026-03-17: Code review fixes — H1: improved exceeded message, H3: clamped usedPercent to 100, H4: fixed amber vs yellow colors in Alert, M3: added cap exceeded tests, M1/M2: documented trading-layout.tsx in file list, H2: corrected Task 4.3 description

### File List

**New files:**
- `web/src/lib/cap-utils.ts` — Cap calculation utility functions (wallet cap, side cap, combined status)
- `web/src/lib/cap-utils.test.ts` — 25 unit tests for cap calculations
- `web/src/components/trading/cap-warning-banner.tsx` — Warning/error banner component for cap limits
- `web/src/components/trading/cap-warning-banner.test.tsx` — 8 component tests for cap warning banner

**Modified files:**
- `web/src/hooks/use-trade-preview.ts` — Added capStatus to TradePreviewData, replaced hardcoded isNearCap, integrated useUserPosition
- `web/src/hooks/use-trade-preview.test.tsx` — Added useUserPosition mock and cap-related constants
- `web/src/components/trading/trade-ticket.tsx` — Added CapWarningBanner, cap exceeded button disable, useTradePreview import
- `web/src/components/trading/trade-ticket.test.tsx` — Added useTradePreview and CapWarningBanner mocks
- `web/src/components/trading/trade-preview.test.tsx` — Added useUserPosition mock and cap-related constants
- `web/src/components/trading/your-position.tsx` — Moved useMemo before early returns to fix Rules of Hooks violation
- `web/src/components/trading/trading-layout.tsx` — Moved MultiAssetPositionsPanel into chart column (leftover from Story 4.4 layout adjustment)
- `web/src/components/ui/alert.tsx` — Fixed warning variant to use amber colors (was yellow, spec requires amber)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story status updated
- `_bmad-output/implementation-artifacts/4-6-add-cap-warning-indicators.md` — Story file updated
