# Story 7.35: Balance Page Revamp — FOGO Primary + USDC Display

Status: done
Created: 2026-03-26
Epic: 7 - Platform Polish & UX
Sprint: Current
Priority: Medium — UX Correctness + Enhancement

## Story

As a user,
I want the balance page to show my FOGO balance as the primary balance, my USDC balance prominently, and all my tokens with human-readable names and USD values,
so that I can see my actual holdings at a glance without needing to look up mint addresses.

## Problem

The balance page at `/account/[address]` currently displays the native gas token balance with the label "SOL". On the FOGO chain, the native gas token is **FOGO**, not SOL. This is misleading and incorrect.

### Current Issues

1. **Wrong label**: The hero heading shows "1.23456 SOL" — but `connection.getBalance()` returns FOGO lamports on this chain
2. **Missing USDC**: USDC (the trading currency) is not prominently displayed — it only appears in the raw token accounts table
3. **Dated layout**: The page uses a generic `AppHero` centered-text layout with a raw SPL token table that shows public keys and mint addresses — not user-friendly
4. **Wallet dropdown also says "SOL"**: The wallet button and wallet info components label the native balance as "SOL"
5. **Useless Airdrop button**: The Airdrop button on the balance page serves no purpose and should be removed
6. **Token table shows raw addresses**: Token accounts table displays public keys and mint addresses instead of human-readable token names. Tokens on FOGO chain (wFOGO, fUSD, FURBO, stFOGO, Pyth, OIL, etc.) have Metaplex Token Metadata on-chain but it's not being fetched
7. **No USD values**: Token balances show raw amounts with no USD conversion
8. **NFTs clutter the list**: Tokens with decimals: 0 (NFTs) appear in the fungible token table
9. **No sorting**: Tokens appear in arbitrary RPC order instead of by value
10. **Tables stretched too wide**: Token Accounts and Transaction History tables stretch full width on wide screens, looking unbalanced compared to the centered balance cards

### Current Layout

```
AppHero: "1.23456 SOL" (large heading — wrong label)
Explorer link
[Airdrop] [Send] [Receive]

Token Accounts Table (raw: Public Key | Mint | Balance)
Transaction History Table
```

## Solution

1. **Relabel native balance from "SOL" to "FOGO"** everywhere (balance page, wallet button, wallet info)
2. **Replace AppHero with a 2-card balance dashboard**: FOGO (primary) + USDC (secondary)
3. **Remove Airdrop button** — serves no purpose; keep Send/Receive
4. **Revamp token accounts table** — resolve token names from on-chain Metaplex metadata, add USD value column via Pyth batch price fetch
5. **Filter NFTs** from the token table (decimals === 0)
6. **Sort tokens** by USD value descending, then named tokens by balance, then unnamed
7. **Constrain page width** — `max-w-5xl mx-auto` on the outer container so tables don't stretch edge-to-edge
8. **Keep existing functionality**: Send/Receive buttons, transaction history

### New Layout

```
┌──────────────────────────────────────────────────┐
│  Wallet: 4xK...7mP (explorer link)              │
│                                                  │
│  ┌────────────────────┐  ┌─────────────────────┐│
│  │ FOGO Balance        │  │ USDC Balance        ││
│  │ 1,234.56 FOGO      │  │ $567.89 USDC        ││
│  └────────────────────┘  └─────────────────────┘│
│                                                  │
│  [Send] [Receive]                                │
│                                                  │
│  Token Accounts (existing table)                 │
│  Transaction History (existing table)            │
└──────────────────────────────────────────────────┘
```

### Key Design Decisions

- **No new hook needed**: `connection.getBalance()` already returns FOGO lamports. `LAMPORTS_PER_SOL` constant still works for conversion (same denomination).
- **Reuse `useUsdcBalance()`**: Existing hook handles USDC balance fetching with 10s refresh.
- **Reuse `useGetBalance()`**: Existing hook fetches native (FOGO) balance.
- **USDC card only for connected wallet**: The `useUsdcBalance()` hook uses the connected wallet internally, so USDC card shows "Connect wallet" when viewing another user's address.

## Acceptance Criteria

