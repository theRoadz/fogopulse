# Story 7.34: Add +/- Increment/Decrement Buttons to Trade Preset Amounts

Status: done
Created: 2026-03-26
Epic: 7 - Platform Polish & UX
Sprint: Current
Priority: Low — UX Enhancement

## Story

As a trader,
I want +/- buttons on each preset amount ($5, $10, $20),
so that I can quickly increment or decrement my trade amount by a preset value without manually typing.

## Problem

The trade ticket currently has four quick-amount buttons: $5, $10, $20, and Max. Each button **sets** the trade amount to that fixed value. There is no way to incrementally adjust the amount using these presets.

### Current UX Friction

1. User enters $15 manually, then wants to add $5 — must clear input and type $20, or mentally compute and type
2. User wants $25 — no preset exists, must type manually
3. Building up a position in increments (e.g., adding $10 at a time) requires manual math each time
4. The only quick option is absolute-set, not relative-adjust

### Current Flow

1. User clicks `$10` → amount input is set to `10.00`
2. User wants to increase to `$15` → must manually clear and type `15.00`
3. No way to use presets as increments

## Solution

Add `-` and `+` buttons flanking each preset ($5, $10, $20). The preset label click retains its current absolute-set behavior. Max button remains unchanged.

### New Layout

**Before:** `grid grid-cols-4` → `[$5] [$10] [$20] [Max]`

**After:**
```
Row 1 (grid-cols-3):  [-] $5 [+]   [-] $10 [+]   [-] $20 [+]
Row 2 (full-width):   [              Max              ]
```

### How It Works

| Action | Result |
|--------|--------|
| Click preset label (e.g. $10) | Sets amount to $10.00 (unchanged behavior) |
| Click `+` on $10 | Adds $10 to current amount (e.g. $5 → $15) |
| Click `-` on $10 | Subtracts $10 from current amount (e.g. $25 → $15) |
| Click Max | Sets to effective max (unchanged behavior) |

### Disable Logic

- **`-` disabled** when: `currentValue - presetValue < MIN_TRADE_AMOUNT` ($0.10) — covers empty/zero input
- **`+` disabled** when: `currentValue + presetValue > effectiveMax` (lesser of balance, maxTradeAmount, walletCapMax)
- **Preset label disabled**: unchanged (balance insufficient, exceeds caps)
- **All disabled**: wallet disconnected or balance 0

### Edge Cases

- Empty input + click `+`: treats current as 0, sets to preset value (equivalent to clicking preset)
- Empty input + click `-`: button is disabled (0 - anything < MIN_TRADE_AMOUNT)
- Floating-point safety: uses `Math.round(... * 100) / 100` to avoid drift

## Acceptance Criteria

1. **Given** a current amount of $15 and the user clicks `+$5`, **Then** the amount updates to $20.00
2. **Given** a current amount of $25 and the user clicks `-$10`, **Then** the amount updates to $15.00
3. **Given** an empty amount field and the user clicks `+$10`, **Then** the amount is set to $10.00
4. **Given** a current amount of $3 and the user clicks `-$5`, **Then** the `-` button is disabled (result < $0.10)
5. **Given** a current amount of $95 and effectiveMax is $100, the user sees `+$10` disabled but `+$5` enabled
6. **Given** the user clicks the `$10` label directly, **Then** the amount is set to $10.00 (unchanged behavior)
7. **Given** the Max button, **Then** it renders full-width with no +/- buttons (unchanged behavior)
8. **Given** wallet is disconnected, **Then** all buttons (including +/-) are disabled

## Architecture

### Component Changes

Only the `QuickAmountButtons` component changes structurally. The parent passes one new prop.

### New Prop: `currentAmount`

```typescript
interface QuickAmountButtonsProps {
  balance: number | null
  maxTradeAmount?: number
  walletCapMax?: number
  currentAmount: string       // NEW — current amount from trade store
  onSelect: (amount: string) => void
  disabled?: boolean
}
```

### Layout Structure

```tsx
<div className="space-y-2">
  {/* Row 1: Preset groups with +/- */}
  <div className="grid grid-cols-3 gap-2">
    {PRESET_AMOUNTS.map(({ label, value }) => (
      <div key={label} className="flex items-center gap-0.5">
        <Button size="icon" className="h-8 w-8">-</Button>
        <Button size="sm" className="flex-1">{label}</Button>
        <Button size="icon" className="h-8 w-8">+</Button>
      </div>
    ))}
  </div>
  {/* Row 2: Max button */}
  <Button className="w-full">Max</Button>
</div>
```

### Increment/Decrement Logic

```typescript
const currentValue = parseFloat(currentAmount) || 0

// Decrement
const decrementDisabled = isDisabled || currentValue - presetValue < MIN_TRADE_AMOUNT
const onDecrement = () => {
  const result = Math.round((currentValue - presetValue) * 100) / 100
  onSelect(result < MIN_TRADE_AMOUNT ? '' : result.toFixed(2))
}

// Increment
const incrementDisabled = isDisabled || currentValue + presetValue > effectiveMax
const onIncrement = () => {
  const result = Math.round((currentValue + presetValue) * 100) / 100
  const clamped = Math.min(result, effectiveMax)
  onSelect(clamped.toFixed(2))
}
```

## Critical Reference Files

| File | Purpose |
|------|---------|
| `web/src/components/trading/quick-amount-buttons.tsx` | Primary file — layout and +/- logic |
| `web/src/components/trading/trade-ticket.tsx` | Parent — pass `currentAmount` prop (1-line change) |
| `web/src/stores/trade-store.ts` | Trade store — no changes needed, `onSelect` callback handles updates |
| `web/src/types/trade.ts` | `MIN_TRADE_AMOUNT` constant import |
| `web/src/components/ui/button.tsx` | Button component — `size="icon"` variant reference |

