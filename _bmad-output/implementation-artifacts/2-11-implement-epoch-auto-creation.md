# Story 2.11: Implement Epoch Auto-Creation

Status: done

## Story

As a system,
I want epochs created automatically,
so that trading can continue seamlessly without manual intervention.

## Acceptance Criteria

1. **Epoch State Detection**: When a trader visits the trading page, the frontend detects when a new epoch is needed:
   - No active epoch exists (`pool.activeEpoch` is null)
   - Current epoch is in Frozen state or has passed its `end_time`
   - Detection uses existing `useEpoch` hook's `noEpochStatus` return value

2. **Pyth Lazer Price Fetching** (via server-side API route for security):
   - **API Route**: `POST /api/pyth-price` handles WebSocket connection server-side
   - **Token Security**: `PYTH_ACCESS_TOKEN` stays on server, never exposed to browser
   - Connects to `wss://pyth-lazer.dourolabs.app/v1/stream` with bearer token authentication
   - Sends subscription with unique `subscriptionId` (required field)
   - Uses `formats: ['solana']` (Ed25519, NOT ECDSA - critical for FOGO)
   - Requests `properties: ['price', 'confidence']`
   - Uses `channel: 'fixed_rate@200ms'`
   - Uses Node.js `ws` library server-side (not browser WebSocket)

3. **Transaction Construction**: The frontend builds a valid create_epoch transaction:
   - Fetches `pool.nextEpochId` to derive new Epoch PDA
   - Ed25519 signature verification instruction MUST be first (index 0)
   - create_epoch instruction follows at index 1
   - pythMessageOffset = 12 bytes (8 discriminator + 4 vec length)
   - Uses VersionedTransaction with all 10 required accounts

4. **Transaction Submission**: The transaction can be signed by any connected wallet:
   - Transaction is permissionless (no specific signer required)
   - Loading state shown during submission
   - Success toast confirms epoch creation
   - Error handling maps on-chain errors to user-friendly messages

5. **UI State Updates**: On successful epoch creation:
   - Invalidates `['epoch', asset]` query to trigger refetch
   - New epoch becomes active and is displayed
   - Trading UI enables position entry
   - "Price to Beat" shows the new epoch's start_price

6. **Requirements Coverage**:
   - FR52: System creates new epoch automatically when previous epoch enters freeze window
   - FR53: System captures start price snapshot with confidence at epoch creation
   - FR54: System enforces freeze window (no trading in final ~15 seconds)

## Tasks / Subtasks

**Task Dependencies:** Tasks 1, 2, 3 can be developed in parallel. Task 4 depends on 1, 2, 3. Task 5 depends on 4.

