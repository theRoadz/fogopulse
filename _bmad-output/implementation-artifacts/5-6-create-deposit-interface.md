# Story 5.6: Create Deposit Interface

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a liquidity provider,
I want a clear interface to deposit liquidity,
so that I understand the risks and can invest confidently.

## Acceptance Criteria

1. **Given** the LP dashboard with pool cards, **When** I click a "Deposit" button on a pool card or the empty state, **Then** a deposit dialog opens for that pool (or a pool selector if from empty state)
2. **And** a risk disclosure is displayed before the deposit form, explaining: impermanent loss risk, withdrawal cooldown period, fee structure (70% LP / 20% treasury / 10% insurance)
3. **And** I must acknowledge the risks (checkbox) before the deposit button becomes enabled
4. **And** I can enter the USDC amount to deposit with my current USDC balance shown
5. **And** expected LP shares are calculated and displayed in real-time as I type: `shares = (amount * totalLpShares) / (yesReserves + noReserves)` (or `shares = amount` for first deposit when `totalLpShares == 0`)
6. **And** confirming initiates the `deposit_liquidity` on-chain transaction via wallet signature
7. **And** transaction success shows a toast with explorer link and refreshes LP dashboard data
8. **And** transaction failure shows a user-friendly error message via toast
9. **And** the disabled "Deposit — Coming Soon" button in `LpEmptyState` is replaced with a functional "Deposit" button that opens the dialog
10. **And** each `LpPoolCard` gains a "Deposit" button to deposit into that specific pool
11. **And** minimum deposit is enforced: `amount >= 2 * MIN_TRADE_AMOUNT` ($0.20, since MIN_TRADE_AMOUNT = 100,000 lamports = $0.10) with inline validation message
12. **And** FR30 (view risk disclosure before depositing) is satisfied

## Tasks / Subtasks

