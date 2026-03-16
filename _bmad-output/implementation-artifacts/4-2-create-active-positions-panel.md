# Story 4.2: Create Active Positions Panel

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want to see my open positions,
so that I can monitor my current exposure and take action (sell or claim) without navigating away from the trading view.

## Acceptance Criteria

1. **Given** I have a position in the active epoch for the selected asset, **When** I view the trade ticket area, **Then** a "Your Position" card is displayed showing direction (UP/DOWN with icon), entry amount (USDC), shares held, and entry price.
2. **Given** I have a position and the epoch is in Open state, **When** I view the position card, **Then** a "Sell" button is available that triggers the sell_position flow (using existing `useSellPosition` hook).
3. **Given** I have a position and the epoch has settled (won), **When** I view the position card, **Then** a "Claim Payout" button is shown with the calculated payout amount (using existing `useClaimableAmount` logic).
4. **Given** I have a position and the epoch was refunded, **When** I view the position card, **Then** a "Claim Refund" button is shown (using existing `useClaimPosition` hook).
5. **Given** I have a position that has been fully claimed or fully sold, **When** I view the position card, **Then** the card shows "Claimed" or "Sold" status with a muted/gray appearance and no action buttons.
6. **Given** I do NOT have a position in the current epoch, **When** I view the trade ticket area, **Then** no position card is shown (the area is clean).
7. **Given** I have positions across multiple assets, **When** I switch asset tabs, **Then** the position card updates to show the position for the newly selected asset's active epoch.
8. **Given** the epoch transitions from Open to Frozen to Settled, **When** the state changes, **Then** the position card updates in real-time to reflect the new state and available actions.
9. **Given** I successfully sell or claim a position, **When** the transaction confirms, **Then** the position card updates immediately (via query invalidation) to reflect the new state.
10. **Given** FR15 (view open positions in current epochs), **When** all acceptance criteria are met, **Then** the functional requirement is satisfied.

## Tasks / Subtasks

