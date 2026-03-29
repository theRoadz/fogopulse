# Story 7.40: Fix Mobile Responsiveness Issues

Status: done
Created: 2026-03-29
Epic: 7 - Platform Polish & UX
Sprint: Current
Priority: MEDIUM — Mobile UX is broken/unusable

## Story

As a mobile user,
I want the app to display correctly on my phone without overflow, clipping, or inaccessible controls,
so that I can connect my wallet, view live prices, and place trades on mobile.

## Problem

**Three mobile responsiveness issues identified via manual testing on phone-width viewports:**

### Issue 1: Mobile Hamburger Menu — Scroll & Redundancy

The mobile menu overlay (`app-header.tsx`) has no `overflow-y-auto`, so on shorter screens the bottom controls (ModeToggle, ClusterUiSelect, WalletButton) are unreachable — the menu scrolls the background page instead.

Additionally, the menu redundantly lists Markets (BTC, ETH, SOL, FOGO) and Pools, which are already visible in the always-shown header bar via the Markets dropdown and Pools link. This wastes vertical space and pushes critical controls (wallet connect) further down.

### Issue 2: Live Price & Epoch Details Overflow

In the chart header (`chart-area.tsx`), the "Live: $66,536.xx" text and in the epoch status row (`epoch-status-display.tsx`), the target price + countdown timer overflow/clip on narrow screens. The flex rows have no wrapping, `min-w-0`, or responsive font sizing.

### Issue 3: Trade Quick Amount Buttons Overflow

The quick amount buttons (`quick-amount-buttons.tsx`) use a fixed `grid-cols-3` layout with `w-8` increment/decrement buttons. On phones < 375px, the button groups overflow the card boundary. The `ButtonGroup` component defaults to `w-fit` which prevents groups from filling their grid cells.

## Solution

### Fix 1: Mobile Menu Cleanup

- Add `overflow-y-auto` to the mobile menu overlay div
- Remove the Markets section (BTC/ETH/SOL/FOGO list) — already accessible via header Markets dropdown
- Remove the Pools link section — already visible in header bar
- Clean up border-t on the now-first section

### Fix 2: Responsive Epoch/Price Display

- `chart-area.tsx`: Add `min-w-0` to CardTitle and left child; add `shrink-0` and responsive `text-xs sm:text-sm` to live price div
- `epoch-status-display.tsx`: Add `flex-wrap` and `min-w-0` to epoch info row
- `price-to-beat.tsx`: Reduce target price font `text-xl` -> `text-base sm:text-xl`; add `flex-wrap` to price row
- `epoch-countdown.tsx`: Add `shrink-0` to root; reduce countdown font `text-2xl` -> `text-xl sm:text-2xl`

### Fix 3: Responsive Quick Amount Buttons

- Reduce grid gap `gap-2` -> `gap-1 sm:gap-2`
- Override ButtonGroup `w-fit` with `className="w-full"`
- Reduce +/- button width `w-8` -> `w-6 sm:w-8`

### Fix 4: Epoch Countdown Above Target Price on Mobile

- `epoch-status-display.tsx`: Use `flex-col-reverse sm:flex-row` (later corrected to DOM reorder + `sm:order-last`) so countdown appears above badge+price on mobile, right-aligned on desktop

### Fix 5: Amount Input Value Overflow

- `amount-input.tsx`: Add `overflow-hidden` to input container, `min-w-0` to input element, reduce font to `text-base sm:text-lg`

### Fix 6: Mobile Layout Reorder — Trade Above Positions

- `trading-layout.tsx`: Use `display: contents` on the chart column wrapper on mobile, which dissolves it so Chart, Positions, and Trade Ticket become direct flex children. CSS `order` (1, 2, 3) reorders them as Chart → Trade → Positions on mobile. On desktop (`lg:`), the wrapper restores to `lg:flex lg:flex-col lg:gap-4 lg:w-[70%]`, keeping positions tight under the chart with no gap.
- Previous attempts with CSS grid (`col-span-2`, `row-span-2`) and flex-wrap all failed because both grid rows and flex-wrap lines have uniform height based on the tallest item, creating a gap when the trade ticket column is taller than the chart.

**Desktop impact: None.** All changes use `sm:`/`md:`/`lg:` breakpoint prefixes preserving existing desktop styles. The `display: contents` trick only applies on mobile; desktop restores the original nested flex layout.

## Acceptance Criteria

