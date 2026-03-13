# Story 2.9: Implement Trade Execution Flow

Status: done

## Story

As a **trader**,
I want to **submit my trade and see confirmation**,
so that **I know my position was opened successfully**.

## Acceptance Criteria

1. **Given** a valid trade ticket with direction and amount, **When** I click the trade button, **Then** the transaction is built with buy_position instruction
2. **When** the trade button is clicked, **Then** the wallet prompts for signature
3. **When** transaction is submitted, **Then** a loading state is shown during transaction confirmation
4. **When** transaction succeeds, **Then** a toast notification confirms the trade with transaction link
5. **When** transaction succeeds, **Then** the position appears in my positions list (via TanStack Query invalidation)
6. **When** transaction fails, **Then** an error message explains what went wrong (user rejection, insufficient funds, cap exceeded, epoch not open)
7. **When** transaction succeeds, **Then** the UI updates to reflect new pool state (probabilities update)
8. FR40: User can sign transactions for trades, LP deposits, and withdrawals

## Tasks / Subtasks

- [x] **Task 1: Create useBuyPosition Hook** (AC: #1, #2, #3, #4, #5, #6)
  - [x] 1.1 Create `web/src/hooks/use-buy-position.ts` with TanStack Query mutation
  - [x] 1.2 Use existing IDL from `@/lib/fogopulse.json` (already used by use-epoch.ts)
  - [x] 1.3 Implement `buildBuyPositionTransaction()` helper in `web/src/lib/transactions/buy.ts`
  - [x] 1.4 Derive epoch PDA and position PDA (pool PDAs already in constants.ts)
  - [x] 1.5 Build instruction with proper account order matching buy_position.rs
  - [x] 1.6 Handle transaction signing via wallet adapter's `sendTransaction`
  - [x] 1.7 Implement proper transaction confirmation with blockhash expiry handling
  - [x] 1.8 Add TanStack Query cache invalidation for epoch, pool, and positions

- [x] **Task 2: Create Transaction Error Handler** (AC: #6)
  - [x] 2.1 Create `web/src/lib/transaction-errors.ts` for error parsing
  - [x] 2.2 Map Anchor error codes to user-friendly messages (see error mapping table)
  - [x] 2.3 Handle wallet rejection errors ("User rejected the request")
  - [x] 2.4 Handle insufficient funds errors (check for 0x1 program error)
  - [x] 2.5 Handle on-chain errors (EpochNotOpen, ExceedsWalletCap, ExceedsSideCap, etc.)

- [x] **Task 3: Integrate with TradeTicket Component** (AC: #1, #2, #3, #4, #6)
  - [x] 3.1 Import `useBuyPosition` hook into `trade-ticket.tsx`
  - [x] 3.2 Add onClick handler to "Place Trade" button calling mutation
  - [x] 3.3 Add loading state to button (`isPending` from mutation)
  - [x] 3.4 Show toast notifications on success/error using sonner
  - [x] 3.5 Reset trade store state on successful trade via `reset()`

- [x] **Task 4: Create PDA Derivation Utilities** (AC: #1)
  - [x] 4.1 Create `web/src/lib/pda.ts` with browser-compatible PDA derivation
  - [x] 4.2 Implement `deriveEpochPda(poolPda, epochId)` - epochId from useEpoch hook
  - [x] 4.3 Implement `derivePositionPda(epochPda, userPubkey)`
  - [x] 4.4 Implement `deriveUserUsdcAta(userPubkey)` using getAssociatedTokenAddressSync
  - [x] 4.5 Use Uint8Array for epoch_id bytes (browser-compatible)

- [x] **Task 5: Create Shared Program Hook** (AC: #1)
  - [x] 5.1 Create `web/src/hooks/use-program.ts` for shared Anchor Program instance
  - [x] 5.2 Reuse pattern from use-epoch.ts (dummy wallet for read-only)
  - [x] 5.3 Export from hooks/index.ts

- [x] **Task 6: Add Query Key Constants** (AC: #5, #7)
  - [x] 6.1 Add QUERY_KEYS constant to constants.ts or create query-keys.ts
  - [x] 6.2 Use consistent keys: `['epoch', asset]`, `['pool', asset]`, `['positions', userPubkey]`
  - [x] 6.3 Add `onSuccess` callback to invalidate relevant queries

- [x] **Task 7: Write Unit Tests** (AC: #1-#7)
  - [x] 7.1 Create `web/src/hooks/use-buy-position.test.ts`
  - [x] 7.2 Test successful transaction flow (mock sendTransaction)
  - [x] 7.3 Test error handling (wallet rejection, on-chain errors)
  - [x] 7.4 Test loading states
  - [x] 7.5 Create `web/src/lib/transaction-errors.test.ts`

## Dev Notes

### Direction Enum Conversion

**CRITICAL:** Frontend uses `'up' | 'down'` strings, but Anchor expects enum object format:

```typescript
// Convert frontend direction to Anchor enum format
function toAnchorDirection(direction: 'up' | 'down'): { up: {} } | { down: {} } {
  return direction === 'up' ? { up: {} } : { down: {} }
}

// Usage in instruction
const directionEnum = toAnchorDirection(direction)
```

### Amount Conversion

Frontend uses human-readable USDC (e.g., 10.50), on-chain uses lamports (6 decimals):

```typescript
// Convert USDC to lamports
const amountLamports = Math.floor(parseFloat(amount) * 1_000_000)

// MIN_TRADE_AMOUNT in types/trade.ts is 0.01 USDC = 10_000 lamports
```

### Getting Epoch Data for Transaction

Get `epochId` and derive epoch PDA from the `useEpoch` hook:

```typescript
const { epochState } = useEpoch(asset)
const epochId = epochState.epoch?.epochId  // bigint
const poolPda = POOL_PDAS[asset]

// Derive epoch PDA using epochId
const epochPda = deriveEpochPda(poolPda, epochId)
```

### User USDC ATA Derivation

Use `@solana/spl-token` for ATA derivation:

```typescript
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { USDC_MINT } from '@/lib/constants'

const userUsdcAta = getAssociatedTokenAddressSync(
  USDC_MINT,
  userPublicKey,
  false  // allowOwnerOffCurve
)
```

### Transaction Confirmation Pattern

**CRITICAL:** Use proper confirmation with blockhash expiry handling:

```typescript
// Get blockhash BEFORE building transaction
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

// Build transaction
const transaction = new Transaction()
transaction.add(instruction)
transaction.recentBlockhash = blockhash
transaction.feePayer = publicKey

// Send and confirm with expiry handling
const signature = await sendTransaction(transaction, connection, {
  skipPreflight: false,
  preflightCommitment: 'confirmed',
})

await connection.confirmTransaction({
  signature,
  blockhash,
  lastValidBlockHeight,
}, 'confirmed')
```

### Browser-Compatible PDA Derivation

**CRITICAL:** Node.js `Buffer.writeBigUInt64LE()` does NOT work in browsers:

```typescript
import { PublicKey } from '@solana/web3.js'
import { PROGRAM_ID, SEEDS } from '@/lib/constants'

// Convert bigint epochId to little-endian Uint8Array
function epochIdToBytes(epochId: bigint): Uint8Array {
  const buffer = new Uint8Array(8)
  let n = epochId
  for (let i = 0; i < 8; i++) {
    buffer[i] = Number(n & BigInt(0xff))
    n = n >> BigInt(8)
  }
  return buffer
}

export function deriveEpochPda(poolPda: PublicKey, epochId: bigint): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), poolPda.toBuffer(), epochIdToBytes(epochId)],
    PROGRAM_ID
  )
  return pda
}

export function derivePositionPda(epochPda: PublicKey, userPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), epochPda.toBuffer(), userPubkey.toBuffer()],
    PROGRAM_ID
  )
  return pda
}
```

### Complete useBuyPosition Hook

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import { toast } from 'sonner'

import type { Asset } from '@/types/assets'
import { buildBuyPositionInstruction } from '@/lib/transactions/buy'
import { parseTransactionError } from '@/lib/transaction-errors'

interface BuyPositionParams {
  asset: Asset
  direction: 'up' | 'down'
  amount: string  // Human-readable USDC
  epochId: bigint
}

export function useBuyPosition() {
  const queryClient = useQueryClient()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()

  return useMutation({
    mutationFn: async ({ asset, direction, amount, epochId }: BuyPositionParams) => {
      if (!publicKey) throw new Error('Wallet not connected')

      // Get blockhash first
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

      // Build instruction
      const instruction = await buildBuyPositionInstruction({
        asset,
        direction,
        amount,
        epochId,
        userPubkey: publicKey,
      })

      // Build transaction
      const transaction = new Transaction()
      transaction.add(instruction)
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      // Send transaction
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      // Confirm with expiry handling
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed')

      return { signature }
    },
    onSuccess: ({ signature }, { asset }) => {
      toast.success('Trade confirmed!', {
        description: `View on explorer`,
        action: {
          label: 'View',
          onClick: () => window.open(`https://explorer.fogo.io/tx/${signature}`, '_blank'),
        },
      })
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['epoch', asset] })
      queryClient.invalidateQueries({ queryKey: ['pool', asset] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    },
    onError: (error) => {
      const message = parseTransactionError(error)
      toast.error('Trade failed', { description: message })
    },
  })
}
```

### TradeTicket Integration

Add to `trade-ticket.tsx`:

```typescript
import { useBuyPosition } from '@/hooks/use-buy-position'

// Inside TradeTicket component:
const { mutate: buyPosition, isPending } = useBuyPosition()
const { epochState } = useEpoch(asset)

const handleTrade = () => {
  if (!direction || !amount || !epochState.epoch?.epochId) return

  buyPosition(
    {
      asset,
      direction,
      amount,
      epochId: epochState.epoch.epochId
    },
    { onSuccess: () => reset() }  // Reset trade store on success
  )
}

// Update button:
<Button
  onClick={handleTrade}
  disabled={!isTradeReady || isPending}
>
  {isPending ? 'Confirming...' : 'Place Trade'}
</Button>
```

### Error Code Mapping

```typescript
// web/src/lib/transaction-errors.ts
const ERROR_MESSAGES: Record<string, string> = {
  'EpochNotOpen': 'Trading is not available. Epoch is not open.',
  'ProtocolPaused': 'Trading is temporarily paused.',
  'PoolPaused': 'This market is temporarily paused.',
  'ZeroAmount': 'Please enter a valid amount.',
  'BelowMinimumTrade': 'Minimum trade amount is $0.01',
  'ExceedsWalletCap': 'Trade exceeds your maximum position size (5% of pool).',
  'ExceedsSideCap': 'Trade exceeds the market side limit (30% of pool).',
  'InvalidDirection': 'Cannot add to existing position in opposite direction.',
  'Unauthorized': 'Wallet signature verification failed.',
  'InsufficientBalance': 'Insufficient USDC balance.',
  'TokenOwnerMismatch': 'Token account does not belong to your wallet.',
}

export function parseTransactionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  // Check for user rejection
  if (message.includes('User rejected') || message.includes('rejected the request')) {
    return 'Transaction cancelled by user.'
  }

  // Check for Anchor errors
  for (const [code, userMessage] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) {
      return userMessage
    }
  }

  // Check for insufficient funds
  if (message.includes('0x1') || message.includes('insufficient')) {
    return 'Insufficient SOL for transaction fees.'
  }

  return 'Transaction failed. Please try again.'
}
```

### On-Chain Instruction Accounts

Reference: `anchor/programs/fogopulse/src/instructions/buy_position.rs`

Account order for `buy_position` instruction:
1. `signer_or_session` - User wallet (signer, mut)
2. `config` - GlobalConfig PDA
3. `pool` - Pool PDA (mut) - use `POOL_PDAS[asset]`
4. `epoch` - Epoch PDA (mut) - derive from poolPda + epochId
5. `position` - UserPosition PDA (init_if_needed) - derive from epochPda + userPubkey
6. `user_usdc` - User's USDC ATA (mut) - derive using getAssociatedTokenAddressSync
7. `pool_usdc` - Pool's USDC ATA (mut) - use `POOL_USDC_ATAS[asset]`
8. `usdc_mint` - USDC Mint - use `USDC_MINT`
9. `token_program` - TOKEN_PROGRAM_ID
10. `associated_token_program` - ASSOCIATED_TOKEN_PROGRAM_ID
11. `system_program` - SystemProgram.programId

### Files to Create

| File | Purpose |
|------|---------|
| `web/src/hooks/use-buy-position.ts` | Main mutation hook |
| `web/src/hooks/use-program.ts` | Shared Anchor Program instance |
| `web/src/lib/pda.ts` | PDA derivation utilities |
| `web/src/lib/transactions/buy.ts` | Transaction/instruction builder |
| `web/src/lib/transaction-errors.ts` | Error parsing |

### Files to Modify

| File | Change |
|------|--------|
| `web/src/components/trading/trade-ticket.tsx` | Add onClick handler, loading state |
| `web/src/hooks/index.ts` | Export `useBuyPosition` |

### Existing Resources

- IDL already exists at `web/src/lib/fogopulse.json`
- Pool PDAs already in `web/src/lib/constants.ts` as `POOL_PDAS`
- Pool USDC ATAs already in `web/src/lib/constants.ts` as `POOL_USDC_ATAS`
- `@coral-xyz/anchor` already in package.json (^0.32.1)
- `@solana/spl-token` already in package.json (0.4.14)
- Jest configured for testing (not Vitest)

### Testing Notes

Project uses **Jest** (not Vitest) - see `web/package.json`:
- `jest` and `jest-environment-jsdom` are dev dependencies
- Test command: `pnpm test` or `pnpm test:watch`
- Use `@testing-library/react` for hook tests

## References

- [Source: anchor/programs/fogopulse/src/instructions/buy_position.rs] - On-chain instruction
- [Source: anchor/programs/fogopulse/src/errors.rs] - All error codes
- [Source: web/src/hooks/use-epoch.ts] - Existing epoch hook pattern and IDL usage
- [Source: web/src/components/trading/trade-ticket.tsx] - Component to modify
- [Source: web/src/stores/trade-store.ts] - Trade state with reset()
- [Source: web/src/lib/constants.ts] - POOL_PDAS, POOL_USDC_ATAS, PROGRAM_ID
- [Source: web/src/types/trade.ts] - TradeDirection type, MIN_TRADE_AMOUNT

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All tests pass: 57 tests across 3 test files (use-buy-position, transaction-errors, trade-ticket)
- Linting passes on all new files

### Completion Notes List

- Implemented complete trade execution flow with TanStack Query mutation pattern
- Created browser-compatible PDA derivation utilities (avoiding Node.js Buffer methods)
- Implemented comprehensive error handling with user-friendly messages for all Anchor error codes
- Integrated with TradeTicket component with loading state and toast notifications
- Added QUERY_KEYS constants for consistent cache invalidation
- Transaction confirmation uses blockhash expiry handling for robust confirmation
- Direction enum correctly converted to Anchor format ({ up: {} } or { down: {} })
- Amount conversion from human-readable USDC to lamports (6 decimals)

### File List

**Created:**
- `web/src/lib/pda.ts` - PDA derivation utilities (deriveEpochPda, derivePositionPda, deriveUserUsdcAta)
- `web/src/lib/transaction-errors.ts` - Transaction error parsing and user-friendly messages
- `web/src/lib/transactions/buy.ts` - Build buy_position instruction
- `web/src/hooks/use-program.ts` - Shared Anchor Program instance hook
- `web/src/hooks/use-buy-position.ts` - Main trade execution mutation hook
- `web/src/lib/transaction-errors.test.ts` - Unit tests for error parsing (29 tests)
- `web/src/hooks/use-buy-position.test.ts` - Unit tests for hook logic (11 tests)

**Modified:**
- `web/src/lib/constants.ts` - Added QUERY_KEYS and FOGO_EXPLORER_TX_URL
- `web/src/hooks/index.ts` - Export useProgram and useBuyPosition
- `web/src/components/trading/trade-ticket.tsx` - Added onClick handler, loading state, handleTrade
- `web/src/components/trading/trade-ticket.test.tsx` - Added useBuyPosition mock

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5 (Adversarial Code Review)
**Date:** 2026-03-13
**Outcome:** Approved with Fixes Applied

### Issues Found and Fixed

| # | Severity | Issue | Fix Applied |
|---|----------|-------|-------------|
| 1 | HIGH | `publicKey` closure could become stale in `onSuccess` callback | Added `userPubkey` param to mutation, validated in mutationFn |
| 2 | HIGH | `user` passed as both account AND argument undocumented | Added extensive JSDoc explaining FOGO Sessions pattern |
| 3 | MEDIUM | `epochIdToBytes` created BigInt constants on each loop iteration | Extracted to module-level constants |
| 4 | MEDIUM | Trade button disabled/text logic split across multiple places | Extracted `getTradeButtonState()` helper function |
| 5 | MEDIUM | Fallback Connection in `useProgram` could mask config issues | Removed fallback, rely on provider |
| 6 | MEDIUM | No max amount validation in `usdcToLamports` | Added MAX_USDC_AMOUNT guard |
| 7 | LOW | Blockhash error detection too broad (matched "expired") | Made pattern more specific |
| 8 | LOW | TODO comment left in production code | Converted to story reference comment |

### Notes Not Requiring Fixes

- Issue #4 (Shallow hook tests): Tests adequately cover business logic; hook integration tested via component tests
- Issue #8 (AC #7 verification): Query invalidation correctly implemented; UI update depends on existing pool hooks

### Post-Review Verification

- All 57 tests pass (29 + 11 + 17)
- ESLint passes on all modified files
- No regressions introduced

## Change Log

- 2026-03-13: Implemented trade execution flow (Story 2.9)
- 2026-03-13: Code review fixes applied (8 issues resolved)