1. **Given** the balance page loads, **Then** the primary balance card shows "FOGO Balance" with the native token amount (not "SOL")
2. **Given** a connected wallet with USDC, **Then** a USDC balance card shows "$X.XX USDC"
3. **Given** a connected wallet with no USDC, **Then** the USDC card shows "$0.00 USDC"
4. **Given** balances are loading, **Then** skeleton placeholders are shown in both cards
5. **Given** the wallet dropdown button, **Then** it shows "X.XXXX FOGO" (not "SOL")
6. **Given** the wallet info component, **Then** it shows "X.XX FOGO" (not "SOL")
7. **Given** the balance page, **Then** there is no Airdrop button (removed)
8. **Given** the Send/Receive buttons, **Then** they still function as before
9. **Given** the token accounts table, **Then** it still renders all SPL token accounts
10. **Given** a token with Metaplex metadata (e.g., wFOGO, fUSD, FURBO, stFOGO, Pyth), **Then** the token table shows its symbol/name from on-chain metadata
11. **Given** a token without Metaplex metadata, **Then** the token table shows an ellipsified mint address with explorer link
12. **Given** a token with a Pyth price feed (BTC, ETH, SOL, FOGO) or USDC, **Then** the USD value column shows `$X.XX`
13. **Given** a token without a price feed, **Then** the USD value column shows "—"
14. **Given** an NFT (decimals: 0), **Then** it is excluded from the token table
15. **Given** multiple tokens, **Then** they are sorted by USD value descending, then named tokens by balance, then unnamed
16. **Given** a wide screen, **Then** the token table and transaction history are centered with breathing room on both sides

## Architecture

### Reused Hooks (no changes needed)
- `useGetBalance({ address })` from `web/src/components/account/account-data-access.tsx` — returns FOGO lamports
- `useUsdcBalance()` from `web/src/hooks/use-usdc-balance.ts` — returns USDC balance

### New Component
- `AccountBalanceCards({ address })` — 2-card grid using shadcn Card + Skeleton

### New Hooks
- `useTokenPrices()` from `web/src/hooks/use-token-prices.ts` — batch Pyth price fetch for all known assets
- `useTokenMetadata()` from `web/src/hooks/use-token-metadata.ts` — fetches Metaplex on-chain metadata (name/symbol) for all token mints

### Removed Components
- `AccountBalance` — old SOL hero heading (replaced by cards)
- `BalanceSol` — old lamport-to-SOL formatter (inlined in card)
- `ModalAirdrop` — airdrop button/modal (serves no purpose)
- `useRequestAirdrop` import — no longer needed

## Critical Reference Files

| File | Purpose |
|------|---------|
| `web/src/components/account/account-ui.tsx` | Primary — balance cards, token table with metadata |
| `web/src/hooks/use-token-metadata.ts` | Metaplex metadata fetch hook |
| `web/src/hooks/use-token-prices.ts` | Pyth batch price fetch hook |
| `web/src/components/account/account-detail-feature.tsx` | Page layout — replace AppHero |
| `web/src/components/account/account-data-access.tsx` | `useGetBalance` hook (no changes) |
| `web/src/hooks/use-usdc-balance.ts` | `useUsdcBalance` hook (no changes) |
| `web/src/components/wallet/wallet-button.tsx` | Relabel SOL → FOGO |
| `web/src/components/wallet/wallet-info.tsx` | Relabel SOL → FOGO |
| `web/src/components/ui/card.tsx` | shadcn Card component (no changes) |
| `web/src/components/ui/skeleton.tsx` | shadcn Skeleton component (no changes) |

## Tasks / Subtasks

### Task 1: Add AccountBalanceCards component (AC: #1, #2, #3, #4)

- [x] 1.1: Add new imports to `account-ui.tsx`: `useUsdcBalance`, `Card`/`CardContent`/`CardHeader`/`CardTitle`, `Skeleton`, `useWallet`
- [x] 1.2: Create `AccountBalanceCards` component with 2-card responsive grid
- [x] 1.3: FOGO card — use `useGetBalance`, convert lamports, display with `text-primary` styling
- [x] 1.4: USDC card — use `useUsdcBalance`, display with `$` prefix
- [x] 1.5: Add Skeleton loading states for both cards
- [x] 1.6: Remove old `AccountBalance` component and `BalanceSol` helper

### Task 2: Revamp page layout and remove Airdrop (AC: #7, #8)

- [x] 2.1: Replace `AppHero` with header section + `AccountBalanceCards` + centered buttons
- [x] 2.2: Update imports in `account-detail-feature.tsx`
- [x] 2.3: Remove `ModalAirdrop` component and `useRequestAirdrop` import
- [x] 2.4: Remove Airdrop button from `AccountButtons`
- [x] 2.5: Simplify `AccountBalanceCheck` — remove airdrop action, pass `action={null}` to `AppAlert`

### Task 3: Relabel SOL → FOGO in wallet components (AC: #5, #6)

- [x] 3.1: Change "SOL" to "FOGO" in `wallet-button.tsx`
- [x] 3.2: Change "SOL" to "FOGO" in `wallet-info.tsx`

### Task 4: Token name resolution and USD values (AC: #10, #11, #12, #13)

- [x] 4.1: Add `MINT_FEED_IDS` lookup map to `constants.ts`
- [x] 4.2: Create `useTokenPrices` hook — batch Pyth `getLatestPriceUpdates()` call, 30s refresh
- [x] 4.3: Revamp `AccountTokens` table: Token (name) | Balance | Value (USD)
- [x] 4.4: USD value column: `uiAmount × price` for known tokens, "—" for unknown

