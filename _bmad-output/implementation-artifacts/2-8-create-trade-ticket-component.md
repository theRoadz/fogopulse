# Story 2.8: Create Trade Ticket Component

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trader,
I want a clear interface to enter my trade,
so that I can quickly take a position.

## Acceptance Criteria

1. **Given** the trade ticket panel (35% right side)
   **When** I interact with the trade ticket
   **Then** I can select direction (UP or DOWN) with clear visual buttons

2. **Given** a selected direction
   **When** I view the direction buttons
   **Then** the selected direction is visually highlighted (green for UP, red for DOWN)

3. **Given** the trade ticket
   **When** I want to enter an amount
   **Then** I can enter USDC amount with numeric input

4. **Given** the amount input
   **When** I want to quickly select common amounts
   **Then** quick amount buttons (25%, 50%, 75%, Max) are available

5. **Given** a connected wallet
   **When** I view the trade ticket
   **Then** my USDC balance is displayed

6. **Given** an entered amount
   **When** the amount is invalid (negative, exceeds balance)
   **Then** input validation prevents invalid amounts with error feedback

7. **Given** the trade ticket with direction and amount selected
   **When** I view the ticket
   **Then** FR6, FR7 (take UP/DOWN position) foundations are satisfied

## Tasks / Subtasks

