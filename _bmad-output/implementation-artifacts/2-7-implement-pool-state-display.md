# Story 2.7: Implement Pool State Display

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want to see pool probabilities and depth,
so that I can understand the current market sentiment.

## Acceptance Criteria

1. **Given** an active pool with trading activity
   **When** I view the pool state display
   **Then** current probabilities (pYES/pNO) are calculated from reserves and displayed

2. **Given** an active pool
   **When** I view the pool state display
   **Then** probabilities are shown as percentages (e.g., "UP: 65% / DOWN: 35%")

3. **Given** an active pool
   **When** I view the pool state display
   **Then** pool depth/liquidity is displayed (total USDC in pool)

4. **Given** an active pool
   **When** I view the pool state display
   **Then** a visual representation (progress bar or pie chart) shows the probability split

5. **Given** an active pool with state changes
   **When** the pool state updates on-chain
   **Then** the display updates within 1 second of on-chain changes (NFR2)

6. **Given** no active pool or pool with zero reserves
   **When** I view the pool state display
   **Then** appropriate placeholder or zero-state is shown

## Tasks / Subtasks

- [x] Task 1: Create Pool Types and Interfaces (AC: #1, #6)
  - [x] 1.1: Add `PoolData` interface to `types/index.ts` with assetMint, yesReserves, noReserves, totalLpShares, activeEpoch, activeEpochState, isPaused, isFrozen
  - [x] 1.2: Add `PoolUIState` interface with probabilities (pUp, pDown), totalLiquidity, isLoading, error
  - [x] 1.3: Add helper type for probability calculation results

- [x] Task 2: Create `usePool` Hook (AC: #1, #5)
  - [x] 2.1: Create `hooks/use-pool.ts` with `usePool(asset: Asset)` signature
  - [x] 2.2: Implement TanStack Query fetching of Pool account via Anchor program
  - [x] 2.3: Implement WebSocket subscription for real-time pool updates using `connection.onAccountChange`
  - [x] 2.4: Calculate probabilities from reserves using CPMM formula: `pUp = noReserves / (yesReserves + noReserves)`
  - [x] 2.5: Calculate total liquidity: `totalLiquidity = yesReserves + noReserves`
  - [x] 2.6: Handle pool not found / no liquidity states gracefully

- [x] Task 3: Create `ProbabilityBar` Component (AC: #2, #4)
  - [x] 3.1: Create `components/trading/probability-bar.tsx`
  - [x] 3.2: Implement horizontal progress bar showing UP vs DOWN split
  - [x] 3.3: Display percentage labels on each side ("UP: 65%" left, "DOWN: 35%" right)
  - [x] 3.4: Color code: green (`--up` / `text-green-500`) for UP side, red (`--down` / `text-red-500`) for DOWN side
  - [x] 3.5: Add smooth transition animation when probabilities change

- [x] Task 4: Create `PoolDepth` Component (AC: #3)
  - [x] 4.1: Create `components/trading/pool-depth.tsx`
  - [x] 4.2: Display "Pool Liquidity" label with total USDC value
  - [x] 4.3: Format as currency with appropriate decimal places (e.g., "$12,345.67")
  - [x] 4.4: Add Skeleton loader for loading state

- [x] Task 5: Create `PoolStateDisplay` Container Component (AC: #1-#6)
  - [x] 5.1: Create `components/trading/pool-state-display.tsx` combining ProbabilityBar and PoolDepth
  - [x] 5.2: Layout: ProbabilityBar on top, PoolDepth below in compact card
  - [x] 5.3: Handle loading state with skeleton
  - [x] 5.4: Handle no-pool / zero-liquidity state with appropriate message
  - [x] 5.5: Accept asset prop and integrate with usePool hook

- [x] Task 6: Integrate into Trade Ticket Area (AC: #1-#6)
  - [x] 6.1: Identify integration point in trading layout (likely above or beside trade ticket)
  - [x] 6.2: Add `PoolStateDisplay` component to trading page
  - [x] 6.3: Ensure responsive layout works on different screen sizes
  - [x] 6.4: Verify real-time updates work with WebSocket subscription

- [x] Task 7: Write Tests (AC: All)
  - [x] 7.1: Create `hooks/use-pool.test.tsx` with mock Anchor program data
  - [x] 7.2: Create `components/trading/probability-bar.test.tsx` testing probability display and colors
  - [x] 7.3: Create `components/trading/pool-depth.test.tsx` testing liquidity formatting
  - [x] 7.4: Create `components/trading/pool-state-display.test.tsx` testing loading, empty, and active states

## Dev Notes

### Architecture Compliance

**Data Flow Pattern:**
```
Pool Account (on-chain)
       │
       ▼
  usePool hook (TanStack Query + WebSocket subscription)
       │
       ▼
  PoolStateDisplay
       │
       ├── ProbabilityBar (calculated pUp/pDown from reserves)
       └── PoolDepth (yesReserves + noReserves)
```

**Pool Account Fields (from architecture.md):**
```rust
pub struct Pool {
    pub asset_mint: Pubkey,           // Asset this pool tracks
    pub yes_reserves: u64,            // YES (UP) token reserves
    pub no_reserves: u64,             // NO (DOWN) token reserves
    pub total_lp_shares: u64,         // Total LP shares issued
    pub next_epoch_id: u64,           // Counter for next epoch creation
    pub active_epoch: Option<Pubkey>, // Current active epoch PDA
    pub active_epoch_state: u8,       // Cached: 0=None, 1=Open, 2=Frozen
    pub wallet_cap_bps: u16,          // Max position per wallet
    pub side_cap_bps: u16,            // Max exposure per side
    pub is_paused: bool,              // Pool-level pause
    pub is_frozen: bool,              // Pool-level freeze
    pub bump: u8,                     // PDA bump
}
```

### CPMM Probability Calculation (CRITICAL)

The CPMM (Constant Product Market Maker) formula for binary outcomes:

**Probability Formula:**
```typescript
// For a binary outcome market with YES (UP) and DOWN (NO) reserves:
// pUp represents "probability" that UP will win based on market sentiment
// pDown = 1 - pUp

// FORMULA: pUp = noReserves / (yesReserves + noReserves)
// This is because: when more people buy UP, yesReserves increases,
// making UP shares more expensive (lower pUp = higher price)

const calculateProbabilities = (yesReserves: bigint, noReserves: bigint) => {
  const total = yesReserves + noReserves
  if (total === 0n) {
    return { pUp: 50, pDown: 50 } // 50/50 when no liquidity
  }

  // Convert to percentages
  const pUp = Number((noReserves * 100n) / total)
  const pDown = 100 - pUp

  return { pUp, pDown }
}
```

**Why noReserves / total = pUp?**
- In CPMM, price = opposite_reserves / same_reserves
- Higher yesReserves means UP shares are cheaper (less desirable)
- Lower yesReserves means UP shares are more expensive (more desirable)
- So pUp (market-implied probability of UP winning) = noReserves / total

**Example:**
- If yesReserves = 30,000 USDC and noReserves = 70,000 USDC
- pUp = 70,000 / 100,000 = 70% (market thinks UP is likely)
- pDown = 30% (market thinks DOWN is less likely)

### Price Formatting

**Pool reserves are stored as u64 in USDC base units (6 decimals):**
- USDC has 6 decimal places
- 1,000,000 base units = 1 USDC
- Format for display: `reserves / 1_000_000` then format as currency

```typescript
const USDC_DECIMALS = 6
const USDC_DIVISOR = 10 ** USDC_DECIMALS // 1,000,000

export function formatPoolLiquidity(reserves: bigint): string {
  const value = Number(reserves) / USDC_DIVISOR
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}
```

### WebSocket Subscription Pattern (from Story 2.6)

```typescript
useEffect(() => {
  if (!poolPda) return

  const subscriptionId = connection.onAccountChange(
    poolPda,
    (accountInfo) => {
      const pool = program.coder.accounts.decode('Pool', accountInfo.data)
      queryClient.setQueryData(['pool', asset], pool)
    },
    'confirmed'
  )

  return () => {
    connection.removeAccountChangeListener(subscriptionId)
  }
}, [poolPda, connection, program, queryClient, asset])
```

### PDA Derivation for Pool

```typescript
// From lib/pdas.ts
import { PublicKey } from '@solana/web3.js'
import { PROGRAM_ID, SEEDS } from './constants'

export function derivePoolPda(assetMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.POOL, assetMint.toBuffer()],
    PROGRAM_ID
  )
}
```

**Asset Mints (from architecture.md):**
| Asset | Mint Address |
|-------|-------------|
| BTC | `4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY` |
| ETH | `8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE` |
| SOL | `CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP` |
| FOGO | `H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X` |

### Component Structure

```
web/src/components/trading/
├── probability-bar.tsx          # UP/DOWN probability visualization
├── pool-depth.tsx               # Total pool liquidity display
├── pool-state-display.tsx       # Container combining pool UI
├── epoch-status-display.tsx     # (existing from 2.6)
├── chart-area.tsx               # (existing)
└── ...existing files...
```

### UX Requirements (from UX Design Specification)

**Visual Patterns:**
- Binary probability visualization (Polymarket-inspired)
- Clear percentage display with color coding
- Information hierarchy: probabilities prominent, liquidity secondary

**Color Scheme:**
- UP (green): `text-green-500`, `bg-green-500/20`, matches `--up` CSS variable
- DOWN (red): `text-red-500`, `bg-red-500/20`, matches `--down` CSS variable
- Background: use shadcn Card with subtle border

**Typography:**
- Percentages: `text-lg font-bold font-mono` for prominent display
- Labels: `text-xs uppercase tracking-wide text-muted-foreground`
- Liquidity value: `text-sm font-medium`

**Animation:**
- Smooth transition on probability changes: `transition-all duration-300 ease-out`
- Progress bar width transition for visual feedback

### Integration Point

The PoolStateDisplay should integrate into the trading interface near the Trade Ticket or above/below the EpochStatusDisplay. Based on the UX spec's "Direction 1" layout (Chart 65% left, Trade ticket 35% right), the pool state display fits in the trade ticket panel area.

**Suggested Placement:**
```
Trade Ticket Panel (35% right side)
├── Epoch Status Display (from 2.6)
├── Pool State Display (THIS STORY)
│   ├── Probability Bar (UP: 65% / DOWN: 35%)
│   └── Pool Liquidity ($50,000)
└── Trade Ticket (direction + amount - Story 2.8)
```

### Testing Standards

**Unit Tests (Jest):**
- Mock `@solana/web3.js` Connection and AccountInfo
- Mock Anchor program decoder for Pool account
- Test probability calculation accuracy (edge cases: 0/0, 100/0, 50/50)
- Test liquidity formatting
- Test loading and error states

**Test File Pattern:**
```typescript
// hooks/use-pool.test.tsx
import { describe, it, expect, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react'
import { usePool } from './use-pool'

describe('usePool', () => {
  it('calculates probabilities correctly', () => {
    // Mock pool with 30k YES, 70k NO
    // Expected: pUp = 70%, pDown = 30%
  })

  it('handles zero reserves', () => {
    // Should return 50/50 or show empty state
  })

  it('updates on WebSocket events', async () => {
    // Verify queryClient.setQueryData is called
  })
})
```

### Project Structure Notes

**Alignment with unified project structure:**
- Components go in `web/src/components/trading/` (consistent with existing)
- Hooks go in `web/src/hooks/` (consistent with `use-epoch.ts`, `use-pyth-price.ts`)
- Types extend `web/src/types/` (add to `index.ts` or create `pool.ts`)
- Use `@/` path aliases (already configured in tsconfig)

**No conflicts detected.** This story extends existing patterns established in Stories 2.4, 2.5, and 2.6.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.7] - Acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#Pool Account] - Pool account structure
- [Source: _bmad-output/planning-artifacts/architecture.md#CPMM] - AMM math formulas
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] - UX patterns for probability display
- [Source: _bmad-output/planning-artifacts/prd.md#FR3, FR4, NFR2] - Functional requirements
- [Source: anchor/programs/fogopulse/src/state/pool.rs] - On-chain Pool struct

### Previous Story Intelligence

**From Story 2.6 (Create Epoch Status Display):**
- `useEpoch` hook established pattern for on-chain account fetching with WebSocket subscription
- EpochStatusDisplay combines multiple sub-components in a container pattern
- WebSocket subscription + TanStack Query invalidation pattern works well
- Badge and styling patterns established for state indicators
- Successfully integrated into ChartArea component

**From Story 2.5 (Implement Price Chart Component):**
- ChartArea component is the main container for trading display
- Lightweight Charts integration pattern
- Card-based layout with CardHeader/CardContent

**From Story 2.4 (Integrate Pyth Hermes Price Feed):**
- Real-time WebSocket subscription patterns for price data
- `usePythPrice` hook structure to follow
- Loading and error state handling

**Patterns to reuse:**
- Hook structure: TanStack Query + WebSocket subscription combo
- Container component pattern with sub-components
- Loading states with Skeleton components
- Error handling with fallback UI

### Git Intelligence

**Recent commits:**
- `a50a145`: Story 2.6 - Epoch Status Display (previous story)
- `8248a79`: Story 2.5 - Price Chart Component
- `27462e0`: Story 2.4 - Pyth Hermes Price Feed integration
- `982d780`: Story 2.3 - Asset Selector and Market Layout

**Code patterns from recent work:**
- Hooks use `'use client'` directive for Next.js App Router
- TanStack Query v5 for server state management
- shadcn/ui components for consistent styling
- FOGO brand colors: `text-green-500` (up), `text-red-500` (down)
- WebSocket subscriptions cleaned up in useEffect return

### Latest Tech Information

**Anchor Program IDL:**
The program is deployed at `D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5`. The IDL at `web/src/lib/fogopulse.json` contains the Pool account structure.

**TanStack Query v5 Pattern (matching Story 2.6):**
```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query'

export function usePool(asset: Asset) {
  const queryClient = useQueryClient()
  const { connection } = useConnection()
  const program = useFogoPulseProgram()

  // Get pool PDA
  const poolPda = useMemo(() => {
    const assetMint = ASSET_MINTS[asset]
    return derivePoolPda(new PublicKey(assetMint))[0]
  }, [asset])

  // TanStack Query for initial fetch and cache
  const query = useQuery({
    queryKey: ['pool', asset],
    queryFn: () => fetchPoolAccount(connection, program, poolPda),
    refetchInterval: 2000, // Polling fallback
    staleTime: 1000,
  })

  // WebSocket subscription for real-time updates
  useEffect(() => {
    // ... subscription logic (see above)
  }, [poolPda, connection, program, queryClient, asset])

  // Calculate derived state
  const poolState = useMemo(() => {
    if (!query.data) return null
    return calculatePoolUIState(query.data)
  }, [query.data])

  return {
    pool: query.data,
    poolState,
    isLoading: query.isLoading,
    error: query.error,
  }
}
```

### Edge Cases to Handle

1. **Zero reserves (new pool):** Display 50/50 split or "No liquidity" message
2. **Pool not found:** Handle gracefully with "Pool not available" state
3. **Pool paused/frozen:** May want to show visual indicator (could be future enhancement)
4. **Very large numbers:** Ensure proper BigInt handling and formatting
5. **Rounding errors:** Use integer math with BigInt, convert at display time only

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Fixed TypeScript error: `PoolData | null | undefined` not assignable to `PoolData | null` - used nullish coalescing (`?? null`)
- Added jest-environment-jsdom dependency and TextEncoder/TextDecoder polyfills for Solana library compatibility
- Added jest.config.js and jest.setup.ts for test infrastructure

### Completion Notes List

- Created comprehensive pool types and interfaces in `types/pool.ts` including PoolData, PoolUIState, Probabilities, and helper functions (calculateProbabilities, formatPoolLiquidity, reservesToDisplayValue)
- Implemented `usePool` hook following existing patterns from `useEpoch` with TanStack Query + WebSocket subscription for real-time updates
- Created ProbabilityBar component with green/red color coding, percentage labels, and smooth CSS transitions
- Created PoolDepth component with Intl.NumberFormat currency formatting and loading skeleton
- Created PoolStateDisplay container component handling loading, no-pool, zero-liquidity, and active states
- Integrated PoolStateDisplay into TradeTicketArea component above the trade ticket card
- Added test configuration (jest.config.js, jest.setup.ts) and test script to package.json
- All 37 new tests pass (usePool: 5 tests, ProbabilityBar: 11 tests, PoolDepth: 10 tests, PoolStateDisplay: 11 tests)

### File List

**New files:**
- web/src/types/pool.ts
- web/src/hooks/use-pool.ts
- web/src/hooks/use-pool.test.tsx
- web/src/components/trading/probability-bar.tsx
- web/src/components/trading/probability-bar.test.tsx
- web/src/components/trading/pool-depth.tsx
- web/src/components/trading/pool-depth.test.tsx
- web/src/components/trading/pool-state-display.tsx
- web/src/components/trading/pool-state-display.test.tsx
- web/jest.config.js
- web/jest.setup.ts

**Modified files:**
- web/src/types/index.ts (added pool export)
- web/src/hooks/index.ts (added use-pool export)
- web/src/components/trading/trade-ticket-area.tsx (integrated PoolStateDisplay)
- web/package.json (added test scripts, jest-environment-jsdom)

## Change Log

- 2026-03-13: Story implementation completed - Pool State Display with probability bar, liquidity display, and real-time WebSocket updates
- 2026-03-13: Code review fixes applied:
  - M1: Added explanatory comment for Anchor `any` type assertion pattern
  - M2: Added `isRealtimeConnected` state to usePool hook for WebSocket status visibility
  - M3: Updated story docs from "Vitest" to "Jest" to match actual implementation
  - M4: Added probability normalization in ProbabilityBar to handle edge cases
  - M5: Added JSDoc precision warning to reservesToDisplayValue function