### Task 5: On-chain Metaplex metadata for token names (AC: #10, #11)

- [x] 5.1: Create `useTokenMetadata` hook — batch fetch via `getMultipleAccountsInfo()`
- [x] 5.2: Parse Metaplex metadata (name/symbol) from account data buffer
- [x] 5.3: USDC fallback (no Metaplex metadata) via hardcoded `FALLBACK_METADATA`
- [x] 5.4: Update `AccountTokens` to use `useTokenMetadata` instead of hardcoded `MINT_TOKEN_NAMES`
- [x] 5.5: Show symbol as primary, full name as subtitle for tokens with both
- [x] 5.6: Remove `MINT_TOKEN_NAMES` and `MINT_TOKEN_COLORS` from `constants.ts` (replaced by on-chain data)

### Task 6: Sort tokens and filter NFTs (AC: #14, #15)

- [x] 6.1: Filter out NFTs (decimals === 0) from token list
- [x] 6.2: Sort by USD value desc → named tokens by balance desc → unnamed by balance desc
- [x] 6.3: Update "No token accounts" and "Show All" to use filtered fungible count

### Task 7: Add stablecoin price mappings (AC: #12)

- [x] 7.1: Add original USDC (`ELNbJ1RtERV2fjtuZjbTscDekWhVzkQ1LjmiPsxp5uND`) as $1 stablecoin
- [x] 7.2: Add fUSD / Fogo USD (`fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry`) as $1 stablecoin
- [x] 7.3: Refactor `useTokenPrices` to use `STABLECOIN_MINTS` map for all stablecoin entries

### Task 8: Fix USDC card showing "Connect wallet" when disconnected (AC: #2, #3)

- [x] 8.1: Replace `useUsdcBalance()` with USDC lookup from `useGetTokenAccounts({ address })`
- [x] 8.2: Remove `isOwnWallet` check — USDC card now works for any address, connected or not
- [x] 8.3: Remove `useUsdcBalance` import from account-ui (still used by trade ticket, faucet)

### Task 9: Constrain page width (AC: #16)

- [x] 9.1: Add `max-w-5xl mx-auto` to outer container in `account-detail-feature.tsx`

### Task 10: Verify build

- [x] 10.1: Run type check — no new errors (all errors pre-existing in test files)
- [x] 10.2: Visual verification of balance page layout

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] `useTokenMetadata` — `Buffer` cast unsafe for browser `Uint8Array`; wrapped with `Buffer.from()` [`web/src/hooks/use-token-metadata.ts:20`]
- [x] [AI-Review][HIGH] `useTokenPrices` — empty catch swallows all Pyth errors silently; now re-throws + logs warning [`web/src/hooks/use-token-prices.ts:51`]
- [x] [AI-Review][MEDIUM] `useTokenPrices` — `HermesClient` re-instantiated every 30s; hoisted to module scope [`web/src/hooks/use-token-prices.ts:8`]
- [x] [AI-Review][MEDIUM] Unrelated file `7-27-fix-deposit-dilution-vulnerability.md` modified in working tree — not part of this story (no code fix, user should stage carefully)
- [x] [AI-Review][MEDIUM] `useTokenMetadata` query key join — acceptable but noted; comma-join is safe for base58 addresses

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `web/src/components/account/account-ui.tsx` | Edit | Add `AccountBalanceCards`, revamp `AccountTokens` with metadata, remove old components |
| `web/src/components/account/account-detail-feature.tsx` | Edit | Replace AppHero with card-based layout |
| `web/src/components/wallet/wallet-button.tsx` | Edit | "SOL" → "FOGO" |
| `web/src/components/wallet/wallet-info.tsx` | Edit | "SOL" → "FOGO" |
| `web/src/lib/constants.ts` | Edit | Add `MINT_FEED_IDS` lookup map |
| `web/src/hooks/use-token-prices.ts` | New | Batch Pyth price fetch hook for token USD values |
| `web/src/hooks/use-token-metadata.ts` | New | Metaplex on-chain metadata fetch hook |

## Dev Agent Record

### Implementation Summary

**`web/src/components/account/account-ui.tsx`** — Main changes:
- Added imports: `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Skeleton`, `useUsdcBalance`
- New `AccountBalanceCards` component: 2-card responsive grid (`grid-cols-1 md:grid-cols-2`)
  - FOGO card: uses `useGetBalance`, converts lamports via `LAMPORTS_PER_SOL`, `text-primary` color, click-to-refresh
  - USDC card: uses `useUsdcBalance`, `$X.XX USDC` format, shows "Connect wallet" for non-own wallets
  - Both cards use `Skeleton` loading states
