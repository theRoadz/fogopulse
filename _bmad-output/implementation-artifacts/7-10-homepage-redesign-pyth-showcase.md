# Story 7.10: Homepage Redesign — Pyth Technology Showcase

Status: done
Created: 2026-03-19
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a Pyth Hackathon judge or visitor,
I want to see FogoPulse's Pyth integration clearly highlighted on the homepage,
so that I understand how the platform leverages Pyth Lazer and Pyth Hermes for its prediction markets.

## Problem

The current homepage displays 4 market cards in a full-width 2x2 grid with a generic footer "Prices powered by Pyth Oracle." There is no visibility into:
- **Pyth Hermes** — the real-time SSE streaming powering live price feeds and oracle health monitoring
- **Pyth Lazer** — the on-chain oracle used for epoch price discovery, settlement, and confidence-based validity checks
- **Oracle Health** — staleness, confidence ratios, and connection state are only visible in the admin dashboard

For a Pyth Hackathon submission, the homepage should showcase the dual-oracle architecture front and center.

## Design Decisions

1. **Two-column 50:50 layout.** Left side: compact 2x2 market cards (no price — shown in Oracle Health instead). Right side: Oracle Health card. Stacks vertically on mobile.

2. **Pyth tech section below as full-width 50:50.** "Powered by Pyth Network" sits below the main grid with Pyth Lazer (left card) and Pyth Hermes (right card) side by side.

3. **Separate test page first.** Build at `/test-home` without touching the existing homepage. Once approved, swap into `/`.

4. **No admin dependency for Oracle Health.** The homepage version uses hardcoded default thresholds instead of `useGlobalConfig` (which requires admin auth). Thresholds: staleness 10s/30s, confidence 0.5%/1.0%.

5. **Compact market cards via prop.** Add `compact` prop to existing `MarketCard` rather than creating a separate component. Compact mode reduces padding, hides pool depth, hides price, and uses smaller buttons.

6. **Reuse existing `usePythPrice` hook.** Both market cards and oracle health use the same Hermes SSE hook — no new data layer needed.

## Acceptance Criteria

1. **Given** I navigate to `/test-home`, **When** the page loads on desktop, **Then** I see a 50:50 two-column layout with market cards on the left and Oracle Health on the right
2. **Given** I view the Oracle Health card, **When** Hermes feeds are active, **Then** I see live prices, staleness counters, confidence ratios, and connection badges for BTC, ETH, SOL, and FOGO
3. **Given** I view the Oracle Health card header, **When** at least one feed is connected, **Then** I see a green pulsing dot and "Live data from Pyth Hermes" subtitle
4. **Given** I view the Pyth Tech section below the main grid, **When** the page loads, **Then** I see two side-by-side cards — Pyth Lazer (on-chain) and Pyth Hermes (real-time) — in a 50:50 layout
5. **Given** I view the market cards in compact mode, **When** compared to the original homepage, **Then** cards have no price display, no pool depth, reduced padding, and smaller trade buttons
6. **Given** I click a market card on `/test-home`, **When** I click it, **Then** I navigate to the correct `/trade/[asset]` page
7. **Given** I navigate to `/`, **When** the page loads, **Then** the original homepage is completely unchanged
8. **Given** I view `/test-home` on mobile, **When** the viewport is < 1024px, **Then** the layout stacks vertically: hero, markets, oracle health, pyth tech, footer

## Tasks / Subtasks

### Task 0: Create story file (AC: all)

- [x] 0.1: Create `_bmad-output/implementation-artifacts/7-10-homepage-redesign-pyth-showcase.md`

### Task 1: Create `HomeOracleHealthCard` component (AC: #2, #3)

**New file:** `web/src/components/home/home-oracle-health-card.tsx`

- [x] 1.1: Create component adapted from `admin/oracle-health-card.tsx` with hardcoded thresholds
- [x] 1.2: Add green pulsing dot indicator and "Pyth Hermes" branding
- [x] 1.3: Include per-asset rows with price, staleness, confidence, connection badge

### Task 2: Create `PythTechSection` component (AC: #4)

**New file:** `web/src/components/home/pyth-tech-section.tsx`

- [x] 2.1: Create presentational card with Pyth Lazer section (on-chain badge, bullet points)
- [x] 2.2: Add Pyth Hermes section (real-time badge, bullet points)
- [x] 2.3: V2 — Split into two side-by-side cards (50:50 grid) with shared heading above

### Task 3: Add `compact` prop to `MarketCard` (AC: #5, #6)

**Modify:** `web/src/components/home/market-card.tsx`

- [x] 3.1: Add optional `compact?: boolean` prop
- [x] 3.2: Conditionally reduce padding, spacing, text size, hide pool depth, smaller button
- [x] 3.3: V2 — Hide price section in compact mode (prices shown in Oracle Health instead)

### Task 4: Create test page at `/test-home` (AC: #1, #7, #8)

**New files:** `web/src/app/test-home/page.tsx`, `web/src/components/home/test-home-feature.tsx`

- [x] 4.1: Create route entry point
- [x] 4.2: Create `TestHomeFeature` with two-column grid layout (V2: 50:50 split, Pyth section moved below as full-width)
- [x] 4.3: Updated hero and footer text mentioning Pyth

### Task 5: Tests (AC: all)

- [x] 5.1: Add compact mode tests to `market-card.test.tsx` (6 tests: pool depth hidden, spacing, price hidden)
- [x] 5.2: Create `home-oracle-health-card.test.tsx` (6 tests added)

## Technical Notes

- 8 SSE connections on the test page (4 from market cards + 4 from oracle health). Acceptable for hackathon but could be optimized with a shared price context provider later.
- FOGO has a placeholder Hermes feed ID — may show "Disconnected" which is accurate.
- The `lg` breakpoint (1024px) is used for the two-column split.
- Default thresholds (10s/30s staleness, 0.5%/1.0% confidence) match typical on-chain config values.

## DO NOT

- Modify the existing `home-feature.tsx` or the `/` route
- Add `useGlobalConfig` dependency to the homepage oracle health card
- Create a shared price context provider (optimization for later)
- Touch admin components

## REUSE THESE

| What | Where |
|------|-------|
| `usePythPrice` hook | `web/src/hooks/use-pyth-price.ts` |
| `ASSETS` array | `web/src/types/assets.ts` |
| `ASSET_METADATA` | `web/src/lib/constants.ts` |
| `Card`, `Badge` components | `web/src/components/ui/` |
| `connectionBadge` pattern | `web/src/components/admin/oracle-health-card.tsx` |
| `MarketCard` component | `web/src/components/home/market-card.tsx` |

## Change Log

- **2026-03-19** — Promoted to homepage: replaced `home-feature.tsx` with redesigned layout, deleted `test-home-feature.tsx` and `/test-home` route, updated tests. Build passes, 29/29 tests pass.
- **2026-03-19** — V2 refinements: removed price from compact market cards (redundant with Oracle Health), changed main layout to 50:50 split, moved Pyth tech section below as full-width 50:50 (Lazer left, Hermes right as separate cards). Build passes, 28/28 tests pass (12 new).
- **2026-03-19** — V1 complete. Test page at `/test-home` ready for visual review. Build passes, 26/26 tests pass (10 new). Pending: visual approval before swapping to homepage.
- **2026-03-19** — Story created, implementation started