- [x] Task 1: Create Trade Types and State Management (AC: #1, #2)
  - [x] 1.1: Add `TradeDirection` type (`'up' | 'down' | null`) to `types/index.ts`
  - [x] 1.2: Add `TradeTicketState` interface with direction, amount, isValid, error fields
  - [x] 1.3: Create `stores/trade-store.ts` with Zustand store for trade ticket state
  - [x] 1.4: Implement `setDirection`, `setAmount`, `reset` actions

- [x] Task 2: Create USDC Balance Hook (AC: #5)
  - [x] 2.1: Create `hooks/use-usdc-balance.ts` to fetch user's USDC balance
  - [x] 2.2: Use Associated Token Account derivation for USDC mint
  - [x] 2.3: Implement TanStack Query for balance fetching with 10s refetch
  - [x] 2.4: Handle disconnected wallet (return null)
  - [x] 2.5: Format balance with 2 decimal places

- [x] Task 3: Create DirectionButton Component (AC: #1, #2)
  - [x] 3.1: Create `components/trading/direction-button.tsx`
  - [x] 3.2: Implement UP button with green styling (`text-green-500`, `border-green-500/50`)
  - [x] 3.3: Implement DOWN button with red styling (`text-red-500`, `border-red-500/50`)
  - [x] 3.4: Add selected state with filled background (`bg-green-500/20` or `bg-red-500/20`)
  - [x] 3.5: Add hover and disabled states
  - [x] 3.6: Display triangle icons (▲ for UP, ▼ for DOWN)

- [x] Task 4: Create AmountInput Component (AC: #3, #6)
  - [x] 4.1: Create `components/trading/amount-input.tsx`
  - [x] 4.2: Implement numeric-only input with $ prefix
  - [x] 4.3: Add validation for negative numbers (prevent)
  - [x] 4.4: Add validation for exceeding balance (show error)
  - [x] 4.5: Add validation for minimum amount (if any)
  - [x] 4.6: Display error message below input when invalid
  - [x] 4.7: Format input with proper decimal handling (max 2 decimals)

- [x] Task 5: Create QuickAmountButtons Component (AC: #4)
  - [x] 5.1: Create `components/trading/quick-amount-buttons.tsx`
  - [x] 5.2: Implement 25%, 50%, 75%, Max buttons
  - [x] 5.3: Calculate amounts based on connected wallet's USDC balance
  - [x] 5.4: Disable buttons when wallet not connected
  - [x] 5.5: Show actual dollar amounts when balance available (e.g., "$25" instead of "25%")

- [x] Task 6: Create BalanceDisplay Component (AC: #5)
  - [x] 6.1: Create `components/trading/balance-display.tsx`
  - [x] 6.2: Display "Balance: $X.XX USDC" when connected
  - [x] 6.3: Display "Connect wallet" when disconnected
  - [x] 6.4: Add loading skeleton during balance fetch
  - [x] 6.5: Add small USDC icon or label

- [x] Task 7: Create TradeTicket Container Component (AC: #1-#7)
  - [x] 7.1: Create `components/trading/trade-ticket.tsx` combining all sub-components
  - [x] 7.2: Layout: DirectionButtons (grid 2-col), BalanceDisplay, AmountInput, QuickAmountButtons
  - [x] 7.3: Integrate with trade-store for state management
  - [x] 7.4: Add disabled state for entire ticket when epoch not Open
  - [x] 7.5: Show "Connect Wallet to Trade" button when wallet not connected
  - [x] 7.6: Show "Select Direction" prompt when no direction selected
  - [x] 7.7: Placeholder for future trade preview (Story 2.10)

- [x] Task 8: Update TradeTicketArea Integration (AC: All)
  - [x] 8.1: Replace placeholder content in `trade-ticket-area.tsx` with `TradeTicket` component
  - [x] 8.2: Pass asset prop to TradeTicket
  - [x] 8.3: Ensure responsive layout works on different screen sizes
  - [x] 8.4: Verify integration with existing EpochStatusDisplay and PoolStateDisplay

- [x] Task 9: Write Tests (AC: All)
  - [x] 9.1: Create `stores/trade-store.test.ts` for Zustand store testing
  - [x] 9.2: Create `hooks/use-usdc-balance.test.ts` with mock token account data
  - [x] 9.3: Create `components/trading/direction-button.test.tsx` testing selection and styling
  - [x] 9.4: Create `components/trading/amount-input.test.tsx` testing validation
  - [x] 9.5: Create `components/trading/quick-amount-buttons.test.tsx` testing calculations
  - [x] 9.6: Create `components/trading/trade-ticket.test.tsx` testing full integration

## Dev Notes

### Architecture Compliance

**Data Flow Pattern:**
```
Trade Store (Zustand)          USDC Balance (TanStack Query)
       │                              │
       │                              ▼
       │                        useUsdcBalance hook
       ▼                              │
   TradeTicket                        │
       │                              │
       ├── DirectionButtons ◄─────────┤
       ├── BalanceDisplay ◄───────────┤
       ├── AmountInput ◄──────────────┤
       └── QuickAmountButtons ◄───────┘
```

**State Management (from architecture.md):**
- **Zustand** for UI state (trade direction, amount, validation)
- **TanStack Query** for on-chain data (USDC balance)
- Trade state is client-only, not persisted

### Trade Store Design

```typescript
// stores/trade-store.ts
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

type TradeDirection = 'up' | 'down' | null

interface TradeState {
  direction: TradeDirection
  amount: string // String for input handling
  isValid: boolean
  error: string | null

  // Actions
  setDirection: (direction: TradeDirection) => void
  setAmount: (amount: string) => void
  validate: (balance: number | null) => void
  reset: () => void
}

export const useTradeStore = create<TradeState>()(
  immer((set, get) => ({
    direction: null,
    amount: '',
    isValid: false,
    error: null,

    setDirection: (direction) =>
      set((state) => {
        state.direction = direction
      }),

    setAmount: (amount) =>
      set((state) => {
        state.amount = amount
        // Trigger validation
        const parsed = parseFloat(amount)
        if (isNaN(parsed) || parsed < 0) {
          state.isValid = false
          state.error = 'Invalid amount'
        } else {
          state.error = null
          // Balance validation happens in component with balance context
        }
      }),

    validate: (balance) =>
      set((state) => {
        const parsed = parseFloat(state.amount)
        if (isNaN(parsed) || parsed <= 0) {
          state.isValid = false
          state.error = 'Enter a valid amount'
        } else if (balance !== null && parsed > balance) {
          state.isValid = false
          state.error = 'Exceeds balance'
        } else if (state.direction === null) {
          state.isValid = false
          state.error = null // No error, just not complete
        } else {
          state.isValid = true
          state.error = null
        }
      }),

    reset: () =>
      set((state) => {
        state.direction = null
        state.amount = ''
        state.isValid = false
        state.error = null
      }),
  }))
)
```

### USDC Balance Fetching

**USDC Mint on FOGO Testnet:** `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy`

```typescript
// hooks/use-usdc-balance.ts
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import { USDC_MINT } from '@/lib/constants'

const USDC_DECIMALS = 6

export function useUsdcBalance() {
  const { connection } = useConnection()
  const { publicKey, connected } = useWallet()

  return useQuery({
    queryKey: ['usdc-balance', publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) return null

      const ata = await getAssociatedTokenAddress(
        new PublicKey(USDC_MINT),
        publicKey
      )

      try {
        const account = await getAccount(connection, ata)
        // Convert from base units (6 decimals) to display value
        return Number(account.amount) / (10 ** USDC_DECIMALS)
      } catch (error) {
        // Account doesn't exist (no USDC balance)
        return 0
      }
    },
    enabled: connected && !!publicKey,
    refetchInterval: 10000, // Refresh every 10 seconds
    staleTime: 5000,
  })
}
```

### Component Styling (from UX Design Specification)

**Direction Buttons:**
```typescript
// UP Button
className={cn(
  "h-16 text-lg font-semibold flex items-center justify-center gap-2",
  "border-2 transition-all duration-200",
  selected === 'up'
    ? "border-green-500 bg-green-500/20 text-green-500"
    : "border-green-500/50 text-green-500 hover:bg-green-500/10"
)}

// DOWN Button
className={cn(
  "h-16 text-lg font-semibold flex items-center justify-center gap-2",
  "border-2 transition-all duration-200",
  selected === 'down'
    ? "border-red-500 bg-red-500/20 text-red-500"
    : "border-red-500/50 text-red-500 hover:bg-red-500/10"
)}
```

**Amount Input (from UX spec):**
- Dollar sign prefix
- Right-aligned text, monospace font
- Clear error state with red border
- 2 decimal place precision

**Typography (from UX Design Spec):**
- Labels: `text-xs uppercase tracking-wide text-muted-foreground`
- Input text: `text-lg font-mono`
- Button text: `text-sm font-medium`
- Balance: `text-sm text-muted-foreground`

### Validation Rules

1. **Amount must be positive number** - no negative, no zero
2. **Amount must not exceed USDC balance** - real-time check
3. **Minimum amount** - Consider 0.01 USDC minimum (configurable)
4. **Direction must be selected** - either UP or DOWN
5. **Wallet must be connected** - show connect button otherwise

### Input Handling

**Numeric Input Pattern:**
```typescript
const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value

  // Allow empty, numbers, and single decimal point
  if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
    setAmount(value)
  }
}
```

**Quick Amount Calculation:**
```typescript
const calculateQuickAmount = (percentage: number, balance: number | null) => {
  if (balance === null || balance <= 0) return null
  return Math.floor(balance * percentage * 100) / 100 // Round down to 2 decimals
}
```

### Project Structure Notes

**New Files:**
```
web/src/
├── stores/
│   ├── trade-store.ts         # Trade ticket Zustand store
│   └── trade-store.test.ts    # Store tests
├── hooks/
│   ├── use-usdc-balance.ts    # USDC balance hook
│   └── use-usdc-balance.test.ts
├── components/trading/
│   ├── direction-button.tsx   # UP/DOWN button component
│   ├── direction-button.test.tsx
│   ├── amount-input.tsx       # Amount input with validation
│   ├── amount-input.test.tsx
│   ├── quick-amount-buttons.tsx
│   ├── quick-amount-buttons.test.tsx
│   ├── balance-display.tsx    # USDC balance display
│   ├── balance-display.test.tsx
│   ├── trade-ticket.tsx       # Container component
│   └── trade-ticket.test.tsx
```

**Modified Files:**
- `web/src/components/trading/trade-ticket-area.tsx` - Replace placeholder with TradeTicket
- `web/src/types/index.ts` - Add TradeDirection type
- `web/src/lib/constants.ts` - Add USDC_MINT constant (if not already present)
- `web/src/hooks/index.ts` - Export use-usdc-balance

### Integration with Existing Components

**Current TradeTicketArea structure (to be replaced):**
- PoolStateDisplay (keep - from Story 2.7)
- Placeholder trade card (replace with TradeTicket)

**Dependencies on other stories:**
- Story 2.9 (Trade Execution Flow) - Will add confirm button and transaction logic
- Story 2.10 (Trade Preview Calculations) - Will add fee, payout preview

**This story provides the UI foundation; execution is in 2.9**

### Epoch State Integration

The TradeTicket should be disabled when:
1. Epoch state is not "Open" (Frozen, Settling, Settled, Refunded)
2. Pool is paused or frozen
3. No active epoch exists

```typescript
// In TradeTicket
const { epochState } = useEpoch(asset)
const isTradeEnabled = epochState?.state === 'open'

// Disable direction buttons and amount input when not Open
```

### Testing Standards

**Unit Tests (Jest):**
- Mock Zustand store for isolated component tests
- Mock `@solana/web3.js` and `@solana/spl-token` for balance hook
- Test all validation edge cases
- Test state transitions (direction selection, amount changes)

**Test Patterns:**
```typescript
// Example: direction-button.test.tsx
describe('DirectionButton', () => {
  it('shows UP variant with green styling', () => {
    render(<DirectionButton direction="up" selected={null} onSelect={jest.fn()} />)
    expect(screen.getByText('UP')).toHaveClass('text-green-500')
  })

  it('shows selected state when active', () => {
    render(<DirectionButton direction="up" selected="up" onSelect={jest.fn()} />)
    expect(screen.getByRole('button')).toHaveClass('bg-green-500/20')
  })

  it('calls onSelect when clicked', () => {
    const onSelect = jest.fn()
    render(<DirectionButton direction="up" selected={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith('up')
  })
})
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.8] - Acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend State] - State management patterns
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Trade Ticket] - Visual design specs
- [Source: _bmad-output/planning-artifacts/prd.md#FR6, FR7] - Functional requirements
- [Source: web/src/components/trading/trade-ticket-area.tsx] - Current placeholder implementation
- [Source: web/src/stores/ui-store.ts] - Zustand store pattern example
- [Source: web/src/hooks/use-wallet-connection.ts] - Wallet hook patterns

### Previous Story Intelligence

**From Story 2.7 (Implement Pool State Display):**
- Zustand store pattern with immer middleware works well
- TanStack Query for on-chain data fetching pattern established
- Component container pattern with sub-components
- Integration into TradeTicketArea already established

**From Story 2.2 (Implement Wallet Connection UI):**
- `useWalletConnection` hook provides wallet state and actions
- `useWallet` from `@solana/wallet-adapter-react` for connection state
- Wallet connection pattern established

**From Story 2.4 (Integrate Pyth Hermes Price Feed):**
- Hook patterns with TanStack Query v5
- Real-time update subscription patterns

**Patterns to reuse:**
- Zustand store with immer for state management
- Component composition pattern
- Testing with Jest
- Loading states with Skeleton components

### Git Intelligence

**Recent commits:**
- `dcc274c`: Story 2.7 - Pool State Display (previous story)
- `a50a145`: Story 2.6 - Epoch Status Display
- `8248a79`: Story 2.5 - Price Chart Component

**Code patterns from recent work:**
- Hooks use `'use client'` directive for Next.js App Router
- TanStack Query v5 for server state
- shadcn/ui components for consistent styling
- FOGO brand colors: `text-green-500` (up), `text-red-500` (down)

### Latest Tech Information

**Solana SPL Token Library:**
```bash
pnpm add @solana/spl-token
```

The `@solana/spl-token` library provides:
- `getAssociatedTokenAddress()` - Derive ATA address
- `getAccount()` - Fetch token account data
- Handles TokenAccountNotFoundError for zero balances

**Constants to add:**
```typescript
// lib/constants.ts
export const USDC_MINT = '6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy'
export const USDC_DECIMALS = 6
```

### Edge Cases to Handle

1. **Zero USDC balance:** Show $0.00, disable quick amounts
2. **Wallet not connected:** Show connect button, disable all inputs
3. **Epoch not Open:** Disable direction buttons and submit
4. **Very small amounts:** Enforce minimum (e.g., $0.01)
5. **Very large amounts:** May hit wallet cap (handled in Story 2.10)
6. **Decimal precision:** Limit to 2 decimal places
7. **Copy/paste validation:** Sanitize pasted input

### Accessibility Requirements (from UX spec)

- Focus states on all interactive elements
- Keyboard navigation for direction selection (Tab, Enter)
- ARIA labels on buttons and inputs
- Error messages linked to inputs via `aria-describedby`
- Color-blind friendly with icons (▲/▼) supplementing color

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- No debug issues encountered during implementation

### Completion Notes List

- Task 1: Created `types/trade.ts` with TradeDirection type and MIN_TRADE_AMOUNT constant. Created `stores/trade-store.ts` with Zustand + immer for trade ticket state management including setDirection, setAmount, validate, and reset actions.
- Task 2: Created `hooks/use-usdc-balance.ts` using TanStack Query with 10s refetch interval. Uses @solana/spl-token for ATA derivation and handles TokenAccountNotFoundError gracefully.
- Task 3: Created `components/trading/direction-button.tsx` with green/red styling for UP/DOWN, selected state backgrounds, triangle icons, and proper accessibility attributes (aria-pressed, aria-label).
- Task 4: Created `components/trading/amount-input.tsx` with numeric validation (max 2 decimals), dollar sign prefix, error display, and proper ARIA attributes for accessibility.
- Task 5: Created `components/trading/quick-amount-buttons.tsx` with 25/50/75/Max percentage buttons that calculate and display actual dollar amounts when balance is available.
- Task 6: Created `components/trading/balance-display.tsx` showing formatted USDC balance with USDC icon (CircleDollarSign), loading skeleton and disconnected wallet states.
- Task 7: Created `components/trading/trade-ticket.tsx` container integrating all sub-components with epoch state awareness, wallet connection handling, trade state management, and `isTradeReady` validation for AC #7.
- Task 8: Updated `trade-ticket-area.tsx` to use the new TradeTicket component with proper asset prop passing.
- Task 9: Created comprehensive tests for all new components and hooks.

### Change Log

- 2026-03-13: Implemented Story 2.8 - Trade Ticket Component with full test coverage
- 2026-03-13: [Code Review] Fixed missing balance-display.test.tsx, added USDC icon, improved validation for disconnected wallets, added isTradeReady for AC #7

### File List

**New Files:**
- web/src/types/trade.ts
- web/src/stores/trade-store.ts
- web/src/stores/trade-store.test.ts
- web/src/hooks/use-usdc-balance.ts
- web/src/hooks/use-usdc-balance.test.ts
- web/src/components/trading/direction-button.tsx
- web/src/components/trading/direction-button.test.tsx
- web/src/components/trading/amount-input.tsx
- web/src/components/trading/amount-input.test.tsx
- web/src/components/trading/quick-amount-buttons.tsx
- web/src/components/trading/quick-amount-buttons.test.tsx
- web/src/components/trading/balance-display.tsx
- web/src/components/trading/balance-display.test.tsx
- web/src/components/trading/trade-ticket.tsx
- web/src/components/trading/trade-ticket.test.tsx

**Modified Files:**
- web/src/types/index.ts (added trade export)
- web/src/hooks/index.ts (added use-usdc-balance export)
- web/src/lib/constants.ts (added USDC_DECIMALS constant)
- web/src/components/trading/trade-ticket-area.tsx (integrated TradeTicket)
