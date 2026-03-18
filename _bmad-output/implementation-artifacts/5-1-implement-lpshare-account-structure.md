# Story 5.1: Implement LpShare Account Structure

Status: done
Created: 2026-03-18
Epic: 5 - Liquidity Provision
Sprint: Current

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Overview

This is the **first story in Epic 5**, establishing the on-chain account structure for LP (Liquidity Provider) share tracking. The LpShare account enables liquidity providers to have verifiable ownership records of their pool positions, supporting deposit, withdrawal request, and withdrawal processing flows.

**FRs Covered:** FR28-FR36 (foundation — account structure required before any LP instruction)
**Dependencies:** Epic 1 complete (GlobalConfig, Pool accounts exist), Pool.total_lp_shares field already in place

## Story

As a developer,
I want LP share tracking on-chain,
so that liquidity providers have verifiable ownership records.

## Acceptance Criteria

1. **Given** the Anchor program with Pool accounts, **When** I implement the LpShare account, **Then** the struct includes all required fields: `user` (Pubkey), `pool` (Pubkey), `shares` (u64), `deposited_amount` (u64), `pending_withdrawal` (u64), `withdrawal_requested_at` (Option<i64>), `bump` (u8)
2. **Given** the LpShare account definition, **When** PDA is derived, **Then** seeds are `[b"lp_share", user.key().as_ref(), pool.key().as_ref()]`
3. **Given** the LpShare struct with all fields, **When** account size is calculated, **Then** total is 106 bytes (8 discriminator + 98 data)
4. **Given** the account structure, **When** reviewed against architecture.md, **Then** it supports deposit (shares increment), withdrawal request (pending_withdrawal + timestamp set), and withdrawal processing (shares decrement, pending reset)
5. **Given** the new state module, **When** `anchor build` runs, **Then** build completes without errors or stack overflow warnings

## Tasks / Subtasks

