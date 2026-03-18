# Story 5.5: Create LP Dashboard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a liquidity provider,
I want to see my LP positions and pool metrics,
so that I can monitor my investments.

## Acceptance Criteria

1. **Given** pools with liquidity, **When** I navigate to `/lp`, **Then** I see an LP Dashboard page with per-pool metrics
2. **And** each pool card shows: TVL (total USDC = yesReserves + noReserves), my LP share count, my share value in USDC
3. **And** my share value is calculated as: `(myShares / totalLpShares) * (yesReserves + noReserves)` displayed in USDC
4. **And** my total LP value across all pools is shown in a summary card at the top
5. **And** recent fee earnings are displayed per pool (calculated from share value appreciation vs deposited_amount)
6. **And** FR28 (view pool TVL) and FR32 (view LP share and current value) are fully satisfied. FR29 (view estimated APY) is partially satisfied with a "Coming Soon" placeholder — the actual APY calculation based on trading volume is deferred to Story 5.8
7. **And** the LP Dashboard link appears in the app header navigation (desktop: top-level link; mobile: in menu)
8. **And** when wallet is not connected, a "Connect Wallet" prompt is shown with explanation of LP features
9. **And** when wallet is connected but user has no LP positions, an empty state shows "Earn fees by providing liquidity" with a disabled/coming-soon "Deposit" button placeholder (actual deposit flow is Story 5.6)
10. **And** pool data is fetched in real-time using the existing `usePool` hook pattern (TanStack Query + WebSocket subscription)
11. **And** LpShare account data is fetched per pool using a new `useLpShare` hook following the same pattern
12. **And** the page is responsive — card grid on desktop, stacked cards on mobile

## Tasks / Subtasks

