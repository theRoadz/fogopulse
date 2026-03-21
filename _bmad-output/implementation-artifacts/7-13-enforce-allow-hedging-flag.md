# Story 7.13: Enforce `allow_hedging` Flag in Frontend Trade Flow

Status: done
Created: 2026-03-21
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a protocol operator,
I want the `allow_hedging` flag to actually prevent users from opening opposite-direction positions,
so that when hedging is disabled, traders cannot hold both Up and Down on the same epoch.

## Problem

The `allow_hedging` field exists in `GlobalConfig` on-chain and is toggleable via the admin dashboard, but **it is never enforced anywhere in the trading flow**. When `allow_hedging = false` (current default), users can still place both Up and Down positions on the same epoch with no restriction.

### Root Cause

Story 7.8 changed Position PDA seeds from `["position", epoch, user]` to `["position", epoch, user, direction_byte]`, making hedging **structurally possible** at the account level. The on-chain code explicitly delegated enforcement to the client:

```rust
// buy_position.rs:208-210
// Direction is enforced by PDA seeds — each direction gets its own account.
// Hedging (both Up and Down on same epoch) is structurally supported via separate PDAs.
// allow_hedging flag is enforced client-side.
```

However, the client-side enforcement was **never implemented**. The `allowHedging` flag is:
- Parsed from on-chain data in `use-global-config.ts:74`
- Displayed in admin panel (`configuration-panel.tsx`) and system status card
- **Not referenced** in `trade-ticket.tsx`, `use-buy-position.ts`, or any trading component

### Why Not On-Chain Enforcement?

Per Story 7.8 design decision: hedging when disabled is economically self-punishing (double fees, zero net exposure). On-chain enforcement would require passing the opposite-direction position PDA as a remaining account on every buy, adding complexity for no real attack vector. Client-side enforcement is sufficient for MVP.

## Acceptance Criteria

1. **Given** `allow_hedging = false` and the user has an existing Up position on the current epoch, **When** they select Down direction, **Then** the buy button is disabled with message "Hedging disabled — you have an Up position on this epoch"
2. **Given** `allow_hedging = false` and the user has an existing Down position, **When** they select Up direction, **Then** the buy button is disabled with the equivalent message
3. **Given** `allow_hedging = false` and the user has no position yet, **When** they select either direction, **Then** trading works normally (no blocking)
4. **Given** `allow_hedging = false` and the user has an Up position, **When** they select Up (same direction), **Then** they can add to the existing position normally
5. **Given** `allow_hedging = true`, **When** the user has an Up position and selects Down, **Then** the trade is allowed
6. **Given** the admin toggles `allow_hedging` from false to true, **When** the config refetches, **Then** the restriction is immediately lifted without page reload

## Tasks / Subtasks

### Task 1: Add Opposite-Position Check to Trade Ticket (AC: #1-#5)

- [x] 1.1: **`web/src/components/trading/trade-ticket.tsx`** — Import `useUserPosition` from `@/hooks/use-user-position`
- [x] 1.2: **`trade-ticket.tsx`** — Call `useUserPosition(epochPda, 'up')` and `useUserPosition(epochPda, 'down')` to fetch both direction positions for the current epoch. The epoch PDA is available from `pool?.activeEpoch`
- [x] 1.3: **`trade-ticket.tsx`** — Add hedging check logic: when `config?.allowHedging === false` and `direction` is selected, check if the opposite direction has an existing position with `shares > 0`. If so, set a hedging-blocked state
- [x] 1.4: **`trade-ticket.tsx`** — Update `getTradeButtonState` to handle hedging-blocked state: return `{ disabled: true, text: 'Hedging Disabled' }`
- [x] 1.5: **`trade-ticket.tsx`** — Show inline warning message below the direction buttons when hedging is blocked

### Task 2: Tests (AC: #1-#6)

- [x] 2.1: Add/update tests in `web/src/components/trading/trade-ticket.test.tsx` to verify:
  - Direction button click with existing opposite position + hedging disabled → buy blocked
  - Direction button click with existing same-direction position + hedging disabled → buy allowed
  - Direction button click with existing opposite position + hedging enabled → buy allowed
  - No existing position → buy allowed regardless of flag

### Task 3: Build Verification

- [x] 3.1: `npx next build` — TypeScript compilation passes with zero errors

## Dev Notes

### Key Files

- `web/src/components/trading/trade-ticket.tsx` — Main file to modify (lines 11, 100-106, 128-135, 151-152)
- `web/src/hooks/use-global-config.ts:74` — Already parses `allowHedging: boolean`
- `web/src/hooks/use-user-position.ts` — Already accepts `direction` param, returns `{ position, isLoading }`
- `web/src/components/trading/your-position.tsx:278-279` — Reference implementation of fetching both direction positions

### What NOT to Change

- **No on-chain changes** — Story 7.8 design decision: client-side enforcement only
- **No admin panel changes** — Toggle already works correctly
- **No PDA or transaction changes** — Only UI-level blocking

### Related Stories

- **Story 7.8** (`7-8-fix-hedging-direction-pda.md`) — Added direction-based PDAs, introduced `allow_hedging` enforcement gap
- **Story 7.12** (`7-12-fixed-trade-presets-max-trade-amount.md`) — Added `useGlobalConfig()` to trade-ticket (reuse this)

## Dev Agent Record

### Implementation Notes

- Reused existing `usePool` hook to get `pool.activeEpoch` PDA (same pattern as `your-position.tsx:276`)
- Reused existing `useUserPosition` hook with direction param to fetch both Up and Down positions
- Hedging check uses IIFE for clean inline computation: `config?.allowHedging !== false` allows trading while config is loading (safe default)
- Added `hedgingBlocked` param to `getTradeButtonState` — button shows "Hedging Disabled" text
- Inline warning uses `text-destructive` class for red error styling consistent with project design system
- Fixed pre-existing test bug: `setAmount` assertion was missing second arg (`maxTradeAmount`) added in Story 7.12

### Completion Notes

All 3 tasks complete. 6 hedging test cases added covering AC #1-#5. AC #6 (live config refetch) is inherently satisfied because `useGlobalConfig` uses TanStack Query with `refetchInterval: 5000` plus a WebSocket `onAccountChange` subscription — when admin toggles the flag, the trade ticket re-renders with fresh config data.

## File List

- `web/src/components/trading/trade-ticket.tsx` — Modified: added hedging enforcement (imports, position hooks, hedging check, button state, warning message)
- `web/src/components/trading/trade-ticket.test.tsx` — Modified: added mocks for useGlobalConfig/usePool/useUserPosition, added 5 hedging test cases, fixed pre-existing setAmount assertion
- `_bmad-output/implementation-artifacts/7-13-enforce-allow-hedging-flag.md` — Story file (this file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Added story 7-13 entry

## Change Log

- 2026-03-21: Implemented client-side hedging enforcement in trade-ticket.tsx. When `allow_hedging = false` in GlobalConfig, users with an existing opposite-direction position are blocked from placing a trade with a clear warning message. 5 test cases added.
- 2026-03-21: Code review fixes — fixed grammar in warning message ("a Up" → "an Up"), added `hedgingBlocked` guard in `handleTrade` function, added test for zero-shares edge case (25 tests total), corrected completion notes re: AC #6 mechanism.