## Tasks / Subtasks

### Task 1: Restructure QuickAmountButtons layout (AC: #6, #7)

- [x] 1.1: Add `currentAmount: string` prop to `QuickAmountButtonsProps` interface
- [x] 1.2: Import `MIN_TRADE_AMOUNT` from `@/types/trade`
- [x] 1.3: Split `QUICK_AMOUNTS` into `PRESET_AMOUNTS` array (no Max) and separate Max rendering
- [x] 1.4: Compute `effectiveMax` once at component top (move out of map loop)
- [x] 1.5: Change layout from `grid grid-cols-4` to `space-y-2` wrapper with `grid grid-cols-3` for presets and full-width Max below
- [x] 1.6: Each preset renders as `[-] [label] [+]` flex group — label click retains absolute-set behavior

### Task 2: Implement +/- increment/decrement logic (AC: #1, #2, #3, #4, #5)

- [x] 2.1: Parse `currentValue = parseFloat(currentAmount) || 0`
- [x] 2.2: `-` button: subtract preset value, disable when `currentValue - presetValue < MIN_TRADE_AMOUNT`
- [x] 2.3: `+` button: add preset value, clamp to effectiveMax, disable when `currentValue + presetValue > effectiveMax`
- [x] 2.4: Use `Math.round(... * 100) / 100` for floating-point safety

### Task 3: Wire up parent prop (AC: #8)

- [x] 3.1: In `trade-ticket.tsx`, pass `currentAmount={amount}` to `<QuickAmountButtons>`

### Task 4: Verify build and existing behavior

- [x] 4.1: Run type check — no new type errors (pre-existing errors in unrelated test files only)
- [x] 4.2: All 33 unit tests pass (updated test file with +/- coverage, walletCapMax coverage)
- [x] 4.3: Preset label click still sets absolute amount (verified via tests)
- [x] 4.4: All disabled states work correctly (verified via tests)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `web/src/components/trading/quick-amount-buttons.tsx` | Rewrite | New layout with +/- buttons, increment/decrement logic, new prop |
| `web/src/components/trading/trade-ticket.tsx` | Edit (1 line) | Add `currentAmount={amount}` prop to QuickAmountButtons |
| `web/src/components/trading/quick-amount-buttons.test.tsx` | Rewrite | Updated tests for new layout (10 buttons), added +/- test coverage |
| `web/src/components/ui/button-group.tsx` | New | shadcn ButtonGroup component (installed from registry) |

## Dev Agent Record

### Implementation Summary

**`web/src/components/ui/button-group.tsx`** — New file:
- Installed shadcn `ButtonGroup` component from registry (manual install due to CLI/pnpm conflict)
- Added `radix-ui` dependency via `pnpm add radix-ui`
- Provides `ButtonGroup`, `ButtonGroupText`, `ButtonGroupSeparator` exports
- Uses CVA variants for horizontal/vertical orientation
- Automatically handles border joining, border-radius removal on inner edges

**`web/src/components/trading/quick-amount-buttons.tsx`** — Full rewrite:
- Added `currentAmount: string` prop and `MIN_TRADE_AMOUNT` import
- Split constants: `PRESET_AMOUNTS` (3 items) separate from Max
- Layout: `space-y-2` wrapper → `grid grid-cols-3` for `<ButtonGroup>` wrapped `[-]$5[+]` groups → full-width Max below
- Each preset group wrapped in `<ButtonGroup>` for unified single-block appearance (no separate borders)
- Buttons use `variant="outline"` — ButtonGroup handles border joining automatically
- `+` button adds preset value, disabled when `currentValue + value > effectiveMax`
- `-` button subtracts preset value, disabled when `currentValue - value < MIN_TRADE_AMOUNT`
- Preset label click retains absolute-set behavior
- Uses `Math.round(... * 100) / 100` for float safety
- Uses `−` (minus sign U+2212) for `-` button display

**`web/src/components/trading/trade-ticket.tsx`** — 1-line change:
- Added `currentAmount={amount}` prop to `<QuickAmountButtons>`

**`web/src/components/trading/quick-amount-buttons.test.tsx`** — Full rewrite:
- Updated button count from 4 to 10 (3 presets × 3 + Max)
- Added `currentAmount` to all defaultProps and render calls
- Added mock for `@/components/ui/button-group`
- Added test sections: increment (+) buttons, decrement (-) buttons
- 33 tests total, all passing (3 walletCapMax tests added during code review)

### Code Review (2026-03-26)

**Fixes Applied:**

1. **[H1] Removed `radix-ui` mega-package import from `button-group.tsx`** — Trimmed unused exports (`ButtonGroupText`, `ButtonGroupSeparator`) that depended on `radix-ui` and `Separator`. Only `ButtonGroup` and `buttonGroupVariants` are exported now.
2. **[H2] Removed dead-code unused exports from `button-group.tsx`** — `ButtonGroupText` and `ButtonGroupSeparator` were never used by this feature.
3. **[M1] Removed unreachable empty-string fallback in decrement handler** — The disable logic already prevents clicking when result < MIN_TRADE_AMOUNT, so the fallback was dead code.
4. **[M2] Aligned rounding to `Math.floor` consistently** — Both increment and decrement handlers now use `Math.floor` to match `effectiveMax` computation, preventing any rounding-up past the cap.
5. **[M3] Added 3 `walletCapMax` tests for +/- disable states** — Covers `walletCapMax` constraining `+` buttons, enabling when within cap, and capping Max button.

**Not Fixed (LOW — accepted):**
- L1: `@jest-environment jsdom` directive — harmless, consistent with other test files
- L2: `'use client'` directive — harmless, consistent with other component files