- [x] Task 1: Create `buildDepositLiquidityInstruction` transaction builder (AC: #6)
  - [x] 1.1: Create `web/src/lib/transactions/deposit-liquidity.ts` following `buy.ts` pattern exactly
  - [x] 1.2: Accept params: `{ asset, amount (string), userPubkey, program }`
  - [x] 1.3: Derive LpShare PDA via `deriveLpSharePda(userPubkey, POOL_PDAS[asset])`
  - [x] 1.4: Derive user USDC ATA via `deriveUserUsdcAta(userPubkey)`
  - [x] 1.5: Convert amount string to BN lamports using same `usdcToLamports` pattern as `buy.ts`
  - [x] 1.6: Build instruction with `(program.methods as any).depositLiquidity(userPubkey, amountLamports)` — 2 args: user (Pubkey), amount (u64)
  - [x] 1.7: Accounts in exact order: `signerOrSession`, `config`, `pool`, `lpShare`, `poolUsdc`, `userUsdc`, `usdcMint`, `tokenProgram`, `associatedTokenProgram`, `systemProgram`

- [x] Task 2: Create `useDepositLiquidity` mutation hook (AC: #6, #7, #8)
  - [x] 2.1: Create `web/src/hooks/use-deposit-liquidity.ts` following `use-buy-position.ts` pattern exactly
  - [x] 2.2: Params interface: `{ asset, amount (string), userPubkey (string) }`
  - [x] 2.3: Full flow: validate wallet → get blockhash → build instruction → create Transaction → sendTransaction → confirmTransaction
  - [x] 2.4: On success: toast.success with explorer link, invalidate queries: `pool(asset)`, `lpShare(asset, userPubkey)`, `usdcBalance(userPubkey)`
  - [x] 2.5: On error: `parseTransactionError(error)` → toast.error

- [x] Task 3: Create `LpDepositDialog` component (AC: #1, #2, #3, #4, #5, #6, #11)
  - [x] 3.1: Create `web/src/components/lp/lp-deposit-dialog.tsx`
  - [x] 3.2: Use shadcn `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`
  - [x] 3.3: Accept props: `{ asset: Asset, open: boolean, onOpenChange: (open: boolean) => void }`
  - [x] 3.4: Risk disclosure section with 3 items: impermanent loss, withdrawal cooldown, fee structure (70/20/10 split)
  - [x] 3.5: Checkbox "I understand the risks" — deposit button disabled until checked
  - [x] 3.6: USDC amount input with current balance display from `useUsdcBalance()`
  - [x] 3.7: Real-time share preview: fetch pool data via `usePool(asset)`, calculate expected shares
  - [x] 3.8: "Max" button to fill with full USDC balance
  - [x] 3.9: Inline validation: empty, zero, below minimum ($0.20), exceeds balance
  - [x] 3.10: Deposit button calls `useDepositLiquidity` mutation, shows loading state during transaction
  - [x] 3.11: Close dialog on successful deposit

- [x] Task 4: Add "Deposit" button to `LpPoolCard` (AC: #10)
  - [x] 4.1: Modify `web/src/components/lp/lp-pool-card.tsx` to accept optional `onDeposit?: () => void` prop
  - [x] 4.2: Add "Deposit" button at bottom of card that calls `onDeposit`
  - [x] 4.3: Button uses `variant="outline"` with `size="sm"`

- [x] Task 5: Replace disabled button in `LpEmptyState` (AC: #9)
  - [x] 5.1: Modify `web/src/components/lp/lp-empty-state.tsx` to accept `onDeposit?: () => void` prop
  - [x] 5.2: Replace disabled "Deposit — Coming Soon" button with functional "Deposit" button

- [x] Task 6: Wire deposit dialog into `LpDashboardFeature` (AC: #1)
  - [x] 6.1: Modify `web/src/components/lp/lp-dashboard-feature.tsx`
  - [x] 6.2: Add state: `depositDialogOpen: boolean`, `depositAsset: Asset`
  - [x] 6.3: Pass `onDeposit` callback to each `LpPoolCard` that opens dialog with that asset
  - [x] 6.4: Pass `onDeposit` to `LpEmptyState` (default to first asset or open pool selector)
  - [x] 6.5: Render `LpDepositDialog` with current `depositAsset` and open state

- [x] Task 7: Add LP-specific error messages to transaction-errors.ts (AC: #8)
  - [x] 7.1: Add to `ERROR_MESSAGES` in `web/src/lib/transaction-errors.ts`:
    - `DepositTooSmall`: "Deposit too small — would result in zero LP shares."
  - [x] 7.2: Note: `BelowMinimumTrade` already exists with message "Minimum trade amount is $0.01" — this fires for deposits below $0.20 on-chain. The existing message is slightly misleading for deposits, but acceptable since client-side validation will catch it first with a deposit-specific message ("Minimum deposit is $0.20").

- [x] Task 8: Install shadcn Checkbox component (AC: #3)
  - [x] 8.1: Run `cd web && npx shadcn@latest add checkbox` — this component does NOT exist yet in `web/src/components/ui/`
  - [x] 8.2: Verify `web/src/components/ui/checkbox.tsx` was created

- [x] Task 9: Export new hook from hooks index (AC: #6)
  - [x] 9.1: Add `useDepositLiquidity` export to `web/src/hooks/index.ts` following existing re-export pattern

## Dev Notes

### Critical Implementation Patterns

**Transaction Builder — Follow `buy.ts` Exactly (`web/src/lib/transactions/buy.ts`)**

The deposit_liquidity instruction takes 2 args and 10 accounts. The builder must follow the identical pattern:

```typescript
// web/src/lib/transactions/deposit-liquidity.ts
import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BN, Program } from '@coral-xyz/anchor'
import type { Asset } from '@/types/assets'
import { POOL_PDAS, POOL_USDC_ATAS, GLOBAL_CONFIG_PDA, USDC_MINT } from '@/lib/constants'
import { deriveLpSharePda, deriveUserUsdcAta } from '@/lib/pda'

// Instruction args: user (Pubkey), amount (u64)
// Account order MUST match deposit_liquidity.rs:
// 1. signerOrSession (signer, mut)
// 2. config (GlobalConfig PDA)
// 3. pool (Pool PDA, mut)
// 4. lpShare (LpShare PDA, init_if_needed, mut)
// 5. poolUsdc (Pool's USDC ATA, mut)
// 6. userUsdc (User's USDC ATA, mut)
// 7. usdcMint (USDC Mint)
// 8. tokenProgram (TOKEN_PROGRAM_ID)
// 9. associatedTokenProgram (ASSOCIATED_TOKEN_PROGRAM_ID)
// 10. systemProgram (SystemProgram.programId)
const methodBuilder = (program.methods as any)
  .depositLiquidity(userPubkey, amountLamports)
  .accounts({
    signerOrSession: userPubkey,
    config: GLOBAL_CONFIG_PDA,
    pool: POOL_PDAS[asset],
    lpShare: deriveLpSharePda(userPubkey, POOL_PDAS[asset]),
    poolUsdc: POOL_USDC_ATAS[asset],
    userUsdc: deriveUserUsdcAta(userPubkey),
    usdcMint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
```

**USDC Amount Conversion** — Reuse exact pattern from `buy.ts`:
```typescript
function usdcToLamports(amount: string): BN {
  const parsed = parseFloat(amount)
  if (isNaN(parsed) || parsed < 0) throw new Error('Invalid amount')
  if (parsed > Number.MAX_SAFE_INTEGER / 1_000_000) throw new Error('Amount exceeds maximum safe value')
  const lamports = Math.floor(parsed * 1_000_000)
  return new BN(lamports)
}
```

**Mutation Hook — Follow `use-buy-position.ts` Exactly (`web/src/hooks/use-buy-position.ts`)**

Key cache invalidation for deposit success:
```typescript
queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pool(asset) })
queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lpShare(asset, userPubkey) })
queryClient.invalidateQueries({ queryKey: QUERY_KEYS.usdcBalance(userPubkey) })
```

**Share Preview Calculation** — Use existing helpers from `types/lp.ts`:
```typescript
import { calculateShareValue } from '@/types/lp'

// For preview: estimate shares user will receive
function estimateSharesForDeposit(
  amountLamports: bigint,
  totalLpShares: bigint,
  yesReserves: bigint,
  noReserves: bigint
): bigint {
  if (totalLpShares === 0n) return amountLamports // First deposit: 1:1
  const poolValue = yesReserves + noReserves
  if (poolValue === 0n) return 0n
  return (amountLamports * totalLpShares) / poolValue
}
```

**Minimum Deposit Validation**: On-chain requires `amount >= 2 * MIN_TRADE_AMOUNT`. `MIN_TRADE_AMOUNT` = 100,000 lamports ($0.10), so minimum deposit = 200,000 lamports (**$0.20**). Validate client-side before submitting. Define as constant: `const MIN_DEPOSIT_AMOUNT = 0.20`.

**USDC Display Formatting**: Use `formatUsdcAmount(amount: bigint): string` from `@/hooks/use-claimable-amount` — accepts USDC lamports (6 decimals), returns formatted string like `"95.00"`. Use for share value display. For share count display, use `Number(shares).toLocaleString()` (NOT `bigint.toLocaleString()` — cross-browser issue from Story 5.5 code review).

**FOGO Sessions**: The `user` arg is passed as both instruction argument AND account (`signerOrSession`). This supports gasless transactions via session accounts. No special frontend handling needed — pass `publicKey` for both.

### Scope Boundaries — DO NOT Implement

- **Withdrawal interface** — Story 5.7. Do NOT add withdrawal buttons or UI.
- **APY calculation** — Story 5.8. Keep "Coming Soon" badge as-is.
- **Pool selector in dialog** — Keep it simple: dialog opens for a specific asset. Empty state "Deposit" button can default to first asset (BTC) or you can add a simple asset select within the dialog.
- **Auto-compound toggle** — UX spec mentions this as future enhancement, not in scope.
- **Earnings breakdown** — Out of scope (P3 in UX spec).

### Project Structure Notes

Files to CREATE:
- `web/src/lib/transactions/deposit-liquidity.ts` — Instruction builder
- `web/src/hooks/use-deposit-liquidity.ts` — Mutation hook
- `web/src/components/lp/lp-deposit-dialog.tsx` — Deposit dialog component

Files to MODIFY:
- `web/src/components/lp/lp-pool-card.tsx` — Add "Deposit" button
- `web/src/components/lp/lp-empty-state.tsx` — Replace disabled button
- `web/src/components/lp/lp-dashboard-feature.tsx` — Wire dialog + state
- `web/src/lib/transaction-errors.ts` — Add `DepositTooSmall` error message
- `web/src/hooks/index.ts` — Export new hook (if applicable)

### Architecture Compliance

- **TanStack Query for on-chain data**: Pool data via `usePool`, LP share via `useLpShare` — NOT Zustand
- **Zustand for UI state only**: Dialog open/close state uses React `useState` (local component state) — no Zustand store needed
- **shadcn/ui components**: Dialog, Input, Button, Alert from existing library; **Checkbox must be installed first** (Task 8) — it does not exist yet
- **File naming**: kebab-case (`lp-deposit-dialog.tsx`, `use-deposit-liquidity.ts`, `deposit-liquidity.ts`)
- **Component naming**: PascalCase (`LpDepositDialog`)
- **Hook naming**: camelCase with `use` prefix (`useDepositLiquidity`)
- **Import order**: React/Next → External libs → Internal aliases (@/) → Relative → Types
- **FOGO identity**: Use FOGO constants, no Solana references
- **Transaction pattern**: Follow `useBuyPosition` → `buildBuyPositionInstruction` pattern exactly

### Library/Framework Requirements

- **@solana/web3.js**: `PublicKey`, `Transaction`, `SystemProgram`, `Connection` — already imported in buy.ts pattern
- **@solana/spl-token**: `TOKEN_PROGRAM_ID`, `ASSOCIATED_TOKEN_PROGRAM_ID` — already used
- **@coral-xyz/anchor**: `Program`, `BN` — already used in buy.ts
- **@solana/wallet-adapter-react**: `useWallet`, `useConnection` — for wallet state and signing
- **@tanstack/react-query**: `useMutation`, `useQueryClient` — for mutation hook
- **sonner**: `toast` — for success/error notifications
- **shadcn/ui**: Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, Button, Label, Alert, AlertDescription — all already installed. **Checkbox** — must be installed via `npx shadcn@latest add checkbox` (Task 8)
- **lucide-react**: AlertTriangle (for risk disclosure icon), Loader2 (for loading spinner)
- **No new npm dependencies required** — all libraries already installed. Only shadcn Checkbox component needs generation.

### Testing Requirements

- `pnpm build` must succeed with no TypeScript errors
- Deposit dialog opens from pool card "Deposit" button
- Deposit dialog opens from empty state "Deposit" button
- Risk disclosure displays and checkbox gates deposit button
- Amount input validates: empty, zero, below minimum ($0.20), exceeds balance
- Share preview updates in real-time as amount changes
- Transaction executes successfully with correct instruction args and account order
- Success toast shows with explorer link
- Error toast shows user-friendly message on failure
- LP dashboard data refreshes after successful deposit (pool, lpShare, balance queries invalidated)
- Dialog closes on successful deposit

### Previous Story Intelligence

- **Story 5.5**: LpPoolCard and LpEmptyState already have placeholder UI that this story replaces. LpDashboardFeature orchestrates all LP components — add dialog state there.
- **Story 5.5 Code Review**: Fixed `bigint.toLocaleString()` cross-browser issue → use `Number(shares).toLocaleString()` for share preview display. Fixed negative earnings formatting → use absolute value approach.
- **Story 5.4**: `totalLpShares > 0` guard required before division — replicate in frontend share estimation. `process_withdrawal` handles LP exit — deposit is the inverse.
- **Story 5.2**: LpShare uses `init_if_needed` — first deposit creates the account, subsequent deposits update it. `deposited_amount` tracks cumulative deposits for P&L.
- **Story 2.9**: Trade execution flow (trade-ticket → useBuyPosition → buildBuyPositionInstruction) is the exact pattern to follow for deposit flow.

### Git Intelligence

Recent commits:
- `76105bc fix: Add FOGO/USD Pyth Hermes feed ID` — non-LP, no impact
- `e1c264f feat: Implement LP Dashboard with code review fixes (Story 5.5)` — direct predecessor, contains LP components to modify
- Commit format: `feat: <description> (Story X.Y)`
- Frontend stories don't require `anchor build` or IDL copy — instruction already exists in IDL

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.6] — Acceptance criteria and BDD
- [Source: _bmad-output/planning-artifacts/prd.md#FR30] — LP can view risk disclosure before depositing
- [Source: _bmad-output/planning-artifacts/prd.md#FR31] — LP can deposit USDC into pool
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Derek Journey] — LP deposit flow: click Deposit → enter amount → see preview → acknowledge risks → confirm
- [Source: web/src/lib/transactions/buy.ts] — Transaction builder pattern (COPY THIS PATTERN)
- [Source: web/src/hooks/use-buy-position.ts] — Mutation hook pattern (COPY THIS PATTERN)
- [Source: web/src/lib/transaction-errors.ts] — Error parsing and user-friendly messages
- [Source: web/src/hooks/use-usdc-balance.ts] — USDC balance hook for displaying current balance
- [Source: web/src/hooks/use-program.ts] — Anchor program instance hook
- [Source: web/src/types/lp.ts] — LpShareData type, calculateShareValue, calculateEarnings
- [Source: web/src/lib/pda.ts] — deriveLpSharePda, deriveUserUsdcAta
- [Source: web/src/lib/constants.ts] — POOL_PDAS, POOL_USDC_ATAS, GLOBAL_CONFIG_PDA, USDC_MINT, QUERY_KEYS
- [Source: web/src/components/lp/lp-dashboard-feature.tsx] — Main LP dashboard to wire dialog into
- [Source: web/src/components/lp/lp-pool-card.tsx] — Pool card to add Deposit button
- [Source: web/src/components/lp/lp-empty-state.tsx] — Empty state to replace disabled button
- [Source: web/src/lib/fogopulse.json#depositLiquidity] — IDL instruction definition (2 args, 10 accounts)
- [Source: anchor/programs/fogopulse/src/instructions/deposit_liquidity.rs] — On-chain deposit logic: share calc, 50/50 split, min amount validation
- [Source: _bmad-output/implementation-artifacts/5-5-create-lp-dashboard.md] — Previous story patterns and learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- shadcn CLI `npx shadcn@latest add checkbox` failed due to npm/pnpm incompatibility on Windows — resolved by manually installing `@radix-ui/react-checkbox` via pnpm and creating the Checkbox component file manually following shadcn patterns.

### Completion Notes List

- Created transaction builder `buildDepositLiquidityInstruction` following `buy.ts` pattern exactly — 2 instruction args (user, amount), 10 accounts in correct order
- Created `useDepositLiquidity` mutation hook following `useBuyPosition` pattern — full wallet validation, blockhash handling, transaction send/confirm, cache invalidation (pool, lpShare, usdcBalance), toast notifications with explorer link
- Created `LpDepositDialog` component with: risk disclosure (impermanent loss, withdrawal cooldown, fee structure 70/20/10), checkbox risk acknowledgement, USDC amount input with balance display, real-time share preview calculation, Max button, inline validation (empty, zero, below $0.20 minimum, exceeds balance), loading state during transaction, dialog close on success
- Added "Deposit" button (outline/sm variant) to `LpPoolCard` via optional `onDeposit` prop
- Replaced disabled "Deposit — Coming Soon" button in `LpEmptyState` with functional "Deposit" button via `onDeposit` prop
- Wired dialog state (`depositDialogOpen`, `depositAsset`) into `LpDashboardFeature` — each pool card opens dialog for its asset, empty state defaults to BTC
- Added `DepositTooSmall` error message to `transaction-errors.ts`
- Installed shadcn Checkbox component (manually created + `@radix-ui/react-checkbox` dependency)
- Exported `useDepositLiquidity` from hooks index
- `pnpm build` passes with zero TypeScript errors
- Share preview uses `Number(shares).toLocaleString()` per Story 5.5 code review (cross-browser bigint fix)

### Change Log

- 2026-03-18: Implemented Story 5.6 — Create Deposit Interface (all 9 tasks complete)
- 2026-03-18: Code review — Fixed 3 issues: (H2) dialog state not resetting on close, (M2) Max button floating-point precision, (M4) empty state button disabled guard. Build verified passing.

### File List

New files:
- `web/src/lib/transactions/deposit-liquidity.ts`
- `web/src/hooks/use-deposit-liquidity.ts`
- `web/src/components/lp/lp-deposit-dialog.tsx`
- `web/src/components/ui/checkbox.tsx`

Modified files:
- `web/src/components/lp/lp-pool-card.tsx`
- `web/src/components/lp/lp-empty-state.tsx`
- `web/src/components/lp/lp-dashboard-feature.tsx`
- `web/src/lib/transaction-errors.ts`
- `web/src/hooks/index.ts`
- `web/package.json` (added @radix-ui/react-checkbox)
- `web/pnpm-lock.yaml`
