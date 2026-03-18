# Story 6.1: Implement update_config Instruction

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to update protocol parameters through a tested and verified instruction with frontend transaction support,
so that I can adjust fees, caps, and thresholds as needed without command-line tools.

## Acceptance Criteria

1. **Given** an initialized GlobalConfig and admin wallet, **When** I call update_config with new parameters, **Then** admin signature is verified against GlobalConfig.admin
2. **Given** valid parameters, **When** fee percentage is updated (trading_fee_bps), **Then** the value is stored and a `ConfigUpdated` event is emitted with changed fields bitmask
3. **Given** valid parameters, **When** per-wallet cap (per_wallet_cap_bps) or per-side cap (per_side_cap_bps) are updated, **Then** the values are stored correctly
4. **Given** valid parameters, **When** oracle confidence thresholds are updated, **Then** the values are stored correctly
5. **Given** valid parameters, **When** epoch duration and freeze window are updated, **Then** the values are stored and timing validation passes (epoch >= 60s, freeze < epoch)
6. **Given** fee share updates, **When** lp + treasury + insurance fee shares don't sum to 10000 bps, **Then** the instruction fails with `InvalidFeeShare`
7. **Given** a non-admin wallet, **When** update_config is called, **Then** the instruction fails with `Unauthorized`
8. **Given** the frontend, **When** the admin calls updateConfig, **Then** a transaction is built and submitted using the existing IDL and program instance
9. **And** FR47, FR48, FR49, FR50 (configure fees, caps, thresholds) are satisfied

## Important Context: On-Chain Instruction Already Exists

The `update_config` Anchor instruction is **fully implemented and deployed** at:
- `anchor/programs/fogopulse/src/instructions/update_config.rs`
- Registered in `anchor/programs/fogopulse/src/lib.rs`
- Present in IDL at `anchor/target/idl/fogopulse.json`

**What this story ACTUALLY needs:**
1. **Anchor tests** for update_config (none exist yet)
2. **Frontend transaction handler** (`web/src/lib/transactions/update-config.ts` - does not exist)
3. Verification that the deployed instruction works correctly on FOGO testnet

## Tasks / Subtasks

