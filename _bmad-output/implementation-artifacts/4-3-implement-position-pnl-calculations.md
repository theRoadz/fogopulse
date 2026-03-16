# Story 4.3: Implement Position PnL Calculations

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want to see my unrealized profit/loss,
so that I can make informed decisions about holding or exiting.

## Acceptance Criteria

1. **Given** an open position in an active epoch, **When** I view the position card, **Then** unrealized PnL is displayed as `current_value - entry_amount` in USDC.
2. **Given** an open position, **When** I view the position card, **Then** PnL is shown as both absolute USDC amount (e.g., "+0.42 USDC") and percentage (e.g., "+8.4%").
3. **Given** a position with positive PnL, **When** I view the position card, **Then** the PnL text is displayed in `text-green-500`.
4. **Given** a position with negative PnL, **When** I view the position card, **Then** the PnL text is displayed in `text-red-500`.
5. **Given** a position with zero PnL, **When** I view the position card, **Then** the PnL text is displayed in `text-muted-foreground`.
6. **Given** pool reserves change (via TanStack Query polling), **When** the pool data updates, **Then** PnL recalculates automatically reflecting the new current value.
7. **Given** the epoch transitions to Frozen or Settled state, **When** the position card renders, **Then** PnL continues to display based on the last known pool reserves (does not disappear).
8. **Given** a fully sold position (shares === 0n), **When** the position card renders, **Then** no PnL is displayed (position shows "Sold" badge instead).
9. **Given** FR18 (view unrealized PnL for open positions), **When** all acceptance criteria are met, **Then** the functional requirement is satisfied.

## Tasks / Subtasks

