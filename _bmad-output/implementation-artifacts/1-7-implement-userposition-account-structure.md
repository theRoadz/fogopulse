# Story 1.7: Implement UserPosition Account Structure

Status: done

## Story

As a developer,
I want the UserPosition account structure implemented,
So that user positions within epochs can be tracked.

## Acceptance Criteria

1. **UserPosition Account Structure**: The struct includes all required fields:
   - `user: Pubkey` - Wallet address of position holder
   - `epoch: Pubkey` - Reference to the epoch
   - `direction: Direction` - Up or Down prediction
   - `amount: u64` - Position size in USDC (lamports)
   - `shares: u64` - Shares received from CPMM calculation
   - `entry_price: u64` - Price paid per share at entry
   - `claimed: bool` - Whether payout/refund has been claimed
   - `bump: u8` - PDA bump seed

2. **PDA Derivation**: Seeds are `[b"position", epoch.key().as_ref(), user.key().as_ref()]`

3. **Direction Enum**: Includes variants: `Up`, `Down`

4. **Account Size**: Calculated correctly (99 bytes as per architecture.md)

5. **Structure Support**: The account structure supports the `buy_position` instruction (to be implemented in Epic 2, Story 2.1)

## Tasks / Subtasks

- [x] Task 1: Create Direction enum (AC: #3)
  - [x] Create `anchor/programs/fogopulse/src/state/position.rs`
  - [x] Define Direction enum with Up/Down variants
  - [x] Use `#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]`
  - [x] Add `#[default]` to `Up` variant
  - [x] Add doc comments for each variant

- [x] Task 2: Create UserPosition account structure (AC: #1, #2, #4)
  - [x] Define UserPosition struct with all 8 fields
  - [x] Use `#[account]` and `#[derive(InitSpace)]` attributes
  - [x] Document PDA seeds in struct doc comment
  - [x] Calculate and verify account size (8 discriminator + 91 data = 99 bytes)

- [x] Task 3: Export from state module (AC: #1, #3)
  - [x] Add `pub mod position;` to `state/mod.rs`
  - [x] Add `pub use position::*;` to `state/mod.rs`

- [x] Task 4: Build and verify (AC: #1-5)
  - [x] Run `anchor build` in WSL
  - [x] Verify no stack overflow warnings
  - [x] Confirm IDL types deferred: UserPosition and Direction will appear in IDL when used by instructions (Story 2.1)
  - [x] Verify account size matches architecture spec (99 bytes)

## Dev Notes

### Direction Enum Definition

```rust
use anchor_lang::prelude::*;

/// Direction of a user's position prediction
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum Direction {
    /// Prediction: settlement price > start price
    #[default]
    Up,
    /// Prediction: settlement price < start price
    Down,
}
```

### UserPosition Account Definition

```rust
/// UserPosition account - tracks a user's position within a specific epoch
/// PDA Seeds: ["position", epoch.key(), user.key()]
#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    /// Wallet address of the position holder
    pub user: Pubkey,

    /// Reference to the epoch this position is in
    pub epoch: Pubkey,

    /// Direction of the prediction (Up or Down)
    pub direction: Direction,

    /// Position size in USDC (lamports, 6 decimals)
    pub amount: u64,

    /// Shares received from CPMM calculation
    pub shares: u64,

    /// Price paid per share at entry (for PnL calculations)
    pub entry_price: u64,

    /// Whether payout or refund has been claimed
    pub claimed: bool,

    /// PDA bump seed
    pub bump: u8,
}
```

### Account Size Calculation

```
UserPosition account size breakdown:
- user (Pubkey):      32 bytes
- epoch (Pubkey):     32 bytes
- direction (enum):   1 byte (u8)
- amount (u64):       8 bytes
- shares (u64):       8 bytes
- entry_price (u64):  8 bytes
- claimed (bool):     1 byte
- bump (u8):          1 byte
────────────────────────────
Data total:           91 bytes
+ Discriminator:      8 bytes
────────────────────────────
Account total:        99 bytes ✓ (matches architecture.md)
```

### PDA Derivation Pattern

When deriving UserPosition PDA in TypeScript:

```typescript
// Browser-compatible PDA derivation
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from './constants';

export function deriveUserPositionPda(
  epochPda: PublicKey,
  userPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('position'),
      epochPda.toBuffer(),
      userPubkey.toBuffer(),
    ],
    PROGRAM_ID
  );
}
```

### Why Direction is Separate from Outcome

- **Direction** (`Up`/`Down`): Used in UserPosition - represents user's PREDICTION
- **Outcome** (`Up`/`Down`/`Refunded`): Used in Epoch - represents ACTUAL result after settlement

Both exist because:
1. Outcome has a third variant `Refunded` that Direction doesn't need
2. Semantic clarity: prediction vs. result
3. Avoids confusion when comparing user prediction to epoch outcome

### state/mod.rs After This Story

```rust
pub mod config;
pub mod epoch;
pub mod pool;
pub mod position;

pub use config::*;
pub use epoch::*;
pub use pool::*;
pub use position::*;
```

### Project Structure Notes

This story creates ONE new file and modifies ONE file:

| File | Action |
|------|--------|
| `anchor/programs/fogopulse/src/state/position.rs` | Create - UserPosition struct, Direction enum |
| `anchor/programs/fogopulse/src/state/mod.rs` | Modify - add position module export |

### Previous Story Intelligence

**From Story 1.6 Code Review:**
- Added `Default` derive with `#[default]` attribute on enums - apply same pattern to Direction
- Used checked arithmetic on calculations - no calculations needed in this story (structure only)
- `as_pool_cache_u8()` helper added for EpochState - not needed for Direction enum

**From Story 1.5:**
- `Box<Account<>>` pattern for large accounts - UserPosition is small (99 bytes), no boxing needed
- Protocol/pool pause/freeze checks - not applicable for account structure definition

**Patterns Established:**
- Enum derives: `AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default`
- Account derives: `#[account]`, `#[derive(InitSpace)]`
- Doc comments on all fields
- PDA seeds documented in struct-level doc comment

### Testing Scenarios

This story only defines account structure - no instruction implementation. Testing will occur in Story 2.1 (buy_position instruction).

Verification checklist:
1. `anchor build` completes without errors
2. IDL includes UserPosition account type
3. IDL includes Direction enum with Up/Down variants
4. TypeScript types generated correctly

### Architecture References

- [Source: architecture.md#UserPosition Account] - Account fields and size (99 bytes)
- [Source: architecture.md#PDA Seeds] - `["position", epoch, user]`
- [Source: epics.md#Story 1.7] - User story and acceptance criteria
- [Source: project-context.md#On-Chain Account Model] - PDA derivation patterns

### Files to Create/Modify

| File | Action |
|------|--------|
| `anchor/programs/fogopulse/src/state/position.rs` | Create - UserPosition struct, Direction enum |
| `anchor/programs/fogopulse/src/state/mod.rs` | Modify - add `pub mod position; pub use position::*;` |

### What This Story Does NOT Include

- `buy_position` instruction (Story 2.1)
- `sell_position` instruction (Story 4.1)
- `claim_payout` instruction (Story 3.3)
- `claim_refund` instruction (Story 3.4)
- FOGO Sessions integration (Story 1.9)
- Position cap enforcement logic (Story 2.1)
- CPMM share calculation logic (Story 2.1)

This is a STRUCTURE-ONLY story. All logic using UserPosition will be implemented in future stories.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - clean implementation with no issues.

### Completion Notes List

- Created `position.rs` with Direction enum (Up/Down variants with #[default] on Up) and UserPosition struct
- Direction enum uses established pattern: `AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default`
- UserPosition struct uses `#[account]` and `#[derive(InitSpace)]` as per established patterns
- Account size verified: 91 bytes data + 8 bytes discriminator = 99 bytes (matches architecture.md)
- PDA seeds documented in struct doc comment: `["position", epoch.key(), user.key()]`
- Exported from state/mod.rs following existing pattern
- Build successful with no stack overflow warnings
- Note: UserPosition and Direction types will appear in IDL when used by an instruction (Story 2.1 buy_position)

### File List

| File | Action |
|------|--------|
| `anchor/programs/fogopulse/src/state/position.rs` | Created |
| `anchor/programs/fogopulse/src/state/mod.rs` | Modified |

## Change Log

- 2026-03-12: Implemented UserPosition account structure and Direction enum per architecture.md specification
- 2026-03-12: [Code Review] Added Debug derive to Direction enum and UserPosition struct for improved debugging