- [x] Task 1: Create integration tests for update_config (AC: #1-#7)
  - [x] 1.1: Create `anchor/tests/update-config.test.ts` — plain tsx script with `main()` entrypoint (NOT Jest/Vitest/Mocha). Follow pattern from `anchor/tests/admin-force-close-epoch.test.ts`
  - [x] 1.2: Use raw `@solana/web3.js` — build `TransactionInstruction` manually with IDL discriminator, send as `VersionedTransaction`, verify state via `connection.getAccountInfo()` + buffer parsing
  - [x] 1.3: Load admin wallet from `WALLET_PATH` env or `~/.config/solana/fogo-testnet.json` (same helper as force-close test)
  - [x] 1.4: Test happy path — update single field (trading_fee_bps), read back GlobalConfig account and verify field changed
  - [x] 1.5: Test happy path — update multiple fields simultaneously, verify all fields stored correctly
  - [x] 1.6: Test partial updates — only provided fields update, others remain unchanged (read before + after)
  - [x] 1.7: Test fee share validation — lp + treasury + insurance must sum to 10000 bps, expect error containing `InvalidFeeShare`
  - [x] 1.8: Test cap validation — per_wallet_cap_bps and per_side_cap_bps > 10000, expect `InvalidCap`
  - [x] 1.9: Test oracle threshold validation — 0 or > 10000 bps, expect `InvalidOracleThreshold`
  - [x] 1.10: Test staleness threshold validation — 0 or negative, expect `InvalidOracleThreshold`
  - [x] 1.11: Test timing validation — epoch_duration < 60s or freeze_window >= epoch_duration, expect `InvalidTimingParams`
  - [x] 1.12: Test trading_fee_bps max — > 1000 (10%), expect `InvalidTradingFee`
  - [x] 1.13: Test authorization — non-admin signer should fail with `Unauthorized` or Anchor `has_one` constraint error
  - [x] 1.14: Test paused/frozen flag updates — set and verify via account read
  - [x] 1.15: Test allow_hedging flag update
  - [x] 1.16: **IMPORTANT: Restore original config values** after each test to avoid corrupting testnet state
  - [x] 1.17: Run via WSL: `cd /mnt/d/dev/fogopulse/anchor && npx tsx tests/update-config.test.ts`

- [x] Task 2: Create frontend transaction builder (AC: #8)
  - [x] 2.1: Create `web/src/lib/transactions/update-config.ts`
  - [x] 2.2: Export `buildUpdateConfigInstruction(params)` returning `Promise<TransactionInstruction>` (NOT Transaction — match buy.ts pattern)
  - [x] 2.3: Import IDL from `@/lib/fogopulse.json` and use `Program<any>` (no TypeScript IDL type file exists)
  - [x] 2.4: Use `GLOBAL_CONFIG_PDA` pre-derived constant from `@/lib/constants` (do NOT derive dynamically — match codebase pattern)
  - [x] 2.5: Use Anchor's `(program.methods as any).updateConfig(params).accounts({...}).instruction()` pattern
  - [x] 2.6: Define `UpdateConfigParams` interface with all 17 optional fields matching IDL

- [x] Task 3: Verify on FOGO testnet (AC: #1-#5)
  - [x] 3.1: Run tests against FOGO testnet: `cd /mnt/d/dev/fogopulse/anchor && npx tsx tests/update-config.test.ts`
  - [x] 3.2: Verify state changes persist by re-reading GlobalConfig account after updates

## DO NOT (Anti-patterns)

- **DO NOT** modify the on-chain Rust code — the instruction is complete and deployed
- **DO NOT** modify the IDL — it already has the correct update_config definition
- **DO NOT** create a UI component for this story — that's Story 6.6 (Create Configuration Panel)
- **DO NOT** use Jest, Vitest, or Mocha for tests — use plain tsx scripts with `main()` function (match existing test pattern)
- **DO NOT** use Anchor `Program` in tests — use raw `@solana/web3.js` TransactionInstruction with manual discriminator (match force-close test pattern)
- **DO NOT** derive GlobalConfig PDA dynamically in frontend — use `GLOBAL_CONFIG_PDA` constant from `@/lib/constants`
- **DO NOT** import from `@/types/fogopulse` — this file does not exist. Import IDL from `@/lib/fogopulse.json` and use `Program<any>`
- **DO NOT** return `Transaction` from builder — return `TransactionInstruction` via `.instruction()` (match buy.ts pattern)
- **DO NOT** create a new program instance — use `useProgram()` from `web/src/hooks/use-program.ts` when integrating

## REUSE THESE (Existing Code)

| What | Import From | Purpose |
|------|-------------|---------|
| `useProgram()` | `web/src/hooks/use-program.ts` | Anchor program instance (`Program<any>` with dummy wallet) |
| `useIsAdmin()` | `web/src/hooks/use-is-admin.ts` | Admin wallet detection |
| `isAdminWallet()` | `web/src/lib/admin.ts` | Server-side admin check |
| `PROGRAM_ID` | `web/src/lib/constants.ts` | Program ID (`D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5`) |
| `GLOBAL_CONFIG_PDA` | `web/src/lib/constants.ts` | Pre-derived GlobalConfig PDA address |
| `SEEDS.GLOBAL_CONFIG` | `web/src/lib/constants.ts` | `Buffer.from('global_config')` seed constant |
| IDL JSON | `web/src/lib/fogopulse.json` | IDL for Anchor Program instantiation |
| `admin-force-close-epoch.test.ts` | `anchor/tests/` | Test pattern: raw web3.js, manual discriminator, buffer parsing |
| `buy.ts` | `web/src/lib/transactions/` | Tx builder pattern: returns `Promise<TransactionInstruction>` |

## Dev Notes

### On-Chain Implementation Summary (Already Complete)

The `update_config` instruction in `anchor/programs/fogopulse/src/instructions/update_config.rs`:
- **Accounts:** `admin` (Signer), `global_config` (mut, PDA with `has_one = admin`)
- **Params:** `UpdateConfigParams` with 17 optional fields (treasury, insurance, trading_fee_bps, lp_fee_share_bps, treasury_fee_share_bps, insurance_fee_share_bps, per_wallet_cap_bps, per_side_cap_bps, oracle_confidence_threshold_start_bps, oracle_confidence_threshold_settle_bps, oracle_staleness_threshold_start, oracle_staleness_threshold_settle, epoch_duration_seconds, freeze_window_seconds, allow_hedging, paused, frozen)
- **Validation:** Fee shares sum to 10000, trading fee <= 1000 bps, caps <= 10000, oracle thresholds 1-10000, staleness > 0, epoch >= 60s, freeze < epoch
- **Event:** `ConfigUpdated { admin, config, fields_updated }` where `fields_updated` is a u32 bitmask (bit 0 = treasury, bit 1 = insurance, ..., bit 16 = frozen)

### Test Infrastructure

Tests run via WSL (not native Windows): `cd /mnt/d/dev/fogopulse/anchor && npx tsx tests/update-config.test.ts`

**Pattern from `admin-force-close-epoch.test.ts` — DO NOT deviate:**
- Plain tsx script with `main()` async entrypoint — NOT Jest/Vitest/Mocha
- Uses raw `@solana/web3.js` — NO Anchor Program object in tests
- Builds `TransactionInstruction` manually with IDL discriminator bytes
- Sends via `VersionedTransaction` + `TransactionMessage`
- Admin keypair loaded from `WALLET_PATH` env or `~/.config/solana/fogo-testnet.json`
- State verification via `connection.getAccountInfo()` + manual buffer deserialization
- Error assertion via string matching on transaction error messages
- Each test returns `TestResult { name, passed, signature?, error? }`
- Summary printed at end with pass/fail counts

```typescript
// Test file skeleton (match force-close pattern exactly)
import * as dotenv from 'dotenv'
dotenv.config({ path: 'anchor/.env' })
dotenv.config()

import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'

// Get update_config discriminator from IDL (anchor/target/idl/fogopulse.json)
const UPDATE_CONFIG_DISCRIMINATOR = Buffer.from([...]) // Extract from IDL

function loadWallet(): Keypair { /* same as force-close test */ }
function deriveGlobalConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('global_config')], PROGRAM_ID)
}

// Serialize UpdateConfigParams matching Anchor's Borsh layout
function serializeUpdateConfigParams(params: {...}): Buffer { /* Borsh serialize */ }

async function main() { /* test orchestration */ }
main().catch(console.error)
```

### Frontend Transaction Builder Pattern

Follow the pattern from `web/src/lib/transactions/buy.ts`:
```typescript
import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'
import { GLOBAL_CONFIG_PDA } from '@/lib/constants'

export interface UpdateConfigParams {
  treasury: PublicKey | null
  insurance: PublicKey | null
  tradingFeeBps: number | null
  lpFeeShareBps: number | null
  treasuryFeeShareBps: number | null
  insuranceFeeShareBps: number | null
  perWalletCapBps: number | null
  perSideCapBps: number | null
  oracleConfidenceThresholdStartBps: number | null
  oracleConfidenceThresholdSettleBps: number | null
  oracleStalenessThresholdStart: number | null  // BN or number
  oracleStalenessThresholdSettle: number | null
  epochDurationSeconds: number | null
  freezeWindowSeconds: number | null
  allowHedging: boolean | null
  paused: boolean | null
  frozen: boolean | null
}

export async function buildUpdateConfigInstruction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>,
  admin: PublicKey,
  params: UpdateConfigParams
): Promise<TransactionInstruction> {
  const instruction: TransactionInstruction = await (program.methods as any)
    .updateConfig(params)
    .accounts({
      admin,
      globalConfig: GLOBAL_CONFIG_PDA,  // Pre-derived constant
    })
    .instruction()  // NOT .transaction() — returns single instruction

  return instruction
}
```

**Key differences from the test approach:** The frontend builder uses Anchor's `program.methods` API (type-safe, handles serialization). The tests use raw web3.js (manual discriminator + Borsh serialization) because the test pattern in this codebase doesn't use Anchor Program objects.

### GlobalConfig PDA

- Seeds: `[b"global_config"]` (single seed, no variable component)
- Pre-derived address: `GLOBAL_CONFIG_PDA` exported from `web/src/lib/constants.ts`
- In tests: derive via `PublicKey.findProgramAddressSync([Buffer.from('global_config')], PROGRAM_ID)`
- Only one GlobalConfig exists per program deployment

### Error Codes (from `anchor/programs/fogopulse/src/errors.rs`)

Anchor error codes start at 6000 + enum index:

| Error | Offset | Anchor Code | When |
|-------|--------|-------------|------|
| `Unauthorized` | 0 | 6000 | Non-admin signer |
| `AlreadyInitialized` | 1 | 6001 | Re-init attempt |
| `InvalidFeeShare` | 2 | 6002 | lp + treasury + insurance != 10000 |
| `InvalidCap` | 3 | 6003 | cap_bps > 10000 |
| `InvalidTradingFee` | 4 | 6004 | trading_fee_bps > 1000 |
| `InvalidTimingParams` | 5 | 6005 | epoch < 60s or freeze >= epoch |
| `InvalidOracleThreshold` | 6 | 6006 | threshold < 1 or > 10000 |
| `ProtocolPaused` | 7 | 6007 | Protocol paused |
| `ProtocolFrozen` | 8 | 6008 | Protocol frozen |

### Key Validation Rules

1. **Fee shares are interdependent:** When updating any fee share, the system uses current values for unspecified fields and validates the sum equals 10000 bps
2. **Timing params are interdependent:** When updating epoch_duration or freeze_window, the system uses current values for unspecified fields and validates freeze < epoch
3. **All fields are optional:** Passing `null`/`None` for a field leaves it unchanged
4. **Paused vs Frozen:** `paused` stops new epoch creation; `frozen` halts ALL activity (nuclear option). Both are controlled via update_config.

### Previous Story Intelligence (Story 5.8)

Key learnings from the most recent story:
- TypeScript compilation and ESLint must pass — run build checks
- Use existing hooks and utilities rather than creating new ones
- Follow established patterns (TanStack Query, transaction builders)
- USDC amounts use 6 decimal places (lamports)
- Code review found issues with redundant providers and duplicate hook calls — keep code DRY

### Git Intelligence

Recent commits show:
- `0d37758` feat: Implement APY calculation with code review fixes (Story 5.8)
- `630d3c0` fix: Remove admin_seed_liquidity to close LP pool drain vulnerability
- `93d1204` feat: Add admin close epoch instruction and update IDL with epoch management improvements
- Admin instructions follow a consistent pattern — see `admin_force_close_epoch.rs`, `admin_close_epoch.rs` for reference

### Project Structure Notes

- Anchor tests: `anchor/tests/*.test.ts`
- Frontend transactions: `web/src/lib/transactions/*.ts`
- IDL JSON: `web/src/lib/fogopulse.json` (used as `import idl from '@/lib/fogopulse.json'`)
- Program instructions: `anchor/programs/fogopulse/src/instructions/`
- No conflicts with existing structure — new files only

### References

- [Source: anchor/programs/fogopulse/src/instructions/update_config.rs] — Complete on-chain implementation
- [Source: anchor/programs/fogopulse/src/lib.rs] — Instruction registration
- [Source: anchor/target/idl/fogopulse.json] — IDL with UpdateConfigParams definition
- [Source: anchor/programs/fogopulse/src/errors.rs] — Error codes for validation failures
- [Source: anchor/programs/fogopulse/src/events.rs] — ConfigUpdated event definition
- [Source: anchor/programs/fogopulse/src/state/config.rs] — GlobalConfig account structure
- [Source: anchor/tests/admin-force-close-epoch.test.ts] — Test pattern reference
- [Source: web/src/lib/transactions/buy.ts] — Transaction builder pattern reference
- [Source: web/src/hooks/use-program.ts] — Program instance hook
- [Source: web/src/hooks/use-is-admin.ts] — Admin detection hook
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6] — Epic requirements
- [Source: _bmad-output/planning-artifacts/architecture.md] — Architecture constraints
- [Source: _bmad-output/planning-artifacts/prd.md#FR47-FR50] — Functional requirements

## Change Log

- 2026-03-18: Implemented update_config integration tests (12 tests) and frontend transaction builder
- 2026-03-18: Code review fixes — strict error assertions, added 4 new tests (16 total): oracle upper bound, negative staleness, happy-path oracle/timing updates

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Transient FOGO testnet RPC `fetch failed` errors during test runs (socket closures) — not code issues, network instability. Tests pass consistently on retry.
- After first test run, `paused` flag was left as `true` due to RPC failure during restore. Manually restored via separate script.

### Completion Notes List

- Created `anchor/tests/update-config.test.ts` with 16 integration tests covering all acceptance criteria:
  - Happy path: single field update, multi-field update, partial update preservation
  - Validation: InvalidFeeShare, InvalidCap, InvalidOracleThreshold, InvalidStalenessThreshold, InvalidTimingParams, InvalidTradingFee
  - Authorization: non-admin rejection
  - Boundary: oracle threshold > 10000, negative staleness threshold
  - Happy path: oracle threshold update, timing params update
  - Flags: paused/frozen toggle, allow_hedging toggle
  - All tests restore original values after execution to protect testnet state
  - Error assertions validate specific error codes (no catch-all pass-on-any-failure)
- Created `web/src/lib/transactions/update-config.ts` frontend transaction builder:
  - Exports `buildUpdateConfigInstruction(program, admin, params)` returning `Promise<TransactionInstruction>`
  - Exports `UpdateConfigParams` interface with all 17 optional fields
  - Uses `GLOBAL_CONFIG_PDA` constant, Anchor `program.methods` API, and `BN` wrapping for i64 fields
  - Passes TypeScript compilation and ESLint with zero errors
- All 16 tests passed against FOGO testnet (16/16 PASS)
- Testnet state verified and restored to original values after all tests

### File List

- `anchor/tests/update-config.test.ts` (new) — Integration tests for update_config instruction (16 tests)
- `web/src/lib/transactions/update-config.ts` (new) — Frontend transaction builder for update_config
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — Sprint status sync