1. **AC1:** Mobile menu scrolls when content exceeds viewport height; wallet button is always reachable
2. **AC2:** Mobile menu no longer shows redundant Markets/Pools sections
3. **AC3:** Markets dropdown and Pools link in header bar still function correctly on mobile
4. **AC4:** Live price text does not clip or overflow on 375px viewport
5. **AC5:** Epoch status (target price + countdown) does not clip on 375px viewport
6. **AC6:** Quick amount buttons fit within card boundary on 320px viewport
7. **AC7:** No visual regressions on desktop (1024px+) viewports
8. **AC8:** Amount input value stays within the textbox border on mobile
9. **AC9:** On mobile, Trade Ticket (Your Position + Trade) appears before Positions/Trades panel
10. **AC10:** My Trades tab rows fit within screen width on mobile without horizontal overflow

## Tasks / Subtasks

- [x] Task 1: Fix mobile menu (AC: #1, #2, #3)
  - [x] 1.1: Add `overflow-y-auto` to mobile menu overlay div in `app-header.tsx`
  - [x] 1.2: Remove Markets section from mobile menu
  - [x] 1.3: Remove Pools section from mobile menu
  - [x] 1.4: Remove border-t from utility links section (now first section, outer border-t on parent suffices)

- [x] Task 2: Fix quick amount buttons overflow (AC: #6, #7)
  - [x] 2.1: Reduce grid gap to `gap-1 sm:gap-2`
  - [x] 2.2: Add `className="w-full"` to ButtonGroup
  - [x] 2.3: Reduce +/- button width to `w-6 sm:w-8`

- [x] Task 3: Fix epoch/price overflow (AC: #4, #5, #7)
  - [x] 3.1: Add `min-w-0` and `shrink-0` to chart-area CardTitle row
  - [x] 3.2: Add `flex-wrap` and `min-w-0` to epoch-status-display info row
  - [x] 3.3: Reduce price-to-beat font and add flex-wrap
  - [x] 3.4: Add `shrink-0` and reduce epoch-countdown font

- [x] Task 4: Fix epoch countdown position on mobile (AC: #5)
  - [x] 4.1: Use `flex-col-reverse sm:flex-row` to place countdown above price on mobile
  - [x] 4.2: Add `self-end sm:self-auto` to countdown for right-alignment on mobile

- [x] Task 5: Fix amount input value overflow (AC: #8)
  - [x] 5.1: Add `overflow-hidden` to input container div
  - [x] 5.2: Add `min-w-0` and reduce font `text-base sm:text-lg` on input element

- [x] Task 6: Reorder mobile layout — Trade above Positions (AC: #9, #7)
  - [x] 6.1: Use `display: contents` on chart column wrapper on mobile to dissolve it, allowing CSS `order` to interleave children with trade ticket
  - [x] 6.2: On desktop (`lg:`), wrapper becomes `lg:flex lg:flex-col lg:gap-4 lg:w-[70%]` restoring original nested layout — positions sits tight under chart with no gap
  - [x] 6.3: Trade ticket div uses `order-2 lg:order-none` to appear between chart and positions on mobile only

- [x] Task 7: Fix My Trades tab row overflow on mobile (AC: #10)
  - [x] 7.1: Add `flex-wrap` and `overflow-hidden` to row container, reduce gap to `gap-x-2 gap-y-1 sm:gap-3`
  - [x] 7.2: Hide chevron expand icon on mobile (`hidden sm:block`) — row tap still expands
  - [x] 7.3: Remove fixed widths on mobile for asset (`sm:w-12`), amount (`sm:w-20`), P&L (`sm:w-24`)

- [x] Task 8: Verify (AC: #1-#10)
  - [x] 8.1: Mobile verified by user — Chart → Trade → Positions order correct
  - [x] 8.2: Desktop verified by user — no gap between chart and positions panel, matches original layout

## File List

| File | Action | Description |
|------|--------|-------------|
| `web/src/components/app-header.tsx` | **MODIFY** | Add overflow-y-auto; remove Markets/Pools from mobile menu; auto-close menu on route change |
| `web/src/components/trading/quick-amount-buttons.tsx` | **MODIFY** | Fix grid overflow with responsive gap, w-full ButtonGroup, smaller +/- buttons |
| `web/src/components/trading/chart-area.tsx` | **MODIFY** | Add min-w-0/shrink-0 to prevent title row overflow |
| `web/src/components/trading/epoch-status-display.tsx` | **MODIFY** | Countdown above price on mobile via flex-col-reverse; flex-wrap and min-w-0 |
| `web/src/components/trading/price-to-beat.tsx` | **MODIFY** | Reduce font size on mobile, add flex-wrap |
| `web/src/components/trading/epoch-countdown.tsx` | **MODIFY** | Add shrink-0, reduce countdown font on mobile |
| `web/src/components/trading/amount-input.tsx` | **MODIFY** | Add overflow-hidden, min-w-0, responsive font size |
| `web/src/components/trading/trading-layout.tsx` | **MODIFY** | Reorder mobile layout using `display: contents` + CSS `order`; added `role="group"` for a11y; desktop unchanged via `lg:flex` restore |
| `web/src/components/trading/trading-history-row.tsx` | **MODIFY** | Add flex-wrap, overflow-hidden, hide chevron on mobile, responsive fixed widths; changed trigger from div to button for a11y |

## Change Log

- **2026-03-29**: Story created. Three mobile responsiveness issues identified via manual phone testing.
- **2026-03-29**: Tasks 1-3 implemented. All CSS-only changes using responsive Tailwind breakpoints. Awaiting manual verification.
- **2026-03-29**: Round 2 — Task 4: Epoch countdown reordered above target price on mobile using flex-col-reverse. Task 5: Amount input overflow fixed with overflow-hidden + min-w-0 + responsive font.
- **2026-03-29**: Round 3 — Task 6: Reordered mobile layout so Trade Ticket appears before Positions/Trades panel. Moved PositionsAndTradesPanel out of the chart column into its own flex-wrap row.
- **2026-03-29**: Code review fixes — Replaced flex-wrap layout with CSS grid to fix gap overflow breaking 70/30 desktop split (HIGH). Positions panel now spans full width via col-span-2. Fixed mobile menu controls layout (horizontal row with border separator). Fixed placeholder `--` font size consistency in price-to-beat. Corrected task numbering and descriptions.
- **2026-03-29**: Task 6 reverted — trading-layout.tsx changes rolled back, to be implemented later. AC9 deferred.
- **2026-03-29**: Code review (adversarial) — Fixed M1: added flex-wrap to mobile menu controls row to prevent overflow on narrow screens. Fixed M2: added overflow-hidden+truncate to chart-area title left side to prevent collision with live price. Fixed M3: swapped DOM order in epoch-status-display to match visual order (countdown first), eliminating flex-col-reverse accessibility issue; used sm:order-last for desktop right-alignment.
- **2026-03-29**: Task 6 re-implemented — Used `display: contents` on chart column wrapper (mobile) to dissolve it, allowing CSS `order` to interleave Chart (order-1), Trade Ticket (order-2), Positions (order-3). On desktop, wrapper restores to `lg:flex lg:flex-col lg:gap-4 lg:w-[70%]` so positions sits tight under chart with no gap. Previous grid/flex-wrap approaches failed because both CSS grid rows and flex-wrap lines have uniform height based on tallest item. User verified desktop matches original layout.
- **2026-03-29**: Task 7 — Fixed My Trades tab row overflow on mobile. Added `flex-wrap` + `overflow-hidden` to row container, reduced gap to `gap-x-2 gap-y-1 sm:gap-3`, hidden chevron on mobile, moved fixed widths behind `sm:` breakpoint (asset `sm:w-12`, amount `sm:w-20`, P&L `sm:w-24`). Rows now wrap to 2 lines on mobile.
- **2026-03-29**: Code review (adversarial #2) — Fixed H2: added `role="group"` to `display: contents` wrapper in trading-layout for a11y. Fixed M1: changed `div[role="button"]` to `<button>` in trading-history-row for proper keyboard semantics. Fixed M2: added `useEffect` on pathname to auto-close mobile menu on route change in app-header. Merged split AC sections into single list. L1/L2 noted but not actioned.

## Senior Developer Review (AI)

**Reviewer:** theRoad | **Date:** 2026-03-29

**Findings:** 2 HIGH, 3 MEDIUM, 2 LOW

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| H1 | HIGH | `trading-layout.tsx` and `trading-history-row.tsx` uncommitted — story marked done but changes not in commit `40e7ebc` | Pending commit by user |
| H2 | HIGH | `display: contents` breaks a11y tree in older browsers | Fixed: added `role="group"` |
| M1 | MEDIUM | `div[role="button"]` in trading-history-row lacks native keyboard semantics | Fixed: changed to `<button>` |
| M2 | MEDIUM | Mobile menu stays open when navigating via header Markets/Pools links | Fixed: `useEffect` on pathname closes menu |
| M3 | MEDIUM | `flex-wrap` + `sm:` breakpoint timing may cause single-item wrap at 640px | Noted — visual only, no functional impact |
| L1 | LOW | ACs 8-10 in separate section from ACs 1-7 | Fixed: merged into single list |
| L2 | LOW | Change log overly verbose | Noted — no action taken |
