# Story 3.6: Create Settlement Status UI

Status: done

## Story

As a trader,
I want to see settlement details after an epoch ends,
So that I understand exactly what happened.

## Context

FOGO Pulse operates on 5-minute epochs. After each epoch ends, the crank bot (or any permissionless caller) executes `advance_epoch` which settles the previous epoch and creates a new one atomically. Settlement determines the outcome: UP wins (price went up), DOWN wins (price went down), or Refunded (confidence bands overlap).

**Current State:**
- On-chain: `settle_epoch` and `advance_epoch` instructions are fully implemented (Stories 3.1, 2.11.4)
- On-chain: Epoch account stores settlement data: `settlement_price`, `settlement_confidence`, `settlement_publish_time`, `outcome`, `yes_total_at_settlement`, `no_total_at_settlement`
- Frontend: Basic epoch status display exists (`EpochStatusDisplay` component in Story 2.6)
- Frontend: `useEpoch` hook already fetches all epoch data including settlement fields
- Frontend: No detailed settlement transparency yet - users cannot verify start/end prices, confidence values, or see WHY the outcome was determined

**This story's purpose:**
Create a comprehensive settlement status UI that shows:
1. Start price + publish time + confidence
2. Settlement price + publish time + confidence
3. Settlement outcome (UP won / DOWN won / Refunded)
4. For refunds: link to confidence band visualization (Story 3.7)

This is a **frontend-only** story - no on-chain changes required.

## Acceptance Criteria

1. **Given** a settled epoch with outcome UP or DOWN
   **When** I view the epoch details
   **Then** I see the start price and start_publish_time displayed
   **And** I see the settlement price and settlement_publish_time displayed
   **And** I see the confidence values for both snapshots (as percentage of price)
   **And** I see the outcome clearly indicated (UP won / DOWN won)
   **And** I see the settlement timestamp

2. **Given** a refunded epoch
   **When** I view the epoch details
   **Then** I see "REFUNDED - Oracle Uncertain" as the outcome
   **And** I see a "Why?" link that expands to show brief explanation
   **And** the explanation mentions confidence bands overlap
   **And** a link to detailed confidence visualization is shown (placeholder for Story 3.7)

3. **Given** the epoch status display component
   **When** the epoch is in Settled or Refunded state
   **Then** the settlement panel automatically expands to show settlement details
   **And** the information is displayed within 1 second of on-chain change (NFR2)

4. **Given** a user viewing settlement details
   **When** they see the price values
   **Then** prices are formatted consistently with other UI (USD with 2 decimal places for display, high precision available)
   **And** confidence values are shown as percentage (e.g., "0.05%")
   **And** timestamps are formatted in user's local timezone

5. **Given** the settlement details are displayed
   **When** I interact with the UI
   **Then** I can copy the on-chain verification data (epoch address, transaction signature)
   **And** a link to the block explorer is provided for verification

6. **Given** a mobile viewport
   **When** viewing settlement details
   **Then** the layout adjusts responsively (stacked rather than side-by-side)
   **And** all information remains accessible without horizontal scrolling

## Tasks / Subtasks

- [x] **Task 1: Create useSettlementDisplay hook** (AC: 1, 2, 3, 4)
  - [x] 1.1: Create `web/src/hooks/use-settlement-display.ts` that composes with existing `useEpoch`
  - [x] 1.2: Accept `asset: Asset` parameter (same as useEpoch)
  - [x] 1.3: Derive settlement display data from `epochState.epoch` (already contains all settlement fields)
  - [x] 1.4: Calculate confidence as percentage: `(confidence / price) * 100`
  - [x] 1.5: Format prices using Pyth exponent (-8) via existing `scalePrice` pattern
  - [x] 1.6: Return null for settlement fields when epoch not settled
  - [x] 1.7: Add export to `web/src/hooks/index.ts`

