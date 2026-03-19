# Story 7.7: Switch Oracle Health Card to Pyth Lazer

Status: todo
Created: 2026-03-19
Epic: 7 - Platform Polish & UX
Sprint: Backlog

## Overview

The admin dashboard's Oracle Health card currently displays price, staleness, and confidence data from **Pyth Hermes** (classic SSE feed via `usePythPrice` hook). However, the on-chain program uses **Pyth Lazer** for epoch creation and settlement. This means the admin is monitoring the wrong data source — Hermes staleness/confidence values don't reflect what the crank bot and on-chain program actually see.

Switching to Pyth Lazer's HTTP REST endpoint (`POST /v1/latest_price`) gives accurate monitoring of the actual data source used for operations.

**FRs Covered:** Operational observability, admin tooling accuracy
**Dependencies:** None (Pyth Lazer SDK `@pythnetwork/pyth-lazer-sdk` v6.2.0 already installed)

### Current State

| Component | Oracle Source | Purpose |
|-----------|-------------|---------|
| Admin Oracle Health card | Pyth Hermes (SSE) | Display monitoring — **wrong source** |
| Admin Alerts section | Pyth Hermes (SSE) | Alert monitoring — **wrong source** |
| Epoch creation (on-chain) | Pyth Lazer (Ed25519) | Transaction verification |
| Epoch settlement (on-chain) | Pyth Lazer (Ed25519) | Transaction verification |
| Trading components (market-card, chart, etc.) | Pyth Hermes (SSE) | User-facing display — OK for now |

### What Changes

- Admin dashboard components switch from Hermes → Lazer
- Trading components remain on Hermes (separate concern)

## Story

As a platform administrator,
I want the Oracle Health card to display Pyth Lazer price data instead of Pyth Hermes,
so that I can monitor the actual data source used by the crank bot and on-chain program for epoch create/settle operations.

## Acceptance Criteria

1. **Given** the admin navigates to the dashboard, **When** the Oracle Health card loads, **Then** it displays price, staleness, and confidence from Pyth Lazer (not Hermes)
2. **Given** Pyth Lazer returns price data, **When** the Oracle Health card renders, **Then** staleness values are significantly lower than with Hermes (Lazer updates at 200ms vs Hermes at ~seconds)
3. **Given** the Pyth Lazer API is unreachable, **When** the Oracle Health card polls, **Then** it shows "Disconnected" status and does not crash
4. **Given** the admin dashboard alerts section monitors oracle health, **When** oracle data is stale or has high confidence, **Then** alerts fire based on Lazer data (same threshold logic, different source)
5. **Given** trading page components (market-card, chart-area, epoch-status-display), **When** they render, **Then** they still use Pyth Hermes (unchanged)
6. **Given** the `PYTH_ACCESS_TOKEN` env var is not set, **When** the API route is called, **Then** it returns a clear error message

## Tasks / Subtasks

