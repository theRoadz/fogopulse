# Story 1.9: Integrate FOGO Sessions SDK

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want FOGO Sessions SDK integrated,
So that user-facing instructions support both wallet and session signatures.

## Acceptance Criteria

1. `fogo-sessions-sdk@0.7.5` is added to Cargo.toml
2. User-facing instructions (buy_position, sell_position, claim_payout) use `Session::extract_user_from_signer_or_session`
3. Admin-only instructions (initialize, create_pool) do NOT use session extraction
4. The pattern is documented in code comments for future developers
5. The program builds successfully with `anchor build`

## Tasks / Subtasks

- [x] Task 1: Add fogo-sessions-sdk dependency (AC: #1)
  - [x] Add `fogo-sessions-sdk = "0.7.5"` to anchor/programs/fogopulse/Cargo.toml
  - [x] Verify `cargo build --release` succeeds (may need feature flags)
  - [x] Note any version compatibility issues with anchor-lang 0.31.1

- [x] Task 2: Create session helper module (AC: #2, #4)
  - [x] Create `src/session.rs` helper module with documentation
  - [x] Add `pub mod session;` to lib.rs
  - [x] Create `extract_user` wrapper function with documented usage pattern
  - [x] Include doc comments explaining when to use sessions vs direct signers

- [x] Task 3: Prepare instruction stubs for user-facing instructions (AC: #2)
  - [x] Create `src/instructions/buy_position.rs` stub with session extraction pattern
  - [x] Create `src/instructions/sell_position.rs` stub with session extraction pattern
  - [x] Create `src/instructions/claim_payout.rs` stub with session extraction pattern
  - [x] Add module exports to `src/instructions/mod.rs`
  - [x] Note: Full implementation is in Epic 2; this story only adds the session pattern skeleton

- [x] Task 4: Document admin instructions exclusion (AC: #3, #4)
  - [x] Add doc comments to `initialize.rs` explaining why sessions are NOT used for admin
  - [x] Add doc comments to `create_pool.rs` explaining why sessions are NOT used for admin
  - [x] Add doc comments to `create_epoch.rs` (permissionless, anyone can call)

- [x] Task 5: Build and verify (AC: #5)
  - [x] Run `anchor build` and verify no errors
  - [x] Verify IDL generation succeeds (check anchor_version compatibility)
  - [x] Run `cargo test` if any tests exist

## Dev Notes

### FOGO Sessions SDK Integration Pattern

**Import Statement:**
```rust
use fogo_sessions_sdk::session::Session;
use fogo_sessions_sdk::session::is_session;
```

**Extract User Pattern (for user-facing instructions):**
```rust
// In instruction handler:
let user = Session::extract_user_from_signer_or_session(
    &ctx.accounts.signer_or_session,
    &crate::ID,
).map_err(ProgramError::from)?;
```

**What extract_user_from_signer_or_session does:**
- If the account is a valid session owned by Session Manager Program: returns the delegating wallet's pubkey
- If the account is a regular signer (not a session): returns the signer's pubkey
- If the account is an expired/invalid session: returns an error

**When to use sessions:**
- User-facing instructions: `buy_position`, `sell_position`, `claim_payout`, `claim_refund`, `deposit_liquidity`, `withdraw_liquidity`
- These allow users to trade with session keys for gasless UX

**When NOT to use sessions:**
- Admin instructions: `initialize`, `create_pool`, `update_config`, `pause_pool`, `emergency_freeze`
- These require actual admin wallet signature, not delegated sessions

**Permissionless instructions (no session extraction needed):**
- `create_epoch`, `advance_epoch` - anyone can call to keep epochs running

### Instruction Context Account Pattern

For user-facing instructions, the signer account should be named descriptively:

```rust
#[derive(Accounts)]
pub struct BuyPosition<'info> {
    /// The user OR a session account representing the user
    /// Session validation is performed via Session::extract_user_from_signer_or_session
    #[account(mut)]
    pub signer_or_session: Signer<'info>,

    // ... other accounts
}
```

### Token Transfer Considerations (Future Epic)

For token transfers within sessions, a program_signer PDA is required:
```rust
// Check if signer is a session
let is_session = is_session(&ctx.accounts.signer_or_session);

// If session, use program_signer for token transfer CPI
if is_session {
    // Seeds: [PROGRAM_SIGNER_SEED, user.as_ref()]
    // See fogo_sessions_sdk::token::PROGRAM_SIGNER_SEED
}
```

This is for Epic 2 (buy_position with actual USDC transfer). Story 1.9 only adds the SDK and pattern skeleton.

### Project Structure Notes

**New Files:**
- `anchor/programs/fogopulse/src/session.rs` - Session helper module with documentation

**Modified Files:**
- `anchor/programs/fogopulse/Cargo.toml` - Add fogo-sessions-sdk dependency
- `anchor/programs/fogopulse/src/lib.rs` - Add session module export
- `anchor/programs/fogopulse/src/instructions/mod.rs` - Add new instruction module exports
- `anchor/programs/fogopulse/src/instructions/initialize.rs` - Add doc comments
- `anchor/programs/fogopulse/src/instructions/create_pool.rs` - Add doc comments
- `anchor/programs/fogopulse/src/instructions/create_epoch.rs` - Add doc comments

**New Instruction Stubs:**
- `anchor/programs/fogopulse/src/instructions/buy_position.rs` - Skeleton with session pattern
- `anchor/programs/fogopulse/src/instructions/sell_position.rs` - Skeleton with session pattern
- `anchor/programs/fogopulse/src/instructions/claim_payout.rs` - Skeleton with session pattern

### Compatibility Notes from Previous Stories

**Anchor Version:** Using anchor-lang 0.31.1 (downgraded from 0.32.1 for pyth-lazer-solana-contract 0.5.0 compatibility)

**Anchor.toml:** Has `anchor_version = "0.31.1"` under `[toolchain]` to fix IDL build compatibility

**fogo-sessions-sdk 0.7.5 compatibility:**
- Check if compatible with anchor-lang 0.31.1
- If not, may need to use an earlier version or find workaround
- Version 0.7.5 fixed Bytes constraints bug from 0.7.2

### Git Commit Patterns from Previous Stories

Recent commits follow this pattern:
- `Story 1.X: Brief description of what was implemented`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#FOGO Sessions Integration Strategy] - Session integration pattern
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9] - Original story requirements
- [Source: https://docs.fogo.io/user-guides/integrating-fogo-sessions.html] - Official FOGO Sessions integration docs
- [Source: https://docs.rs/fogo-sessions-sdk/0.7.0] - Crate documentation
- [Source: https://github.com/fogo-foundation/fogo-sessions/tree/main/programs/example] - Official example program
- [Source: _bmad-output/implementation-artifacts/1-8-integrate-pyth-lazer-ed25519-verification.md] - Previous story learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- fogo-sessions-sdk 0.7.5 is fully compatible with anchor-lang 0.31.1
- Used `features = ["anchor"]` for Anchor integration support
- Added SessionExtractionFailed error to errors.rs for session validation failures
- Added InvalidEpoch, AlreadyClaimed, NotImplemented errors for instruction stubs

### Completion Notes List

- **AC #1 Verified**: fogo-sessions-sdk@0.7.5 added to Cargo.toml with `features = ["anchor"]`
- **AC #2 Verified**: User-facing instruction stubs (buy_position, sell_position, claim_payout) use `session::extract_user()` which wraps `Session::extract_user_from_signer_or_session`
- **AC #3 Verified**: Admin instructions (initialize, create_pool) have doc comments explaining why sessions are NOT used; create_epoch documented as permissionless
- **AC #4 Verified**: Comprehensive documentation added to session.rs module and all instruction files
- **AC #5 Verified**: `anchor build` succeeds, IDL generated at `target/idl/fogopulse.json`, `cargo test` passes (1 test, 4 doc-tests ignored)

### File List

**New Files:**
- anchor/programs/fogopulse/src/session.rs
- anchor/programs/fogopulse/src/instructions/buy_position.rs
- anchor/programs/fogopulse/src/instructions/sell_position.rs
- anchor/programs/fogopulse/src/instructions/claim_payout.rs

**Modified Files:**
- anchor/programs/fogopulse/Cargo.toml
- anchor/Cargo.lock (dependency resolution for fogo-sessions-sdk)
- anchor/programs/fogopulse/src/lib.rs
- anchor/programs/fogopulse/src/errors.rs
- anchor/programs/fogopulse/src/instructions/mod.rs
- anchor/programs/fogopulse/src/instructions/initialize.rs
- anchor/programs/fogopulse/src/instructions/create_pool.rs
- anchor/programs/fogopulse/src/instructions/create_epoch.rs

## Change Log

| Date | Change |
|------|--------|
| 2026-03-12 | Story 1.9: Integrate FOGO Sessions SDK - Added fogo-sessions-sdk 0.7.5, created session helper module, added user-facing instruction stubs with session pattern, documented admin/permissionless exclusions |
| 2026-03-12 | Code Review Fixes: Fixed position PDA seeds to use user wallet instead of signer_or_session, wired stub instructions in lib.rs, added explicit bump validation, fixed import ordering in session.rs |