- [x] **Task 2: Create SettlementStatusPanel component** (AC: 1, 2, 4, 5)
  - [x] 2.1: Create `web/src/components/trading/settlement-status-panel.tsx`
  - [x] 2.2: Props: `asset: Asset`, `onClose?: () => void`
  - [x] 2.3: Use `useSettlementDisplay(asset)` to get data (NOT duplicate fetching)
  - [x] 2.4: Display start price section: price, confidence %, publish time
  - [x] 2.5: Display settlement price section: price, confidence %, publish time
  - [x] 2.6: Display outcome badge with appropriate color
  - [x] 2.7: Add "Why?" expandable section for refunded epochs

- [x] **Task 3: Create OutcomeBadge component** (AC: 1, 2)
  - [x] 3.1: Create `web/src/components/trading/outcome-badge.tsx`
  - [x] 3.2: Props: `outcome: Outcome` (use existing `Outcome` enum from `@/types/epoch`)
  - [x] 3.3: Variants: UP (green, Check icon), DOWN (red, Check icon), REFUNDED (amber, RefreshCw icon)
  - [x] 3.4: Use shadcn Badge component as base
  - [x] 3.5: Design for reuse by Story 3.8 (Claim Payout UI)

- [x] **Task 4: Create RefundExplanation component** (AC: 2)
  - [x] 4.1: Create `web/src/components/trading/refund-explanation.tsx`
  - [x] 4.2: Props: `startPrice`, `startConfidence`, `settlementPrice`, `settlementConfidence` (all bigint)
  - [x] 4.3: Use shadcn Collapsible component for "Why?" toggle
  - [x] 4.4: Display explanation text and actual confidence values that caused refund
  - [x] 4.5: Show disabled "View Confidence Bands" link (placeholder for Story 3.7)

- [x] **Task 5: Create VerificationLinks component** (AC: 5)
  - [x] 5.1: Create `web/src/components/trading/verification-links.tsx`
  - [x] 5.2: Props: `epochPda: PublicKey`
  - [x] 5.3: "Copy Epoch Address" button using `navigator.clipboard.writeText`
  - [x] 5.4: "View on Explorer" link using `getExplorerUrl` helper
  - [x] 5.5: Use sonner toast to confirm copy action

- [x] **Task 6: Add formatting utilities** (AC: 4)
  - [x] 6.1: Add `formatConfidencePercent(confidence: bigint, price: bigint): string` to `web/src/lib/utils.ts`
  - [x] 6.2: Add `formatSettlementTime(timestamp: number): string` to `web/src/lib/utils.ts`
  - [x] 6.3: Add `getExplorerUrl(address: string, type?: 'address' | 'tx'): string` to `web/src/lib/utils.ts`
  - [x] 6.4: Use FOGO testnet RPC URL from existing `FOGO_TESTNET_RPC` constant

- [x] **Task 7: Integrate into EpochStatusDisplay** (AC: 3)
  - [x] 7.1: Modify `web/src/components/trading/epoch-status-display.tsx`
  - [x] 7.2: Import SettlementStatusPanel component
  - [x] 7.3: Add conditional rendering when `epochState.isSettled` is true
  - [x] 7.4: Leverage existing WebSocket subscription (5s polling + account change listener)

- [x] **Task 8: Add responsive styles** (AC: 6)
  - [x] 8.1: Use Tailwind `sm:` breakpoint for desktop side-by-side layout
  - [x] 8.2: Default mobile layout stacks price sections vertically
  - [x] 8.3: Ensure touch-friendly tap targets (min 44x44px) for buttons
  - [x] 8.4: Test on 320px, 375px, and 640px viewport widths

- [x] **Task 9: Add accessibility features** (AC: 4)
  - [x] 9.1: Add `role="region"` and `aria-label` for settlement panel
  - [x] 9.2: Ensure Collapsible component has proper `aria-expanded` state
  - [x] 9.3: Add `aria-live="polite"` for outcome announcement
  - [x] 9.4: Verify color contrast meets WCAG AA (4.5:1 for text)

- [x] **Task 10: Write component tests** (AC: 1-6)
  - [x] 10.1: Test SettlementStatusPanel renders correctly for UP outcome
  - [x] 10.2: Test SettlementStatusPanel renders correctly for DOWN outcome
  - [x] 10.3: Test SettlementStatusPanel renders correctly for REFUNDED outcome
  - [x] 10.4: Test RefundExplanation expands and collapses
  - [x] 10.5: Test VerificationLinks copy functionality (mock clipboard API)