- [ ] Task 1: Create server-side API route for Lazer parsed prices (AC: #1, #6)
  - [ ] 1.1: Create `web/src/app/api/pyth-lazer-prices/route.ts` as a GET endpoint
  - [ ] 1.2: Read `PYTH_ACCESS_TOKEN` from server env (same as existing `/api/pyth-price`)
  - [ ] 1.3: Call `POST https://pyth-lazer-0.dourolabs.app/v1/latest_price` with Bearer token auth
  - [ ] 1.4: Request body: `{ priceFeedIds: [1, 2, 5], properties: ["price", "confidence", "exponent", "feedUpdateTimestamp"], parsed: true, channel: "fixed_rate@200ms", formats: [] }`
  - [ ] 1.5: Extract `parsed.priceFeeds[]` from `JsonUpdate` response
  - [ ] 1.6: Convert each `ParsedFeedPayload`: `actualPrice = Number(price) * 10^exponent`, same for confidence; convert `feedUpdateTimestamp` (microseconds) to milliseconds
  - [ ] 1.7: Return JSON: `{ prices: { "1": { price, confidence, timestamp }, "2": {...}, "5": {...} } }`
  - [ ] 1.8: Handle errors: missing token (500), failed fetch (502), empty response (502)

- [ ] Task 2: Create React Query hook for Lazer prices (AC: #1, #2, #3)
  - [ ] 2.1: Create `web/src/hooks/use-pyth-lazer-prices.ts`
  - [ ] 2.2: Implement fetcher function that calls `GET /api/pyth-lazer-prices`
  - [ ] 2.3: Export `usePythLazerPrice(asset: Asset)` hook using `useQuery` with shared query key `['pyth-lazer-prices']`
  - [ ] 2.4: Set `refetchInterval: 2000` (poll every 2s), `staleTime: 1500`
  - [ ] 2.5: Map query state to `ConnectionState`: loading→'connecting', error→'disconnected', fetching→'reconnecting', success→'connected'
  - [ ] 2.6: Return same `{ price: PriceData | null, connectionState: ConnectionState }` interface as `usePythPrice`
  - [ ] 2.7: Use `PYTH_LAZER_FEED_IDS` from `@/lib/constants` for asset→feedId mapping

- [ ] Task 3: Update Oracle Health card to use Lazer (AC: #1, #2)
  - [ ] 3.1: In `web/src/components/admin/oracle-health-card.tsx`, change import from `usePythPrice` to `usePythLazerPrice`
  - [ ] 3.2: Change `ConnectionState` type import to new hook
  - [ ] 3.3: In `OracleAssetRow`, change `usePythPrice(asset)` → `usePythLazerPrice(asset)`
  - [ ] 3.4: No other changes needed — staleness calc, confidence ratio, color coding, thresholds all stay identical

- [ ] Task 4: Update Alerts section to use Lazer (AC: #4)
  - [ ] 4.1: In `web/src/components/admin/alerts-section.tsx`, change import from `usePythPrice` to `usePythLazerPrice`
  - [ ] 4.2: Change all `usePythPrice('BTC')` etc. calls to `usePythLazerPrice('BTC')`
  - [ ] 4.3: All alert logic stays identical (same PriceData/ConnectionState types)

- [ ] Task 5: Verification
  - [ ] 5.1: Run `npm run build` in `web/` — no type errors
  - [ ] 5.2: Start dev server, navigate to admin dashboard — Oracle Health shows Lazer data
  - [ ] 5.3: Verify staleness values are lower than with Hermes
  - [ ] 5.4: Verify alerts still trigger correctly on stale/high-confidence conditions
  - [ ] 5.5: Verify trading pages still work (Hermes unchanged)
  - [ ] 5.6: Run `npm test` in `web/`

## Dev Notes

### Architecture: Simple HTTP Polling (not WebSocket)

**Why not use the SDK's WebSocket streaming on the server?**
- The existing `/api/pyth-price` route already does one-shot WS for transaction building — it creates a `PythLazerClient` (which spins up a `WebSocketPool`) for each request, which is wasteful for continuous monitoring
- The SDK has a `getLatestPrice()` HTTP method that calls `POST /v1/latest_price` — a simple REST call
- For the admin dashboard, 2-second polling via HTTP is more than adequate

**Why not use `PythLazerClient.getLatestPrice()` directly?**
- `PythLazerClient.create()` always creates a `WebSocketPool` even for HTTP-only calls
- A direct `fetch` to the same URL with Bearer auth is simpler and avoids the overhead
- The URL (`https://pyth-lazer-0.dourolabs.app/v1/latest_price`) and auth pattern are visible in the SDK source (`client.mjs:193-214`)

**Why React Query instead of custom polling?**
- Already used throughout the project
- Automatic deduplication: all 4 `OracleAssetRow` components share one fetch via shared query key
- Built-in error/loading/stale state management
- `refetchInterval` handles polling; `staleTime` prevents redundant fetches

### Pyth Lazer SDK Types (Reference)

```typescript
// protocol.d.ts — relevant types
type ParsedFeedPayload = {
  priceFeedId: number
  price?: string           // Raw integer string, needs exponent
  confidence?: number      // Raw integer, needs exponent
  exponent?: number        // Negative (e.g., -8)
  feedUpdateTimestamp?: number  // Microseconds
}

type ParsedPayload = {
  timestampUs: string
  priceFeeds: ParsedFeedPayload[]
}

type JsonUpdate = {
  parsed?: ParsedPayload
  solana?: JsonBinaryData  // Not needed for display
}

type LatestPriceRequest = {
  priceFeedIds?: number[]
  properties: PriceFeedProperty[]
  formats: Format[]
  parsed?: boolean
  channel: Channel
}
```

### Price Conversion

```typescript
// ParsedFeedPayload.price is a string like "6543210000"
// ParsedFeedPayload.exponent is negative like -8
// Actual price = Number(price) * 10^exponent = 6543210000 * 10^-8 = 65432.10
const actualPrice = Number(payload.price) * Math.pow(10, payload.exponent)
const actualConfidence = Number(payload.confidence) * Math.pow(10, payload.exponent)
const timestampMs = Math.floor(payload.feedUpdateTimestamp / 1000) // μs → ms
```

### Existing Interface to Match

```typescript
// From web/src/hooks/use-pyth-price.ts
export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting'
export interface PriceData {
  price: number
  confidence: number
  timestamp: number  // milliseconds
}
```

### FOGO Feed ID Note

FOGO is currently mapped to feed ID `1` (BTC placeholder) in `PYTH_LAZER_FEED_IDS` at `web/src/lib/constants.ts`. This is a known issue addressed in Story 7.6 (Task 1.2: change to `2923`). No change needed in this story.

### Scope Boundaries — DO NOT Implement

- Do NOT modify trading page components (market-card, chart-area, epoch-status-display) — they stay on Hermes
- Do NOT modify the existing `/api/pyth-price` route — it serves transaction building (binary data)
- Do NOT modify `pyth-lazer-client.ts` — it serves one-shot fetch for epoch creation
- Do NOT modify `use-pyth-price.ts` — still used by trading components
- Do NOT add WebSocket streaming to the new API route — HTTP polling is sufficient

### File List

**Files to create:**
- `web/src/app/api/pyth-lazer-prices/route.ts` — Server-side proxy for Lazer parsed prices
- `web/src/hooks/use-pyth-lazer-prices.ts` — React Query hook for polling Lazer prices

**Files to modify:**
- `web/src/components/admin/oracle-health-card.tsx` — Swap `usePythPrice` → `usePythLazerPrice` (3 lines)
- `web/src/components/admin/alerts-section.tsx` — Swap `usePythPrice` → `usePythLazerPrice` (5 lines)

**Files NOT changed:**
- `web/src/hooks/use-pyth-price.ts` — Still used by trading components
- `web/src/app/api/pyth-price/route.ts` — Still serves binary data for TX building
- `web/src/lib/pyth-lazer-client.ts` — Still serves one-shot fetch for epoch creation
- `web/src/lib/constants.ts` — Feed IDs unchanged (FOGO fix is Story 7.6 scope)
