# Story 7.24: Admin Toggle to Enable/Disable "Create New Epoch" Button

Status: complete
Created: 2026-03-23
Epic: 7 - Platform Polish & UX
Sprint: Backlog

## Story

As an admin,
I want a toggle in the admin configuration panel to enable or disable the "Create New Epoch" button,
so that I can control whether users see the button to manually create epochs across all devices.

## Problem

The "Create New Epoch" button in the trading UI (`web/src/components/trading/epoch-status-display.tsx`) is always visible when no active epoch exists. There is no way for an admin to hide this button from users. The on-chain `paused` flag is too broad — it blocks all protocol operations (buy, sell, deposit, withdraw), not just epoch creation. Admins need a targeted, UI-level control.

## Solution

Add a **frontend-only, server-persisted** admin setting using Firebase Firestore (the same database already used by the feedback system). The setting is stored in Firestore doc `settings/admin` and exposed via an API route. When disabled, the "Create New Epoch" button is hidden for **all users** across all devices and browsers.

**Note:** This is a UI-only toggle. The on-chain Solana program remains permissionless — the crank-bot and other callers can still create epochs on-chain regardless of this setting.

### Key Design Decisions

1. **Firebase Firestore** — Reuses the existing database (`web/src/lib/firebase.ts` → `getDb()`). No new dependencies.
2. **Server-side storage** — Unlike localStorage, the setting is global. When admin disables it, all users everywhere see the button hidden.
3. **Separate from on-chain config** — This is not a blockchain parameter. It lives alongside the on-chain config panel but saves independently (immediate toggle, not batched with the "Update Config" transaction).
4. **TanStack Query polling** — The frontend polls the setting every 30s so users pick up changes without refreshing.
5. **Admin-only writes** — The PATCH endpoint validates the caller is an admin via `isAdminWallet()` (same pattern as `/api/feedback/admin-check`).

### Existing Code to Reuse

| What | File | Usage |
|------|------|-------|
| Firebase Firestore client | `web/src/lib/firebase.ts` → `getDb()` | Read/write `settings/admin` doc |
| Admin wallet check | `web/src/lib/admin.ts` → `isAdminWallet()` | Gate PATCH endpoint |
| Switch component | `web/src/components/ui/switch.tsx` | Toggle UI (already used for "Allow Hedging") |
| TanStack Query patterns | `web/src/hooks/use-feedback-list.ts` | Query/mutation patterns to follow |
| Configuration panel toggles | `web/src/components/admin/configuration-panel.tsx` lines 687-701 | Add new toggle alongside "Allow Hedging" |

## Acceptance Criteria

