# Story 5.7: Create Withdrawal Interface

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a liquidity provider,
I want to manage my withdrawal process,
so that I can track when my funds will be available.

## Acceptance Criteria

1. **Given** my LP position with shares, **When** I click "Withdraw" on a pool card, **Then** a withdrawal dialog opens showing my current share balance and equivalent USDC value.

2. **Given** the withdrawal dialog is open, **When** I enter a number of shares to withdraw, **Then** the equivalent USDC value is calculated and displayed in real-time using formula: `(shares * (yesReserves + noReserves)) / totalLpShares`.

3. **Given** the withdrawal dialog is open, **When** I click "Max", **Then** the input auto-fills with my total available (non-pending) shares.

4. **Given** valid share input and no existing pending withdrawal, **When** I confirm the withdrawal request, **Then** the `request_withdrawal` on-chain instruction is executed, starting the cooldown timer.

5. **Given** a successful withdrawal request, **When** I view my LP position, **Then** the pending withdrawal status is shown with a cooldown countdown (60 seconds).

6. **Given** a pending withdrawal where cooldown has elapsed, **When** I click "Complete Withdrawal", **Then** the `process_withdrawal` on-chain instruction is executed, transferring USDC to my wallet.

7. **Given** a pending withdrawal where cooldown has NOT elapsed, **Then** the "Complete Withdrawal" button is disabled with remaining time displayed.

8. **Given** a pending withdrawal already exists, **When** I try to request another withdrawal, **Then** an error message is shown explaining only one pending withdrawal is allowed at a time.

9. **Given** a successful withdrawal completion, **Then** a success toast is shown with the USDC amount received and FOGO explorer link (use `FOGO_EXPLORER_TX_URL` from constants).

10. **Given** FR34 (pending withdrawal status) and FR35 (cooldown timer), **Then** both requirements are satisfied.

## Tasks / Subtasks

