# Story 6.6: Create Configuration Panel

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to modify protocol parameters through a UI,
so that I can adjust settings without command-line tools.

## Acceptance Criteria

1. **Given** the admin dashboard, **When** I access the configuration panel, **Then** current parameter values are displayed with their labels and units
2. **Given** the configuration panel, **When** I edit trading fee %, wallet cap %, or side cap %, **Then** the input validates in real-time (numeric, integer; tradingFeeBps max 1000 BPS, caps max 10000 BPS)
3. **Given** the configuration panel, **When** I edit oracle confidence thresholds (start/settle), **Then** inputs accept BPS values and display the percentage equivalent
4. **Given** the configuration panel, **When** I edit epoch duration or freeze window, **Then** inputs accept seconds and display human-readable format (e.g., "5m", "15s")
5. **Given** the configuration panel, **When** I edit fee split (LP/Treasury/Insurance), **Then** the three shares are validated to sum to 10000 BPS (100%)
6. **Given** the configuration panel with modified values, **When** I click "Update Config", **Then** a confirmation dialog shows all changed parameters with old vs new values
7. **Given** the confirmation dialog, **When** I confirm, **Then** the `update_config` transaction is built with ONLY changed fields (unchanged = `null`) and sent for wallet signature
8. **Given** a successful transaction, **When** confirmed on-chain, **Then** a success toast with explorer link is shown, GlobalConfig query is invalidated, and the form resets to new on-chain values
9. **Given** a failed transaction, **When** error occurs, **Then** a user-friendly error message is shown via toast (using `parseTransactionError`)
10. **And** FR47 (configure fee percentage), FR48 (configure per-wallet cap), FR49 (configure per-side exposure cap), FR50 (configure oracle confidence thresholds) are satisfied

## Tasks / Subtasks

