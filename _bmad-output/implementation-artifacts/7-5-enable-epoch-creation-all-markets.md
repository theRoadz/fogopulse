# Story 7.5: Enable Epoch Creation for All Markets

Status: todo
Created: 2026-03-17
Epic: 7 - Platform Polish & UX
Sprint: Backlog

## Overview

Epoch creation is currently restricted to BTC only (`asset !== 'BTC'` guard on the Create New Epoch button). This was done intentionally so testing could focus on BTC first. This story removes that restriction to enable ETH, SOL, and FOGO markets.

**FRs Covered:** FR1 (multi-asset support)
**Dependencies:** None — BTC market testing must be complete first

## Story

As a trader,
I want to create new epochs on ETH, SOL, and FOGO markets,
so that I can trade all supported assets.

## Acceptance Criteria

1. **Given** I am on any market (BTC, ETH, SOL, FOGO), **When** no active epoch exists, **Then** the "Create New Epoch" button is enabled (if wallet connected)
2. **Given** epoch creation succeeds on a non-BTC market, **When** the epoch is created, **Then** trading works the same as BTC

## Tasks / Subtasks

- [ ] Task 1: Remove BTC-only guard from epoch creation button
  - [ ] 1.1: In `web/src/components/trading/epoch-status-display.tsx` (~line 188), remove `|| asset !== 'BTC'` from the `disabled` prop
  - [ ] 1.2: Verify button is enabled for all 4 markets when wallet connected and no epoch active
- [ ] Task 2: Smoke test all markets
  - [ ] 2.1: Create epoch on ETH, verify trading flow works
  - [ ] 2.2: Create epoch on SOL, verify trading flow works
  - [ ] 2.3: Create epoch on FOGO, verify trading flow works
- [ ] Task 3: Run full test suite, confirm no regressions

## Dev Notes

### The Change

Single line in `web/src/components/trading/epoch-status-display.tsx`:

```tsx
// Current (restricted):
disabled={!connected || isCreating || asset !== 'BTC'}

// Target (all markets):
disabled={!connected || isCreating}
```

### File List

**Files to modify:**
- `web/src/components/trading/epoch-status-display.tsx` — Remove `asset !== 'BTC'` from disabled condition
