# Story 1.8: Integrate Pyth Lazer Ed25519 Verification

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want Pyth Lazer oracle verification integrated,
So that epoch creation can capture verified price snapshots.

## Acceptance Criteria

1. The `create_epoch` instruction accepts `pyth_message` bytes, `ed25519_instruction_index`, and `signature_index` parameters
2. FOGO-specific Pyth addresses are used:
   - Program: `pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt`
   - Storage: `3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL`
   - Treasury: `upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr`
3. Ed25519 format (`solana`) is used, NOT ECDSA
4. `instructions_sysvar` account is included for Ed25519 verification
5. `VerifyMessage` CPI is called to verify the signature via Pyth program
6. `SolanaMessage` is deserialized to extract price and confidence from verified oracle data
7. `start_price`, `start_confidence`, and `start_publish_time` are populated from verified oracle data
8. The instruction emits an `EpochCreated` event with verified oracle values

## Tasks / Subtasks

- [x] Task 1: Add pyth-lazer-solana-contract dependency (AC: #1, #3)
  - [x] Add `pyth-lazer-solana-contract = { version = "0.5.0", features = ["no-entrypoint", "cpi"] }` to Cargo.toml
  - [x] Note: Version 0.5.0 with "cpi" feature is required for CPI support (0.7.1 doesn't export cpi module)
  - [x] Verify cargo build succeeds

- [x] Task 2: Add FOGO Pyth address constants (AC: #2)
  - [x] Create `src/constants.rs` with FOGO-specific Pyth addresses
  - [x] Define `PYTH_PROGRAM_ID`, `PYTH_STORAGE_ID`, `PYTH_TREASURY_ID` as `Pubkey` constants
  - [x] Export constants from lib.rs

- [x] Task 3: Update CreateEpoch instruction accounts (AC: #4)
  - [x] Add `instructions_sysvar` account with `address = sysvar_instructions::ID` constraint
  - [x] Add `pyth_program` account (readonly, address = PYTH_PROGRAM_ID)
  - [x] Add `pyth_storage` account (readonly, address = PYTH_STORAGE_ID)
  - [x] Add `pyth_treasury` account (mut, address = PYTH_TREASURY_ID)
  - [x] Box large accounts if needed to prevent stack overflow

- [x] Task 4: Update create_epoch handler signature (AC: #1)
  - [x] Change handler to accept `pyth_message: Vec<u8>` instead of individual price fields
  - [x] Add `ed25519_instruction_index: u8` parameter
  - [x] Add `signature_index: u8` parameter
  - [x] Update lib.rs program entry to match new signature

- [x] Task 5: Implement Pyth verification CPI (AC: #5)
  - [x] Build CPI accounts for `VerifyMessage`
  - [x] Call `pyth_lazer_solana_contract::cpi::verify_message()`
  - [x] Pass `pyth_message`, `ed25519_instruction_index`, `signature_index`
  - [x] Handle verification errors with appropriate error types

- [x] Task 6: Deserialize verified oracle data (AC: #6, #7)
  - [x] Use `SolanaMessage::deserialize_slice()` to parse verified message
  - [x] Use `PayloadData::deserialize_slice_le()` to extract price data
  - [x] Extract `price` and `confidence` from first feed property using `into_inner().into()` pattern
  - [x] Extract `timestamp_us.as_micros()` for publish time
  - [x] Add validation that feed is not empty

- [x] Task 7: Add oracle-specific error types (AC: #5, #6)
  - [x] Add `OracleVerificationFailed` error
  - [x] Add `OracleDataInvalid` error
  - [x] Add `OraclePriceMissing` error

- [x] Task 8: Build and test (AC: #8)
  - [x] Run `cargo build --release` and verify no errors
  - [x] Verify EpochCreated event includes oracle values
  - [x] Build successful with Anchor 0.31.1

## Dev Notes

### Critical Integration Details

**FOGO uses Ed25519 verification, NOT ECDSA:**
- FOGO's Pyth storage has **zero ECDSA signers registered**
- FOGO has Ed25519 signers: `HaXscpSUcbCLSnPQB8Z7H6idyANxp1mZAXTbHeYpfrJJ`, `9gKEEcFzSd1PDYBKWAKZi4Sq4ZCUaVX5oTr8kEjdwsfR`
- Use `VerifyMessage` CPI, NOT `VerifyEcdsaMessage`

**Pyth Solana Message Format:**
```
Bytes 0-3:     4-byte magic prefix
Bytes 4-67:    64-byte Ed25519 signature
Bytes 68-99:   32-byte Ed25519 public key
Bytes 100-101: 2-byte message size (u16 LE)
Bytes 102+:    Actual payload (price data)
```

**Transaction Structure (Client-side responsibility):**
```
Transaction:
  [0] Ed25519 signature verification instruction (MUST be first)
  [1] create_epoch instruction (contains pyth_message)
```

**pythMessageOffset calculation for client (not this story):**
- Anchor layout: 8 (discriminator) + variable args + 4 (vec length prefix) = offset
- This will be documented for Story 1.10/1.11 when creating TypeScript clients

**DO NOT use `Ed25519Program.createInstructionWithPublicKey`:**
- This embeds data IN the instruction
- Pyth expects Ed25519 instruction to REFERENCE data in another instruction via offset pointers
- Use `createEd25519Instruction()` from `@pythnetwork/pyth-lazer-solana-sdk` on client side

### Relevant Architecture Patterns

**From Architecture Document:**
- Use Box<> for large accounts to prevent stack overflow (AR13)
- Include `instructions_sysvar` account for Ed25519 verification (Architecture: Oracle Integration)
- Emit Anchor events for all state-changing operations (AR12)

**Error Enum Pattern:**
```rust
#[error_code]
pub enum FogoPulseError {
    #[msg("Oracle verification failed")]
    OracleVerificationFailed,
    #[msg("Oracle data invalid")]
    OracleDataInvalid,
    // ... existing errors
}
```

### Dependencies

**Rust crate versions (current as of March 2026):**
- `pyth-lazer-solana-contract = "0.7.1"` with feature `no-entrypoint`
- `pyth-lazer-protocol` for payload deserialization (check crates.io for compatible version)

**SDK imports needed:**
```rust
use pyth_lazer_solana_contract::cpi::accounts::VerifyMessage as VerifyMessageAccounts;
use pyth_lazer_solana_contract::cpi::verify_message;
use pyth_lazer_solana_contract::protocol::message::SolanaMessage;
use pyth_lazer_protocol::payload::PayloadData;
use anchor_lang::solana_program::sysvar::instructions as sysvar_instructions;
```

### Testing Strategy

1. **Unit test** Pyth message parsing with mock data
2. **Integration test** requires real Pyth Lazer WebSocket subscription
3. **Full verification** will be tested in Story 1.10 (Deploy) and 1.11 (Initialize)

### Project Structure Notes

- New file: `src/constants.rs` for FOGO Pyth addresses
- Modified file: `src/instructions/create_epoch.rs`
- Modified file: `src/errors.rs` (add oracle errors)
- Modified file: `src/lib.rs` (update instruction signature, export constants)
- Modified file: `Cargo.toml` (add dependencies)

### References

- [Source: docs/pyth-lazer-ed25519-integration.md] - Complete integration guide with lessons learned
- [Source: _bmad-output/planning-artifacts/architecture.md#Oracle Integration] - AR20-AR24 Pyth Lazer patterns
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8] - Original story requirements
- [Source: https://docs.rs/pyth-lazer-solana-contract/0.7.1] - Crate documentation
- [Source: https://docs.pyth.network/price-feeds/v2/integrate-as-a-consumer/on-solana-and-fogo] - Official integration docs

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Initial ICE (Internal Compiler Error) with rustc 1.94.0 when using pyth-lazer-solana-contract 0.7.1
- Required downgrade to version 0.5.0 with "cpi" feature to access CPI module
- Required anchor-lang 0.31.1 (downgraded from 0.32.1) for compatibility

### Completion Notes List

1. **Dependency Version Discovery**: The story suggested pyth-lazer-solana-contract 0.7.1, but this version doesn't export the `cpi` module. Version 0.5.0 with features `["no-entrypoint", "cpi"]` is required for CPI support.

2. **Protocol Types Location**: Types are in `pyth_lazer_solana_contract::protocol::*` not `pyth_lazer_protocol::*`. The crate re-exports protocol types.

3. **Price Extraction Pattern**: Use `p.into_inner().into()` to convert price from NonZero<i64> to i64, not `p.0.get()`.

4. **Timestamp Access**: Use `timestamp_us.as_micros()` method, not direct `.0` field access.

5. **Anchor Version**: Downgraded to anchor-lang 0.31.1 for compatibility with pyth-lazer-solana-contract 0.5.0.

### File List

**Created:**
- `anchor/programs/fogopulse/src/constants.rs` - FOGO Pyth address constants

**Modified:**
- `anchor/programs/fogopulse/Cargo.toml` - Updated dependencies (anchor 0.31.1, pyth-lazer 0.5.0)
- `anchor/programs/fogopulse/src/lib.rs` - Added constants module, updated create_epoch signature
- `anchor/programs/fogopulse/src/instructions/create_epoch.rs` - Full Pyth Lazer integration with oracle validation, unit tests
- `anchor/programs/fogopulse/src/errors.rs` - Added oracle error types (including OracleDataStale, OracleConfidenceTooWide)
- `anchor/programs/fogopulse/src/events.rs` - Added start_publish_time to EpochCreated event

### Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-03-12 | Initial implementation | Dev Agent |
| 2026-03-12 | Code Review fixes: added staleness/confidence validation, unit tests, fixed event | Code Review |

## Senior Developer Review (AI)

**Review Date:** 2026-03-12
**Reviewer:** Claude Opus 4.5 (adversarial code review)
**Outcome:** Changes Requested → Fixed

### Issues Found and Fixed

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| HIGH-1 | HIGH | constants.rs not staged in git | ✅ Staged file |
| HIGH-2 | HIGH | No oracle staleness validation | ✅ Added staleness check against `oracle_staleness_threshold_start` |
| HIGH-3 | HIGH | No oracle confidence threshold validation | ✅ Added confidence check against `oracle_confidence_threshold_start_bps` |
| MEDIUM-1 | MEDIUM | EpochCreated event missing start_publish_time | ✅ Added field to event struct and emit |
| MEDIUM-2 | MEDIUM | Unsafe i64→u64 cast in price extraction | ✅ Changed to `try_from()` with error handling |
| MEDIUM-3 | MEDIUM | Undocumented property index assumption | ✅ Added doc comment explaining Pyth property ordering |
| MEDIUM-4 | MEDIUM | No unit tests for Pyth parsing | ✅ Added 4 unit tests in tests module |
| LOW-1 | LOW | Dev Notes import path inconsistency | Acknowledged (notes not updated) |
| LOW-2 | LOW | Unnecessary pyth_message.clone() | Acknowledged (may be needed for CPI) |

### New Error Types Added
- `OracleDataStale` - Oracle publish time exceeds staleness threshold
- `OracleConfidenceTooWide` - Oracle confidence exceeds threshold relative to price

### Verification
All HIGH and MEDIUM issues were fixed. Story is now ready for commit.

