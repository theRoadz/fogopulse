# Story 3.9: Display Settlement History

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want to see past epoch outcomes,
so that I can review historical performance and make informed trading decisions.

## Acceptance Criteria

1. **Given** the trading interface, **When** I view the epoch history section, **Then** recent epochs are listed with their outcomes.
2. **Given** the settlement history list, **When** I view an entry, **Then** each entry shows: epoch ID, start price, settlement price, outcome (UP WON / DOWN WON / REFUNDED).
3. **Given** many past epochs, **When** I view the history, **Then** the list is scrollable for many epochs (virtual scroll or paginated loading).
4. **Given** I click/expand an epoch in the history, **When** it expands, **Then** full settlement details are shown (confidence values, publish times, price delta, verification links).
5. **Given** I am connected with a wallet, **When** I view the history, **Then** my positions in each epoch are indicated (direction, amount, payout/loss, claimed status).
6. **Given** I am NOT connected with a wallet, **When** I view the history, **Then** settlement data is still visible but position indicators are hidden.
7. **Given** the history is loading, **When** the component mounts, **Then** skeleton placeholders are shown while data loads.
8. **Given** no settled epochs exist, **When** I view the history, **Then** an empty state message is shown: "No settlement history yet".
9. **Given** the history section, **When** FR27 (view epoch history with outcomes) is evaluated, **Then** all requirements are satisfied.

## Tasks / Subtasks