## Dev Notes

### Critical: Use Correct Epoch Field Names

The on-chain Epoch account uses these field names (from `anchor/programs/fogopulse/src/state/epoch.rs`):

```rust
pub struct Epoch {
    pub pool: Pubkey,
    pub epoch_id: u64,
    pub state: EpochState,
    pub start_time: i64,
    pub end_time: i64,
    pub freeze_time: i64,
    pub start_price: u64,
    pub start_confidence: u64,
    pub start_publish_time: i64,
    pub settlement_price: Option<u64>,
    pub settlement_confidence: Option<u64>,
    pub settlement_publish_time: Option<i64>,
    pub outcome: Option<Outcome>,
    pub yes_total_at_settlement: Option<u64>,  // NOT yes_snapshot
    pub no_total_at_settlement: Option<u64>,   // NOT no_snapshot
    pub bump: u8,
}
```

### Reuse Existing useEpoch Hook

The existing `useEpoch` hook in `web/src/hooks/use-epoch.ts` already fetches ALL epoch data including settlement fields. DO NOT create duplicate fetching logic.

**Existing EpochData interface** (from `@/types/epoch`):
```typescript
interface EpochData {
  pool: PublicKey;
  epochId: bigint;
  state: EpochState;
  startTime: number;
  endTime: number;
  freezeTime: number;
  startPrice: bigint;
  startConfidence: bigint;
  startPublishTime: number;
  settlementPrice: bigint | null;
  settlementConfidence: bigint | null;
  settlementPublishTime: number | null;
  outcome: Outcome | null;
  bump: number;
}
```

**Create a composition hook** that derives display data from useEpoch:

```typescript
// hooks/use-settlement-display.ts
import { useMemo } from 'react';
import { useEpoch } from './use-epoch';
import type { Asset } from '@/types/assets';
import { EpochState, Outcome } from '@/types/epoch';

interface SettlementDisplayData {
  isSettled: boolean;
  outcome: Outcome | null;
  startPrice: number;
  startConfidence: number;
  startConfidencePercent: string;
  startPublishTime: number;
  settlementPrice: number | null;
  settlementConfidence: number | null;
  settlementConfidencePercent: string | null;
  settlementPublishTime: number | null;
  priceDelta: number | null;
  priceDeltaPercent: string | null;
}

const PYTH_EXPONENT = -8;

function scalePrice(price: bigint): number {
  return Number(price) * Math.pow(10, PYTH_EXPONENT);
}

export function useSettlementDisplay(asset: Asset): SettlementDisplayData | null {
  const { epochState } = useEpoch(asset);

  return useMemo(() => {
    const epoch = epochState.epoch;
    if (!epoch) return null;

    const isSettled = epoch.state === EpochState.Settled ||
                      epoch.state === EpochState.Refunded;

    const startPrice = scalePrice(epoch.startPrice);
    const startConfidence = scalePrice(epoch.startConfidence);
    const startConfidencePercent = ((startConfidence / startPrice) * 100).toFixed(4) + '%';

    let settlementPrice: number | null = null;
    let settlementConfidence: number | null = null;
    let settlementConfidencePercent: string | null = null;
    let priceDelta: number | null = null;
    let priceDeltaPercent: string | null = null;

    if (epoch.settlementPrice !== null) {
      settlementPrice = scalePrice(epoch.settlementPrice);
      settlementConfidence = epoch.settlementConfidence
        ? scalePrice(epoch.settlementConfidence)
        : null;
      settlementConfidencePercent = settlementConfidence
        ? ((settlementConfidence / settlementPrice) * 100).toFixed(4) + '%'
        : null;
      priceDelta = settlementPrice - startPrice;
      priceDeltaPercent = ((priceDelta / startPrice) * 100).toFixed(2) + '%';
    }

    return {
      isSettled,
      outcome: epoch.outcome,
      startPrice,
      startConfidence,
      startConfidencePercent,
      startPublishTime: epoch.startPublishTime,
      settlementPrice,
      settlementConfidence,
      settlementConfidencePercent,
      settlementPublishTime: epoch.settlementPublishTime,
      priceDelta,
      priceDeltaPercent,
    };
  }, [epochState.epoch]);
}
```