1. **Given** an admin on the admin page, **When** they view the Configuration Panel → Toggles section, **Then** they see a "Allow Epoch Creation (UI)" switch alongside the existing "Allow Hedging" toggle
2. **Given** an admin toggles "Allow Epoch Creation (UI)" off, **When** any user visits the trading page with no active epoch, **Then** the "Create New Epoch" button is hidden and replaced with "Waiting for next epoch..." text
3. **Given** an admin toggles "Allow Epoch Creation (UI)" back on, **When** any user visits the trading page with no active epoch, **Then** the "Create New Epoch" button reappears (within 30s polling interval or on page refresh)
4. **Given** the setting has never been configured (Firestore doc doesn't exist), **When** the trading page loads, **Then** the default behavior is to show the button (allowEpochCreation defaults to `true`)
5. **Given** a non-admin user, **When** they call PATCH `/api/admin-settings`, **Then** the request is rejected with 403 Forbidden

## Tasks / Subtasks

### Task 1: Create API route for admin settings (AC: #1, #4, #5)

- [x] 1.1: Create `web/src/app/api/admin-settings/route.ts` with GET handler — reads `settings/admin` doc from Firestore, returns `{ allowEpochCreation: boolean }`, defaults to `{ allowEpochCreation: true }` if doc doesn't exist
- [x] 1.2: Add PATCH handler — validates `wallet` query param via `isAdminWallet()`, accepts `{ allowEpochCreation: boolean }` body, writes to Firestore `settings/admin` doc using `merge: true`
- [x] 1.3: Return 403 for non-admin PATCH requests, 400 for invalid body

### Task 2: Create frontend hook (AC: #2, #3, #4)

- [x] 2.1: Create `web/src/hooks/use-admin-settings.ts` with `useAdminSettings()` — TanStack `useQuery` fetching GET `/api/admin-settings`, `staleTime: 10_000`, `refetchInterval: 30_000`
- [x] 2.2: Add `useUpdateAdminSettings()` — TanStack `useMutation` calling PATCH `/api/admin-settings?wallet=...`, invalidates `admin-settings` query on success
- [x] 2.3: Export from `web/src/hooks/index.ts`

### Task 3: Add toggle to admin configuration panel (AC: #1)

- [x] 3.1: Import `useAdminSettings` and `useUpdateAdminSettings` in `web/src/components/admin/configuration-panel.tsx`
- [x] 3.2: Add a `Switch` in a separate "UI Settings" Card (outside the on-chain Configuration Panel Card) labeled "Allow Epoch Creation (UI)" with hint text "When disabled, the Create New Epoch button is hidden for all users. Saves immediately."
- [x] 3.3: Wire switch `onCheckedChange` to call `useUpdateAdminSettings` mutation immediately (not batched with on-chain config update)

### Task 4: Hide button in trading UI when disabled (AC: #2, #3)

- [x] 4.1: Import `useAdminSettings` in `web/src/components/trading/epoch-status-display.tsx`
- [x] 4.2: In the no-epoch block (around line 169), check `allowEpochCreation` — when `false`, hide the Create New Epoch button and show "Waiting for next epoch..." message instead
- [x] 4.3: Ensure loading state doesn't flash the button (default to hidden while loading, or show skeleton)

### Task 5: Tests

- [x] 5.1: Unit test for API route — GET returns defaults when no doc, PATCH rejects non-admin, PATCH updates setting
- [x] 5.2: Unit test for `useAdminSettings` hook — returns default when API returns default, updates on mutation
- [x] 5.3: Update `epoch-status-display.test.tsx` — verify button hidden when `allowEpochCreation` is `false`

## File List

| File | Action | Description |
|------|--------|-------------|
| `web/src/app/api/admin-settings/route.ts` | NEW | API route: GET/PATCH admin settings from Firestore |
| `web/src/hooks/use-admin-settings.ts` | NEW | TanStack Query hook for fetching/updating admin settings |
| `web/src/hooks/index.ts` | MODIFIED | Export new hook |
| `web/src/components/admin/configuration-panel.tsx` | MODIFIED | Add "Allow Epoch Creation (UI)" toggle in Toggles section |
| `web/src/components/trading/epoch-status-display.tsx` | MODIFIED | Conditionally hide Create New Epoch button based on setting |
| `web/src/app/api/admin-settings/route.test.ts` | NEW | API route tests |
| `web/src/hooks/use-admin-settings.test.ts` | NEW | Hook tests |
| `web/src/components/trading/epoch-status-display.test.tsx` | MODIFIED | Add test for hidden button state |
| `web/src/components/admin/configuration-panel.test.tsx` | MODIFIED | Added mock for new admin settings hooks |
| `web/src/lib/constants.ts` | MODIFIED | Added `QUERY_KEYS.adminSettings` |

## Dev Agent Record

- **Implementation**: All 5 tasks completed in order. Followed existing patterns from feedback system (Firebase, admin check, TanStack Query hooks).
- **Key decisions**:
  - No wallet signature required for PATCH — matches story spec (uses `isAdminWallet()` on query param like `/api/feedback/admin-check`)
  - Loading state defaults to hiding the button to prevent flash (AC #4.3)
  - Added `QUERY_KEYS.adminSettings` to constants for consistency with existing query key patterns
  - Moved toggle to its own "UI Settings" Card, separate from the on-chain "Configuration Panel" Card, to avoid confusion with the "Update Config" batch flow — this toggle saves to Firebase immediately, not on-chain
- **Tests created**:
  - `route.test.ts`: 8 tests (GET defaults, GET stored, GET missing field, PATCH non-admin 403, PATCH no wallet 403, PATCH invalid body 400, PATCH success)
  - `use-admin-settings.test.ts`: 4 tests (query config, fetch failure default, fetch success, PATCH mutation)
  - `epoch-status-display.test.tsx`: 3 new tests (button hidden when disabled, hidden while loading, shown when enabled)
  - `configuration-panel.test.tsx`: Fixed existing 23 tests by adding mock for new hooks
- **Test results**: 51 tests across 4 suites — all passing (post-review). 3 pre-existing failures in unrelated tests (direction-button, use-multi-asset-positions, trading-history-list) are not caused by this story.

## Change Log

- **2026-03-23**: Story created. Approach: Firebase Firestore + API route + admin panel toggle.
- **2026-03-24**: Implemented. Moved toggle from inside on-chain config Card to its own separate "UI Settings" Card to clearly separate Firebase-backed UI settings from on-chain config.
- **2026-03-24**: Code review (AI). Fixed: (1) M1 — `res.json()` not awaited in mutation happy path, (2) M2 — added Cache-Control header to GET endpoint, (3) H2/L2 — added 2 missing Firestore error-path tests to route.test.ts, (4) M4 — added onSuccess/onError callback tests to hook tests, (5) L1 — added UI Settings toggle interaction test to configuration-panel.test.tsx. Note: H1 (admin auth via query param, no signature) is a known codebase-wide pattern — not addressed here, tracked as future hardening.