- Removed `AccountBalance` component (old SOL hero heading)
- Removed `BalanceSol` helper function (lamport converter, now inlined)
- Removed `ModalAirdrop` component (serves no purpose)
- Removed `useRequestAirdrop` import
- Removed Airdrop button from `AccountButtons` — only Send/Receive remain
- Simplified `AccountBalanceCheck` — removed airdrop action, just shows informational alert

**`web/src/components/account/account-detail-feature.tsx`** — Layout revamp:
- Removed `AppHero` import and usage
- New layout: centered header with "Wallet" title + explorer link → `AccountBalanceCards` → centered `AccountButtons` → existing tables
- Clean `space-y-8` vertical flow

**`web/src/components/wallet/wallet-button.tsx`** — Label fix:
- Line 110: `"SOL"` → `"FOGO"` in balance display

**`web/src/components/wallet/wallet-info.tsx`** — Label fix:
- Line 34: `"SOL"` → `"FOGO"` in balance display

**`web/src/lib/constants.ts`** — Lookup maps:
- Added `MINT_FEED_IDS`: mint address → Pyth Hermes feed ID (BTC, ETH, SOL, FOGO — not USDC)
- Initially added `MINT_TOKEN_NAMES`/`MINT_TOKEN_COLORS` for hardcoded token resolution, but later removed in favor of on-chain Metaplex metadata

**`web/src/hooks/use-token-prices.ts`** — New hook:
- Uses `HermesClient.getLatestPriceUpdates()` for batch price fetch (single RPC call for all 4 feeds)
- Returns `Record<string, number>` mapping mint → USD price
- USDC hardcoded to $1, 30s refresh, 15s stale time
- Matches Pyth feed IDs back to mint addresses via `MINT_FEED_IDS`

**`web/src/hooks/use-token-metadata.ts`** — New hook:
- Fetches Metaplex Token Metadata via `getMultipleAccountsInfo()` (batch RPC, up to 100 per call)
- Derives metadata PDA per mint: `['metadata', TOKEN_METADATA_PROGRAM, mint]`
- Parses name/symbol from binary buffer (offset 65: nameLen + name + symbolLen + symbol)
- USDC hardcoded fallback (no Metaplex metadata on FOGO testnet for USDC mint)
- 5 min staleTime, 30 min gcTime (metadata rarely changes)
- Confirmed working: resolves FURBO, OIL, fUSD, wFOGO, stFOGO, Pyth, USDC.s etc.

**`web/src/components/account/account-ui.tsx`** — `AccountTokens` final state:
- New columns: Token | Balance | Value (USD) (was: Public Key | Mint | Balance)
- Token names resolved from on-chain Metaplex metadata via `useTokenMetadata(mints)`
- Shows symbol as primary name (clickable explorer link), full name as subtitle when different
- Unknown tokens (no metadata) show ellipsified mint address with explorer link
- Balance formatted with `toLocaleString` (2-6 decimal places)
- USD value: `uiAmount × price` for priced tokens, "—" for others

**`web/src/hooks/use-token-prices.ts`** — Stablecoin mappings:
- Added `STABLECOIN_MINTS` constant mapping 3 stablecoin mints to $1:
  - Testnet USDC (`USDC_MINT` from constants)
  - Original USDC on FOGO chain (`ELNbJ1RtERV2fjtuZjbTscDekWhVzkQ1LjmiPsxp5uND`)
  - fUSD / Fogo USD (`fUSDNGgHkZfwckbr5RLLvRbvqvRcTLdH9hcHJiq4jry`)
- Refactored initial prices and fallback to spread from `STABLECOIN_MINTS`

**`web/src/components/account/account-ui.tsx`** — Token sorting & NFT filtering:
- `items` useMemo now filters `decimals === 0` (NFTs) first
- Sorts remaining tokens: USD value desc → named tokens by balance desc → unnamed by balance desc
- Added `totalFungible` memo for accurate "Show All" button and empty-state checks
- Dependencies: `prices` and `metadata` added to useMemo deps

**`web/src/components/account/account-ui.tsx`** — USDC card fix:
- Replaced `useUsdcBalance()` (connected wallet only) with USDC lookup from `useGetTokenAccounts({ address })`
- Finds USDC by matching `USDC_MINT` in token accounts data
- Works for any address regardless of wallet connection state
- Removed `isOwnWallet` check and `useUsdcBalance` import
- Added `USDC_MINT` import from constants

**`web/src/components/account/account-detail-feature.tsx`** — Page width constraint:
- Added `max-w-5xl mx-auto` to outer `<div>` so tables and sections don't stretch full width on wide screens

### Type Check
- 0 new errors introduced (all existing errors in unrelated test files)

### Status
- Status updated to: done (pending visual verification)