### Formatting Utilities

Add to `web/src/lib/utils.ts`:

```typescript
import { FOGO_TESTNET_RPC } from './constants';

export function formatConfidencePercent(confidence: bigint, price: bigint): string {
  const pct = (Number(confidence) / Number(price)) * 100;
  return `${pct.toFixed(4)}%`;
}

export function formatSettlementTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });
}

export function getExplorerUrl(address: string, type: 'address' | 'tx' = 'address'): string {
  const baseUrl = 'https://explorer.solana.com';
  const rpcParam = encodeURIComponent(FOGO_TESTNET_RPC);
  return `${baseUrl}/${type}/${address}?cluster=custom&customUrl=${rpcParam}`;
}
```

### Component Structure

```
components/trading/
├── settlement-status-panel.tsx    # Main settlement display (uses useSettlementDisplay)
├── outcome-badge.tsx              # UP/DOWN/REFUNDED badge (reusable)
├── refund-explanation.tsx         # Collapsible "Why?" section
├── verification-links.tsx         # Copy address, explorer link
└── epoch-status-display.tsx       # Existing - to be modified
```

### UI Layout (Desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│ Settlement Details                                    [X Close] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │ START PRICE              │  │ SETTLEMENT PRICE         │    │
│  │ $69,173.98               │  │ $69,180.12               │    │
│  │ Confidence: 0.07%        │  │ Confidence: 0.05%        │    │
│  │ Mar 15, 10:00:00 AM EST  │  │ Mar 15, 10:05:00 AM EST  │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              [✓ UP WON]  (+$6.14 / +0.01%)              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Copy Epoch Address]  [View on Explorer]                      │
└─────────────────────────────────────────────────────────────────┘
```

### UI Layout (Refunded)

```
┌─────────────────────────────────────────────────────────────────┐
│ Settlement Details                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │ START PRICE              │  │ SETTLEMENT PRICE         │    │
│  │ $69,173.98               │  │ $69,174.12               │    │
│  │ Confidence: 2.50%        │  │ Confidence: 3.20%        │    │
│  │ Mar 15, 10:00:00 AM EST  │  │ Mar 15, 10:05:00 AM EST  │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         [↻ REFUNDED - Oracle Uncertain]                 │   │
│  │         [Why?] ▼                                        │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │ The settlement price was too close to the start   │  │   │
│  │  │ price. Oracle confidence bands overlapped.        │  │   │
│  │  │                                                   │  │   │
│  │  │ Start: $69,173.98 ± $1,729.35 (2.50%)            │  │   │
│  │  │ End:   $69,174.12 ± $2,213.57 (3.20%)            │  │   │
│  │  │                                                   │  │   │
│  │  │ [View Confidence Bands] (Coming in Story 3.7)     │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Copy Epoch Address]  [View on Explorer]                      │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout (Stacked)

```
┌────────────────────────┐
│ Settlement Details     │
├────────────────────────┤
│ START PRICE            │
│ $69,173.98             │
│ Confidence: 0.07%      │
│ Mar 15, 10:00 AM       │
├────────────────────────┤
│ SETTLEMENT PRICE       │
│ $69,180.12             │
│ Confidence: 0.05%      │
│ Mar 15, 10:05 AM       │
├────────────────────────┤
│    [✓ UP WON]          │
│    (+$6.14)            │
├────────────────────────┤
│ [Copy]  [Explorer]     │
└────────────────────────┘
```

### Color Scheme

Use existing design system tokens from project-context.md:

| Outcome | Background | Text | Icon |
|---------|------------|------|------|
| UP | `bg-up/20` | `text-up` | `Check` (lucide) |
| DOWN | `bg-down/20` | `text-down` | `Check` (lucide) |
| REFUNDED | `bg-warning/20` | `text-warning` | `RefreshCw` (lucide) |

### Integration Pattern

Modify `epoch-status-display.tsx` to conditionally render settlement panel:

```tsx
// In epoch-status-display.tsx
import { SettlementStatusPanel } from './settlement-status-panel';

// Inside the component, after the active epoch display:
{epochState.isSettled && (
  <SettlementStatusPanel asset={asset} />
)}
```

### Existing Patterns to Follow

From `use-epoch.ts`:
- Uses TanStack Query with 5s refetchInterval + WebSocket subscription
- Creates read-only Anchor provider for account fetching
- Parses Anchor enums via `Object.keys(state)[0]` pattern
- Uses `PYTH_PRICE_EXPONENT = -8` constant

From `epoch-status-display.tsx`:
- Handles loading state with Skeleton components
- Handles no-epoch state gracefully
- Uses `useWalletConnection` for wallet-dependent actions

### Previous Story Learnings (from Story 3.5)

- Use TanStack Query for data fetching with refetchInterval for real-time updates
- Format prices consistently across the UI using shared utilities
- Include toast notifications for user feedback on actions (sonner)
- Test with real testnet data for accurate formatting

## Project Structure Notes

### Files to Create

| File | Purpose |
|------|---------|
| `web/src/hooks/use-settlement-display.ts` | Composition hook deriving display data from useEpoch |
| `web/src/components/trading/settlement-status-panel.tsx` | Main settlement display panel |
| `web/src/components/trading/outcome-badge.tsx` | Reusable UP/DOWN/REFUNDED badge |
| `web/src/components/trading/refund-explanation.tsx` | Collapsible refund explanation |
| `web/src/components/trading/verification-links.tsx` | Copy address and explorer links |

### Files to Modify

| File | Change |
|------|--------|
| `web/src/hooks/index.ts` | Add export for useSettlementDisplay |
| `web/src/components/trading/epoch-status-display.tsx` | Integrate SettlementStatusPanel |
| `web/src/lib/utils.ts` | Add formatConfidencePercent, formatSettlementTime, getExplorerUrl |

### Dependencies (Already Installed)

- shadcn/ui: Badge, Button, Collapsible, Card
- Lucide icons: Check, RefreshCw, Copy, ExternalLink
- TanStack Query
- Sonner (toast notifications)

## References