- [x] Task 1: Create `calculatePositionPnL` utility function (AC: #1, #2)
  - [x] 1.1: Add function to `web/src/lib/trade-preview.ts` (co-locate with existing CPMM calculations)
  - [x] 1.2: Signature: `calculatePositionPnL(shares: bigint, entryAmount: bigint, direction: 'up' | 'down', yesReserves: bigint, noReserves: bigint): { currentValue: bigint; pnlAmount: bigint; pnlPercent: number }`
  - [x] 1.3: Current value formula (inverse CPMM, EXCLUDING sell fees — PnL shows mark-to-market, not after-fee exit value): `currentValue = (shares * sameReserves) / oppositeReserves`
  - [x] 1.4: If `oppositeReserves === 0n` → return `{ currentValue: 0n, pnlAmount: -entryAmount, pnlPercent: -100 }` (no liquidity edge case)
  - [x] 1.5: If `shares === 0n` → return `{ currentValue: 0n, pnlAmount: 0n, pnlPercent: 0 }` (sold position)
  - [x] 1.6: `pnlAmount = currentValue - entryAmount`
  - [x] 1.7: `pnlPercent = Number(pnlAmount) / Number(entryAmount) * 100` (handle entryAmount === 0n edge case → 0%). NOTE: `Number(bigint)` conversion is safe — USDC amounts will never approach `Number.MAX_SAFE_INTEGER`
  - [x] 1.8: Use `getReservesForDirection()` helper already in `trade-preview.ts` for same/opposite mapping

- [x] Task 2: Create `PnLDisplay` component (AC: #1-#5, #8)
  - [x] 2.1: Create `web/src/components/trading/pnl-display.tsx` — MUST include `'use client'` directive at top (Next.js App Router requirement, all components in this project use it)
  - [x] 2.2: Props: `{ shares: bigint; entryAmount: bigint; direction: 'up' | 'down'; yesReserves: bigint; noReserves: bigint; className?: string }`
  - [x] 2.3: Call `calculatePositionPnL()` with props
  - [x] 2.4: Render PnL as: `{sign}{formatUsdcAmount(absPnl)} USDC ({sign}{pnlPercent.toFixed(1)}%)`. CRITICAL: BigInt has NO `Math.abs()` — compute absolute value as `const absPnl = pnlAmount < 0n ? -pnlAmount : pnlAmount`. Prefix sign: `const sign = pnlAmount > 0n ? '+' : pnlAmount < 0n ? '-' : ''`
  - [x] 2.5: Color: `text-green-500` if positive, `text-red-500` if negative, `text-muted-foreground` if zero
  - [x] 2.6: Render nothing if `shares === 0n` (fully sold)
  - [x] 2.7: Compact text size: `text-sm` to fit within position card grid

- [x] Task 3: Integrate PnL into `YourPosition` component (AC: #1, #6, #7)
  - [x] 3.1: Import `PnLDisplay` into `your-position.tsx`
  - [x] 3.2: Add PnL display row between position details grid and action buttons (inside `<CardContent>`, after the `grid grid-cols-3` div, before the `pt-1` action div)
  - [x] 3.3: Pass position and pool data: `shares={position.shares} entryAmount={position.amount} direction={direction} yesReserves={pool.yesReserves} noReserves={pool.noReserves}`
  - [x] 3.4: Only render PnL when `pool` data is available AND `position.shares > 0n`
  - [x] 3.5: PnL updates automatically when pool data refreshes via TanStack Query (no additional subscription needed — `usePool(asset)` already polls)
  - [x] 3.6: AC #7 (Frozen/Settled state): NO special logic needed — pool reserves persist across epoch state transitions, `usePool(asset)` always returns current reserves regardless of epoch state. PnL renders automatically.

- [x] Task 4: Write unit tests for `calculatePositionPnL` (AC: #1, #2)
  - [x] 4.1: Add tests to `web/src/lib/trade-preview.test.ts` (co-located with existing CPMM tests)
  - [x] 4.2: Test: balanced pool (50/50 reserves) — PnL should be ~0 for just-entered position
  - [x] 4.3: Test: favorable pool shift — PnL positive (e.g., UP position, noReserves decreased)
  - [x] 4.4: Test: unfavorable pool shift — PnL negative
  - [x] 4.5: Test: zero shares → returns zeros
  - [x] 4.6: Test: zero oppositeReserves → returns -100% PnL
  - [x] 4.7: Test: zero entryAmount → returns 0% (edge case)

- [x] Task 5: Write component tests for `PnLDisplay` (AC: #3-#5, #8)
  - [x] 5.1: Create `web/src/components/trading/pnl-display.test.tsx`
  - [x] 5.2: Test: positive PnL renders green text with "+" prefix
  - [x] 5.3: Test: negative PnL renders red text with "-" prefix
  - [x] 5.4: Test: zero PnL renders muted text
  - [x] 5.5: Test: renders nothing when shares is 0n
  - [x] 5.6: Test: formats USDC amount correctly (e.g., 420000 lamports → "0.42")

- [x] Task 6: Add PnL integration test to `YourPosition` tests (AC: #1, #6)
  - [x] 6.1: Add test to `web/src/components/trading/your-position.test.tsx`
  - [x] 6.2: Test: PnL row renders within position card when position and pool data are available
  - [x] 6.3: Test: PnL row does NOT render when position is fully sold (shares === 0n)

## Dev Notes

### Architecture Patterns & Constraints

**This is a FRONTEND-ONLY story — no on-chain changes required.**

The PnL calculation is a client-side derivation from existing on-chain data (position shares/amount + pool reserves). No new instructions, accounts, or deployment needed.

**PnL Calculation — Mark-to-Market (NOT after-fee exit value):**

The unrealized PnL shows the theoretical value of the position at current market prices, WITHOUT deducting the 1.8% sell fee. This is the standard financial convention for unrealized PnL. The `estimateSellReturn()` function in `your-position.tsx` already shows the after-fee exit value in the sell confirmation dialog — PnL and exit value serve different purposes.

```typescript
// PnL calculation (mark-to-market, NO fees)
currentValue = (shares * sameReserves) / oppositeReserves
pnlAmount = currentValue - entryAmount
pnlPercent = (pnlAmount / entryAmount) * 100

// Existing sell preview (after fees) — DIFFERENT purpose
grossReturn = (shares * sameReserves) / oppositeReserves
netReturn = grossReturn - (grossReturn * 180 / 10000)  // after 1.8% fee
```

**CPMM Inverse Formula Context:**

The `estimateSellReturn()` function already exists in `your-position.tsx` and computes `(shares * sameReserves) / oppositeReserves`. The PnL calculation uses the SAME formula but WITHOUT fee deduction. Do NOT duplicate the reserve-mapping logic — use `getReservesForDirection()` from `trade-preview.ts`.

**Where same/opposite determined by direction:**
- `Direction::Up` → same = `yesReserves`, opposite = `noReserves`
- `Direction::Down` → same = `noReserves`, opposite = `yesReserves`

**BigInt Arithmetic Required:**

All position data (`shares`, `amount`, `entryPrice`) and pool reserves (`yesReserves`, `noReserves`) are `bigint`. The PnL calculation MUST use BigInt arithmetic. Only convert to `Number` for the percentage calculation and display formatting. Reference `calculatePotentialPayout()` in `trade-preview.ts` for the BigInt-to-display conversion pattern.

**BigInt Gotcha — No `Math.abs()` for BigInt:**

`Math.abs()` throws on BigInt. For absolute value: `pnlAmount < 0n ? -pnlAmount : pnlAmount`. Similarly, BigInt has no `.toFixed()` — always convert to Number first via `formatUsdcAmount()`.

**Frozen/Settled Epoch — Pool Reserves Persist:**

Pool reserves (`yesReserves`, `noReserves`) do NOT disappear when an epoch freezes or settles. They are pool-level state, not epoch-level. `usePool(asset)` always returns current reserves regardless of epoch state. No special "cache last known reserves" logic is needed for AC #7.

**Performance — `useMemo` for PnL calculation:**

Wrap the PnL calculation in `PnLDisplay` with `useMemo` keyed on `[shares, entryAmount, direction, yesReserves, noReserves]`. Pool data polls frequently and this prevents unnecessary recalculations when other props/state change. Matches the `useMemo` pattern in `useClaimableAmount`.

**Component Placement in YourPosition:**

```
YourPosition Card
  ├── Direction indicator (▲ UP / ▼ DOWN)
  ├── Position details grid (Entry, Shares, Avg Price)
  ├── PnLDisplay          ← NEW: Unrealized PnL row
  └── Action buttons (Sell / Claim / Badge)
```

The PnL row goes between the details grid and the action buttons. It should be a single line: `PnL: +0.42 USDC (+8.4%)` with appropriate color.

**Real-Time Updates — Already Handled:**

`usePool(asset)` in `your-position.tsx` already polls for pool data via TanStack Query. When reserves change, the component re-renders, and the PnL display recalculates automatically. No additional WebSocket subscription or query setup needed.

### Project Structure Notes

- New file: `web/src/components/trading/pnl-display.tsx` — presentational component for PnL display
- New file: `web/src/components/trading/pnl-display.test.tsx` — component tests
- Modified: `web/src/lib/trade-preview.ts` — add `calculatePositionPnL` function
- Modified: `web/src/lib/trade-preview.test.ts` — add PnL calculation tests
- Modified: `web/src/components/trading/your-position.tsx` — integrate PnLDisplay component

### Existing Code to Reuse (DO NOT DUPLICATE)

**Hooks (already implemented — no new hooks needed):**
- `usePool(asset)` from `hooks/use-pool.ts` — provides `yesReserves`, `noReserves` (already used in `your-position.tsx`)
- `useUserPosition(epochPda)` from `hooks/use-user-position.ts` — provides `shares`, `amount`, `direction` (already used in `your-position.tsx`)
- `useEpoch(asset)` from `hooks/use-epoch.ts` — provides epoch state (already used in `your-position.tsx`)

**Utility Functions (already implemented):**
- `getReservesForDirection(direction, yesReserves, noReserves)` from `lib/trade-preview.ts` — maps direction to same/opposite reserves
- `formatUsdcAmount(lamports)` from `hooks/use-claimable-amount.ts` — formats bigint USDC lamports to display string (e.g., `420000n` → `"0.42"`)
- `estimateSellReturn(shares, direction, yesReserves, noReserves)` in `your-position.tsx` — DIFFERENT purpose (after-fee exit value for sell dialog), do NOT reuse for PnL

**UI Components (from shadcn/ui):**
- No new shadcn components needed — PnLDisplay is a simple text display

**Styling Patterns:**
- Direction colors: `text-green-500` for UP/positive, `text-red-500` for DOWN/negative (from `your-position.tsx` and `direction-buttons.tsx`)
- Muted text: `text-muted-foreground` (shadcn convention)
- Compact sizing: `text-sm` (matches position details grid)

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 4, Story 4.3]
- [Source: _bmad-output/planning-artifacts/prd.md - FR18 (view unrealized PnL for open positions)]
- [Source: _bmad-output/planning-artifacts/architecture.md - CPMM formula, UserPosition account, TanStack Query patterns]
- [Source: _bmad-output/project-context.md - Naming conventions, component patterns, BigInt arithmetic requirements]
- [Source: web/src/components/trading/your-position.tsx - Integration target, estimateSellReturn for CPMM reference]
- [Source: web/src/lib/trade-preview.ts - Existing CPMM calculation functions, getReservesForDirection helper]
- [Source: web/src/hooks/use-claimable-amount.ts - formatUsdcAmount utility]
- [Source: web/src/hooks/use-pool.ts - Pool data with yesReserves/noReserves]
- [Source: web/src/hooks/use-user-position.ts - Position data with shares/amount/direction]
- [Source: web/src/lib/constants.ts - TRADING_FEE_BPS (180), USDC_DECIMALS (6)]
- [Source: _bmad-output/implementation-artifacts/4-2-create-active-positions-panel.md - Previous story intelligence]
- [Source: _bmad-output/implementation-artifacts/4-1-implement-sell-position-instruction.md - CPMM inverse formula, sell mechanics]

### Previous Story Intelligence (Story 4.2)

- Story 4.2 created `YourPosition` component in `web/src/components/trading/your-position.tsx` — this is the integration target for PnL display
- `estimateSellReturn()` is a LOCAL function inside `your-position.tsx` (not exported) — it computes inverse CPMM with fees. PnL needs the same formula WITHOUT fees, so create a separate utility in `trade-preview.ts`
- `usePool(asset)` is already imported and used in `your-position.tsx` — pool reserves are available for PnL calculation, no additional hook setup
- Position card uses `formatUsdcAmount()` from `use-claimable-amount.ts` — reuse the same formatter for PnL display
- 15 unit tests exist for `YourPosition` — adding PnL display should not break them (PnL is additive, not replacing existing content)
- Pre-existing test failures (5 suites, 18 tests) exist on master — don't attempt to fix unrelated test failures
- `parseDirection` exported from `use-user-position.ts` — position.direction is already `'up' | 'down'` string, no parsing needed in PnL component
- shadcn Dialog used for sell confirmation — no new shadcn components needed for PnL

### Git Intelligence

Recent commits:
- `e325889` feat(Story 4.2): Implement active positions panel with code review fixes
- `1e5a24c` feat(Story 4.1): Implement sell_position instruction with code review fixes
- `393638a` feat(Story 7.2): Implement community feedback tracker with code review fixes
- `d63aec6` feat(Story 3.9): Implement settlement history display with code review fixes
- `ff4e1ca` docs: Add story document sync rule to project context

Patterns established:
- Commit prefix: `feat(Story X.Y):` for story implementations
- Code review fixes included in same commit
- Tests co-located with components (`*.test.tsx` alongside `*.tsx`)
- All UI components use shadcn/ui + Tailwind CSS
- React 19.2.1 + Next.js 16.0.10 + TanStack Query 5.89.0

### Latest Tech Notes

- TanStack Query 5.89.0: `useMutation` returns `{ isPending }` (NOT `isLoading` — renamed in v5). Pool data polling via `useQuery` with `refetchInterval`.
- React 19.2.1: No special considerations for this story — standard functional component with props
- `formatUsdcAmount` divides by `10^6` — ensure BigInt values are passed, not Number
- `Number(bigint)` conversion is safe for PnL percentage calculation as long as values are within `Number.MAX_SAFE_INTEGER` (2^53 - 1) — USDC amounts in lamports will never approach this limit
- Jest 30.1.3 + `@testing-library/react` 16.3.2 for component tests

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No blocking issues encountered during implementation.

### Completion Notes List

- Implemented `calculatePositionPnL()` in `trade-preview.ts` using inverse CPMM formula with `getReservesForDirection()` helper. Returns mark-to-market PnL (no fees), matching financial convention.
- Created `PnLDisplay` component with `useMemo` optimization, proper BigInt absolute value handling, color-coded display (green/red/muted), and null render for sold positions.
- Integrated `PnLDisplay` into `YourPosition` component between position details grid and action buttons. PnL auto-updates via TanStack Query pool polling — no additional subscription needed.
- All 7 unit tests for `calculatePositionPnL` pass (balanced pool, favorable/unfavorable shifts, zero shares, zero reserves, zero entryAmount, DOWN direction).
- All 6 component tests for `PnLDisplay` pass (positive/negative/zero PnL colors, sold position null render, USDC formatting, percentage display).
- All 3 integration tests for `YourPosition` PnL pass (renders with pool data, hidden for sold positions, hidden without pool data).
- Full regression suite: 603 passed, 12 failed (all 12 failures are pre-existing on master — no new regressions).

### Change Log

- 2026-03-16: Implemented Story 4.3 — Position PnL Calculations. Added `calculatePositionPnL` utility, `PnLDisplay` component, integrated into `YourPosition` card. 16 new tests added (7 unit + 6 component + 3 integration).
- 2026-03-16: Code review fixes — Fixed double-negative sign on PnL percentage display (`Math.abs` on `pnlPercent`), fixed trailing whitespace in className, added `sprint-status.yaml` to File List, strengthened negative PnL test to catch formatting bugs.

### File List

- `web/src/lib/trade-preview.ts` — Modified: Added `calculatePositionPnL()` function and `PositionPnL` interface
- `web/src/lib/trade-preview.test.ts` — Modified: Added 7 unit tests for `calculatePositionPnL`
- `web/src/components/trading/pnl-display.tsx` — New: PnLDisplay presentational component
- `web/src/components/trading/pnl-display.test.tsx` — New: 6 component tests for PnLDisplay
- `web/src/components/trading/your-position.tsx` — Modified: Integrated PnLDisplay between details grid and action buttons
- `web/src/components/trading/your-position.test.tsx` — Modified: Added 3 PnL integration tests and PnLDisplay mock
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Modified: Updated story 4.3 development status
