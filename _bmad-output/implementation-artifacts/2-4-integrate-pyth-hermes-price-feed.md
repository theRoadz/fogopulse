# Story 2.4: Integrate Pyth Hermes Price Feed

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want to see real-time price data,
So that I can make informed trading decisions.

## Acceptance Criteria

1. **Given** the trading interface with a selected asset, **When** the page loads, **Then** an SSE connection to Pyth Hermes is established
2. Live price updates are received and displayed via Server-Sent Events streaming
3. Price updates within 1 second of oracle publication (NFR4)
4. The current price is prominently displayed with USD formatting
5. Connection status indicator shows Live/Reconnecting/Offline states
6. AR18 (Pyth Hermes for frontend) is satisfied

## Tasks / Subtasks

- [x] Task 0: Install required dependencies (MUST DO FIRST)
  - [x] Subtask 0.1: Run `cd web && pnpm add @pythnetwork/hermes-client`
  - [x] Subtask 0.2: Verify installation in package.json

- [x] Task 1: Create usePythPrice hook (AC: #1, #2, #3)
  - [x] Subtask 1.1: Create `web/src/hooks/use-pyth-price.ts`
  - [x] Subtask 1.2: Import `HermesClient` from `@pythnetwork/hermes-client`
  - [x] Subtask 1.3: Accept `asset: Asset` parameter (not feedId)
  - [x] Subtask 1.4: Get feedId from `ASSET_METADATA[asset].feedId`
  - [x] Subtask 1.5: Use `getPriceUpdatesStream()` for SSE streaming
  - [x] Subtask 1.6: Return `{ price, connectionState }` where connectionState is `connected | reconnecting | disconnected`
  - [x] Subtask 1.7: Implement exponential backoff reconnection (max 5 retries)
  - [x] Subtask 1.8: Implement cleanup with `isMounted` flag and EventSource close
  - [x] Subtask 1.9: Parse price using exponent: `price * Math.pow(10, expo)`
  - [x] Subtask 1.10: Handle empty feedId gracefully (FOGO case)

- [x] Task 2: Create price formatting utilities (AC: #4)
  - [x] Subtask 2.1: Create `formatUsdPrice(price: number): string` in `web/src/lib/utils.ts`
  - [x] Subtask 2.2: Format with proper USD formatting (e.g., "$95,432.18")
  - [x] Subtask 2.3: Handle large numbers (BTC) and small numbers (fractional tokens)
  - [x] Subtask 2.4: Create `formatPriceChange(change: number): string` with + or - prefix

- [x] Task 3: Create ConnectionStatus component (AC: #5)
  - [x] Subtask 3.1: Create `web/src/components/trading/connection-status.tsx`
  - [x] Subtask 3.2: Accept `state: ConnectionState` prop
  - [x] Subtask 3.3: Display colored dot indicator (green/yellow/red)
  - [x] Subtask 3.4: Display text label: "Live" / "Reconnecting..." / "Offline"
  - [x] Subtask 3.5: Add accessibility attributes (aria-live, role="status")
  - [x] Subtask 3.6: Yellow dot should pulse when reconnecting

- [x] Task 4: Update ChartArea to use real price (AC: #4, #5)
  - [x] Subtask 4.1: Modify `web/src/components/trading/chart-area.tsx`
  - [x] Subtask 4.2: Import `usePythPrice` hook and `ConnectionStatus` component
  - [x] Subtask 4.3: Replace placeholder `$--,---.--` with `formatUsdPrice(price)`
  - [x] Subtask 4.4: Add `ConnectionStatus` component showing connection state
  - [x] Subtask 4.5: Handle FOGO case - show "Price Unavailable" when no feedId
  - [x] Subtask 4.6: Show loading skeleton while connecting initially

- [x] Task 5: Handle FOGO asset edge case (AC: #1, #2)
  - [x] Subtask 5.1: Check if FOGO feed ID is available in Pyth
  - [x] Subtask 5.2: If no FOGO feed: display "Price Unavailable" gracefully
  - [x] Subtask 5.3: Add fallback logic to skip subscription for empty feedId
  - [x] Subtask 5.4: Document FOGO feed ID status in constants.ts
  - [x] Subtask 5.5: FOGO/USD Pyth Hermes feed now available — populated feedId `0x245f89fb8084840bd098d661a026032ee21062270003426797c9196d2d8d4e43` in ASSET_METADATA

- [x] Task 6: Create hooks barrel export
  - [x] Subtask 6.1: Create `web/src/hooks/index.ts` barrel file
  - [x] Subtask 6.2: Export `usePythPrice` from barrel

- [x] Task 7: Testing and build verification
  - [x] Subtask 7.1: Verify SSE connection establishes on page load
  - [x] Subtask 7.2: Verify price updates appear within 1 second
  - [x] Subtask 7.3: Test asset switching - new subscription for new asset
  - [x] Subtask 7.4: Verify cleanup on component unmount (no memory leaks)
  - [x] Subtask 7.5: Run `pnpm build` - ensure no TypeScript errors
  - [x] Subtask 7.6: Test dark/light theme compatibility
  - [x] Subtask 7.7: Test FOGO asset shows "Price Unavailable"

## Dev Notes

### CRITICAL: Dependency Installation

The Pyth Hermes client is NOT currently installed. Run this FIRST:
```bash
cd web && pnpm add @pythnetwork/hermes-client
```

### CRITICAL: Use HermesClient (NOT PriceServiceConnection)

Use `@pythnetwork/hermes-client` with SSE streaming:
- **HermesClient** is the newer, recommended package
- Uses **Server-Sent Events (SSE)** - more efficient for one-way price updates
- Cleaner async/await API compared to older WebSocket approach

### CRITICAL: FOGO Chain Context

This is a FOGO application. All references should say "FOGO", not "Solana". However, Pyth Hermes is a universal service (not FOGO-specific) - it serves price data to all chains.

### Previous Story Learnings (Story 2.3)

1. **Zustand for UI state:** AR16 mandates Zustand + Immer for all state management
2. **URL is source of truth:** Asset selection is driven by URL params
3. **FOGO branding:** Keep all network references as "FOGO"
4. **Build validation:** Always run `pnpm build` before marking complete
5. **Type safety:** Use type guards and proper validation

### Architecture Compliance (AR18)

From architecture.md:
> **AR18:** Use Pyth Hermes for frontend price display (same source as settlement)

This ensures price consistency between what users see and what the on-chain settlement uses.

### Pyth Hermes Integration Pattern (HermesClient + SSE)

**Reference Implementation:** `D:\dev\2026\fogopulse\web\hooks\use-pyth-price.ts`

```typescript
// web/src/hooks/use-pyth-price.ts
'use client'

import { useState, useEffect } from 'react'
import { HermesClient } from '@pythnetwork/hermes-client'
import { ASSET_METADATA } from '@/lib/constants'
import type { Asset } from '@/types/assets'

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting'

export interface PriceData {
  price: number
  confidence: number
  timestamp: number
}

const MAX_RETRIES = 5
const HERMES_ENDPOINT = 'https://hermes.pyth.network'

/**
 * Hook for streaming real-time price data from Pyth Hermes.
 * Uses Server-Sent Events (SSE) for efficient real-time updates.
 *
 * @param asset - The asset to get price data for (BTC, ETH, SOL, or FOGO)
 * @returns Object containing price data and connection state
 */
export function usePythPrice(asset: Asset) {
  const [price, setPrice] = useState<PriceData | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')

  useEffect(() => {
    const feedId = ASSET_METADATA[asset].feedId

    // Handle FOGO placeholder - no price feed available yet
    if (!feedId) {
      setConnectionState('disconnected')
      setPrice(null)
      return
    }

    let eventSource: EventSource | null = null
    let retryTimeout: NodeJS.Timeout | null = null
    let retryCount = 0
    let isMounted = true

    const cleanup = () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout)
        retryTimeout = null
      }
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
    }

    const connect = async (isRetry = false) => {
      if (!isMounted) return

      try {
        cleanup()
        // Only show 'reconnecting' on retry attempts, not initial connection
        if (isRetry) {
          setConnectionState('reconnecting')
        }

        const client = new HermesClient(HERMES_ENDPOINT, {})
        const source = await client.getPriceUpdatesStream([feedId], {
          parsed: true,
          allowUnordered: true,
          benchmarksOnly: false,
        })

        if (!isMounted) {
          source.close()
          return
        }

        source.onopen = () => {
          if (!isMounted) return
          setConnectionState('connected')
          retryCount = 0
        }

        source.onmessage = (event: MessageEvent) => {
          if (!isMounted) return
          try {
            const data = JSON.parse(event.data)
            // Parse Pyth price format from streaming response
            const priceInfo = data.parsed?.[0]?.price
            if (priceInfo) {
              const expo = Number(priceInfo.expo)
              setPrice({
                price: Number(priceInfo.price) * Math.pow(10, expo),
                confidence: Number(priceInfo.conf) * Math.pow(10, expo),
                timestamp: Number(data.parsed[0].price.publish_time) * 1000, // Convert to ms
              })
            }
          } catch {
            // Silently handle parse errors for malformed messages
          }
        }

        source.onerror = () => {
          if (!isMounted) return
          setConnectionState('reconnecting')
          cleanup()

          // Exponential backoff reconnection
          if (retryCount < MAX_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
            retryCount++
            retryTimeout = setTimeout(() => connect(true), delay)
          } else {
            setConnectionState('disconnected')
          }
        }

        eventSource = source
      } catch {
        if (!isMounted) return
        setConnectionState('disconnected')
      }
    }

    connect()

    return () => {
      isMounted = false
      cleanup()
    }
  }, [asset])

  return { price, connectionState }
}
```

### Price Formatting Utilities

```typescript
// Add to web/src/lib/utils.ts

export function formatUsdPrice(price: number | null): string {
  if (price === null) return '$--,---.--'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: price < 1 ? 6 : 2,
  }).format(price)
}

export function formatPriceChange(change: number | null): string {
  if (change === null) return '--'
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

export function formatLastUpdated(publishTime: number | null): string {
  if (!publishTime) return '--'
  const now = Math.floor(Date.now() / 1000)
  const diff = now - publishTime
  if (diff < 1) return 'Just now'
  if (diff < 60) return `${diff}s ago`
  return `${Math.floor(diff / 60)}m ago`
}
```

### ConnectionStatus Component Pattern

**Reference Implementation:** `D:\dev\2026\fogopulse\web\components\trading\connection-status.tsx`

```typescript
// web/src/components/trading/connection-status.tsx
'use client'

import { cn } from '@/lib/utils'
import type { ConnectionState } from '@/hooks/use-pyth-price'

interface ConnectionStatusProps {
  state: ConnectionState
  className?: string
}

/**
 * Subtle connection status indicator displayed in the chart corner.
 * Shows the current SSE connection state with appropriate visual feedback.
 */
export function ConnectionStatus({ state, className }: ConnectionStatusProps) {
  return (
    <div
      className={cn(
        'absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
        'bg-background/80 backdrop-blur-sm border border-border/50',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={`Price feed ${state}`}
    >
      <span
        className={cn(
          'w-2 h-2 rounded-full',
          state === 'connected' && 'bg-primary',
          state === 'reconnecting' && 'bg-yellow-500 animate-pulse motion-reduce:animate-none',
          state === 'disconnected' && 'bg-destructive'
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          'text-muted-foreground',
          state === 'connected' && 'text-primary',
          state === 'reconnecting' && 'text-yellow-500',
          state === 'disconnected' && 'text-destructive'
        )}
      >
        {state === 'connected' && 'Live'}
        {state === 'reconnecting' && 'Reconnecting...'}
        {state === 'disconnected' && 'Offline'}
      </span>
    </div>
  )
}
```

### Feed IDs Reference

From `web/src/lib/constants.ts`:
```typescript
export const ASSET_METADATA = {
  BTC: {
    feedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  },
  ETH: {
    feedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  },
  SOL: {
    feedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  },
  FOGO: {
    feedId: '0x245f89fb8084840bd098d661a026032ee21062270003426797c9196d2d8d4e43',
  },
}
```

### Files to Create

| File | Purpose |
|------|---------|
| `web/src/hooks/use-pyth-price.ts` | Custom hook for Pyth SSE price streaming |
| `web/src/hooks/index.ts` | Barrel export for hooks |
| `web/src/components/trading/connection-status.tsx` | Connection status indicator component |

### Files to Modify

| File | Changes |
|------|---------|
| `web/src/lib/utils.ts` | Add `formatUsdPrice`, `formatLastUpdated` utilities |
| `web/src/components/trading/chart-area.tsx` | Integrate usePythPrice hook and ConnectionStatus |
| `web/src/components/trading/index.ts` | Add ConnectionStatus to exports |
| `web/package.json` | Add @pythnetwork/hermes-client (via pnpm add) |

### Project Structure Notes

Files should follow existing patterns:
- Hooks: `web/src/hooks/use-*.ts` with barrel export
- Components: `web/src/components/trading/*.tsx` with barrel export
- Utilities: `web/src/lib/utils.ts` for shared functions

### Responsive Design

Price display should be visible at all breakpoints:
- Desktop: Large price in chart header
- Tablet: Medium price in chart area
- Mobile: Compact price with essential info only

### Error Handling

1. **Connection failure**: Show "Connection Error" with retry hint
2. **Stale price**: Show warning if price is > 60 seconds old
3. **Empty feed ID**: Show "Price Unavailable" (for FOGO)
4. **Network issues**: Graceful degradation with cached last price

### Testing Checklist

**Manual Testing:**
1. Navigate to `/trade/btc` - should see BTC price with "Live" indicator
2. Wait 5 seconds - price should update multiple times
3. Switch to ETH tab - should see ETH price (new SSE subscription)
4. Check browser Network tab - confirm EventSource/SSE connection (not WebSocket)
5. Switch to FOGO tab - should see "Price Unavailable" and "Offline"
6. Disconnect network - should show "Reconnecting..." with yellow pulse
7. Reconnect - should show "Live" again with green indicator

**Build Verification:**
```bash
cd web && pnpm build
```

### Anti-Patterns to Avoid

1. **DO NOT** use `@pythnetwork/price-service-client` - use `@pythnetwork/hermes-client` instead
2. **DO NOT** forget to handle empty feedId (FOGO case)
3. **DO NOT** use polling - Hermes supports SSE streaming
4. **DO NOT** forget cleanup with `isMounted` flag and EventSource close
5. **DO NOT** block rendering while connecting - show appropriate connection state
6. **DO NOT** use raw price without applying exponent conversion: `price * Math.pow(10, expo)`

### Performance Considerations

- Each asset switch creates a new SSE connection (clean approach)
- Cleanup previous connection before creating new one
- Memoize price formatting with useMemo if performance issues arise

### Git Intelligence (Recent Commits)

```
982d780 Story 2.3: Create Asset Selector and Market Layout
374161f Story 2.2: Implement Wallet Connection UI
ef33601 Story 2.1: Implement buy_position instruction
```

Asset selector and layout scaffolding are complete. This story adds real price data to the existing placeholder.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#story-24] - Story definition and acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#ar18] - Pyth Hermes requirement
- [Source: _bmad-output/planning-artifacts/architecture.md#real-time-data-strategy] - Price data flow architecture
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] - Trust through transparency principles
- [Source: web/src/lib/constants.ts] - ASSET_METADATA with feed IDs
- [Source: web/src/components/trading/chart-area.tsx] - Current placeholder component
- [Reference: D:\dev\2026\fogopulse\web\hooks\use-pyth-price.ts] - Proven SSE implementation
- [Reference: D:\dev\2026\fogopulse\web\components\trading\connection-status.tsx] - Connection indicator
- [Source: @pythnetwork/hermes-client] - HermesClient SSE streaming API

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None required - implementation proceeded without blocking issues.

### Completion Notes List

- Installed `@pythnetwork/hermes-client@^3.1.0` via pnpm
- Created `usePythPrice` hook using HermesClient SSE streaming API with:
  - Exponential backoff reconnection (max 5 retries, 1s-30s delay range)
  - Proper cleanup with `isMounted` flag and EventSource close
  - Price parsing with exponent conversion: `price * Math.pow(10, expo)`
  - Graceful handling of empty feedId (FOGO case)
- Added price formatting utilities: `formatUsdPrice`, `formatPriceChange`, `formatLastUpdated`
- Created `ConnectionStatus` component with accessibility attributes (aria-live, role="status")
- Updated `ChartArea` to display real-time prices with:
  - Loading skeleton during initial connection
  - "Price Unavailable" for assets without feed (FOGO)
  - Live connection status indicator
- Created hooks barrel export for cleaner imports
- Build verification passed with no TypeScript errors

### File List

**New Files:**
- `web/src/hooks/use-pyth-price.ts` - Custom hook for Pyth SSE price streaming
- `web/src/hooks/use-pyth-price.test.ts` - Unit tests for usePythPrice hook
- `web/src/hooks/index.ts` - Barrel export for hooks
- `web/src/components/trading/connection-status.tsx` - Connection status indicator component

**Modified Files:**
- `web/src/lib/utils.ts` - Added formatUsdPrice, formatPriceChange, formatLastUpdated utilities
- `web/src/components/trading/chart-area.tsx` - Integrated usePythPrice hook and ConnectionStatus
- `web/src/components/trading/index.ts` - Added ConnectionStatus to exports
- `web/src/lib/constants.ts` - Updated FOGO feedId with actual Pyth Hermes feed `0x245f89fb8084840bd098d661a026032ee21062270003426797c9196d2d8d4e43`
- `web/package.json` - Added @pythnetwork/hermes-client dependency
- `pnpm-lock.yaml` - Lock file updated with new dependency

## Change Log

- 2026-03-12: Story 2.4 implemented - Pyth Hermes SSE price feed integration with real-time price display
- 2026-03-18: FOGO/USD Pyth Hermes feed discovered and populated — feedId `0x245f89fb8084840bd098d661a026032ee21062270003426797c9196d2d8d4e43` added to ASSET_METADATA.FOGO, replacing empty string. FOGO price now displays live on home page and trade page.
- 2026-03-12: Code review fixes applied:
  - Added 'connecting' state to ConnectionState type for better UX during initial connection
  - Fixed formatLastUpdated to correctly compare millisecond timestamps
  - Added `absolute` prop to ConnectionStatus component for flexible positioning
  - Added comprehensive unit tests for usePythPrice hook (use-pyth-price.test.ts)
  - Updated File List to include test file and pnpm-lock.yaml