- [x] Task 1: Create LpShare account structure (AC: #1, #2, #3)
  - [x] 1.1: Create `anchor/programs/fogopulse/src/state/lp.rs`
  - [x] 1.2: Define LpShare struct with all 7 fields using `#[account]` and `#[derive(InitSpace, Debug)]`
  - [x] 1.3: Document PDA seeds in struct-level doc comment: `["lp_share", user.key(), pool.key()]`
  - [x] 1.4: Add doc comments for every field explaining purpose
  - [x] 1.5: Verify account size calculation (32+32+8+8+8+9+1 = 98 data + 8 discriminator = 106 bytes)

- [x] Task 2: Export from state module (AC: #1)
  - [x] 2.1: Add `pub mod lp;` to `anchor/programs/fogopulse/src/state/mod.rs`
  - [x] 2.2: Add `pub use lp::*;` to `anchor/programs/fogopulse/src/state/mod.rs`

- [x] Task 3: Build and verify (AC: #3, #5)
  - [x] 3.1: Run `anchor build` in WSL: `wsl -e bash -l -c "cd /mnt/d/dev/fogopulse/anchor && anchor build 2>&1"`
  - [x] 3.2: Verify no stack overflow warnings
  - [x] 3.3: Confirm account size matches architecture spec (106 bytes)
  - [x] 3.4: Note: LpShare type will appear in IDL when used by an instruction (Story 5.2 deposit_liquidity)

- [ ] ~~Task 4: Copy IDL to web folder~~ — N/A: LpShare only appears in IDL when used by an instruction (Story 5.2)

## Dev Notes

### LpShare Account Definition

```rust
use anchor_lang::prelude::*;

/// LpShare account - tracks a user's LP position within a specific pool
/// PDA Seeds: ["lp_share", user.key(), pool.key()]
#[account]
#[derive(InitSpace, Debug)]
pub struct LpShare {
    /// Wallet address of the LP
    pub user: Pubkey,

    /// Reference to the pool this LP position is in
    pub pool: Pubkey,

    /// LP shares currently owned (proportional to pool value)
    pub shares: u64,

    /// Total USDC deposited over time (for tracking, not share calculation)
    pub deposited_amount: u64,

    /// Shares pending withdrawal (locked during cooldown)
    pub pending_withdrawal: u64,

    /// Timestamp when withdrawal was requested (None if no pending withdrawal)
    pub withdrawal_requested_at: Option<i64>,

    /// PDA bump seed
    pub bump: u8,
}
```

### Account Size Calculation

```
LpShare account size breakdown:
- user (Pubkey):                  32 bytes
- pool (Pubkey):                  32 bytes
- shares (u64):                    8 bytes
- deposited_amount (u64):          8 bytes
- pending_withdrawal (u64):        8 bytes
- withdrawal_requested_at (Option<i64>): 1 + 8 = 9 bytes
- bump (u8):                       1 byte
────────────────────────────────────
Data total:                       98 bytes
+ Discriminator:                   8 bytes
────────────────────────────────────
Account total:                   106 bytes ✓ (matches architecture.md)
```

### PDA Derivation Pattern

When deriving LpShare PDA in TypeScript:

```typescript
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from './constants';

export function deriveLpSharePda(
  userPubkey: PublicKey,
  poolPda: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('lp_share'),
      userPubkey.toBuffer(),
      poolPda.toBuffer(),
    ],
    PROGRAM_ID
  );
}
```

**CRITICAL:** The `user` in PDA seeds must be the actual wallet pubkey, NOT the session account. This follows the same pattern established in UserPosition (Story 1.7) where:
1. `user` is passed as an instruction argument
2. Real user is extracted via `extract_user(signer_or_session)`
3. Validation: `require!(user == extracted_user, Unauthorized)`
4. PDA derivation uses the validated `user` pubkey

### How LpShare Interacts with Pool

The `Pool` struct already has a `total_lp_shares: u64` field (created in Story 1.5). This field tracks the sum of all LpShare.shares across all LPs for that pool. The relationship:

- **Pool.total_lp_shares**: Sum of all LP shares for the pool (global)
- **LpShare.shares**: Individual LP's share count (per user)
- **Share value**: `(pool.yes_reserves + pool.no_reserves) / pool.total_lp_shares`

The LP fee auto-compounding model means 70% of trading fees stay in pool_usdc but are NOT added to reserves. This surplus increases LP share value over time without diluting existing shares.

### Fee Auto-Compounding (Context for Future Stories)

From `buy_position.rs` fee handling:
- LP fee (70% of trading fee) stays in `pool_usdc` token account
- NOT added to `yes_reserves` or `no_reserves`
- Creates "surplus" that increases LP share value automatically
- No explicit LP fee distribution mechanism needed

### Follows Established Account Patterns

| Pattern | Source Story | Applied Here |
|---------|------------|--------------|
| `#[account]` + `#[derive(InitSpace, Debug)]` | Story 1.7 (UserPosition) | Same derives |
| Doc comments on all fields | Story 1.7 | Same style |
| PDA seeds in struct doc comment | Story 1.7 | Same approach |
| Module export in `state/mod.rs` | Story 1.7 | Same pattern |

### state/mod.rs After This Story

```rust
pub mod config;
pub mod epoch;
pub mod lp;
pub mod pool;
pub mod position;

pub use config::*;
pub use epoch::*;
pub use lp::*;
pub use pool::*;
pub use position::*;
```

### Project Structure Notes

- Alignment with unified project structure: new file at `anchor/programs/fogopulse/src/state/lp.rs` follows established convention
- Module name `lp` is concise and matches the account name pattern (config, epoch, pool, position, lp)
- No conflicts detected with existing code

### What This Story Does NOT Include

- `deposit_liquidity` instruction (Story 5.2)
- `request_withdrawal` instruction (Story 5.3)
- `process_withdrawal` instruction (Story 5.4)
- LP Dashboard UI (Story 5.5)
- LP events (`LiquidityDeposited`, `WithdrawalRequested`, `WithdrawalProcessed`) — these will be added when their respective instructions are implemented
- FOGO Sessions integration for LP (will be included in Story 5.2)
- Share calculation logic (Story 5.2)

This is a **STRUCTURE-ONLY** story. All logic using LpShare will be implemented in subsequent Epic 5 stories.

### References

- [Source: architecture.md#LpShare Account] - Account fields, size (106 bytes), PDA seeds
- [Source: architecture.md#PDA Seeds] - `["lp_share", user, pool]`
- [Source: epics.md#Story 5.1] - User story and acceptance criteria
- [Source: project-context.md#On-Chain Account Model] - PDA derivation patterns
- [Source: Story 1.7] - Established account structure implementation pattern
- [Source: project-context.md#Stack Overflow Prevention] - Box<> pattern (not needed here, LpShare is small at 106 bytes)

### Previous Story Intelligence

**From Story 1.7 (UserPosition Account - pattern reference):**
- Used `#[derive(InitSpace, Debug)]` with `#[account]` — apply same
- Doc comments on every field — apply same style
- PDA seeds documented in struct-level doc comment — apply same
- Module export pattern in `state/mod.rs` — `pub mod X; pub use X::*;`
- Account size verified against architecture.md — do same verification

**From Story 4.7 (last completed story - recent codebase state):**
- Codebase is stable and actively deployed to Vercel
- Frontend patterns well-established (hooks, components, TanStack Query)
- Recent work was frontend-focused; this story returns to Anchor/Rust

### Git Intelligence

Recent commits show:
- `19dfc13` feat: Disable epoch creation for non-BTC markets (Story 7.5 todo)
- `a457776` fix: Pin footer to viewport bottom when trades overflow page
- `e463ca8` fix: Story 7.2 code review — fix pagination, security, and test gaps

Recent work has been frontend UI fixes. The Anchor program is stable and hasn't been modified recently. This story adds a new state account without modifying existing code, minimizing regression risk.

### Files to Create/Modify

| File | Action |
|------|--------|
| `anchor/programs/fogopulse/src/state/lp.rs` | Create - LpShare struct |
| `anchor/programs/fogopulse/src/state/mod.rs` | Modify - add lp module export |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No debug issues encountered. Clean build on first attempt.

### Completion Notes List

- Created `lp.rs` with LpShare struct matching architecture spec exactly (7 fields, 106 bytes total)
- All fields have doc comments explaining purpose
- PDA seeds documented in struct-level doc comment: `["lp_share", user.key(), pool.key()]`
- Module exported from `state/mod.rs` in alphabetical order following existing pattern
- `anchor build` completed successfully — no errors, no stack overflow warnings
- Only pre-existing warnings present (cfg, deprecated — not introduced by this story)
- Account size verified: 32+32+8+8+8+9+1 = 98 data + 8 discriminator = 106 bytes
- Added compile-time size assertion (`const _: () = assert!(...)`) to catch future size drift
- IDL copy skipped — LpShare won't appear in IDL until used by an instruction (Story 5.2)

### File List

- `anchor/programs/fogopulse/src/state/lp.rs` — Created (LpShare account struct with compile-time size assertion)
- `anchor/programs/fogopulse/src/state/mod.rs` — Modified (added lp module export)

## Change Log

- 2026-03-18: Implemented LpShare account structure (Story 5.1) — created state/lp.rs with all 7 fields, exported from state/mod.rs, verified build and account size (106 bytes)
- 2026-03-18: Code review fixes — removed false IDL copy claim from File List, added compile-time size assertion to lp.rs, marked Task 4 as N/A (IDL unchanged without instruction usage)
