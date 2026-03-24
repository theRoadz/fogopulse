# Story 7.26: Add Protocol Pause & Emergency Freeze Controls to Admin Panel

Status: done
Created: 2026-03-23
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a protocol admin,
I want toggle controls for Protocol Pause and Emergency Freeze in the admin configuration panel,
so that I can pause epoch creation or halt all protocol activity directly from the UI without crafting raw transactions.

## Problem

The FogoPulse protocol has two critical admin safety mechanisms stored in GlobalConfig:

1. **`paused: bool`** — Blocks new epoch creation globally (existing epochs continue to settle normally)
2. **`frozen: bool`** — Emergency freeze that halts ALL protocol activity (trades, settlements, claims, epoch creation)

**On-chain support is complete:**
- `update_config` instruction handles both fields (`anchor/programs/fogopulse/src/instructions/update_config.rs` lines 41-42)
- IDL includes both as `Option<bool>` in `UpdateConfigParams` (`web/src/lib/fogopulse.json` lines 5725-5842)
- Transaction builder already has `paused` and `frozen` in `UpdateConfigParams` (`web/src/lib/transactions/update-config.ts` lines 22-23)
- `useUpdateConfig` hook handles the full transaction flow generically (`web/src/hooks/use-update-config.ts`)

**Frontend reads but cannot write:**
- `system-status-card.tsx` displays protocol state (Frozen/Paused/Active) with color-coded badges (lines 24-34)
- `alerts-section.tsx` shows alerts when paused or frozen (lines 64-76)
- `configuration-panel.tsx` hardcodes `paused: null, frozen: null` in `buildChangeParams()` (lines 325-326), meaning these fields are never sent as changes

**Impact:** An admin has no way to pause or freeze the protocol from the UI. In an emergency requiring an immediate protocol halt, the admin would need to craft a raw Solana transaction — unacceptable for operational safety.

**Important distinction:** These are NOT the same as the epoch freeze window (15s before epoch end). The freeze window is an automatic, per-epoch, time-based mechanism (`EpochState::Frozen`) triggered by keeper bots via `advance_epoch`. The `config.frozen` and `config.paused` flags are manual admin kill switches at the protocol level.

## Solution

Modify **only** `web/src/components/admin/configuration-panel.tsx` to expose `paused` and `frozen` as toggle controls. The entire backend stack already supports these fields — this is purely a frontend wiring task.

Add a "Protocol Safety" section with:
- **Pause toggle** (amber-themed) — clear description that it blocks new epoch creation
- **Freeze toggle** (red-themed) — strong warning that it halts ALL activity
- Both integrated into the existing change detection and confirmation dialog flow
- Enhanced confirmation dialog with red warning banner when enabling freeze

**Safety note:** Verified that `update_config` instruction does NOT check frozen/paused state before allowing updates (only checks `has_one = admin`). An admin can always unfreeze the protocol via this same UI.

## Acceptance Criteria

1. **AC1:** Given an admin viewing the configuration panel, when they see the "Protocol Safety" section, then they see toggle switches for "Pause Protocol" and "Emergency Freeze" with descriptive text explaining each action's scope
2. **AC2:** Given an admin toggles `paused`, when they submit the config update, then the on-chain `GlobalConfig.paused` field is updated and `SystemStatusCard` reflects the new state
3. **AC3:** Given an admin toggles `frozen`, when they see the confirmation dialog, then a prominent red warning banner explains that ALL protocol activity will halt
4. **AC4:** Given an admin submits a freeze change, when the transaction confirms, then `SystemStatusCard` shows red "Frozen" badge and `AlertsSection` shows the emergency freeze alert
5. **AC5:** Given the protocol is frozen, when the admin toggles `frozen` OFF and submits, then the protocol unfreezes successfully (admin is not locked out of `updateConfig`)
6. **AC6:** Given an admin changes pause/freeze along with other config fields, when they view the confirmation dialog, then ALL changes (including pause/freeze) appear in the changes table

## Tasks / Subtasks

