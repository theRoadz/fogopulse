# Story 2.6: Create Epoch Status Display

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want to see the current epoch status,
so that I know how much time remains and what price I need to beat.

## Acceptance Criteria

1. **Given** an active epoch for the selected asset
   **When** I view the epoch status area
   **Then** the countdown timer shows time remaining until epoch end

2. **Given** an active epoch
   **When** viewing the countdown timer
   **Then** the timer updates every second with ±1 second accuracy (NFR5)

3. **Given** an active epoch
   **When** I view the epoch status area
   **Then** the epoch state is displayed (Open, Frozen, Settling, Settled)

4. **Given** an active epoch
   **When** I view the epoch status area
   **Then** the "Price to Beat" (start_price) is prominently shown (AR26)

5. **Given** an active epoch and current price data
   **When** I view the epoch status area
   **Then** a delta indicator shows current price distance from target (AR27: ▲/▼ $XX)

6. **Given** an epoch approaching freeze time
   **When** I view the epoch status area
   **Then** the freeze window is indicated (e.g., "Trading closes in X seconds")

7. **Given** no active epoch for the selected asset
   **When** I view the epoch status area
   **Then** a placeholder shows "No active epoch" or "Next epoch starting soon..."

## Tasks / Subtasks

- [x] Task 1: Create EpochState Types and Constants (AC: #3, #7)
  - [x] 1.1: Add `EpochState` type to `types/index.ts` matching on-chain enum (Open, Frozen, Settling, Settled, Refunded)
  - [x] 1.2: Add `EpochData` interface with pool, epochId, state, startTime, endTime, freezeTime, startPrice, startConfidence

- [x] Task 2: Create `useEpoch` Hook (AC: #1, #2, #3, #7)
  - [x] 2.1: Create `hooks/use-epoch.ts` with `useEpoch(asset: Asset)` signature
  - [x] 2.2: Implement TanStack Query fetching of epoch account via Anchor program
  - [x] 2.3: Implement WebSocket subscription for real-time epoch updates using `connection.onAccountChange`
  - [x] 2.4: Calculate and return countdown state (timeRemaining, isFrozen, isSettling)
  - [x] 2.5: Handle "no active epoch" state gracefully (return null epoch with appropriate status)

- [x] Task 3: Create `EpochCountdown` Component (AC: #1, #2, #6)
  - [x] 3.1: Create `components/trading/epoch-countdown.tsx`
  - [x] 3.2: Implement MM:SS countdown format with monospace font for consistent width
  - [x] 3.3: Add `useEffect` with 1-second interval for countdown updates
  - [x] 3.4: Style freeze window warning (color shift to amber when <15 seconds)
  - [x] 3.5: Add "Trading closes in X seconds" message during freeze window

- [x] Task 4: Create `EpochStateBadge` Component (AC: #3)
  - [x] 4.1: Create `components/trading/epoch-state-badge.tsx`
  - [x] 4.2: Implement color-coded badges: Open (green), Frozen (amber), Settling (blue), Settled/Refunded (gray)
  - [x] 4.3: Use shadcn/ui Badge component with custom FOGO brand colors

- [x] Task 5: Create `PriceToBeat` Component (AC: #4, #5)
  - [x] 5.1: Create `components/trading/price-to-beat.tsx`
  - [x] 5.2: Display "Price to Beat" label with start_price in large monospace font
  - [x] 5.3: Implement delta indicator showing (currentPrice - startPrice) with ▲/▼ symbols
  - [x] 5.4: Color delta: green for positive (▲), red for negative (▼)

- [x] Task 6: Create `EpochStatusDisplay` Container Component (AC: #1-#7)
  - [x] 6.1: Create `components/trading/epoch-status-display.tsx` combining all sub-components
  - [x] 6.2: Layout: State badge, Price to Beat, Delta, Countdown in responsive row
  - [x] 6.3: Handle no-epoch state with "No active epoch" placeholder
  - [x] 6.4: Accept asset prop and integrate with `usePythPrice` hook for current price

- [x] Task 7: Integrate into ChartArea (AC: #1-#7)
  - [x] 7.1: Update `components/trading/chart-area.tsx` to include `EpochStatusDisplay`
  - [x] 7.2: Replace "Price to Beat" placeholder text in CardHeader with actual component
  - [x] 7.3: Ensure proper layout with countdown positioned top-right per UX spec

- [x] Task 8: Write Tests (AC: All)
  - [x] 8.1: Create `hooks/use-epoch.test.ts` with mock Anchor program data
  - [x] 8.2: Create `components/trading/epoch-countdown.test.tsx` verifying countdown accuracy
  - [x] 8.3: Test state transitions (Open -> Frozen) and color changes

## Dev Notes

### Architecture Compliance

**Data Flow Pattern:**
```
Pool Account (on-chain)
       │
       ▼
  useEpoch hook (TanStack Query + WebSocket subscription)
       │
       ▼
  EpochStatusDisplay
       │
       ├── EpochStateBadge (epoch.state)
       ├── PriceToBeat (epoch.startPrice + currentPrice from usePythPrice)
       └── EpochCountdown (epoch.endTime, epoch.freezeTime)
```

**On-Chain Account Reading:**
The Pool account contains `active_epoch` (Pubkey) and `active_epoch_state` (u8 cache). Use the Pool PDA to first check if an epoch exists, then fetch the Epoch account for full details.

**Pool Account Fields (relevant):**
- `active_epoch: Option<Pubkey>` - PDA of current active epoch (None if no epoch)
- `active_epoch_state: u8` - Cached state: 0=None, 1=Open, 2=Frozen
- `next_epoch_id: u64` - Counter for epoch creation

**Epoch Account Fields:**
```rust
pub struct Epoch {
    pub pool: Pubkey,
    pub epoch_id: u64,
    pub state: EpochState,       // Open, Frozen, Settling, Settled, Refunded
    pub start_time: i64,         // Unix timestamp
    pub end_time: i64,           // Unix timestamp
    pub freeze_time: i64,        // end_time - 15 seconds
    pub start_price: u64,        // Pyth price at epoch creation
    pub start_confidence: u64,   // Pyth confidence at epoch creation
    pub start_publish_time: i64,
    pub settlement_price: Option<u64>,
    pub settlement_confidence: Option<u64>,
    pub settlement_publish_time: Option<i64>,
    pub outcome: Option<Outcome>,
    pub bump: u8,
}
```

### Price Formatting

**start_price is stored as u64 with Pyth exponent.** The Pyth price format uses:
- `price: i64` (scaled integer)
- `expo: i32` (negative exponent, typically -8 for USD pairs)

For display: `price * 10^expo` gives the human-readable value.

Example: BTC at $95,000 with expo=-8 would be stored as `start_price = 9500000000000` (95000 * 10^8).

**Use existing `formatUsdPrice` utility from `lib/utils.ts`** for consistent formatting.

### Countdown Implementation

**CRITICAL:** Use `requestAnimationFrame` or `setInterval(1000)` for countdown updates. The countdown must:
1. Calculate remaining time: `endTime - currentTimestamp`
2. Format as MM:SS (pad with zeros)
3. Shift to amber/warning color when `<= freezeTime`

**Freeze Window Logic:**
```typescript
const now = Math.floor(Date.now() / 1000)
const timeRemaining = epoch.endTime - now
const isFrozen = now >= epoch.freezeTime
const freezeWarningThreshold = 30 // Show warning when 30s remain
const showFreezeWarning = !isFrozen && (epoch.freezeTime - now <= freezeWarningThreshold)
```

### Delta Indicator

**Delta calculation:**
```typescript
// Both prices should be in same scale (human-readable USD)
const delta = currentPrice - priceToBeat
const isPositive = delta >= 0
const symbol = isPositive ? '▲' : '▼'
const color = isPositive ? 'text-green-500' : 'text-red-500'
const formatted = `${symbol} $${Math.abs(delta).toFixed(2)}`
```

### Component Structure

```
web/src/components/trading/
├── epoch-countdown.tsx        # MM:SS countdown with freeze warning
├── epoch-state-badge.tsx      # Open/Frozen/Settling/Settled badge
├── epoch-status-display.tsx   # Container combining all epoch UI
├── price-to-beat.tsx          # Start price + delta indicator
├── chart-area.tsx             # UPDATE: integrate epoch status
└── ...existing files...
```

### PDA Derivation for Epoch

```typescript
// From lib/pdas.ts (create this file if not exists)
export function deriveEpochPda(poolPda: PublicKey, epochId: number): [PublicKey, number] {
  // Browser-compatible u64 encoding (no Buffer.writeBigUInt64LE)
  const epochIdBuffer = new Uint8Array(8)
  let n = BigInt(epochId)
  for (let i = 0; i < 8; i++) {
    epochIdBuffer[i] = Number(n & BigInt(0xff))
    n = n >> BigInt(8)
  }
  return PublicKey.findProgramAddressSync(
    [SEEDS.EPOCH, poolPda.toBuffer(), epochIdBuffer],
    PROGRAM_ID
  )
}
```

### Testing Standards

**Unit Tests (Vitest):**
- Mock `@solana/web3.js` Connection and AccountInfo
- Mock Anchor program decoder for Epoch account
- Test countdown accuracy: verify interval updates
- Test state badge color mapping

**Test File Pattern:**
```typescript
// hooks/use-epoch.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEpoch } from './use-epoch'

// Mock Anchor program and connection
vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(),
  PublicKey: vi.fn(),
}))
```

### Project Structure Notes

**Alignment with unified project structure:**
- Components go in `web/src/components/trading/` (consistent with existing)
- Hooks go in `web/src/hooks/` (consistent with `use-pyth-price.ts`)
- Types extend `web/src/types/` (add to `index.ts` or create `epoch.ts`)
- Use `@/` path aliases (already configured in tsconfig)

**No conflicts detected.** This story extends existing patterns established in Stories 2.3, 2.4, and 2.5.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.6] - Acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] - Epoch account structure
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Primary Reference Analysis] - UX patterns for countdown, Price to Beat
- [Source: _bmad-output/planning-artifacts/prd.md#FR1, FR5, NFR5] - Functional requirements
- [Source: anchor/programs/fogopulse/src/state/epoch.rs] - On-chain Epoch struct

### Previous Story Intelligence

**From Story 2.5 (Implement Price Chart Component):**
- TradingView Lightweight Charts successfully integrated
- `usePriceHistory` hook established pattern for time-series data
- `chart-area.tsx` already has "Price to Beat" placeholder in CardHeader - this is the integration point
- Connection status indicator pattern can be reused for epoch subscription status

**Patterns to reuse:**
- `ConnectionStatus` component styling for epoch loading states
- `Skeleton` component for loading states
- Card layout patterns from `chart-area.tsx`

### Git Intelligence

**Recent commits:**
- `8248a79`: Story 2.5 - Price Chart Component
- `27462e0`: Story 2.4 - Pyth Hermes Price Feed integration
- `982d780`: Story 2.3 - Asset Selector and Market Layout
- `374161f`: Story 2.2 - Wallet Connection UI

**Code patterns from recent work:**
- Hooks use `'use client'` directive for Next.js App Router
- TanStack Query for server state management
- shadcn/ui components for consistent styling
- FOGO brand colors: `text-primary` (green), `text-red-500` (down)

### Latest Tech Information

**Anchor Program IDL:**
The program is deployed at `D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5`. The IDL should be generated from `anchor build` and located at `anchor/target/idl/fogopulse.json`.

**TanStack Query v5 Pattern:**
```typescript
import { useQuery } from '@tanstack/react-query'

export function useEpoch(asset: Asset) {
  return useQuery({
    queryKey: ['epoch', asset],
    queryFn: () => fetchEpochForAsset(asset),
    refetchInterval: 1000, // Polling fallback
    staleTime: 500,        // Consider data stale after 500ms
  })
}
```

**WebSocket Subscription Pattern (from architecture):**
```typescript
useEffect(() => {
  const subscriptionId = connection.onAccountChange(
    epochPda,
    (accountInfo) => {
      const epoch = program.coder.accounts.decode('Epoch', accountInfo.data)
      queryClient.setQueryData(['epoch', asset], epoch)
    }
  )
  return () => connection.removeAccountChangeListener(subscriptionId)
}, [epochPda])
```

### UX Requirements Summary

**From UX Design Specification:**
- **Countdown format:** MM:SS in monospace font (`font-mono text-2xl font-bold`)
- **Price to Beat:** Large, prominent (`text-2xl font-bold font-mono`)
- **Delta indicator:** Show ▲/▼ with dollar amount, colored green/red
- **State badge:** Color-coded (Open=green, Frozen=amber, Settled=gray)
- **Freeze warning:** Color shift to amber when in freeze window
- **Typography:** Labels use `text-xs uppercase tracking-wide text-muted`

**Visual hierarchy (top to bottom in ChartHeader):**
1. Asset label + connection status (existing)
2. "Price to Beat" label + value + delta indicator
3. Countdown timer (positioned right) + state badge

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

### Change Log

**2026-03-13 - Code Review Fixes (Claude Opus 4.5)**
- Fixed: `timeToFreeze` in EpochCountdown was stale (calculated once, not per-second)
  - Changed from `Date.now()` to derive from `timeRemaining` prop which updates every second
  - Formula: `timeToFreeze = timeRemaining - (endTime - freezeTime)`
- Added: Missing test files for components
  - `epoch-state-badge.test.tsx` - Tests all 5 states and styling
  - `price-to-beat.test.tsx` - Tests delta calculation and formatting
  - `epoch-status-display.test.tsx` - Tests loading, no-epoch, and active states
- Updated: `epoch-countdown.test.tsx` - Added test verifying freeze countdown uses timeRemaining
- Fixed: Story status and task checkboxes (were not updated during implementation)

### File List

**New Files:**
- `web/src/types/epoch.ts` - EpochState enum, EpochData interface, EpochUIState interface, NoEpochStatus type
- `web/src/hooks/use-epoch.ts` - useEpoch hook with TanStack Query + WebSocket subscription
- `web/src/hooks/use-epoch.test.tsx` - Unit tests for useEpoch hook
- `web/src/components/trading/epoch-countdown.tsx` - MM:SS countdown with freeze warning
- `web/src/components/trading/epoch-countdown.test.tsx` - Unit tests for countdown component
- `web/src/components/trading/epoch-state-badge.tsx` - Color-coded state badge (Open/Frozen/Settling/Settled/Refunded)
- `web/src/components/trading/epoch-state-badge.test.tsx` - Unit tests for state badge component
- `web/src/components/trading/price-to-beat.tsx` - Start price display with delta indicator
- `web/src/components/trading/price-to-beat.test.tsx` - Unit tests for price-to-beat component
- `web/src/components/trading/epoch-status-display.tsx` - Container combining all epoch UI components
- `web/src/components/trading/epoch-status-display.test.tsx` - Unit tests for status display container
- `web/src/lib/fogopulse.json` - Anchor IDL for program account decoding

**Modified Files:**
- `web/src/types/index.ts` - Added epoch types export
- `web/src/hooks/index.ts` - Added useEpoch export
- `web/src/components/trading/chart-area.tsx` - Integrated EpochStatusDisplay, added targetPrice to chart
