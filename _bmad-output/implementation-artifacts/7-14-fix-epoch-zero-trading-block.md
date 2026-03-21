# Story 7.14: Fix Trading Silently Blocked on Epoch 0

Status: done
Created: 2026-03-21
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a trader,
I want to place trades on epoch 0 (the first epoch after pool reinitialization),
so that I can participate in trading from the very first epoch.

## Problem

After pool reinitialization, the first epoch created has `epochId = 0`. When a user clicks the "Place Trade" button on epoch 0, **nothing happens** — the button appears enabled but the trade silently fails to execute. Trading works fine on epoch 1 and all subsequent epochs.

### Root Cause

In `trade-ticket.tsx:199`, the `handleTrade` guard uses a JavaScript falsy check on `epochId`:

```typescript
if (!direction || !amount || !epochState.epoch?.epochId || !publicKey || hedgingBlocked) {
  return
}
```

`epochId` is typed as `bigint`. When the epoch is 0, `epochId = 0n`. In JavaScript, **`!0n === true`** because `0n` is falsy. This causes `handleTrade` to silently return without executing the trade.

This bug was introduced when the `handleTrade` guard was first written — it worked in practice because epochs usually start at 1+ after the initial deployment. The issue only surfaces after a full pool reinitialization that resets `next_epoch_id` to 0.

## Acceptance Criteria

1. **Given** epoch 0 is active and open, **When** the user fills in direction + amount and clicks "Place Trade", **Then** the buy_position transaction is submitted normally
2. **Given** epoch 1+ is active, **When** the user places a trade, **Then** behavior is unchanged (no regression)
3. **Given** no active epoch exists (`epochState.epoch` is null), **When** the user attempts to trade, **Then** the trade is still correctly blocked

## Tasks / Subtasks

### Task 1: Fix Falsy Check on epochId (AC: #1-#3)

- [x] 1.1: **`web/src/components/trading/trade-ticket.tsx`** — Change `!epochState.epoch?.epochId` to `epochState.epoch?.epochId == null` in the `handleTrade` guard. The `== null` check catches both `null` and `undefined` but correctly allows `0n` through.

## Dev Notes

### Key Files

- `web/src/components/trading/trade-ticket.tsx:199` — The single line to fix

### JavaScript Truthiness Gotcha

This is a well-known JavaScript pitfall with BigInt:
- `!0n === true` (0n is falsy)
- `!1n === false` (1n is truthy)
- `0n == null` → `false` (correct — 0n is not null/undefined)
- `null == null` → `true` (correct — catches null)
- `undefined == null` → `true` (correct — catches undefined via optional chaining)

### Related Stories

- **Story 7.13** (`7-13-enforce-allow-hedging-flag.md`) — Added `hedgingBlocked` to the same guard line in `handleTrade`

## Dev Agent Record

### Implementation Notes

- Single-line fix: changed falsy check to explicit null check
- The `== null` pattern (loose equality) is the idiomatic JavaScript way to check for null/undefined without catching falsy values like `0`, `0n`, `""`, or `false`

## File List

- `web/src/components/trading/trade-ticket.tsx` — Modified: fixed epochId falsy check in handleTrade guard (line 199)
- `web/src/components/trading/trade-ticket.test.tsx` — Modified: added epoch-0 regression tests (review follow-up)
- `anchor/scripts/clear-and-reinitialize-pools.ts` — Added: pool reset utility script (bundled in same commit)
- `_bmad-output/implementation-artifacts/7-14-fix-epoch-zero-trading-block.md` — Story file (this file)

## Change Log

- 2026-03-21: Fixed JavaScript truthiness bug where `!epochState.epoch?.epochId` blocked trades on epoch 0 because `!0n === true`. Changed to `epochState.epoch?.epochId == null`.
- 2026-03-21: [Code Review] Added 2 regression tests for epoch-0 trading (epochId=0n enabled, null epoch blocked). Updated File List to document bundled `clear-and-reinitialize-pools.ts` script.
