# Story 7.1: Implement USDC Testnet Faucet

## Status: Complete

## Description
Self-service faucet page that lets anyone with a wallet get test USDC on FOGO testnet without needing admin scripts or mint authority access.

## Acceptance Criteria
- [x] Faucet page accessible at `/faucet` with navigation link
- [x] Server-side API route holds mint authority keypair securely
- [x] Balance check: cannot mint if wallet balance >= cap (enforced server-side, cap not exposed to UI)
- [x] Mints 1000 USDC per request
- [x] Shows current USDC balance; cap and mint-amount info rows hidden to prevent gaming
- [x] Toast notification with explorer link on success
- [x] Error handling for wallet not connected, over-cap, and server errors
- [x] `FAUCET_PRIVATE_KEY` env var documented in `.env.example`
- [x] Unit tests for API route logic, hook, and component

## Architecture

### Three Layers
1. **API Route** (`web/src/app/api/faucet/route.ts`) — `GET ?wallet=` returns `{ canMint }` for eligibility check; `POST` loads `FAUCET_PRIVATE_KEY`, checks on-chain balance < cap, calls `mintTo` for 1000 USDC
2. **Hook** (`web/src/hooks/use-faucet-mint.ts`) — `useQuery` checks eligibility on page load via GET; `useMutation` POSTs to mint, invalidates `usdc-balance` and `faucet-status` queries on success/error
3. **Page** (`web/src/app/faucet/page.tsx` + `web/src/components/faucet/faucet-feature.tsx`) — Card UI with balance display, mint button, vague over-cap message (no numbers revealed)

### Gate Logic
- **Single rule**: Cannot mint if wallet balance >= `FAUCET_BALANCE_CAP` (checked server-side, value not exposed to client)
- No rate limiter needed — the balance cap is the only gate
- Eligibility is checked on page load via `GET /api/faucet?wallet=...` — button is disabled immediately if over cap
- Over-cap responses use a vague message to prevent users from gaming the threshold

### Environment
- `FAUCET_PRIVATE_KEY`: JSON byte array of mint authority keypair (server-side only)

## Files Created
| File | Purpose |
|------|---------|
| `web/src/app/api/faucet/route.ts` | Server-side mint with balance check |
| `web/src/app/faucet/page.tsx` | Page route |
| `web/src/hooks/use-faucet-mint.ts` | Mutation hook |
| `web/src/components/faucet/faucet-feature.tsx` | Main UI component |
| `web/src/app/api/faucet/route.test.ts` | API route logic tests |
| `web/src/hooks/use-faucet-mint.test.ts` | Hook tests |
| `web/src/components/faucet/faucet-feature.test.tsx` | Component tests |

## Files Modified
| File | Change |
|------|--------|
| `web/src/lib/constants.ts` | `FAUCET_MINT_AMOUNT=1000`, `FAUCET_BALANCE_CAP=500` (cap hidden from UI) |
| `web/src/app/layout.tsx` | Added Faucet nav link |
| `web/.env.example` | Added `FAUCET_PRIVATE_KEY` with documentation |

## Test Results
- 46 tests passing across 3 test suites
- Type check clean (no new errors introduced)

## Dev Notes
- The API route creates the wallet's USDC ATA if it doesn't exist (using `getOrCreateAssociatedTokenAccount`)
- Balance check returns HTTP 429 when over cap, with vague message (no balance/cap numbers leaked)
- Component handles all states: disconnected, loading, ready, over-cap, minting
- Toast success includes explorer link via `FOGO_EXPLORER_TX_URL`
- UI intentionally hides cap value and "amount per request" info rows to prevent abuse/gaming
- `FAUCET_BALANCE_CAP` and `FAUCET_MINT_AMOUNT` are server-side only — NOT imported in client components
- Over-cap state in UI is driven by `GET /api/faucet?wallet=...` query on page load (30s stale time), not by client-side constant comparison
- After mint success or error, `faucet-status` query is invalidated to re-check eligibility
- API route also handles `TokenInvalidAccountOwnerError` (treats as zero balance)
- GET handler defaults to `canMint: true` on unexpected errors so the button isn't permanently disabled

## Change Log

### 2026-03-16 — Code Review Fixes
- **H1 Fixed:** Removed `FAUCET_BALANCE_CAP` import from client component (`faucet-feature.tsx`). Over-cap state now driven by hook's `isOverCap` flag set from server 429 response.
- **H2 Fixed:** Changed mint button text from `Mint 1000 USDC` to `Mint Test USDC` — no longer reveals mint amount.
- **M1 Fixed:** Rewrote API route tests (`route.test.ts`) — now calls actual `POST` handler with mocked `@solana/web3.js` and `@solana/spl-token`. Tests cover success, cap enforcement, token errors, input validation, config errors, and downstream failures.
- **M2 Fixed:** Rewrote hook tests (`use-faucet-mint.test.ts`) — now uses `renderHook`, mocked `fetch`, and verifies mutation behavior, toast messages, query invalidation, explorer URL, and over-cap state tracking.
- **M3 Documented:** Added comment in `constants.ts` explaining intentional design where mint amount (1000) exceeds cap (500).
- **L1 Fixed:** Added `TokenInvalidAccountOwnerError` handling in API route's `getUsdcBalance` helper.
- Updated `useFaucetMint` hook to track `isOverCap` state from 429 responses and expose it to the component.
- Test count increased from 36 to 39.

### 2026-03-16 — Eligibility check on page load
- Added `GET /api/faucet?wallet=<address>` handler returning `{ canMint: boolean }` — checks on-chain balance against cap without revealing the cap value.
- Replaced `useState`-based `isOverCap` in hook with `useQuery` that calls GET on page load (30s stale time). Button is now disabled immediately on load if wallet is over cap.
- After mint success or error, `faucet-status` query is invalidated to re-check eligibility.
- GET handler defaults to `canMint: true` on unexpected errors to avoid permanently disabling the button.
- Added 6 GET handler tests and 3 `isOverCap` query-based tests. Test count increased from 39 to 46.