- [x] Task 1: Add `deriveLpSharePda` utility to `pda.ts` (AC: #11)
  - [x] 1.1: Add function `deriveLpSharePda(userPubkey, poolPda)` using seeds `["lp_share", user, pool]`
  - [x] 1.2: Export from `pda.ts`

- [x] Task 2: Create LpShare type definition (AC: #2, #3, #5)
  - [x] 2.1: Create `web/src/types/lp.ts` with `LpShareData` interface matching on-chain LpShare account
  - [x] 2.2: Fields: `user: PublicKey`, `pool: PublicKey`, `shares: bigint`, `depositedAmount: bigint`, `pendingWithdrawal: bigint`, `withdrawalRequestedAt: bigint | null`, `bump: number`. Note: Anchor returns `u64` as BN objects — convert with `BigInt(account.field.toString())` (same pattern as `use-pool.ts`). `Option<i64>` maps to BN or null.
  - [x] 2.3: Add helper functions: `calculateShareValue(shares, totalLpShares, poolReserves)` and `calculateEarnings(currentValue, depositedAmount)`

- [x] Task 3: Create `useLpShare` hook (AC: #10, #11)
  - [x] 3.1: Create `web/src/hooks/use-lp-share.ts` following `use-pool.ts` pattern
  - [x] 3.2: Accept `asset: Asset` and `userPubkey: PublicKey | null` params
  - [x] 3.3: Derive LpShare PDA from userPubkey + POOL_PDAS[asset]
  - [x] 3.4: Fetch LpShare account using `(program.account as any).lpShare.fetch(lpSharePda)` — note: Anchor camelCases the account name
  - [x] 3.5: Return null gracefully if account doesn't exist (user hasn't deposited)
  - [x] 3.6: Use TanStack Query with queryKey from `QUERY_KEYS.lpShare(asset, userPubkey?.toBase58())` factory (see Task 8)
  - [x] 3.7: Setup connection using `useConnection()` with fallback to `new Connection(FOGO_TESTNET_RPC, 'confirmed')` — same pattern as `use-pool.ts` lines 56-58
  - [x] 3.8: Poll every 5s (less critical than trading data), staleTime 3s. WebSocket subscription is optional — LP data changes only on deposit/withdrawal, so polling alone is sufficient. Add WebSocket only if straightforward.

- [x] Task 4: Create `useMultiPoolLp` aggregation hook (AC: #4)
  - [x] 4.1: Create `web/src/hooks/use-multi-pool-lp.ts`
  - [x] 4.2: Call `usePool` and `useLpShare` for each of the 4 assets from `ASSETS` array (`import { ASSETS } from '@/types/assets'`). Note: React hooks cannot be called in loops — call explicitly per asset (same approach as `use-multi-asset-positions.ts`)
  - [x] 4.3: Aggregate: totalValueAcrossPools, totalEarnings, per-pool breakdown
  - [x] 4.4: Return array of `{ asset, pool, lpShare, shareValue, earnings }` plus totals
  - [x] 4.5: Follow `use-multi-asset-positions.ts` pattern for multi-asset aggregation

- [x] Task 5: Create LP Dashboard page route (AC: #1)
  - [x] 5.1: Create `web/src/app/lp/page.tsx` — minimal page component importing `LpDashboardFeature`
  - [x] 5.2: Add `export const dynamic = 'force-dynamic'` to prevent Vercel prerender issues (lesson from Story 4.7)

- [x] Task 6: Create LP Dashboard components (AC: #1, #2, #3, #4, #5, #8, #9, #12)
  - [x] 6.1: Create `web/src/components/lp/lp-dashboard-feature.tsx` — main feature component (client component)
  - [x] 6.2: Create `web/src/components/lp/lp-summary-card.tsx` — top summary showing total LP value, total earnings across all pools
  - [x] 6.3: Create `web/src/components/lp/lp-pool-card.tsx` — per-pool card showing: asset name/color, TVL, my shares, my share value, earnings, APY placeholder
  - [x] 6.4: Create `web/src/components/lp/lp-empty-state.tsx` — empty state when no LP positions ("Earn fees by providing liquidity")
  - [x] 6.5: Create `web/src/components/lp/lp-connect-prompt.tsx` — wallet not connected state
  - [x] 6.6: Use shadcn Card, Skeleton, Badge components
  - [x] 6.7: Responsive grid: `grid-cols-1 md:grid-cols-2` for pool cards
  - [x] 6.8: Use asset colors from `ASSET_METADATA[asset].color` — returns Tailwind class strings (e.g., `'text-orange-500'`), NOT hex values. Apply directly as className.

- [x] Task 7: Add LP link to navigation (AC: #7)
  - [x] 7.1: Desktop: Add "LP" as a `<Link>` in the RIGHT section of the header, alongside existing utility links (Faucet, Feedback). Add to the `utilityLinks` array: `{ label: 'LP', href: '/lp' }` — insert BEFORE Faucet so LP appears first among utility links.
  - [x] 7.2: Mobile: LP will automatically appear in the utility links section of the mobile menu (no separate change needed since it's in `utilityLinks`)
  - [x] 7.3: Use `isActive('/lp')` for active state highlighting (already handled by existing link rendering logic)

- [x] Task 8: Add query key to constants (AC: #10)
  - [x] 8.1: Add `lpShare` query key factory to `QUERY_KEYS` in `constants.ts`: `lpShare: (asset: Asset, userPubkey?: string) => ['lpShare', asset, userPubkey] as const`

## Dev Notes

### Critical Implementation Patterns

**Anchor IDL → TypeScript Field Name Conversion**: The IDL uses snake_case (`deposited_amount`, `pending_withdrawal`, `withdrawal_requested_at`), but Anchor's TS client auto-converts to camelCase at runtime (`depositedAmount`, `pendingWithdrawal`, `withdrawalRequestedAt`). All `u64` fields return as BN objects — convert with `BigInt(account.field.toString())` (same as `use-pool.ts:90-103`).

**LpShare Account Fetch with Error Handling** (follow `use-pool.ts` pattern exactly):
```typescript
// Connection setup — use useConnection() with FOGO_TESTNET_RPC fallback (use-pool.ts:56-58)
const sharedConnection = useMemo(() => {
  return connection || new Connection(FOGO_TESTNET_RPC, 'confirmed')
}, [connection])

// Read-only program (use-pool.ts:61-79) — identical pattern, reuse verbatim
// Account name: on-chain is LpShare (PascalCase), Anchor TS uses lpShare (camelCase)
const fetchLpShare = useCallback(async (): Promise<LpShareData | null> => {
  try {
    const account = await (program.account as any).lpShare.fetch(lpSharePda)
    return {
      user: account.user as PublicKey,
      pool: account.pool as PublicKey,
      shares: BigInt(account.shares.toString()),
      depositedAmount: BigInt(account.depositedAmount.toString()),
      pendingWithdrawal: BigInt(account.pendingWithdrawal.toString()),
      withdrawalRequestedAt: account.withdrawalRequestedAt
        ? BigInt(account.withdrawalRequestedAt.toString())
        : null,
      bump: account.bump,
    }
  } catch {
    return null // Account doesn't exist — user has no LP position in this pool
  }
}, [program, lpSharePda])
```

**LpShare PDA Derivation** (seeds: `["lp_share", user, pool]`):
```typescript
export function deriveLpSharePda(userPubkey: PublicKey, poolPda: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.LP_SHARE, userPubkey.toBuffer(), poolPda.toBuffer()],
    PROGRAM_ID
  )
  return pda
}
```

**Share Value Calculation** (matches on-chain process_withdrawal math — guard `totalLpShares > 0` to prevent division by zero):
```typescript
function calculateShareValue(
  shares: bigint,
  totalLpShares: bigint,
  yesReserves: bigint,
  noReserves: bigint
): bigint {
  if (totalLpShares === 0n) return 0n
  const poolValue = yesReserves + noReserves
  return (shares * poolValue) / totalLpShares
}

function calculateEarnings(currentValue: bigint, depositedAmount: bigint): bigint {
  return currentValue - depositedAmount // Can be negative (impermanent loss)
}
```

**USDC Formatting**: Use `formatUsdcAmount` from `@/hooks/use-claimable-amount` for consistent USDC display (used by `portfolio-summary.tsx`). For pool TVL display, also use `reservesToDisplayValue` from `@/types/pool` for bigint → number conversion.

**Multi-Asset Aggregation**: Follow `use-multi-asset-positions.ts` pattern — explicit per-asset hook calls (React hooks can't be called in loops), aggregate into summary + breakdown, handle loading/error per asset.

**WebSocket Subscription**: Optional for LP data (changes only on deposit/withdrawal). If added, follow `use-pool.ts:128-165` pattern exactly. Polling at 5s interval is sufficient.

**Page Dynamic Export**: Add `export const dynamic = 'force-dynamic'` to `page.tsx` (Vercel prerender fix from Story 4.7).

**Navigation Placement**: Add `{ label: 'LP', href: '/lp' }` to `utilityLinks` array in `app-header.tsx` (before Faucet). This automatically handles both desktop right-section rendering and mobile menu placement.

### Scope Boundaries — DO NOT Implement

- **APY calculation** — Story 5.8. Show "Coming Soon" placeholder only.
- **Deposit interface** — Story 5.6. Show disabled "Deposit" button placeholder only.
- **Withdrawal interface** — Story 5.7. Do NOT display `pendingWithdrawal` or `withdrawalRequestedAt` fields in the UI.
- **Claim Fees button** — Not applicable. Fees auto-compound into share value (pool reserves grow from trading fees → share value increases automatically). There is no separate claim action.
- **Earnings Breakdown component** — UX spec lists `EarningsBreakdown` as P3, but this story covers only the summary earnings figure (current value - deposited amount). Detailed per-epoch fee breakdown is out of scope.

### Project Structure Notes

Files to CREATE:
- `web/src/app/lp/page.tsx` — LP Dashboard page route
- `web/src/types/lp.ts` — LpShare type definitions and helpers
- `web/src/hooks/use-lp-share.ts` — Single-pool LP share data hook
- `web/src/hooks/use-multi-pool-lp.ts` — Multi-pool LP aggregation hook
- `web/src/components/lp/lp-dashboard-feature.tsx` — Main LP dashboard feature
- `web/src/components/lp/lp-summary-card.tsx` — Total LP summary
- `web/src/components/lp/lp-pool-card.tsx` — Per-pool LP card
- `web/src/components/lp/lp-empty-state.tsx` — Empty state component
- `web/src/components/lp/lp-connect-prompt.tsx` — Connect wallet prompt

Files to MODIFY:
- `web/src/lib/pda.ts` — Add `deriveLpSharePda` function
- `web/src/lib/constants.ts` — Add `lpShare` to `QUERY_KEYS`
- `web/src/components/app-header.tsx` — Add LP navigation link

### Architecture Compliance

- **TanStack Query for on-chain data**: All LpShare and Pool data fetched via TanStack Query hooks — NOT Zustand
- **Zustand for UI state only**: No new Zustand stores needed for this story (no local UI state beyond what React state handles)
- **shadcn/ui components**: Use Card, Skeleton, Badge from existing library
- **File naming**: kebab-case for all files (`lp-dashboard-feature.tsx`, `use-lp-share.ts`)
- **Component naming**: PascalCase functions (`LpDashboardFeature`, `LpPoolCard`)
- **Hook naming**: camelCase with `use` prefix (`useLpShare`, `useMultiPoolLp`)
- **Import order**: React/Next → External libs → Internal aliases (@/) → Relative → Types
- **Browser-compatible PDA**: Use `PublicKey.findProgramAddressSync` with `Buffer.from` seeds (already established in `pda.ts`)
- **FOGO identity**: No Solana references — use FOGO_TESTNET_RPC, FOGO pool PDAs

### Library/Framework Requirements

- **@solana/web3.js**: `PublicKey`, `Connection` for PDA derivation and account fetching
- **@coral-xyz/anchor**: `Program`, `AnchorProvider` for account deserialization
- **@solana/wallet-adapter-react**: `useWallet`, `useConnection` for wallet state
- **@tanstack/react-query**: `useQuery`, `useQueryClient` for data caching
- **shadcn/ui**: Card, CardContent, CardHeader, CardTitle, Skeleton, Badge
- **lucide-react**: Icons for LP-specific UI (TrendingUp, Wallet, Coins, etc.)
- **next/link**: For navigation links

### Testing Requirements

- `pnpm build` must succeed with no TypeScript errors
- LP Dashboard page renders at `/lp` route
- Pool data displays correctly for all 4 assets (BTC, ETH, SOL, FOGO)
- LpShare fetch returns null gracefully when user has no position
- Navigation link highlights correctly when on `/lp` route
- Empty state shows when wallet connected but no LP positions
- Connect wallet prompt shows when wallet not connected
- Responsive layout works on desktop and mobile viewports

### Previous Story Intelligence

- **Story 5.4**: Guard `totalLpShares > 0` before division (code review finding) — replicate in frontend `calculateShareValue`
- **Story 5.2**: LpShare created via `init_if_needed` on first deposit — account won't exist until user deposits. `deposited_amount` tracks original deposit for P&L.
- **Story 4.7**: `export const dynamic = 'force-dynamic'` required on page.tsx for Vercel. Feature component as client component, page.tsx as minimal wrapper.
- **Story 2.2**: `useWallet().publicKey` is null when disconnected — conditional rendering established pattern.

### Git Intelligence

Recent commits show:
- All Epic 5 stories (5.1-5.4) are on-chain Anchor instructions — this is the first frontend story in Epic 5
- Commit format: `feat: <description> (Story X.Y)`
- Frontend stories typically don't require `anchor build` or IDL copy
- Recent frontend fixes (Story 7.2 code review, Vercel deployment fixes) show importance of `force-dynamic` export

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5] — Acceptance criteria and BDD
- [Source: _bmad-output/planning-artifacts/prd.md#FR28] — LP can view pool TVL for each asset
- [Source: _bmad-output/planning-artifacts/prd.md#FR29] — LP can view estimated APY (placeholder for now, Story 5.8)
- [Source: _bmad-output/planning-artifacts/prd.md#FR32] — LP can view LP share and current value
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Derek Journey] — LP Dashboard flow: APY, TVL, Your Position
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component Breakdown Phase 4] — LPDashboard (P3), DepositForm, WithdrawForm, EarningsBreakdown
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty States] — "Earn fees by providing liquidity"
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Navigation] — LP as top-level nav item
- [Source: web/src/hooks/use-pool.ts] — TanStack Query + WebSocket subscription pattern
- [Source: web/src/hooks/use-multi-asset-positions.ts] — Multi-asset aggregation pattern
- [Source: web/src/components/trading/multi-asset-positions-panel.tsx] — Panel/card composition pattern
- [Source: web/src/components/app-header.tsx] — Navigation structure
- [Source: web/src/lib/pda.ts] — PDA derivation utilities
- [Source: web/src/lib/constants.ts] — Seeds, PDAs, query keys
- [Source: web/src/types/pool.ts] — Pool data types and helpers
- [Source: anchor/programs/fogopulse/src/state/lp.rs] — On-chain LpShare account structure
- [Source: _bmad-output/implementation-artifacts/5-4-implement-process-withdrawal-instruction.md] — Previous story patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No issues encountered. Build passed on first attempt.

### Completion Notes List

- Implemented `deriveLpSharePda` in `pda.ts` using seeds `["lp_share", user, pool]`
- Created `LpShareData` interface in `types/lp.ts` with `calculateShareValue` and `calculateEarnings` helpers; guards `totalLpShares > 0` per Story 5.4 finding
- Created `useLpShare` hook following `use-pool.ts` pattern: Anchor program setup, TanStack Query with 5s polling / 3s staleTime, returns null gracefully when no LP account exists
- Created `useMultiPoolLp` aggregation hook following `use-multi-asset-positions.ts` pattern: explicit per-asset hook calls, aggregates totalValue/totalEarnings
- Created LP Dashboard page at `/lp` with `force-dynamic` export (Story 4.7 lesson)
- Created 5 LP components: `LpDashboardFeature` (main), `LpSummaryCard`, `LpPoolCard`, `LpEmptyState`, `LpConnectPrompt`
- Pool cards show TVL, shares, share value, earnings, and "APY — Coming Soon" badge (Story 5.8 deferred)
- Empty state shows "Earn fees by providing liquidity" with disabled Deposit button (Story 5.6 deferred)
- Connect wallet prompt with WalletButton when disconnected
- Responsive grid: `grid-cols-1 md:grid-cols-2`
- Added LP link to `utilityLinks` in `app-header.tsx` before Faucet — appears in both desktop and mobile nav
- Added `lpShare` query key factory to `QUERY_KEYS`
- `pnpm build` passes with zero TypeScript errors

### Code Review (AI) — 2026-03-18

**Reviewer:** Claude Opus 4.6 (adversarial code review)

**Issues Found:** 2 High, 4 Medium, 2 Low

**Fixes Applied:**
- **H1 FIXED:** `bigint.toLocaleString()` in `lp-pool-card.tsx` — changed to `Number(myShares).toLocaleString()` for cross-browser safety
- **H2 FIXED:** Negative earnings formatting (`$-0.50` → `-$0.50`) in `lp-pool-card.tsx` and `lp-summary-card.tsx` — use absolute value for formatting, place sign before `$`
- **M1 FIXED:** Added loading skeleton state in `lp-dashboard-feature.tsx` — summary card no longer renders with `$0.00` during initial load
- **M3 FIXED:** Added `hasError` to `useMultiPoolLp` hook and error state card in `lp-dashboard-feature.tsx`

**Accepted as-is:**
- **M2:** `formatPoolLiquidity` used for TVL — semantically different from original intent but math is correct
- **M4:** 4 pool queries poll on LP page even when wallet disconnected — acceptable, `usePool` is shared
- **L1:** Empty state text slightly differs from AC wording — acceptable enhancement
- **L2:** Stale-while-revalidate edge case — correct TanStack Query behavior

### Change Log

- 2026-03-18: Implemented Story 5.5 — LP Dashboard with all 8 tasks complete
- 2026-03-18: Code review — fixed 4 issues (H1, H2, M1, M3), accepted 4 as-is

### File List

New files:
- web/src/app/lp/page.tsx
- web/src/types/lp.ts
- web/src/hooks/use-lp-share.ts
- web/src/hooks/use-multi-pool-lp.ts
- web/src/components/lp/lp-dashboard-feature.tsx
- web/src/components/lp/lp-summary-card.tsx
- web/src/components/lp/lp-pool-card.tsx
- web/src/components/lp/lp-empty-state.tsx
- web/src/components/lp/lp-connect-prompt.tsx

Modified files:
- web/src/lib/pda.ts
- web/src/lib/constants.ts
- web/src/components/app-header.tsx