- [x] Task 1: Create `useUpdateConfig` mutation hook (AC: #7, #8, #9)
  - [x] 1.1: Create `web/src/hooks/use-update-config.ts`
  - [x] 1.2: Follow `useBuyPosition` pattern exactly: `useMutation` from TanStack Query
  - [x] 1.3: Accept `UpdateConfigParams` (from `@/lib/transactions/update-config`) + `userPubkey: string`
  - [x] 1.4: Transaction flow: `getLatestBlockhash` -> `buildUpdateConfigInstruction` -> create `Transaction` -> `sendTransaction` -> `confirmTransaction`
  - [x] 1.5: `onSuccess`: toast with explorer link, invalidate `QUERY_KEYS.globalConfig()`
  - [x] 1.6: `onError`: parse with `parseTransactionError`, show error toast

- [x] Task 2: Create configuration panel component (AC: #1, #2, #3, #4, #5)
  - [x] 2.1: Create `web/src/components/admin/configuration-panel.tsx` ('use client')
  - [x] 2.2: Use `useGlobalConfig()` to populate form with current on-chain values
  - [x] 2.3: Create editable fields for all configurable parameters (see Dev Notes for field list)
  - [x] 2.4: Use controlled inputs with local `useState` for form state (NOT Zustand, NOT react-hook-form — keep it simple with useState matching the existing codebase pattern)
  - [x] 2.5: Reset form to on-chain values when `config` data changes (key-based remount pattern to comply with ESLint rules)

- [x] Task 3: Implement input validation matching on-chain constraints (AC: #2, #3, #4, #5)
  - [x] 3.1: `tradingFeeBps`: integer, max **1000 BPS** (10%) — on-chain rejects > 1000
  - [x] 3.2: `perWalletCapBps`, `perSideCapBps`: integer 0-10000
  - [x] 3.3: `oracleConfidenceThresholdStartBps`, `oracleConfidenceThresholdSettleBps`: integer **1-10000** (min 1 BPS) — on-chain rejects 0
  - [x] 3.4: Fee split validation: `lpFeeShareBps + treasuryFeeShareBps + insuranceFeeShareBps === 10000` — on-chain rejects any other sum
  - [x] 3.5: `epochDurationSeconds`: integer, **minimum 60 seconds** — on-chain rejects < 60
  - [x] 3.6: `freezeWindowSeconds`: integer, > 0, **must be < epochDurationSeconds** — on-chain rejects >= epoch
  - [x] 3.7: `oracleStalenessThresholdStart`, `oracleStalenessThresholdSettle`: integer > 0
  - [x] 3.8: Show inline validation errors below each field using `text-destructive text-sm`

- [x] Task 4: Implement change detection and confirmation dialog (AC: #6, #7)
  - [x] 4.1: Compare form state against current `config` to detect changed fields
  - [x] 4.2: Build `UpdateConfigParams` with `null` for unchanged fields, actual values for changed fields
  - [x] 4.3: Create confirmation dialog using shadcn `Dialog` component
  - [x] 4.4: Display table of changes: field name, current value, new value
  - [x] 4.5: "Confirm" button triggers `useUpdateConfig` mutation, "Cancel" closes dialog

- [x] Task 5: Add wallet address fields for treasury and insurance (AC: #1)
  - [x] 5.1: Display current treasury and insurance pubkey addresses (truncated with copy button)
  - [x] 5.2: Input fields accept valid base58 Solana public key strings
  - [x] 5.3: Validate with `new PublicKey(input)` — catch invalid keys

- [x] Task 6: Add toggle fields for boolean parameters (AC: #1)
  - [x] 6.1: `allowHedging` — Switch component with label
  - [x] 6.2: Note: `paused` and `frozen` are NOT included here (they are managed via Stories 6.7 and 6.8 respectively)

- [x] Task 7: Integrate configuration panel into admin dashboard (AC: #1)
  - [x] 7.1: Import and render `ConfigurationPanel` in `admin-dashboard-feature.tsx`
  - [x] 7.2: Place after `SystemStatusCard`, before the pool overview grid
  - [x] 7.3: Panel should be collapsible or in a dedicated tab (use existing Card pattern)

- [x] Task 8: Verify TypeScript compilation and ESLint (AC: all)
  - [x] 8.1: Run `npm run build` in web/ to verify no TypeScript errors
  - [x] 8.2: Run ESLint to verify no lint errors

## Dev Notes

### Architecture & Component Patterns

**Feature pattern** (match existing admin components):
```
components/admin/
  ├── admin-dashboard-feature.tsx    # Main container (MODIFY — add ConfigurationPanel)
  ├── configuration-panel.tsx        # NEW — config editing form + confirmation dialog
  ├── system-status-card.tsx         # Existing (displays config read-only)
  └── ...existing files unchanged
hooks/
  └── use-update-config.ts           # NEW — mutation hook for update_config tx
```

### Configurable Parameters (Complete Field List)

| Field | Type | Display Label | Unit | Input Type | On-Chain Validation |
|-------|------|--------------|------|------------|---------------------|
| `tradingFeeBps` | u16 | Trading Fee | BPS → show as % | number (step=1) | 0-**1000** (max 10%) |
| `lpFeeShareBps` | u16 | LP Fee Share | BPS → show as % | number (step=1) | 0-10000, sum of 3 shares = 10000 |
| `treasuryFeeShareBps` | u16 | Treasury Fee Share | BPS → show as % | number (step=1) | 0-10000, sum of 3 shares = 10000 |
| `insuranceFeeShareBps` | u16 | Insurance Fee Share | BPS → show as % | number (step=1) | 0-10000, sum of 3 shares = 10000 |
| `perWalletCapBps` | u16 | Per-Wallet Cap | BPS → show as % | number (step=1) | 0-10000 |
| `perSideCapBps` | u16 | Per-Side Cap | BPS → show as % | number (step=1) | 0-10000 |
| `oracleConfidenceThresholdStartBps` | u16 | Oracle Confidence (Start) | BPS | number (step=1) | **1**-10000 (min 1) |
| `oracleConfidenceThresholdSettleBps` | u16 | Oracle Confidence (Settle) | BPS | number (step=1) | **1**-10000 (min 1) |
| `oracleStalenessThresholdStart` | i64 (BN) | Oracle Staleness (Start) | seconds | number (step=1) | > 0 |
| `oracleStalenessThresholdSettle` | i64 (BN) | Oracle Staleness (Settle) | seconds | number (step=1) | > 0 |
| `epochDurationSeconds` | i64 (BN) | Epoch Duration | seconds | number (step=1) | **>= 60** seconds, > freezeWindow |
| `freezeWindowSeconds` | i64 (BN) | Freeze Window | seconds | number (step=1) | > 0, < epochDuration |
| `treasury` | Pubkey | Treasury Wallet | address | text | valid base58 pubkey |
| `insurance` | Pubkey | Insurance Wallet | address | text | valid base58 pubkey |
| `allowHedging` | bool | Allow Hedging | — | Switch | boolean toggle |

**NOT configurable in this panel** (managed by dedicated UIs):
- `paused` — managed via Story 6.7 (Pool Management UI)
- `frozen` — managed via Story 6.8 (Emergency Controls UI)

### Transaction Builder (Already Exists)

**File:** `web/src/lib/transactions/update-config.ts`

```typescript
import { buildUpdateConfigInstruction, UpdateConfigParams } from '@/lib/transactions/update-config'

// UpdateConfigParams uses null for unchanged fields:
const params: UpdateConfigParams = {
  treasury: null,           // not changing
  insurance: null,          // not changing
  tradingFeeBps: 200,       // changing to 2%
  lpFeeShareBps: null,      // not changing
  // ... all other fields null if unchanged
}

const ix = await buildUpdateConfigInstruction(program, adminPubkey, params)
```

**BN conversion is handled internally** by `toAnchorParams()` — pass raw numbers for i64 fields (epochDurationSeconds, freezeWindowSeconds, staleness thresholds). The builder wraps them in `new BN()`.

### Mutation Hook Pattern (Follow Exactly)

```typescript
// Pattern from use-buy-position.ts:
export function useUpdateConfig() {
  const queryClient = useQueryClient()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const program = useProgram()

  return useMutation<{ signature: string }, Error, { params: UpdateConfigParams; userPubkey: string }>({
    mutationFn: async ({ params, userPubkey }) => {
      if (!publicKey) throw new Error('Wallet not connected')
      if (publicKey.toString() !== userPubkey) throw new Error('Wallet changed')

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      const instruction = await buildUpdateConfigInstruction(program, publicKey, params)
      const transaction = new Transaction()
      transaction.add(instruction)
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      )
      if (confirmation.value.err) throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)

      return { signature }
    },
    onSuccess: ({ signature }) => {
      toast.success('Configuration updated!', {
        description: 'Protocol parameters have been updated successfully.',
        action: {
          label: 'View',
          onClick: () => window.open(`${FOGO_EXPLORER_TX_URL}/${signature}`, '_blank'),
        },
      })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.globalConfig() })
    },
    onError: (error) => {
      const message = parseTransactionError(error)
      toast.error('Configuration update failed', { description: message })
    },
  })
}
```

### Change Detection Logic

```typescript
// Compare form state against current config to build UpdateConfigParams
function buildChangeParams(form: FormState, config: GlobalConfigData): UpdateConfigParams {
  return {
    tradingFeeBps: form.tradingFeeBps !== config.tradingFeeBps ? form.tradingFeeBps : null,
    // BN fields: compare using .toNumber()
    epochDurationSeconds: form.epochDurationSeconds !== config.epochDurationSeconds.toNumber()
      ? form.epochDurationSeconds : null,
    // Pubkey fields: compare using .toString()
    treasury: form.treasury !== config.treasury.toString()
      ? new PublicKey(form.treasury) : null,
    // ... etc for all fields
    // CRITICAL: paused and frozen are ALWAYS null (not managed here)
    paused: null,
    frozen: null,
  }
}
```

### BPS Display Helper

For user-friendly display, show BPS as percentage:
```typescript
// 180 BPS → "1.80%"
const bpsToPercent = (bps: number) => (bps / 100).toFixed(2)
// Input: user types "1.8" (percent) → convert to 180 BPS
const percentToBps = (pct: string) => Math.round(parseFloat(pct) * 100)
```

**Decision: Use BPS as the primary input unit** (not percentage). Display the percentage equivalent next to each field as helper text. This avoids float precision issues and matches on-chain storage. Use `type="number"` with `step="1"` on all numeric inputs to enforce integers.

### On-Chain Validation Constraints (from update_config.rs)

The on-chain program enforces these constraints — the UI **must** mirror them to prevent confusing Anchor errors:

| Constraint | Rule | Error if Violated |
|-----------|------|-------------------|
| Trading fee max | `tradingFeeBps <= 1000` | InvalidFeeConfiguration |
| Fee share sum | `lp + treasury + insurance == 10000` | InvalidFeeConfiguration |
| Cap range | `perWalletCapBps <= 10000`, `perSideCapBps <= 10000` | InvalidCapConfiguration |
| Oracle confidence min | `confidenceStart >= 1`, `confidenceSettle >= 1` | InvalidOracleConfiguration |
| Oracle staleness positive | `stalenessStart > 0`, `stalenessSettle > 0` | InvalidOracleConfiguration |
| Epoch duration min | `epochDurationSeconds >= 60` | InvalidTimingConfiguration |
| Freeze < epoch | `freezeWindowSeconds < epochDurationSeconds` | InvalidTimingConfiguration |

**All fields use `Option<T>`** — only non-null fields are validated and updated. The fee share sum validation only triggers if ANY fee share field is provided (it checks the final sum after applying changes).

### Form Reset After Successful Update

After `onSuccess` in the mutation hook, `QUERY_KEYS.globalConfig()` is invalidated. This triggers `useGlobalConfig()` to refetch, which updates the `config` object. The `useEffect` in Task 2.5 (dependency on `config`) resets form state to the new on-chain values automatically. The `ConfigUpdated` event is emitted on-chain with a bitmask of changed fields — no frontend handling needed.

### UI Layout

Use a single `Card` component with sections grouped logically:

```
┌─ Configuration Panel ──────────────────────┐
│                                             │
│  ── Fees ──────────────────────────────     │
│  Trading Fee:    [180] BPS (1.80%)          │
│  LP Share:       [7000] BPS (70.00%)        │
│  Treasury Share: [2000] BPS (20.00%)        │
│  Insurance Share:[1000] BPS (10.00%)        │
│  ⚠ Fee shares must sum to 10000 BPS        │
│                                             │
│  ── Position Caps ─────────────────────     │
│  Per-Wallet Cap: [500] BPS (5.00%)          │
│  Per-Side Cap:   [3000] BPS (30.00%)        │
│                                             │
│  ── Oracle Thresholds ─────────────────     │
│  Confidence Start: [25] BPS (0.25%)         │
│  Confidence Settle:[80] BPS (0.80%)         │
│  Staleness Start:  [3] seconds              │
│  Staleness Settle: [10] seconds             │
│                                             │
│  ── Epoch Timing ──────────────────────     │
│  Epoch Duration:  [300] seconds (5m)        │
│  Freeze Window:   [15] seconds              │
│                                             │
│  ── Wallet Addresses ──────────────────     │
│  Treasury:  [FoGo...xyz] 📋                 │
│  Insurance: [FoGo...abc] 📋                 │
│                                             │
│  ── Toggles ───────────────────────────     │
│  Allow Hedging: [○ OFF]                     │
│                                             │
│  [Update Config] (disabled if no changes)   │
└─────────────────────────────────────────────┘
```

### Styling & Theming

- Follow existing admin card styling from `system-status-card.tsx`
- Dark theme primary: background #080420
- Use shadcn components: `Card`, `Input`, `Button`, `Dialog`, `Switch`, `Label`
- Group fields with section headings using `<h3>` or border dividers
- Validation errors: `text-destructive text-sm` below field
- Changed fields: subtle visual indicator (e.g., border-amber-500)

### Previous Story Intelligence (Story 6.5)

Key learnings from the admin dashboard story:
1. **`useGlobalConfig` returns BN for i64 fields** — use `.toNumber()` to compare/display epoch duration, freeze window, staleness thresholds
2. **System status card already displays all config values read-only** — configuration panel adds edit capability alongside (no need to duplicate display)
3. **Admin auth is already handled** at the `admin-dashboard-feature.tsx` level — configuration panel component does NOT need its own auth check
4. **`FOGO_EXPLORER_TX_URL`** constant exists in `@/lib/constants` for explorer links in toasts
5. **ESLint enforces no impure function calls in render** — if you need `Date.now()`, use `useState`/`useEffect`
6. **`parseTransactionError`** from `@/lib/transaction-errors` provides user-friendly error messages

### Project Structure Notes

- New files go in `web/src/components/admin/` and `web/src/hooks/`
- Follow kebab-case file naming: `configuration-panel.tsx`, `use-update-config.ts`
- Follow PascalCase component naming: `ConfigurationPanel`
- Use 'use client' directive for all components using hooks
- Imports use `@/` path alias (tsconfig paths)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.6] — Story requirements (FR47-FR50)
- [Source: _bmad-output/planning-artifacts/architecture.md] — Transaction flow pattern, state management
- [Source: _bmad-output/planning-artifacts/prd.md] — Admin configuration requirements (FR47-FR50)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — Form patterns, validation timing, toast feedback
- [Source: web/src/lib/transactions/update-config.ts] — Existing transaction builder (DO NOT recreate)
- [Source: web/src/hooks/use-buy-position.ts] — Mutation hook pattern to follow
- [Source: web/src/hooks/use-global-config.ts] — Config data hook (read current values)
- [Source: web/src/components/admin/system-status-card.tsx] — Config display pattern reference
- [Source: web/src/components/admin/admin-dashboard-feature.tsx] — Dashboard layout (add panel here)
- [Source: web/src/lib/constants.ts] — GLOBAL_CONFIG_PDA, QUERY_KEYS, FOGO_EXPLORER_TX_URL
- [Source: web/src/lib/transaction-errors.ts] — parseTransactionError utility
- [Source: _bmad-output/implementation-artifacts/6-5-create-admin-dashboard.md] — Previous story learnings

### REUSE THESE (Existing Code)

| What | Import From | Purpose |
|------|-------------|---------|
| `useGlobalConfig()` | `@/hooks/use-global-config` | Read current config values for form defaults |
| `GlobalConfigData` | `@/hooks/use-global-config` | Type for config data |
| `buildUpdateConfigInstruction` | `@/lib/transactions/update-config` | Build update_config instruction |
| `UpdateConfigParams` | `@/lib/transactions/update-config` | Params type for builder |
| `useProgram()` | `@/hooks/use-program` | Anchor program instance |
| `useWallet()` | `@solana/wallet-adapter-react` | Connected wallet for signing |
| `useConnection()` | `@solana/wallet-adapter-react` | Solana connection |
| `parseTransactionError` | `@/lib/transaction-errors` | User-friendly error messages |
| `QUERY_KEYS` | `@/lib/constants` | TanStack Query key patterns |
| `FOGO_EXPLORER_TX_URL` | `@/lib/constants` | Explorer link for toasts |
| `Card`, `Input`, `Button`, `Dialog`, `Switch`, `Label` | `@/components/ui/*` | shadcn/ui components |
| `toast` | `sonner` | Toast notifications |
| `PublicKey` | `@solana/web3.js` | Pubkey validation |

### DO NOT (Anti-patterns)

- **DO NOT** create a new transaction builder — `buildUpdateConfigInstruction` already exists in `@/lib/transactions/update-config.ts`
- **DO NOT** include `paused` or `frozen` toggles — those are Stories 6.7 and 6.8
- **DO NOT** use react-hook-form or Zod — keep it simple with `useState` (matches codebase pattern)
- **DO NOT** create a Zustand store for form state — local `useState` is sufficient
- **DO NOT** add auth checks in the panel component — auth is handled by the parent `admin-dashboard-feature.tsx`
- **DO NOT** hardcode any config values — always read current values from `useGlobalConfig()`
- **DO NOT** create pool-specific controls — this is global config only
- **DO NOT** use raw `BN` math for display — use `.toNumber()` for i64 fields
- **DO NOT** send unchanged fields as non-null — ONLY changed fields should have values, rest must be `null`
- **DO NOT** write custom BN wrapping — `toAnchorParams()` in update-config.ts handles BN conversion

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- ESLint `react-hooks/set-state-in-effect` rule blocked direct `setState` inside `useEffect`. Resolved by using an outer/inner component pattern with React `key` based on config values to remount the inner form component when config changes, achieving the same reset behavior without violating lint rules.
- ESLint `react-hooks/refs` rule also blocked `useRef` access during render. The key-based approach avoids refs entirely.

### Completion Notes List

- Created `useUpdateConfig` mutation hook following the exact `useBuyPosition` pattern: `useMutation` with TanStack Query, blockhash-based transaction expiry, wallet validation, success toast with explorer link, error parsing via `parseTransactionError`, and `globalConfig` query invalidation on success.
- Created `ConfigurationPanel` component with all 15 configurable parameters organized into logical sections (Fees, Position Caps, Oracle Thresholds, Epoch Timing, Wallet Addresses, Toggles).
- All fields use BPS as primary input unit with percentage helper text displayed alongside.
- Time fields show human-readable format (e.g., "5m", "15s") as helper text.
- Input validation mirrors all on-chain constraints: trading fee max 1000 BPS, fee shares must sum to 10000, oracle confidence min 1, epoch duration min 60s, freeze window < epoch duration.
- Change detection compares form state against current config; only changed fields are sent as non-null in `UpdateConfigParams`.
- Confirmation dialog shows a table of all changes (field name, current value, new value) before submitting.
- Treasury and insurance wallet address fields with base58 validation via `new PublicKey()` and copy-to-clipboard buttons.
- `allowHedging` toggle via shadcn Switch component. `paused` and `frozen` are always sent as `null` (managed by Stories 6.7/6.8).
- Changed fields get a visual indicator (amber border).
- "Update Config" button disabled when no changes or validation errors exist.
- Panel integrated into `admin-dashboard-feature.tsx` after `SystemStatusCard`, before the pool overview grid, using existing Card pattern.
- TypeScript compilation passes (no new errors). ESLint passes with 0 errors on all new/modified files. `npm run build` succeeds.

### File List

- web/src/hooks/use-update-config.ts (NEW)
- web/src/components/admin/configuration-panel.tsx (NEW)
- web/src/components/admin/admin-dashboard-feature.tsx (MODIFIED — added ConfigurationPanel import and render)
- _bmad-output/implementation-artifacts/sprint-status.yaml (MODIFIED — status updated)
- _bmad-output/implementation-artifacts/6-6-create-configuration-panel.md (MODIFIED — task checkboxes, dev agent record)

### Change Log

- 2026-03-19: Implemented configuration panel with full parameter editing, validation, change detection, confirmation dialog, and admin dashboard integration (Story 6.6 complete)
- 2026-03-19: Code review fixes (7 issues resolved):
  - H1: Removed duplicate `bnNumOrNull` function (identical to `numOrNull`)
  - H2: Added max 86400s (24h) validation for oracle staleness thresholds
  - H3: Fixed setTimeout memory leak in `handleCopy` using useRef cleanup
  - M1: All form inputs disabled during pending mutation
  - M3: Added `aria-invalid` and `aria-describedby` accessibility attributes to all validated inputs
  - M4: Wrapped `navigator.clipboard.writeText` in try/catch for error handling
  - L1: Added `formatSeconds()` human-readable display to oracle staleness threshold fields (completes AC#4)