- [x] Task 1: Create `buildRequestWithdrawalInstruction` transaction builder (AC: #4)
  - [x] 1.1: Create `web/src/lib/transactions/request-withdrawal.ts`
  - [x] 1.2: Follow `deposit-liquidity.ts` pattern with 2 args (user, shares_amount) and 4 accounts (signerOrSession, config, pool, lpShare)
  - [x] 1.3: Convert shares input to u64 (BN)
  - [x] 1.4: Validate shares_amount > 0

- [x] Task 2: Create `buildProcessWithdrawalInstruction` transaction builder (AC: #6)
  - [x] 2.1: Create `web/src/lib/transactions/process-withdrawal.ts`
  - [x] 2.2: Follow `deposit-liquidity.ts` pattern with 1 arg (user) and 10 accounts (signerOrSession, config, pool, lpShare, poolUsdc, userUsdc, usdcMint, tokenProgram, associatedTokenProgram, systemProgram)
  - [x] 2.3: Note: process_withdrawal has more accounts than request_withdrawal because it transfers tokens

- [x] Task 3: Create `useRequestWithdrawal` mutation hook (AC: #4, #8)
  - [x] 3.1: Create `web/src/hooks/use-request-withdrawal.ts`
  - [x] 3.2: Follow `use-deposit-liquidity.ts` pattern exactly (blockhash, build, send, confirm)
  - [x] 3.3: Invalidate queries on success: pool, lpShare, usdcBalance
  - [x] 3.4: Toast notifications for success/error with explorer link
  - [x] 3.5: Handle `WithdrawalAlreadyPending` error with user-friendly message

- [x] Task 4: Create `useProcessWithdrawal` mutation hook (AC: #6, #9)
  - [x] 4.1: Create `web/src/hooks/use-process-withdrawal.ts`
  - [x] 4.2: Follow `use-deposit-liquidity.ts` pattern exactly
  - [x] 4.3: Invalidate queries on success: pool, lpShare, usdcBalance
  - [x] 4.4: Toast notifications showing USDC amount received with explorer link
  - [x] 4.5: Handle `NoPendingWithdrawal` and `CooldownNotElapsed` errors with user-friendly messages

- [x] Task 5: Create `LpWithdrawDialog` component (AC: #1, #2, #3, #4, #7, #8)
  - [x] 5.1: Create `web/src/components/lp/lp-withdraw-dialog.tsx`
  - [x] 5.2: Dialog with share amount input + "Max" button
  - [x] 5.3: Real-time USDC value preview using `calculateShareValue()` from `types/lp.ts` (DO NOT reimplement)
  - [x] 5.4: Validate: shares > 0, shares <= available shares (total - pending), no existing pending withdrawal
  - [x] 5.5: Show warning if user has pending withdrawal (disable request, show pending status instead)
  - [x] 5.6: Disable confirm button and show message when protocol is paused or pool is paused/frozen
  - [x] 5.7: Confirm button executes `useRequestWithdrawal`
  - [x] 5.8: Use shadcn/ui Dialog, Input, Button, Alert components (same as deposit dialog)

- [x] Task 6: Create `LpPendingWithdrawal` component (AC: #5, #6, #7)
  - [x] 6.1: Create `web/src/components/lp/lp-pending-withdrawal.tsx`
  - [x] 6.2: Show pending shares count and equivalent USDC value
  - [x] 6.3: Countdown timer showing seconds remaining (60s cooldown)
  - [x] 6.4: "Complete Withdrawal" button enabled only when cooldown elapsed
  - [x] 6.5: Button executes `useProcessWithdrawal`
  - [x] 6.6: Use `useEffect` + `setInterval` for countdown (update every 1 second), cleanup with `return () => clearInterval(id)`, stop interval when countdown reaches 0
  - [x] 6.7: Compare `withdrawal_requested_at + WITHDRAWAL_COOLDOWN_SECONDS` against current `Date.now() / 1000`

- [x] Task 7: Add "Withdraw" button to `LpPoolCard` (AC: #1)
  - [x] 7.1: Modify `web/src/components/lp/lp-pool-card.tsx`
  - [x] 7.2: Current props: `{ info: PoolLpInfo; onDeposit?: () => void }` — extend with `onWithdraw?: () => void`
  - [x] 7.3: Add "Withdraw" button next to existing "Deposit" button (only shown when user has shares > 0)
  - [x] 7.4: Pass `onWithdraw` callback prop

- [x] Task 8: Integrate `LpPendingWithdrawal` into `LpPoolCard` (AC: #5)
  - [x] 8.1: Show pending withdrawal banner/section in pool card when `lpShare.pendingWithdrawal > 0`
  - [x] 8.2: Display inline countdown and "Complete Withdrawal" button

- [x] Task 9: Wire withdrawal dialog into `LpDashboardFeature` (AC: #1)
  - [x] 9.1: Modify `web/src/components/lp/lp-dashboard-feature.tsx`
  - [x] 9.2: Add withdraw dialog state (selectedPool for withdraw) following deposit dialog pattern
  - [x] 9.3: Pass `onWithdraw` handler to pool cards
  - [x] 9.4: Render `LpWithdrawDialog` with selected pool data

- [x] Task 10: Add withdrawal error messages to `transaction-errors.ts` (AC: #8)
  - [x] 10.1: Modify `web/src/lib/transaction-errors.ts`
  - [x] 10.2: Add: `WithdrawalAlreadyPending` → "You already have a pending withdrawal. Complete or wait for it before requesting another."
  - [x] 10.3: Add: `NoPendingWithdrawal` → "No pending withdrawal found to process."
  - [x] 10.4: Add: `CooldownNotElapsed` → "Withdrawal cooldown has not elapsed. Please wait for the timer to complete."
  - [x] 10.5: Add: `WithdrawalTooSmall` → "Withdrawal amount too small — would result in zero USDC."
  - [x] 10.6: Add if missing: `InsufficientShares` → "Not enough shares available for this withdrawal." (already existed)
  - [x] 10.7: Add if missing: `ZeroShares` → "Share amount must be greater than zero." (already existed)

- [x] Task 11: Add `WITHDRAWAL_COOLDOWN_SECONDS` constant (AC: #5, #7)
  - [x] 11.1: Modify `web/src/lib/constants.ts`
  - [x] 11.2: Add `export const WITHDRAWAL_COOLDOWN_SECONDS = 60` (mirrors on-chain constant)

- [x] Task 12: Export new hooks from hooks index (AC: all)
  - [x] 12.1: Modify `web/src/hooks/index.ts`
  - [x] 12.2: Export `useRequestWithdrawal` and `useProcessWithdrawal`

## Dev Notes

### Transaction Builder Patterns

**request_withdrawal** — lighter instruction (no token transfer):
- Args: `user: PublicKey`, `shares_amount: BN` (u64)
- Accounts (4): signerOrSession, config, pool, lp_share
- Follow `deposit-liquidity.ts` structure but simpler — fewer accounts since no token transfer
- Shares are already u64 on-chain, just convert input with `new BN(sharesAmount.toString())`

**process_withdrawal** — heavier instruction (token transfer):
- Args: `user: PublicKey` (no amount — uses pending_withdrawal from LpShare)
- Accounts (10): signerOrSession, config, pool, lp_share, pool_usdc, user_usdc, usdc_mint, token_program, associated_token_program, system_program
- Same account pattern as `deposit-liquidity.ts` for the token accounts
- USDC amount is computed on-chain: `(pending_shares * pool_value) / total_lp_shares`

### USDC Value Preview Calculation

```typescript
// REUSE existing utility — DO NOT reimplement:
import { calculateShareValue } from '@/types/lp'

const usdcValue = calculateShareValue(
  BigInt(inputShares),
  BigInt(pool.totalLpShares),
  BigInt(pool.yesReserves),
  BigInt(pool.noReserves)
)
// Display with formatUsdcAmount from web/src/hooks/use-claimable-amount.ts
```

### Cooldown Logic

- Add `WITHDRAWAL_COOLDOWN_SECONDS = 60` to `web/src/lib/constants.ts` (mirrors on-chain constant from `anchor/programs/fogopulse/src/constants.rs`)
- Frontend countdown: `const elapsed = Math.floor(Date.now() / 1000) - Number(lpShare.withdrawalRequestedAt)`
- Remaining: `Math.max(0, WITHDRAWAL_COOLDOWN_SECONDS - elapsed)`
- Complete button enabled when `remaining === 0`
- **IMPORTANT:** Use `Date.now() / 1000` (Unix seconds) to compare with on-chain `i64` timestamp
- Cleanup interval when countdown reaches 0 to avoid unnecessary re-renders

### Pending Withdrawal Detection

```typescript
// Check if user has pending withdrawal:
const hasPending = lpShare && BigInt(lpShare.pendingWithdrawal) > 0n
// Available shares for new withdrawal:
const availableShares = BigInt(lpShare.shares) - BigInt(lpShare.pendingWithdrawal)
```

### Display Formatting

- Use `Number(shares).toLocaleString()` for share display (per Story 5.5 code review — bigint cross-browser fix)
- Use `formatUsdcAmount` for USDC display — import from `web/src/hooks/use-claimable-amount.ts` (NOT in utils.ts)
- Use `calculateShareValue` for share-to-USDC conversion — import from `web/src/types/lp.ts`
- Use `FOGO_EXPLORER_TX_URL` from `web/src/lib/constants.ts` for explorer links (NOT Solana explorer)
- **DO NOT** use `BigInt.toString()` directly in JSX — always convert via `Number()` first

### Protocol/Pool Pause Handling

On-chain `request_withdrawal` validates `!config.paused && !config.frozen && !pool.is_paused && !pool.is_frozen`. The dialog must:
- Check pool pause/freeze state from pool data (already available via `useMultiPoolLp`)
- Disable confirm button and show "Pool is currently paused" or "Protocol is paused" message
- Note: `process_withdrawal` also checks these — the pending withdrawal component should show a message if pool becomes paused after requesting

### FOGO Sessions Support

Both instructions support gasless transactions via FOGO Sessions. The transaction builder pattern handles this automatically through the `signerOrSession` account pattern — same as deposit.

### Scope Boundaries

**IN SCOPE:**
- Request withdrawal dialog with share input
- USDC value preview
- Pending withdrawal display with countdown
- Complete withdrawal button
- Error handling for all 4 withdrawal error codes

**OUT OF SCOPE:**
- Cancel pending withdrawal (not implemented on-chain)
- Partial withdrawal processing (on-chain always processes full pending amount)
- APY display (Story 5.8)
- Withdrawal history log

### Project Structure Notes

- All new files follow kebab-case naming convention
- Components in `web/src/components/lp/` directory
- Transaction builders in `web/src/lib/transactions/`
- Hooks in `web/src/hooks/`
- Follows established monorepo structure (web/ workspace)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.7] — Acceptance criteria, FR34, FR35
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — LpShare account, PDA seeds
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey 4] — LP withdrawal UX flow
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Decision Patterns] — "Destructive confirmation" pattern for withdrawals
- [Source: anchor/programs/fogopulse/src/instructions/request_withdrawal.rs] — On-chain instruction, events, validations
- [Source: anchor/programs/fogopulse/src/instructions/process_withdrawal.rs] — On-chain instruction, USDC calculation, events
- [Source: anchor/programs/fogopulse/src/constants.rs] — WITHDRAWAL_COOLDOWN_SECONDS = 60
- [Source: web/src/lib/transactions/deposit-liquidity.ts] — Transaction builder pattern to follow
- [Source: web/src/hooks/use-deposit-liquidity.ts] — Mutation hook pattern to follow
- [Source: web/src/components/lp/lp-deposit-dialog.tsx] — Dialog component pattern to follow
- [Source: web/src/components/lp/lp-pool-card.tsx] — Where to add Withdraw button
- [Source: web/src/components/lp/lp-dashboard-feature.tsx] — Where to wire withdraw dialog
- [Source: _bmad-output/implementation-artifacts/5-6-create-deposit-interface.md] — Previous story patterns and learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No issues encountered during implementation.

### Completion Notes List

- Implemented full LP withdrawal flow: request withdrawal dialog, pending withdrawal countdown, and process withdrawal completion
- Transaction builders follow deposit-liquidity.ts pattern exactly; request_withdrawal has 4 accounts, process_withdrawal has 10 accounts
- Mutation hooks follow use-deposit-liquidity.ts pattern with blockhash, build, send, confirm flow
- LpWithdrawDialog validates shares > 0, shares <= available, no existing pending withdrawal, pool not paused/frozen
- LpPendingWithdrawal uses useEffect + setInterval for 1s countdown, cleans up interval when countdown reaches 0
- Reused calculateShareValue from types/lp.ts and formatUsdcAmount from use-claimable-amount.ts (no reimplementation)
- All 5 withdrawal error codes added to transaction-errors.ts; InsufficientShares and ZeroShares already existed
- WITHDRAWAL_COOLDOWN_SECONDS = 60 added to constants.ts
- Withdraw button shows only when user has shares > 0; pending withdrawal inline display in pool card
- Cleaned up pre-existing unused import (reservesToDisplayValue) in lp-pool-card.tsx
- Build passes (next build), lint passes (eslint), no regressions

### File List

New files:
- web/src/lib/transactions/request-withdrawal.ts
- web/src/lib/transactions/process-withdrawal.ts
- web/src/hooks/use-request-withdrawal.ts
- web/src/hooks/use-process-withdrawal.ts
- web/src/components/lp/lp-withdraw-dialog.tsx
- web/src/components/lp/lp-pending-withdrawal.tsx

Modified files:
- web/src/lib/transaction-errors.ts
- web/src/lib/constants.ts
- web/src/hooks/index.ts
- web/src/components/lp/lp-pool-card.tsx
- web/src/components/lp/lp-dashboard-feature.tsx

## Change Log

- 2026-03-18: Implemented withdrawal interface (Story 5.7) — request withdrawal dialog with share input and USDC preview, pending withdrawal countdown component with process_withdrawal completion, transaction builders and mutation hooks for both instructions, error messages for 5 withdrawal error codes, WITHDRAWAL_COOLDOWN_SECONDS constant, integrated into LP dashboard and pool cards
- 2026-03-18: Code review fixes — Fixed BigInt precision loss in share parsing (use string-to-BigInt directly, no Number() intermediate), restricted input to integers only, added estimated USDC to process_withdrawal success toast, guarded against empty pools array crash in withdraw dialog rendering