- [x] Task 1: Create `YourPosition` component (AC: #1, #6, #7, #8)
  - [x] 1.1: Create `web/src/components/trading/your-position.tsx`
  - [x] 1.2: Props: `{ asset: Asset, className?: string }`
  - [x] 1.3: Use `useEpoch(asset)` to get current active epoch PDA
  - [x] 1.4: Use `useUserPosition(epochPda)` to fetch position data — hook gets wallet publicKey internally via `useWallet()`, do NOT pass publicKey as param
  - [x] 1.5: Use `useWallet()` to check wallet connection — render nothing if not connected
  - [x] 1.6: Render nothing if no active epoch or no position exists (AC #6)
  - [x] 1.7: Display position info in a shadcn `Card`: direction with colored icon (▲ green / ▼ red), entry amount (formatted USDC), shares count, entry price
  - [x] 1.8: Direction parsing handled internally by `useUserPosition` hook (position.direction is already 'up' | 'down')

- [x] Task 2: Add position action buttons based on state (AC: #2, #3, #4, #5)
  - [x] 2.1: Import and use `useClaimableAmount()` to determine position state (`ClaimState`)
  - [x] 2.2: **Open epoch + unclaimed position** → Show "Sell Position" button (uses `useSellPosition` hook)
  - [x] 2.3: **Settled epoch + winner** → Show "Claim Payout" button with payout amount (uses `useClaimPosition` hook with `type: 'payout'`, params: `{ asset, type: 'payout', epochPda, userPubkey, displayAmount }`)
  - [x] 2.4: **Refunded epoch** → Show "Claim Refund" button (uses `useClaimPosition` hook with `type: 'refund'`, params: `{ asset, type: 'refund', epochPda, userPubkey, displayAmount }`)
  - [x] 2.5: **Claimed or fully sold** → Show muted "Claimed" / "Sold" badge, no action buttons
  - [x] 2.6: **Lost** → Show muted "Lost" text, no action buttons
  - [x] 2.7: Disable action button and show spinner while transaction is pending (`isPending` from mutation hooks)

- [x] Task 3: Implement sell flow within position card (AC: #2, #9)
  - [x] 3.1: Add sell confirmation using shadcn `Dialog` component (NOT AlertDialog/Popover — those don't exist in the project): "Sell all X shares?" with estimated return preview
  - [x] 3.2: Calculate estimated return using CPMM inverse: `shares * sameReserves / oppositeReserves` minus fees (1.8%)
  - [x] 3.3: Use pool reserves from `usePool(asset)` hook for calculation
  - [x] 3.4: On confirm → call `sellMutation.mutateAsync({ asset, epochPda, shares: position.shares, userPubkey, isFullExit: true })` (full exit — `isFullExit` param is required by the hook)
  - [x] 3.5: Handle success/error via existing hook toast notifications — no additional toasts needed

- [x] Task 4: Integrate into trade ticket area (AC: #1, #7)
  - [x] 4.1: Add `<YourPosition asset={asset} />` to `trade-ticket-area.tsx` — place BETWEEN `PoolStateDisplay` and `TradeTicket`
  - [x] 4.2: Ensure component is wrapped in wallet connection check (render nothing if no wallet)
  - [x] 4.3: Verify asset tab switching correctly re-renders with new asset's position data

- [x] Task 5: Handle epoch state transitions (AC: #8, #9)
  - [x] 5.1: Position card must react to epoch state changes (Open → Frozen → Settled) — this happens automatically via TanStack Query polling on epoch data
  - [x] 5.2: When epoch settles, `useClaimableAmount` re-evaluates → buttons update automatically
  - [x] 5.3: When user claims/sells, query invalidation triggers re-fetch → card updates
  - [x] 5.4: Handle edge case: epoch advances (new epoch starts) — previous position card should disappear or show settlement state for old epoch while new epoch shows no position

- [x] Task 6: Style and polish (AC: #1, #5)
  - [x] 6.1: Use shadcn `Card`, `CardHeader`, `CardContent` — match existing card patterns (e.g., `PoolStateDisplay`)
  - [x] 6.2: Direction indicator: `▲ UP` in `text-green-500` or `▼ DOWN` in `text-red-500` (matches existing direction button colors)
  - [x] 6.3: Status badges for claimed/sold/lost states — use shadcn `Badge` component with `variant="secondary"` for muted appearance
  - [x] 6.4: Compact design — this sits in the 30% right column, space is limited
  - [x] 6.5: Responsive: on mobile (below 768px), card should stack naturally in the column layout

- [x] Task 7: Write component tests (AC: #1-#9)
  - [x] 7.1: Create `web/src/components/trading/your-position.test.tsx`
  - [x] 7.2: Test: renders nothing when wallet not connected
  - [x] 7.3: Test: renders nothing when no position exists
  - [x] 7.4: Test: renders position card with correct direction, amount, shares
  - [x] 7.5: Test: shows "Sell Position" button when epoch is open
  - [x] 7.6: Test: shows "Claim Payout" button when position won
  - [x] 7.7: Test: shows muted "Claimed" badge when already claimed

## Dev Notes

### Architecture Patterns & Constraints

**This is a FRONTEND-ONLY story — no on-chain changes required.**

All position data fetching, sell transactions, and claim transactions are already implemented in existing hooks. This story composes those existing hooks into a new UI component and integrates it into the trading layout.

**Component Placement Decision:**
The `YourPosition` card goes in `trade-ticket-area.tsx` BETWEEN `PoolStateDisplay` and `TradeTicket`. This keeps it visible alongside the trade controls without cluttering the chart area. The UX spec shows "Your Position" inside the trade ticket area in the right column.

**Current Layout Structure (for reference):**
```
TradeTicketArea (trade-ticket-area.tsx)
  ├── PoolStateDisplay    ← Pool reserves, probabilities
  ├── YourPosition        ← NEW: Active position card
  └── TradeTicket         ← Direction buttons, amount input, preview
```

**State Management — NO new stores needed:**
- Position data: `useUserPosition()` hook (TanStack Query) — already exists
- Claim state: `useClaimableAmount()` hook — already exists
- Sell action: `useSellPosition()` hook — already exists (Story 4.1)
- Claim action: `useClaimPosition()` hook — already exists
- Pool data (for sell preview): `usePool()` hook — already exists

**Epoch PDA Resolution Chain:**
```typescript
const { epochState } = useEpoch(asset);   // Returns { epoch, timeRemaining, isFrozen, ... }
// epochPda is derived internally by useEpoch from pool.activeEpoch
// useUserPosition takes epochPda and gets wallet publicKey internally via useWallet()
const { position } = useUserPosition(epochPda); // Single param — NO publicKey param
```
NOTE: `useUserPosition(epochPda: PublicKey | null)` — takes ONLY epochPda, gets wallet key internally. Do NOT pass publicKey as second argument.

**CPMM Sell Preview Calculation (for estimated return display):**
```typescript
// Inverse CPMM formula (matches on-chain calculate_refund)
const grossRefund = (shares * sameReserves) / oppositeReserves;
const totalFees = Math.ceil(grossRefund * TRADING_FEE_BPS / 10000);
const netReturn = grossRefund - totalFees;

// Where same/opposite determined by direction:
// UP position: same = yesReserves, opposite = noReserves
// DOWN position: same = noReserves, opposite = yesReserves
```
Use BigInt arithmetic to match on-chain precision. Reference `calculatePayout()` in `use-claimable-amount.ts` for the established BigInt pattern.

**Sell Flow UX:**
The sell button should NOT immediately execute. Show a confirmation popover/dialog first:
- "Sell all [X] shares?"
- "Estimated return: ~[Y] USDC (after 1.8% fee)"
- [Cancel] [Confirm Sell]

This prevents accidental sells. Use shadcn `Dialog` component (`web/src/components/ui/dialog.tsx` — already exists). Do NOT use `AlertDialog` or `Popover` — they are NOT installed in this project.

**Query Invalidation — already handled:**
The `useSellPosition` and `useClaimPosition` hooks already invalidate the correct query keys. After a successful sell/claim, the position card will auto-update via TanStack Query refetch. No additional invalidation logic needed in this component.

**Edge Case: Epoch Advance (new epoch starts while viewing old position):**
When `advance_epoch` runs (via crank bot or manually), the pool's `active_epoch` changes. The `useEpoch(asset)` hook fetches the active epoch, so the position card will show "no position" for the new epoch. The old epoch's position remains fetchable but the card currently only shows the active epoch's position. This is acceptable for Story 4.2 — Story 4.4 (Multi-Asset Position View) will add cross-epoch position tracking later.

**Existing Hook Exports (verify before importing):**
Some hooks are NOT exported from `hooks/index.ts`:
- `use-user-position.ts` — import directly: `import { useUserPosition, parseDirection } from '@/hooks/use-user-position'`
- `use-sell-position.ts` — import directly: `import { useSellPosition } from '@/hooks/use-sell-position'`
- `use-claim-position.ts` — import directly: `import { useClaimPosition } from '@/hooks/use-claim-position'`
- `use-claimable-amount.ts` — import directly: `import { useClaimableAmount, calculatePayout, formatUsdcAmount } from '@/hooks/use-claimable-amount'`

Do NOT add barrel exports to `hooks/index.ts` unless explicitly asked — avoid scope creep.

### Project Structure Notes

- New component: `web/src/components/trading/your-position.tsx` — follows existing kebab-case naming in `components/trading/`
- New test: `web/src/components/trading/your-position.test.tsx` — co-located with component
- Modified: `web/src/components/trading/trade-ticket-area.tsx` — add YourPosition import and render
- No new hooks, stores, types, or utilities needed — everything is already built

### Existing Code to Reuse (DO NOT DUPLICATE)

**Hooks (already implemented):**
- `useUserPosition(epochPda: PublicKey | null)` from `hooks/use-user-position.ts` — returns `{ position: UserPositionData | null, isLoading, error, refetch }`. Gets wallet publicKey internally via useWallet(), do NOT pass it as param
- `useSellPosition()` from `hooks/use-sell-position.ts` — mutation for sell_position tx
- `useClaimPosition()` from `hooks/use-claim-position.ts` — mutation for claim_payout/claim_refund tx
- `useClaimableAmount(epoch: EpochData | null, position: UserPositionData | null)` from `hooks/use-claimable-amount.ts` — returns `{ claimState: ClaimState, displayAmount: string | null }`. Takes epoch FIRST, position SECOND (no pool param)
- `useEpoch(asset)` from `hooks/use-epoch.ts` — returns active epoch data + PDA
- `usePool(asset)` from `hooks/use-pool.ts` — returns pool reserves for sell preview
- `useWallet()` from `@solana/wallet-adapter-react` — wallet connection state

**Utilities:**
- `parseDirection(directionObj)` from `hooks/use-user-position.ts` — converts IDL direction enum to `'up' | 'down'`
- `calculatePayout(position, epoch, pool)` from `hooks/use-claimable-amount.ts` — payout calculation with BigInt
- `formatUsdcAmount(lamports)` from `hooks/use-claimable-amount.ts` — formats USDC from lamports to display string
- `TRADING_FEE_BPS` from `lib/constants.ts` — 180 (1.8%)

**UI Components (from shadcn/ui):**
- `Card`, `CardHeader`, `CardTitle`, `CardContent` — card container
- `Button` — action buttons (sell, claim)
- `Badge` — status indicators (claimed, sold, lost)
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` — sell confirmation dialog (AlertDialog and Popover are NOT installed)
- `Loader2` from `lucide-react` — spinner for pending state

**Styling Patterns (match existing):**
- `settlement-status-panel.tsx` — card layout with sections and badges
- `trade-ticket.tsx` — compact card in right column
- Direction colors: `text-green-500` for UP, `text-red-500` for DOWN (from `direction-buttons.tsx`)

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 4, Story 4.2]
- [Source: _bmad-output/planning-artifacts/prd.md - FR15 (view open positions in current epochs)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md - "Your Position" card in trade ticket area, position card component specs, position states]
- [Source: _bmad-output/planning-artifacts/architecture.md - UserPosition account structure, TanStack Query patterns, WebSocket subscriptions]
- [Source: _bmad-output/project-context.md - Naming conventions, component patterns, query key patterns]
- [Source: web/src/hooks/use-user-position.ts - Position data hook, UserPositionData interface, parseDirection utility]
- [Source: web/src/hooks/use-sell-position.ts - Sell mutation hook (Story 4.1)]
- [Source: web/src/hooks/use-claim-position.ts - Claim mutation hook]
- [Source: web/src/hooks/use-claimable-amount.ts - ClaimState type, calculatePayout, formatUsdcAmount]
- [Source: web/src/hooks/use-user-positions-batch.ts - Batch position fetching (for future Story 4.4)]
- [Source: web/src/components/trading/trade-ticket-area.tsx - Integration target]
- [Source: web/src/components/trading/settlement-status-panel.tsx - Card layout and badge patterns]
- [Source: web/src/components/trading/settlement-history-row.tsx - PositionResult rendering pattern]
- [Source: web/src/stores/trade-store.ts - Trade UI state (not needed for positions)]
- [Source: web/src/stores/ui-store.ts - Active asset state]
- [Source: web/src/lib/constants.ts - QUERY_KEYS, TRADING_FEE_BPS, ASSET_METADATA]
- [Source: _bmad-output/implementation-artifacts/4-1-implement-sell-position-instruction.md - Previous story intelligence]

### Previous Story Intelligence (Story 4.1)

- Story 4.1 implemented `sell_position` instruction (on-chain + frontend) — the `useSellPosition` hook and `buildSellPositionInstruction` are ready to use
- Query invalidation pattern: sell hook invalidates BOTH `['position']` and `['positions']` to cover all position caches (known inconsistency)
- Wallet rejection → `toast.info` (not error) — established pattern in `use-claim-position.ts`, reused in `use-sell-position.ts`
- `parseDirection` exported from `use-user-position.ts` for shared use
- Code review found sell errors need to be in `isRecoverableError` — already fixed in Story 4.1
- Commit messages follow: `feat(Story X.Y): description with code review fixes`
- Pre-existing test failures (5 suites, 18 tests) exist on master — don't attempt to fix unrelated test failures

### Git Intelligence

Recent commits:
- `1e5a24c` feat(Story 4.1): Implement sell_position instruction with code review fixes
- `393638a` feat(Story 7.2): Implement community feedback tracker with code review fixes
- `d63aec6` feat(Story 3.9): Implement settlement history display with code review fixes
- `ff4e1ca` docs: Add story document sync rule to project context
- `e9edafe` feat(Story 7.1): Implement USDC testnet faucet with code review fixes

Patterns established:
- Commit prefix: `feat(Story X.Y):` for story implementations
- Code review fixes included in same commit
- All UI components follow shadcn/ui patterns with Tailwind CSS
- Tests co-located with components
- React 19.2.1 + Next.js 16.0.10 + TanStack Query 5.89.0

### Latest Tech Notes

- shadcn/ui components: Check shadcn MCP for `AlertDialog`, `Popover`, `Badge` implementations before coding
- TanStack Query 5.89.0: `useMutation` returns `{ mutateAsync, isPending }` (NOT `isLoading` — renamed in v5)
- React 19: `use()` hook available but NOT used in codebase — stick with existing patterns
- Anchor IDL: sell_position instruction already in `web/src/lib/fogopulse.json` (deployed in Story 4.1)
- Position data uses BigInt internally (shares, amount, entryPrice are `bigint` after BN conversion)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed 2 TypeScript strict null check errors in `your-position.tsx` (position possibly null in inner functions)

### Completion Notes List

- Created `YourPosition` component composing 6 existing hooks (useEpoch, usePool, useUserPosition, useClaimableAmount, useSellPosition, useClaimPosition)
- Component conditionally renders based on wallet connection and position existence (AC #6)
- Displays direction (UP/DOWN with colored indicators), entry amount (USDC), shares count, and average entry price (AC #1)
- Implements full state machine for action buttons: Sell (open epoch), Claim Payout (winner), Claim Refund (refunded), Claimed badge, Sold badge, Lost text (AC #2-#5)
- Sell flow includes confirmation Dialog with CPMM-based estimated return preview including 1.8% fee calculation using BigInt arithmetic (AC #2, #9)
- Integrated between PoolStateDisplay and TradeTicket in trade-ticket-area.tsx (AC #1, #7)
- Real-time updates via TanStack Query polling and query invalidation from existing hooks (AC #8, #9)
- Epoch advance handled: active epoch changes → position card shows "no position" for new epoch (AC #8)
- 15 unit tests covering all rendering conditions, position display, action buttons, sell flow, epoch state handling, and epochPda derivation
- All tests pass; no regressions (5 pre-existing failing suites unchanged)

### Change Log

- 2026-03-16: Implemented Story 4.2 — Created YourPosition component with position display, state-dependent actions (sell/claim/refund), sell confirmation dialog with CPMM preview, and integration into trade ticket area. 13 tests added.
- 2026-03-16: Code review fixes — Added missing entry price display (AC #1), removed unused parseDirection import, simplified epochPda derivation (removed IIFE), added try/catch to handleSellConfirm, added 2 new tests (epochPda derivation, frozen epoch state). 15 tests total.

### File List

- `web/src/components/trading/your-position.tsx` — NEW: Active position card component
- `web/src/components/trading/your-position.test.tsx` — NEW: 15 unit tests for YourPosition
- `web/src/components/trading/trade-ticket-area.tsx` — MODIFIED: Added YourPosition between PoolStateDisplay and TradeTicket