- [x] Task 1: Add `paused` and `frozen` to form state (AC: #1)
  - [x] 1.1 Add `paused: boolean` and `frozen: boolean` to `FormState` interface (~line 57)
  - [x] 1.2 Initialize both from `config.paused` and `config.frozen` in `useState` (~line 240)
  - [x] 1.3 Add `String(config.paused)` and `String(config.frozen)` to `configKey()` function (~line 199)

- [x] Task 2: Wire change detection and param building (AC: #2, #6)
  - [x] 2.1 Add `paused` change detection in `changes` useMemo following `allowHedging` pattern (~line 295)
  - [x] 2.2 Add `frozen` change detection in `changes` useMemo (~line 295)
  - [x] 2.3 Replace `paused: null` with conditional logic in `buildChangeParams()` (line 325)
  - [x] 2.4 Replace `frozen: null` with conditional logic in `buildChangeParams()` (line 326)

- [x] Task 3: Add Protocol Safety UI section (AC: #1)
  - [x] 3.1 Add "Protocol Safety" section header between Toggles section (line 702) and Submit (line 704)
  - [x] 3.2 Add Pause toggle card — amber-themed border/background when active, Switch component, description text, "(changed)" indicator
  - [x] 3.3 Add Freeze toggle card — red-themed border/background when active, Switch component, warning description text, red "(changed)" indicator

- [x] Task 4: Enhance confirmation dialog for freeze safety (AC: #3)
  - [x] 4.1 Add red warning banner inside DialogContent when freeze is being toggled ON
  - [x] 4.2 Style "Emergency Freeze" row in confirmation table with red text instead of default amber

## Dev Notes

### Key file to modify
- `web/src/components/admin/configuration-panel.tsx` (760 lines) — **ONLY file that needs changes**

### Existing patterns to reuse
- `Switch` component already imported (line 14) and used for `allowHedging` toggle (lines 691-701)
- `setField` helper already handles boolean form fields
- Change detection `useMemo` pattern at lines 289-294 (`allowHedging` example)
- `buildChangeParams()` conditional pattern at line 324 (`allowHedging` example)
- Confirmation dialog table at lines 736-742

### Files that need NO changes (already work)
- `web/src/lib/transactions/update-config.ts` — `UpdateConfigParams` already has paused/frozen
- `web/src/hooks/use-update-config.ts` — Generic transaction flow
- `web/src/hooks/use-global-config.ts` — Already exposes `config.paused` and `config.frozen`
- `web/src/components/admin/system-status-card.tsx` — Already displays Frozen/Paused/Active badge
- `web/src/components/admin/alerts-section.tsx` — Already shows alerts for paused/frozen states

### References
- [Source: anchor/programs/fogopulse/src/state/config.rs#GlobalConfig] — `paused` (line 51), `frozen` (line 53)
- [Source: anchor/programs/fogopulse/src/instructions/update_config.rs] — No frozen/paused guard, admin-only via `has_one`
- [Source: web/src/components/admin/configuration-panel.tsx#buildChangeParams] — Lines 325-326 hardcode null

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
None — clean implementation, no debugging required.

### Completion Notes List
- Task 1: Added `paused: boolean` and `frozen: boolean` to `FormState` interface, initialized from `config.paused`/`config.frozen` in `useState`, added to `configKey()` for remount on config change.
- Task 2: Added change detection for both fields in `changes` useMemo following `allowHedging` pattern. Replaced hardcoded `paused: null, frozen: null` in `buildChangeParams()` with conditional logic that sends the value only when changed.
- Task 3: Added "Protocol Safety" section between Toggles and Submit with two toggle cards: amber-themed Pause toggle and red-themed Freeze toggle, each with descriptive text and "(changed)" indicators.
- Task 4: Added red warning banner in confirmation dialog when enabling freeze (not shown when disabling). Styled "Emergency Freeze" row in confirmation table with `text-red-500 font-semibold` instead of default amber.
- All 23 unit tests pass covering: rendering, state initialization, change detection, confirmation dialog content, warning banner visibility (pause + freeze), red styling on freeze row, unfreeze styling correctness, mixed changes (AC6), and correct mutate params for pause/freeze/unchanged scenarios.

### File List
- `web/src/components/admin/configuration-panel.tsx` (modified)
- `web/src/components/admin/configuration-panel.test.tsx` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — sprint tracking sync)

### Senior Developer Review (AI)
**Reviewed:** 2026-03-24 | **Outcome:** Approved with fixes applied

**Fixes applied (4 MEDIUM issues):**
1. Added amber warning banner in confirmation dialog when enabling Pause (was missing — only Freeze had one)
2. Fixed freeze row red styling to only apply when freezing (enabling), not when unfreezing — "Active" no longer shows in alarming red
3. Added `sprint-status.yaml` to File List (was modified in git but undocumented)
4. Added test for AC6 mixed-changes scenario (pause + freeze + numeric change in same confirmation dialog)

**Additional tests added:** 4 new tests (pause warning banner show/hide, unfreeze styling, mixed AC6 scenario) — 23 total passing

**LOW issues noted (not fixed):**
- Test className assertions are brittle (depends on mock pass-through)
- No aria-label on safety card containers (toggles themselves are accessible)
- Magic string comparison `'Emergency Freeze'` for styling — consider `ChangeEntry.severity` field in future