- [x] Task 1: Create `useSettlementHistory` hook for fetching multiple settled epochs (AC: #1, #3, #7, #8)
  - [x] 1.1: Create `web/src/hooks/use-settlement-history.ts`
  - [x] 1.2: Accept `asset: Asset` and `limit?: number` (default 20) parameters
  - [x] 1.3: Use pool's `nextEpochId` to walk backwards through epoch accounts
  - [x] 1.4: Extract `tryFetchSettledEpoch` from `use-last-settled-epoch.ts` into a shared utility `web/src/lib/epoch-utils.ts` so both hooks reuse the same parsing logic (follows Story 3.8 pattern where duplicate parsers were extracted to shared exports)
  - [x] 1.5: Return array of `LastSettledEpochData` objects (reuse the existing type from `use-last-settled-epoch.ts` — it already has all required fields: epochId, epochPda, state, outcome, startPrice, settlementPrice, priceDelta, priceDeltaPercent, startPublishTime, settlementPublishTime, confidence values, yesTotalAtSettlement, noTotalAtSettlement, rawEpochData). DO NOT invent a new type — `LastSettledEpochData` is already accepted by `SettlementStatusPanel`'s `settlementData` prop.
  - [x] 1.6: Fetch in batches — load initial batch of settled epochs, allow "load more" via returned `fetchMore` callback
  - [x] 1.7: Use TanStack Query with `queryKey: ['settlementHistory', asset]` — add to QUERY_KEYS in constants.ts
  - [x] 1.8: Handle case where epochs are Open/Frozen (skip them, keep searching backward)
  - [x] 1.9: Stop searching when epoch account doesn't exist (reached beginning)
  - [x] 1.10: Write tests for the hook (including empty history, mixed states, pagination)

- [x] Task 2: Create `useUserPositions` batch hook for fetching user positions across multiple epochs (AC: #5, #6)
  - [x] 2.1: Create `web/src/hooks/use-user-positions-batch.ts`
  - [x] 2.2: Accept `epochPdas: PublicKey[]` and `userPubkey: PublicKey | null`
  - [x] 2.3: For each epoch PDA, derive position PDA using `derivePositionPda(epochPda, userPubkey)` — return `Map<string, UserPositionData>` keyed by epoch PDA string
  - [x] 2.4: Use `Promise.allSettled` with individual `(program.account as any).userPosition.fetch(pda)` calls for batch fetching. This follows the existing codebase pattern (no `getMultipleAccountsInfo` or `coder.accounts.decode` usage exists). Rejected promises = no position (return null for that epoch).
  - [x] 2.5: Return null for missing positions (user didn't trade in that epoch)
  - [x] 2.5a: Parse direction from Anchor enum format `{ up: {} }` / `{ down: {} }` using same `parseDirection()` logic as `use-user-position.ts` — extract to shared utility or inline
  - [x] 2.6: Disable query when `userPubkey` is null (not connected)
  - [x] 2.7: Write tests

- [x] Task 3: Create `SettlementHistoryRow` component (AC: #1, #2, #4, #5)
  - [x] 3.1: Create `web/src/components/trading/settlement-history-row.tsx`
  - [x] 3.2: Compact row showing: Epoch #ID, outcome badge (reuse `OutcomeBadge`), start price, settlement price, price delta, timestamp
  - [x] 3.3: If user position exists: show direction badge (UP/DOWN), amount staked, payout result (won X / lost / refunded / claimed)
  - [x] 3.4: Expandable — clicking row reveals full `SettlementStatusPanel` with all details. Pass the `LastSettledEpochData` entry directly as the `settlementData` prop (compatible type) and pass `asset` for ClaimButton support.
  - [x] 3.5: Use `Collapsible` component for expand/collapse behavior
  - [x] 3.6: Add `data-testid` attributes for testability
  - [x] 3.7: Write tests for all visual states

- [x] Task 4: Create `SettlementHistoryList` component (AC: #1, #3, #7, #8)
  - [x] 4.1: Create `web/src/components/trading/settlement-history-list.tsx`
  - [x] 4.2: Render list of `SettlementHistoryRow` components inside `ScrollArea`
  - [x] 4.3: Set max height (~400px) with vertical scroll for overflow
  - [x] 4.4: Show skeleton loading state (3-5 skeleton rows) while history is loading
  - [x] 4.5: Show empty state: "No settlement history yet" with muted text when no settled epochs
  - [x] 4.6: Show "Load more" button at bottom when more epochs are available
  - [x] 4.7: Column headers: Epoch, Outcome, Start Price, End Price, Change, Time (optional: Your Position)
  - [x] 4.8: Add `data-testid="settlement-history-list"` for testability
  - [x] 4.9: Write tests (loading, empty, populated, load-more states)

- [x] Task 5: Move settlement history to dedicated `/history` page (AC: #1, #9)
  - [x] 5.1: ~~Add `SettlementHistoryList` to `epoch-status-display.tsx` as a new collapsible section~~ — **Revised**: Removed from trading page to avoid pushing chart down when expanded. Settlement history is now on a dedicated `/history` page.
  - [x] 5.2: Created `web/src/app/history/page.tsx` — page route following faucet pattern
  - [x] 5.3: Created `web/src/components/history/history-feature.tsx` — page-level component with `AssetTabs` asset selector and `SettlementHistoryList`
  - [x] 5.4: Added `{ label: 'History', path: '/history' }` nav link in `web/src/app/layout.tsx`
  - [x] 5.5: Removed all Settlement History collapsible sections from `epoch-status-display.tsx` (removed `isHistoryOpen` state, `History` icon import, `SettlementHistoryList` import, and three `<Collapsible>` blocks). `LastSettlementSection` retained — it's small and contextually relevant.
  - [x] 5.6: The history list includes ALL settled epochs (including the one shown in LastSettlementSection on the trading page). This is intentional — LastSettlement for quick-glance on trading page, `/history` for full browsing.

- [x] Task 6: Add QUERY_KEYS entry and update barrel exports (AC: #1)
  - [x] 6.1: Add `settlementHistory: (asset: Asset) => ['settlementHistory', asset] as const` to QUERY_KEYS in `web/src/lib/constants.ts`
  - [x] 6.2: Add new hooks to barrel export in `web/src/hooks/index.ts`: `use-settlement-history`, `use-user-positions-batch`. Note: `use-user-position`, `use-claimable-amount`, `use-claim-position` from Story 3.8 are NOT in the barrel export — import those via direct paths (e.g., `@/hooks/use-user-position`).

## Dev Notes

### Architecture Patterns & Constraints

**Epoch Account Iteration Pattern (CRITICAL):**
The on-chain program uses sequential epoch IDs per pool (0, 1, 2, ...). To build a settlement history:
1. Get `pool.nextEpochId` from the pool account (already available via `usePool`)
2. Walk backwards: `nextEpochId - 1`, `nextEpochId - 2`, etc.
3. For each ID, derive the epoch PDA using `deriveEpochPda(poolPda, epochId)` from `web/src/lib/pda.ts`
4. Fetch the epoch account and check its state
5. Include only `Settled` or `Refunded` epochs in history
6. Skip `Open`/`Frozen`/`Settling` epochs (they haven't resolved yet)
7. Stop when epoch account fetch fails (reached epoch 0 or doesn't exist)

**IMPORTANT:** The active epoch (Open/Frozen state) is typically at `nextEpochId - 1`. The last settled epoch is at `nextEpochId - 2` (when there's an active epoch) or `nextEpochId - 1` (when there's no active epoch). The history hook must handle both cases.

**Batch Position Fetching:**
Use `Promise.allSettled` with individual Anchor `.fetch()` calls — this is the established codebase pattern. The codebase does NOT use `getMultipleAccountsInfo` or `program.coder.accounts.decode` anywhere, so don't introduce those unproven patterns.

```typescript
// Derive all position PDAs
const positionPdas = epochPdas.map(epochPda =>
  derivePositionPda(epochPda, userPubkey)
)

// Batch fetch using Promise.allSettled (follows existing codebase pattern)
const results = await Promise.allSettled(
  positionPdas.map(pda =>
    (program.account as any).userPosition.fetch(pda)
  )
)

// Map results: fulfilled = position exists, rejected = no position (null)
const positions = new Map<string, UserPositionData>()
results.forEach((result, i) => {
  if (result.status === 'fulfilled') {
    const acct = result.value
    positions.set(epochPdas[i].toBase58(), {
      user: acct.user,
      epoch: acct.epoch,
      direction: parseDirection(acct.direction), // { up: {} } → 'Up'
      amount: BigInt(acct.amount.toString()),
      shares: BigInt(acct.shares.toString()),
      entryPrice: BigInt(acct.entryPrice.toString()),
      claimed: acct.claimed,
      bump: acct.bump,
    })
  }
  // rejected = account doesn't exist = user has no position in that epoch
})
```

**Direction Enum Parsing (from Anchor format):**
Position direction comes from Anchor as `{ up: {} }` or `{ down: {} }`. Reuse the same `parseDirection()` pattern from `use-user-position.ts`:
```typescript
function parseDirection(direction: unknown): 'Up' | 'Down' {
  if (direction && typeof direction === 'object' && 'up' in direction) return 'Up'
  return 'Down'
}
```

**Type Compatibility with SettlementStatusPanel (CRITICAL):**
`SettlementStatusPanel` accepts a `settlementData` prop typed as `SettlementData | null`, which is a union of `SettlementDisplayData | LastSettledEpochData`. The history hook MUST return `LastSettledEpochData[]` so each entry can be passed directly to `SettlementStatusPanel` in expanded rows without any type transformation. The `LastSettledEpochData` interface (from `use-last-settled-epoch.ts`) already contains all fields needed for display: epochId, epochPda, state, outcome, prices, confidence, publish times, deltas, settlement totals, and rawEpochData.

**Extract Shared Epoch-Fetching Logic (CRITICAL — avoid duplication):**
`use-last-settled-epoch.ts` contains `tryFetchSettledEpoch()` — the exact logic needed to fetch and parse a settled epoch. Extract this function (and the local `deriveEpochPda`) into `web/src/lib/epoch-utils.ts` so both `useLastSettledEpoch` and `useSettlementHistory` reuse the same code. Then refactor `use-last-settled-epoch.ts` to import from the shared module. This follows the Story 3.8 code review pattern where duplicate `parseEpochState`/`parseOutcome` were extracted to shared exports.

**UserPositionData Interface (from `use-user-position.ts`):**
```typescript
interface UserPositionData {
  user: PublicKey
  epoch: PublicKey
  direction: 'Up' | 'Down'
  amount: bigint      // Staked amount in USDC lamports (6 decimals)
  shares: bigint      // Pool shares
  entryPrice: bigint  // Entry price (scaled u64)
  claimed: boolean    // Whether payout/refund has been claimed
  bump: number
}
```

**Reusable Components from Previous Stories (DO NOT DUPLICATE):**
- `OutcomeBadge` from `web/src/components/trading/outcome-badge.tsx` — Props: `{ outcome: Outcome, priceDeltaText?: string, className?: string }`. Shows "UP WON" / "DOWN WON" / "REFUNDED" badges
- `SettlementStatusPanel` from `web/src/components/trading/settlement-status-panel.tsx` — full settlement details. Props: `{ asset?: Asset, settlementData?: LastSettledEpochData | SettlementDisplayData | null, title?: string, className?: string }`. Pass `asset` for ClaimButton support.
- `VerificationLinks` from `web/src/components/trading/verification-links.tsx` — explorer links
- `ConfidenceBandChart` from `web/src/components/trading/confidence-band-chart.tsx` — confidence visualization
- `RefundExplanation` from `web/src/components/trading/refund-explanation.tsx` — refund details
- `ClaimButton` from `web/src/components/trading/claim-button.tsx` — claim payout/refund

**Existing Hooks to Reuse (DO NOT DUPLICATE):**
- `usePool(asset)` — pool data including `nextEpochId` (starting point for history iteration)
- `useWalletConnection()` — wallet state (publicKey, connected) for position display
- `useUserPosition(epochPda)` — single epoch position (reference pattern, but use batch for history)
- `useClaimableAmount(epochData, position)` — calculate payout amount for position display
- `useLastSettledEpoch(asset)` — the most recently settled epoch (already displayed in `LastSettlementSection`). The history list will overlap with this (showing the same epoch in the list). This is intentional — keep both: LastSettlement for quick-glance, history for full browsing.

**Existing Utilities to Reuse (DO NOT DUPLICATE):**
- `deriveEpochPda(poolPda, epochId)` from `web/src/lib/pda.ts`
- `derivePositionPda(epochPda, userPubkey)` from `web/src/lib/pda.ts`
- `scalePrice(price)` from `web/src/lib/utils.ts` for displaying prices
- `formatUsdPrice(price)` from `web/src/lib/utils.ts` for USD formatting
- `formatSettlementTime(timestamp)` from `web/src/lib/utils.ts` for time display
- `formatConfidencePercent(confidence, price)` from `web/src/lib/utils.ts`
- `parseEpochState(state)` and `parseOutcome(outcome)` from `web/src/types/epoch.ts`
- `cn()` from `web/src/lib/utils.ts` for className merging

**shadcn/ui Components Available:**
- `ScrollArea` — for scrollable history list (already installed)
- `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell` — for structured list (already installed)
- `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` — for expandable rows (already installed)
- `Badge` — for outcome/direction badges (already installed)
- `Skeleton` — for loading states (already installed)
- `Button` — for load more (already installed)

**Position Display States:**
| Position State | Display |
|---|---|
| Winner (unclaimed) | Green "Won X.XX USDC" |
| Winner (claimed) | Muted "Claimed X.XX USDC" with check |
| Loser | Red "Lost" text |
| Refunded (unclaimed) | Amber "Refund: X.XX USDC" |
| Refunded (claimed) | Muted "Refunded X.XX USDC" with check |
| No position | No position indicator shown |
| Wallet not connected | Position column hidden entirely |

**Payout Calculation — Reuse `useClaimableAmount` hook (DO NOT DUPLICATE):**
Import `useClaimableAmount` from `@/hooks/use-claimable-amount` (not in barrel export — use direct path). It accepts `(epochData: EpochData, position: UserPositionData)` and returns `{ claimState, claimableAmount }` where `claimState` is one of: `'winner'`, `'refund'`, `'claimed'`, `'lost'`, `'no-position'`, `'not-settled'`. Use this for position display in each history row. Display USDC amounts as: `Number(amount) / 1_000_000` with 2 decimal places.

**Performance Considerations:**
- Initial load should fetch ~10-20 settled epochs maximum
- Use `staleTime: 30000` (30s) for history data — it changes much less frequently than active epoch
- "Load more" fetches next batch of 10-20 epochs
- Position batch fetch should be a separate query that depends on epoch history data (sequential, not parallel)
- Set `refetchOnWindowFocus: false` explicitly — historical settlement data is immutable once settled

**Read-Only Anchor Program Pattern (follow existing hooks):**
```typescript
const program = useMemo(() => {
  const dummyProvider = new AnchorProvider(
    sharedConnection,
    {
      publicKey: PublicKey.default,
      signTransaction: async () => { throw new Error('Read-only provider') },
      signAllTransactions: async () => { throw new Error('Read-only provider') },
    },
    { commitment: 'confirmed' }
  )
  return new Program(idl as any, dummyProvider)
}, [sharedConnection])
```

### Integration Point

**Post-implementation revision:** Settlement history was initially integrated as a collapsible section within `epoch-status-display.tsx`. During review, this was found to push the price chart down when expanded — bad UX. Settlement history was moved to a dedicated `/history` page accessible from the nav bar. The trading page retains only the `LastSettlementSection` collapsible (small, contextually relevant).

Current layout:
- **Trading page (`/trade`):** Active epoch info + Last Settlement collapsible (unchanged)
- **History page (`/history`):** `AssetTabs` asset selector + full `SettlementHistoryList` with scrollable history and pagination

### Project Structure Notes

- New files go in established locations:
  - Hooks: `web/src/hooks/use-settlement-history.ts`, `web/src/hooks/use-user-positions-batch.ts`
  - Components: `web/src/components/trading/settlement-history-row.tsx`, `web/src/components/trading/settlement-history-list.tsx`
  - Tests: Co-located (e.g., `settlement-history-list.test.tsx` next to `settlement-history-list.tsx`)
- Follow kebab-case for files, PascalCase for components, camelCase for hooks
- Use `'use client'` directive for interactive components
- Use `cn()` utility for className merging
- Include `data-testid` attributes for testability

### UX Requirements

**Row Layout (Compact):**
```
| Epoch #42 | UP WON 🟢 | $84,521.30 → $84,892.10 | +0.44% | 5m ago | [Your: UP ✓ +12.50 USDC] |
| Epoch #41 | REFUNDED 🟡 | $84,312.00 → $84,315.20 | +0.00% | 10m ago | [Your: DOWN ↩ 25.00 USDC] |
| Epoch #40 | DOWN WON 🔴 | $84,890.50 → $84,521.30 | -0.43% | 15m ago | |
```

**Expanded Row:** Shows the full `SettlementStatusPanel` with confidence bands, verification links, and claim button (if applicable).

**Color Coding:**
- UP WON: Green accent (`text-up` / `#22c55e`)
- DOWN WON: Red accent (`text-down` / `#ef4444`)
- REFUNDED: Amber accent (`text-warning` / `#f59e0b`)
- User position won: Green text
- User position lost: Red muted text
- User position refunded: Amber text
- Claimed: Muted/dimmed with check icon

**Empty State:**
- "No settlement history yet" in muted text
- Centered in the scroll area

**Loading State:**
- 3-5 skeleton rows matching the row layout dimensions

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 3, Story 3.9]
- [Source: _bmad-output/planning-artifacts/prd.md - FR27 (view epoch history with outcomes)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md - PositionsTabs, HistoryRow components]
- [Source: _bmad-output/planning-artifacts/architecture.md - Component structure, positions/ directory]
- [Source: web/src/hooks/use-last-settled-epoch.ts - Epoch iteration and parsing pattern]
- [Source: web/src/hooks/use-epoch.ts - Anchor program setup and epoch data parsing]
- [Source: web/src/hooks/use-pool.ts - Pool data with nextEpochId]
- [Source: web/src/hooks/use-user-position.ts - Position fetching pattern]
- [Source: web/src/hooks/use-claimable-amount.ts - Payout calculation]
- [Source: web/src/lib/pda.ts - deriveEpochPda, derivePositionPda]
- [Source: web/src/lib/constants.ts - QUERY_KEYS, POOL_PDAS]
- [Source: web/src/lib/utils.ts - scalePrice, formatUsdPrice, formatSettlementTime]
- [Source: web/src/types/epoch.ts - EpochData, EpochState, Outcome types]
- [Source: web/src/components/trading/outcome-badge.tsx - Reusable outcome badge]
- [Source: web/src/components/trading/settlement-status-panel.tsx - Full settlement details]
- [Source: web/src/components/trading/epoch-status-display.tsx - Integration point]
- [Source: _bmad-output/implementation-artifacts/3-8-create-claim-payout-ui.md - Previous story patterns]

### Previous Story Intelligence (Story 3.8)

- Claim payout UI established the `useUserPosition`, `useClaimableAmount`, and `ClaimButton` patterns — reuse for expanded history rows
- `yesTotalAtSettlement` and `noTotalAtSettlement` were added to `EpochData` — required for payout calculations in history view
- `rawEpochData` was added to `LastSettledEpochData` to pass full epoch data to ClaimButton — same pattern needed for history
- Query key pattern: `['position']` for position data invalidation
- Wallet rejection is handled as info toast (not error) — consistent across all claim interactions
- Code review found duplicate utility issue — shared `parseEpochState`/`parseOutcome` now live in `types/epoch.ts` as exports
- `'use client'` directive: only add for interactive components (components with hooks, state, or event handlers)
- Pre-existing test failures (5 suites, 18 tests) exist on master — don't attempt to fix unrelated test failures

### Git Intelligence

- Recent commits follow pattern: `feat(Story X.Y): description with code review fixes`
- Story 3.6 created `SettlementStatusPanel` — the detailed view reused in expanded history rows
- Story 3.7 created `ConfidenceBandChart` — available for expanded history rows showing refunded epochs
- Story 3.8 created `ClaimButton` + `useUserPosition` + `useClaimableAmount` — available for expanded rows with unclaimed positions
- `LastSettlementSection` in `epoch-status-display.tsx` already shows the most recent settled epoch — history view extends this to show ALL settled epochs
- Browser-compatible BigInt handling is established throughout (no Node.js Buffer methods)

### Latest Tech Notes

- Using `@coral-xyz/anchor` 0.32.1 (frontend), `anchor-lang` 0.31.1 (on-chain)
- `@solana/web3.js` 1.98.4 — codebase uses individual `program.account.*.fetch()` calls, not batch methods
- `@tanstack/react-query` 5.89.0 — supports `placeholderData` for seamless pagination
- `shadcn/ui` components: Table, ScrollArea, Collapsible, Badge, Skeleton all installed and available
- `lucide-react` 0.544.0 for icons (ChevronDown, ChevronRight, History, ArrowUp, ArrowDown, Check, RefreshCw)
- React 19.2.1 + Next.js 16.0.10
- Tests use Jest 30.1.3 + `@testing-library/react` 16.3.2

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- No blocking issues encountered during implementation.

### Completion Notes List

- Extracted `tryFetchSettledEpoch` and `LastSettledEpochData` interface into `web/src/lib/epoch-utils.ts` as shared utilities, refactored `use-last-settled-epoch.ts` to use shared module (eliminates duplication).
- Created `useSettlementHistory` hook with backward epoch iteration, batch loading via `useState` counter, and TanStack Query with 30s staleTime and `refetchOnWindowFocus: false` (immutable data).
- Created `useUserPositionsBatch` hook using `Promise.allSettled` pattern per codebase convention, returns `Map<string, UserPositionData>` for O(1) lookup.
- Created `SettlementHistoryRow` with compact display (epoch ID, outcome badge, prices, delta, time ago, user position) and expandable `SettlementStatusPanel` via `Collapsible`.
- Created `SettlementHistoryList` with loading skeleton, empty state, column headers, `ScrollArea` (max 400px), and "Load more" pagination button.
- Initially integrated settlement history as collapsible section in `EpochStatusDisplay`; later moved to dedicated `/history` page (see Change Log 2026-03-16 revision).
- Added `QUERY_KEYS.settlementHistory` to constants and barrel exports for new hooks.
- 29 new tests added (7 for epoch-utils, 10 for settlement-history-row, 12 for settlement-history-list). No regressions in existing 508 tests.

### Change Log

- 2026-03-16: Implemented Story 3.9 - Display Settlement History. Created shared epoch-utils module, settlement history hook with pagination, batch position fetching hook, history row and list components, integrated into trading layout as collapsible section.
- 2026-03-16: **Post-review revision** — Moved settlement history from trading page to dedicated `/history` page. Expanding settlement history in the chart card header pushed the price chart down (bad UX). Created `web/src/app/history/page.tsx`, `web/src/components/history/history-feature.tsx`, added nav link. Removed all Settlement History collapsible blocks from `epoch-status-display.tsx`; retained `LastSettlementSection`.
- 2026-03-16: **Code review fixes** — (1) Use `QUERY_KEYS.settlementHistory(asset)` instead of hardcoded string in `use-settlement-history.ts` queryKey. (2) Eliminate double-fetch per epoch in `useSettlementHistory` by using `tryFetchSettledEpoch` directly with consecutive-null early termination. (3) Remove duplicated `parseDirection` from `use-user-positions-batch.ts` — now imports from `use-user-position.ts` (exported). (4) Remove unstable `useCallback` + array dep in `useUserPositionsBatch` — inline queryFn in useQuery (TanStack handles re-fetching via queryKey). (5) Add page metadata to `/history/page.tsx`.

### File List

New files:
- web/src/lib/epoch-utils.ts
- web/src/lib/epoch-utils.test.ts
- web/src/hooks/use-settlement-history.ts
- web/src/hooks/use-user-positions-batch.ts
- web/src/components/trading/settlement-history-row.tsx
- web/src/components/trading/settlement-history-row.test.tsx
- web/src/components/trading/settlement-history-list.tsx
- web/src/components/trading/settlement-history-list.test.tsx
- web/src/app/history/page.tsx (dedicated history page route)
- web/src/components/history/history-feature.tsx (history page feature component)

Modified files:
- web/src/hooks/use-last-settled-epoch.ts (refactored to use shared epoch-utils)
- web/src/hooks/use-user-position.ts (exported parseDirection for shared use)
- web/src/hooks/index.ts (added barrel exports for new hooks)
- web/src/lib/constants.ts (added QUERY_KEYS.settlementHistory)
- web/src/components/trading/epoch-status-display.tsx (removed settlement history collapsible sections; retained LastSettlementSection)
- web/src/app/layout.tsx (added History nav link)

## Change Log

- **2026-03-19** — [Story 7.9](7-9-fix-force-closed-epoch-ui-visibility.md): Fixed `tryFetchSettledEpoch` in `epoch-utils.ts` to handle force-closed epochs (state=Refunded with no settlement data). Fixed `settlement-history-row.tsx` to show "Force Closed" display and use `endTime` fallback for time-ago. Changed force-closed detection from `settlementPrice === 0` to `rawEpochData.settlementPrice === null`.