- [Source: anchor/programs/fogopulse/src/state/epoch.rs] - Epoch account with correct field names
- [Source: web/src/hooks/use-epoch.ts] - Existing hook to compose with (DO NOT duplicate)
- [Source: web/src/types/epoch.ts] - Existing EpochData and Outcome types
- [Source: web/src/components/trading/epoch-status-display.tsx] - Existing component to extend
- [Source: _bmad-output/planning-artifacts/epics.md#story-36] - Original story AC
- [Source: _bmad-output/planning-artifacts/prd.md#fr21-fr24] - Settlement transparency requirements

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - implementation completed without issues.

### Completion Notes List

- Created `useSettlementDisplay` hook that composes with existing `useEpoch` hook - derives settlement display data without duplicating on-chain fetching
- Built modular component architecture: OutcomeBadge, RefundExplanation, VerificationLinks, and SettlementStatusPanel
- OutcomeBadge designed for reuse by Story 3.8 (Claim Payout UI)
- Added formatting utilities: `formatConfidencePercent`, `formatSettlementTime`, `getExplorerUrl` to utils.ts
- Integrated into EpochStatusDisplay - automatically shows settlement panel when epoch is settled
- Responsive design: stacked layout on mobile, side-by-side on desktop (sm: breakpoint)
- Accessibility: role="region", aria-label, aria-live="polite" for outcome announcement, aria-expanded for collapsible
- Full test coverage: 48 new tests across 4 test files, all passing
- Pre-existing test failures in unrelated files (price-to-beat, direction-button, quick-amount-buttons, wallet-button) not caused by this story

### Senior Developer Review (AI)

**Reviewed by:** theRoad on 2026-03-16
**Issues Found:** 3 High, 4 Medium, 2 Low
**Issues Fixed:** 6 (all HIGH + MEDIUM code issues)

**Fixes Applied:**
1. **H1 - Duplicated utilities**: Removed duplicate `scalePrice`, `formatConfidencePercent`/`formatConfidenceAsPercent`/`calcConfidencePercent`, and `formatUsd` from `use-settlement-display.ts`, `use-last-settled-epoch.ts`, and `refund-explanation.tsx`. All now import shared functions from `@/lib/utils`.
2. **H2 - Hardcoded RPC URL in utils.ts**: `getExplorerUrl` now imports and uses `FOGO_TESTNET_RPC` constant instead of hardcoding the URL.
3. **H3 - Hardcoded program ID**: `use-settlement-display.ts` now imports `PROGRAM_ID` from constants instead of hardcoding the pubkey string.
4. **M2 - Duplicate getExplorerUrl**: `verification-links.tsx` now imports `getExplorerUrl` from `@/lib/utils` instead of defining its own local copy.
5. **M4 - Float-to-bigint precision loss**: Added `startPriceRaw` and `settlementPriceRaw` bigint fields to `SettlementDisplayData` interface. `SettlementStatusPanel` now passes raw bigints to `RefundExplanation` instead of lossy `BigInt(Math.round(float * 1e8))`.
6. **Utils consolidation**: Added `scalePrice` and `PYTH_PRICE_EXPONENT` as shared exports from `@/lib/utils.ts`.

**Not Fixed (accepted):**
- **M1 - Wasted useEpoch call**: `useSettlementDisplay(undefined)` still calls `useEpoch('BTC')` as a dummy. This is a React hooks constraint (can't conditionally call hooks). Low real-world impact since the component is only rendered when asset is known.
- **M3 - Skeleton persistence logic**: Internal logic is misleading but parent components handle it correctly. No user-visible bug.
- **L1 - No tests for useLastSettledEpoch**: Noted for future work.
- **L2 - crank-bot/DEPLOYMENT.md**: Unrelated to this story.

**All 48 tests pass after fixes. No new TypeScript errors.**

### Change Log

- 2026-03-16: **Code Review** - Fixed 6 issues: eliminated duplicated utils, hardcoded constants, float precision loss. Added shared `scalePrice`/`PYTH_PRICE_EXPONENT` to utils.ts. Added raw bigint price fields to SettlementDisplayData.
- 2026-03-15: Implemented Story 3.6 - Settlement Status UI with all 10 tasks complete
- 2026-03-15: **Enhancement** - Added "Last Settlement" feature to fix UX gap:
  - Created `useLastSettledEpoch` hook to fetch the previous epoch (pool.next_epoch_id - 1)
  - Modified `useSettlementDisplay` to accept optional asset parameter
  - Updated `SettlementStatusPanel` to accept pre-fetched `settlementData` prop and custom `title`
  - Added collapsible "Last Settlement" section to `EpochStatusDisplay` that shows:
    - Always visible when a previous settled epoch exists
    - Collapsible to avoid cluttering the trading UI
    - Works both when no active epoch exists AND when active epoch is Open
  - This fixes the issue where `advance_epoch` atomically settles old epoch AND creates new one,
    so users never saw the settlement UI (the "active" epoch was always the new Open one)

### File List

**New Files:**
- web/src/hooks/use-settlement-display.ts
- web/src/hooks/use-last-settled-epoch.ts (enhancement)
- web/src/components/trading/settlement-status-panel.tsx
- web/src/components/trading/outcome-badge.tsx
- web/src/components/trading/refund-explanation.tsx
- web/src/components/trading/verification-links.tsx
- web/src/components/trading/settlement-status-panel.test.tsx
- web/src/components/trading/outcome-badge.test.tsx
- web/src/components/trading/refund-explanation.test.tsx
- web/src/components/trading/verification-links.test.tsx

**Modified Files:**
- web/src/hooks/index.ts (added exports for useSettlementDisplay, useLastSettledEpoch)
- web/src/hooks/use-settlement-display.ts (enhancement: accept optional asset)
- web/src/lib/utils.ts (added formatConfidencePercent, formatSettlementTime, getExplorerUrl)
- web/src/components/trading/epoch-status-display.tsx (integrated SettlementStatusPanel + Last Settlement section)
- web/src/components/trading/settlement-status-panel.tsx (enhancement: accept settlementData prop, custom title)