- [x] **Task 1: Create Pyth Lazer Price Fetching** (AC: #2) - PARALLEL
  - [x] 1.1: Create `web/src/app/api/pyth-price/route.ts` - Server-side API route
  - [x] 1.2: Use `ws` package for server-side WebSocket (token stays secure)
  - [x] 1.3: Implement subscription with required `subscriptionId` field and Ed25519 format
  - [x] 1.4: Parse `streamUpdated` messages and extract hex-encoded Pyth message from `solana.data`
  - [x] 1.5: Create `web/src/lib/pyth-lazer-client.ts` - Client calls API route
  - [x] 1.6: Add 30-second timeout with Promise rejection
  - [x] 1.7: Return hex string from API, convert to `Uint8Array` in client

- [x] **Task 2: Create Ed25519 Instruction Builder** (AC: #3) - PARALLEL
  - [x] 2.1: Create `web/src/lib/ed25519-instruction.ts`
  - [x] 2.2: Define ED25519_PROGRAM_ID constant (`Ed25519SigVerify111111111111111111111111111`)
  - [x] 2.3: Parse Pyth message offsets (magic=4, signature=64, pubkey=32, size=2)
  - [x] 2.4: Build instruction data referencing create_epoch at index 1, pythMessageOffset=12
  - [x] 2.5: Return instruction with empty keys array and ED25519_PROGRAM_ID

- [x] **Task 3: Create Epoch Creation Transaction Builder** (AC: #3, #4) - PARALLEL
  - [x] 3.1: Create `web/src/lib/transactions/create-epoch.ts`
  - [x] 3.2: Add `PYTH_LAZER_FEED_IDS` constant mapping assets to numeric IDs (BTC=1, ETH=2, SOL=5)
  - [x] 3.3: Implement `fetchPoolNextEpochId(connection, poolPda)` helper
  - [x] 3.4: Implement `deriveEpochPda(poolPda, epochId)` with browser-compatible BigInt conversion
  - [x] 3.5: Build create_epoch instruction with discriminator `[115, 111, 36, 230, 59, 145, 168, 27]`
  - [x] 3.6: Assemble all 10 accounts in correct order (see Dev Notes)
  - [x] 3.7: Return VersionedTransaction ready for signing

- [x] **Task 4: Create useEpochCreation Hook** (AC: #1, #4, #5) - DEPENDS ON 1, 2, 3
  - [x] 4.1: Create `web/src/hooks/use-epoch-creation.ts`
  - [x] 4.2: Accept `asset` parameter and use existing `POOL_PDAS[asset]` from constants
  - [x] 4.3: Implement `needsEpochCreation` check using `useEpoch` hook's state
  - [x] 4.4: Orchestrate: fetch Pyth message -> build transaction -> send -> confirm
  - [x] 4.5: Manage state: `idle | fetching_price | building | signing | confirming | success | error`
  - [x] 4.6: Map error codes to messages (see Error Handling section)
  - [x] 4.7: Call `queryClient.invalidateQueries({ queryKey: ['epoch', asset] })` on success
  - [x] 4.8: Export hook from `web/src/hooks/index.ts`

- [x] **Task 5: Integrate Epoch Creation into Trading UI** (AC: #1, #5) - DEPENDS ON 4
  - [x] 5.1: Modify `web/src/components/trading/epoch-status-display.tsx` lines 49-61
  - [x] 5.2: Replace static "No active epoch" text with "Create New Epoch" button
  - [x] 5.3: Import and use `useEpochCreation` hook
  - [x] 5.4: Show loading spinner with state text during creation
  - [x] 5.5: Use `sonner` toast for success/error feedback (already in project)
  - [x] 5.6: Disable button if wallet not connected

- [x] **Task 6: Add Environment Configuration** (AC: #2)
  - [x] 6.1: Add `PYTH_ACCESS_TOKEN=` to `web/.env.example` (server-side only, NO `NEXT_PUBLIC_` prefix)
  - [x] 6.2: Create `web/.env.local` template for user to add token
  - [x] 6.3: Add runtime check in API route with helpful error message

- [x] **Task 7: Write Tests** (AC: all)
  - [x] 7.1: `pyth-lazer-client.test.ts` - mock WebSocket, test message parsing
  - [x] 7.2: `ed25519-instruction.test.ts` - verify offsets match anchor script values
  - [x] 7.3: `create-epoch.test.ts` - test PDA derivation, instruction data layout

## Dev Notes

### Existing Code to Reuse

**DO NOT duplicate these - import from existing files:**

```typescript
// From web/src/lib/constants.ts - ALREADY EXISTS
import {
  PROGRAM_ID,
  POOL_PDAS,
  GLOBAL_CONFIG_PDA,
  ASSET_MINTS,
  SEEDS,
  PYTH_LAZER_PROGRAM,
  PYTH_LAZER_STORAGE,
  PYTH_LAZER_TREASURY,
  QUERY_KEYS,
} from '@/lib/constants'

// From web/src/hooks/use-epoch.ts - reuse patterns
// - Anchor program setup with dummy wallet for reads
// - TanStack Query integration
// - WebSocket subscription pattern
```

### New Constants to Add

Add to `web/src/lib/constants.ts`:

```typescript
// Pyth Lazer WebSocket (different from Hermes!)
export const PYTH_LAZER_WS = 'wss://pyth-lazer.dourolabs.app/v1/stream'

// Pyth Lazer uses NUMERIC feed IDs (NOT hex strings like Hermes)
export const PYTH_LAZER_FEED_IDS: Record<Asset, number> = {
  BTC: 1,   // BTC/USD
  ETH: 2,   // ETH/USD
  SOL: 5,   // SOL/USD
  FOGO: 1,  // Placeholder - uses BTC feed
}

// Ed25519 program for signature verification
export const ED25519_PROGRAM_ID = new PublicKey('Ed25519SigVerify111111111111111111111111111')

// Sysvars
export const SYSVAR_CLOCK = new PublicKey('SysvarC1ock11111111111111111111111111111111')
export const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111')

// create_epoch instruction discriminator (from IDL)
export const CREATE_EPOCH_DISCRIMINATOR = new Uint8Array([115, 111, 36, 230, 59, 145, 168, 27])
```

### Security Architecture: Server-Side API Route

**Why not use the token directly in the browser?**

Pyth access tokens should NOT be exposed to browsers because:
1. Anyone can inspect browser network requests and steal the token
2. Token could be used to exhaust your API quota
3. Following Pyth's own examples which are all server-side Node.js

**Architecture:**

```
Browser (Client)                    Next.js Server (API Route)
     │                                      │
     │  POST /api/pyth-price                │
     │  { feedId: 1 }                       │
     ├─────────────────────────────────────►│
     │                                      │
     │                              ┌───────┴───────┐
     │                              │ PYTH_ACCESS_  │
     │                              │ TOKEN (secure)│
     │                              └───────┬───────┘
     │                                      │
     │                              WebSocket to Pyth
     │                              (wss://pyth-lazer...)
     │                                      │
     │  { data: "hex..." }                  │
     │◄─────────────────────────────────────┤
     │                                      │
     │  Convert hex to Uint8Array           │
     │  Build transaction                   │
     │  Sign with wallet                    │
     │                                      │
```

**Files:**
- `web/src/app/api/pyth-price/route.ts` - Server-side, has token access
- `web/src/lib/pyth-lazer-client.ts` - Client-side, calls API route
- `web/.env.local` - Contains `PYTH_ACCESS_TOKEN` (server-only)

### Pyth Lazer WebSocket Subscription (Server-Side)

```typescript
// REQUIRED subscription message format (in API route)
const subscribeMsg = {
  type: 'subscribe',
  subscriptionId: 1,              // REQUIRED - unique ID
  priceFeedIds: [feedId],         // Numeric IDs: 1=BTC, 2=ETH, 5=SOL
  properties: ['price', 'confidence'],
  formats: ['solana'],            // CRITICAL: Ed25519, NOT 'leEcdsa'
  deliveryFormat: 'json',
  channel: 'fixed_rate@200ms',
  jsonBinaryEncoding: 'hex',
}

// Response message types to handle:
// - { type: 'subscribed' } - subscription confirmed
// - { type: 'streamUpdated', solana: { data: 'hex...' } } - price update
// - { type: 'error', message: '...' } - error
```

### Pyth Solana Message Format

```
Offset   Length   Content
0        4        Magic prefix
4        64       Ed25519 signature
68       32       Ed25519 public key
100      2        Message size (u16 LE)
102      N        Payload (price data)
```

### CreateEpoch Accounts (10 accounts, in order)

```typescript
const accounts = [
  { pubkey: payer,              isSigner: true,  isWritable: true  },  // 0: payer
  { pubkey: GLOBAL_CONFIG_PDA,  isSigner: false, isWritable: false },  // 1: global_config
  { pubkey: poolPda,            isSigner: false, isWritable: true  },  // 2: pool
  { pubkey: epochPda,           isSigner: false, isWritable: true  },  // 3: epoch (new)
  { pubkey: SYSVAR_CLOCK,       isSigner: false, isWritable: false },  // 4: clock
  { pubkey: SYSVAR_INSTRUCTIONS,isSigner: false, isWritable: false },  // 5: instructions_sysvar
  { pubkey: PYTH_LAZER_PROGRAM, isSigner: false, isWritable: false },  // 6: pyth_program
  { pubkey: PYTH_LAZER_STORAGE, isSigner: false, isWritable: false },  // 7: pyth_storage
  { pubkey: PYTH_LAZER_TREASURY,isSigner: false, isWritable: true  },  // 8: pyth_treasury
  { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 9: system_program
]
```

### Fetching nextEpochId from Pool

```typescript
async function fetchPoolNextEpochId(connection: Connection, poolPda: PublicKey): Promise<bigint> {
  const accountInfo = await connection.getAccountInfo(poolPda)
  if (!accountInfo) throw new Error('Pool account not found')

  // Pool layout: discriminator(8) + asset_mint(32) + yes_reserves(8) + no_reserves(8) +
  //              total_lp_shares(8) + next_epoch_id(8) + ...
  const offset = 8 + 32 + 8 + 8 + 8  // = 64
  const nextEpochId = accountInfo.data.readBigUInt64LE(offset)
  return nextEpochId
}
```

### Browser-Compatible BigInt to Bytes

```typescript
function bigIntToLeBytes(n: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    bytes[i] = Number(n & BigInt(0xff))
    n = n >> BigInt(8)
  }
  return bytes
}

// Usage for epoch PDA derivation
const epochIdBytes = bigIntToLeBytes(epochId, 8)
const [epochPda] = PublicKey.findProgramAddressSync(
  [SEEDS.EPOCH, poolPda.toBytes(), epochIdBytes],
  PROGRAM_ID
)
```

### Error Handling

Map on-chain error codes to user messages:

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  'ProtocolFrozen': 'Protocol is currently frozen. Please try again later.',
  'ProtocolPaused': 'Protocol is paused. Please try again later.',
  'PoolFrozen': 'This pool is currently frozen.',
  'PoolPaused': 'This pool is currently paused.',
  'EpochAlreadyActive': 'An epoch is already active. Refresh the page.',
  'OracleDataStale': 'Price data is too old. Please try again.',
  'OracleConfidenceTooWide': 'Price confidence is too low. Please try again.',
  'OracleVerificationFailed': 'Oracle signature verification failed.',
  'OraclePriceMissing': 'Price data is missing from oracle.',
}

function parseTransactionError(error: unknown): string {
  const errorStr = String(error)
  for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
    if (errorStr.includes(code)) return message
  }
  return 'Transaction failed. Please try again.'
}
```

### UI Integration Point

Modify `web/src/components/trading/epoch-status-display.tsx` lines 49-61:

```typescript
// CURRENT (lines 49-61):
if (!epochState.epoch || noEpochStatus) {
  return (
    <div className={cn('flex items-center justify-center py-2', className)}>
      <span className="text-sm text-muted-foreground">
        {noEpochStatus === 'no-pool' ? 'Pool not initialized' : 'No active epoch'}
      </span>
    </div>
  )
}

// CHANGE TO: Add create epoch button with loading states
```

### UX Considerations

- **Manual trigger preferred**: Show "Create New Epoch" button rather than auto-creating on page load
- **Debouncing**: The button should be disabled during creation to prevent duplicate attempts
- **Wallet required**: Show "Connect wallet to create epoch" if no wallet connected
- **Transaction cost**: Small SOL fee for Pyth verification (~0.001 SOL) - no need to display

### Reference Implementation

The `anchor/scripts/create-test-epoch.ts` script (575 lines) provides a complete working Node.js implementation. Key sections:
- Lines 175-253: Pyth Lazer WebSocket connection
- Lines 267-332: Ed25519 instruction creation
- Lines 337-368: create_epoch instruction data
- Lines 482-517: Transaction assembly

Adapt these patterns for browser environment (native WebSocket, Uint8Array instead of Buffer).

### Testing Standards

- Use Vitest with `@testing-library/react` for hook tests
- Co-locate tests: `pyth-lazer-client.test.ts` next to `pyth-lazer-client.ts`
- Mock WebSocket with `vi.mock` or custom mock class
- Test Ed25519 instruction offsets against known-good values:
  ```typescript
  // Expected values from working anchor script
  expect(signatureOffset).toBe(pythMessageOffset + 4)  // +4 for magic
  expect(pubkeyOffset).toBe(pythMessageOffset + 4 + 64)
  expect(messageOffset).toBe(pythMessageOffset + 4 + 64 + 32 + 2)
  ```

### References

- [Source: web/src/lib/constants.ts] - Existing constants to reuse
- [Source: web/src/hooks/use-epoch.ts] - Patterns for Anchor program, queries
- [Source: web/src/components/trading/epoch-status-display.tsx:49-61] - Integration point
- [Source: anchor/scripts/create-test-epoch.ts] - Complete reference implementation
- [Source: anchor/programs/fogopulse/src/instructions/create_epoch.rs] - On-chain instruction

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Tests pass: 46 tests across 3 test files
- TypeScript: Pre-existing errors in other files (trade-ticket.test.tsx, buy.ts) - not from this story

### Code Review Fixes Applied

**Review Date:** 2026-03-13
**Reviewer:** Claude Opus 4.5 (Adversarial Code Review)

**HIGH Issues Fixed:**
- HIGH-1: Removed real Pyth access token from `.env.local` - replaced with placeholder `your_token_here`
- HIGH-2: Updated `epoch-status-display.test.tsx` to mock `useWalletConnection` and `useEpochCreation` hooks
- HIGH-3: `.env.local` now serves as a proper template (no real credentials)

**MEDIUM Issues Fixed:**
- MEDIUM-3: Moved `PYTH_LAZER_WS` constant to `constants.ts` (centralized)
- MEDIUM-4: Moved `PYTH_LAZER_FEED_IDS` to `constants.ts`, re-exported from `pyth-lazer-client.ts` for backward compatibility
- Updated API route to import `PYTH_LAZER_WS` from constants
- Updated test file to import `PYTH_LAZER_FEED_IDS` from constants

**Tests Status:** All 54 story-related tests pass (46 new + 8 epoch-status-display)

### Completion Notes List

- All core functionality implemented and tested
- **SECURITY FIX**: Pyth access token moved to server-side API route (not exposed to browser)
- Created `/api/pyth-price` Next.js API route for secure WebSocket connection
- Client-side code calls API route instead of direct WebSocket (token stays server-side)
- Ed25519 instruction builder correctly calculates offsets (pythMessageOffset=12)
- Transaction builder assembles all 10 accounts in correct order
- useEpochCreation hook orchestrates full flow with proper state management
- UI integration shows "Create New Epoch" button when no active epoch
- Error messages mapped from on-chain error codes
- Environment setup: User must add Pyth token to `web/.env.local` as `PYTH_ACCESS_TOKEN`
- No separate server needed - Next.js serves both frontend and API routes with `pnpm dev`

### File List

**Created:**
- `web/src/app/api/pyth-price/route.ts` - Server-side API route for Pyth WebSocket (keeps token secure)
- `web/src/lib/pyth-lazer-client.ts` - Client-side Pyth API caller
- `web/src/lib/pyth-lazer-client.test.ts` - Tests for Pyth client
- `web/src/lib/ed25519-instruction.ts` - Ed25519 instruction builder
- `web/src/lib/ed25519-instruction.test.ts` - Tests for Ed25519 builder
- `web/src/lib/transactions/create-epoch.ts` - Transaction builder
- `web/src/lib/transactions/create-epoch.test.ts` - Tests for transaction builder
- `web/src/hooks/use-epoch-creation.ts` - Epoch creation hook
- `web/.env.example` - Environment template with PYTH_ACCESS_TOKEN (server-side only)
- `web/.env.local` - Local environment template (user adds their own token)

**Modified:**
- `web/src/lib/constants.ts` - Added ED25519_PROGRAM_ID, SYSVAR_CLOCK, SYSVAR_INSTRUCTIONS, CREATE_EPOCH_DISCRIMINATOR, PYTH_LAZER_WS, PYTH_LAZER_FEED_IDS
- `web/src/hooks/index.ts` - Export useEpochCreation
- `web/src/components/trading/epoch-status-display.tsx` - Added create epoch button UI
- `web/src/components/trading/epoch-status-display.test.tsx` - Updated mocks for new hooks (useWalletConnection, useEpochCreation)
- `web/package.json` - Added `ws` and `@types/ws` dependencies for server-side WebSocket

### How to Run

```bash
# 1. Add your Pyth token to web/.env.local
PYTH_ACCESS_TOKEN=your_token_here

# 2. Start the dev server (serves both frontend + API)
cd web
pnpm dev

# 3. Visit http://localhost:3000/trade/BTC
# 4. Connect wallet and click "Create New Epoch"
```
