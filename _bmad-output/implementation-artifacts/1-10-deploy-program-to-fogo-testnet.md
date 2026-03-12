# Story 1.10: Deploy Program to FOGO Testnet

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the program deployed to FOGO testnet,
So that I can verify the on-chain structures work correctly.

## Acceptance Criteria

1. `anchor build` completes without errors or stack overflow warnings
2. `solana program deploy target/deploy/fogopulse.so` succeeds on FOGO testnet
3. The program ID is recorded and updated in Anchor.toml and frontend constants
4. The deployed program can be queried via RPC

## Tasks / Subtasks

- [x] Task 1: Verify program builds successfully (AC: #1)
  - [x] Run `anchor build` in WSL and verify no errors
  - [x] Check for stack overflow warnings in build output
  - [x] Verify IDL is generated at `target/idl/fogopulse.json`
  - [x] Document any build warnings that need attention

- [x] Task 2: Prepare deployment wallet (AC: #2)
  - [x] Verify FOGO testnet wallet exists at `~/.config/solana/fogo-testnet.json`
  - [x] Check wallet balance using `solana balance --url https://testnet.fogo.io`
  - [x] If insufficient SOL, get testnet tokens from faucet (https://faucet.fogo.io/)
  - [x] Verify Solana CLI is configured for FOGO testnet

- [x] Task 3: Deploy program to FOGO testnet (AC: #2)
  - [x] Run `solana program deploy target/deploy/fogopulse.so --url https://testnet.fogo.io`
  - [x] Record the returned program ID
  - [x] Note: Do NOT use `anchor deploy` - use `solana program deploy` directly due to Anchor.toml limitations

- [x] Task 4: Update configuration files with new program ID (AC: #3)
  - [x] Update `anchor/Anchor.toml` - both [programs.localnet] and [programs.devnet]
  - [x] Create or update frontend constants file `web/lib/constants.ts` with program ID
  - [x] Update declare_id! in `anchor/programs/fogopulse/src/lib.rs` if different from current

- [x] Task 5: Verify deployment (AC: #4)
  - [x] Query program using `solana program show <PROGRAM_ID> --url https://testnet.fogo.io`
  - [x] Verify program is executable and not closed
  - [x] Document deployed program size and required SOL for rent

## Dev Notes

### Build Environment (CRITICAL)

**ALWAYS use WSL for Anchor/Solana CLI operations:**
- Anchor CLI has Linux dependencies that don't work natively on Windows
- `anchor build` MUST run in WSL
- `solana program deploy` MUST run in WSL
- Frontend dev and TypeScript scripts can run on Windows

### Anchor Build Command

```bash
# In WSL, navigate to anchor directory
cd /mnt/d/dev/fogopulse/anchor

# Build the program
anchor build
```

**Expected Output:**
- Build artifacts in `target/deploy/fogopulse.so`
- IDL at `target/idl/fogopulse.json`
- No stack overflow warnings (Box<> already applied in previous stories)

### FOGO Testnet Configuration

| Resource | Value |
|----------|-------|
| Testnet RPC | `https://testnet.fogo.io` |
| Faucet | `https://faucet.fogo.io/` |
| USDC Mint | `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy` |

### Solana CLI Configuration for FOGO

```bash
# Set Solana CLI to use FOGO testnet
solana config set --url https://testnet.fogo.io

# Verify configuration
solana config get

# Check wallet balance
solana balance ~/.config/solana/fogo-testnet.json --url https://testnet.fogo.io
```

### Deployment Command

```bash
# In WSL - Deploy program to FOGO testnet
solana program deploy target/deploy/fogopulse.so \
  --url https://testnet.fogo.io \
  --keypair ~/.config/solana/fogo-testnet.json

# Example successful output:
# Program Id: <NEW_PROGRAM_ID>
```

**DO NOT use `anchor deploy`** - Anchor.toml workarounds for FOGO cluster require direct `solana program deploy`.

### Anchor.toml Configuration

Current configuration (from Story 1.3):
```toml
[programs.localnet]
fogopulse = "6GJBgvTbE8wRN86iyfAPE8CEBqDNcbb7ReQ7ycacGJqq"

[programs.devnet]
fogopulse = "6GJBgvTbE8wRN86iyfAPE8CEBqDNcbb7ReQ7ycacGJqq"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/fogo-testnet.json"

[toolchain]
anchor_version = "0.31.1"
```

After deployment, update both `[programs.localnet]` and `[programs.devnet]` sections with the actual deployed program ID.

### Frontend Constants File

Create or update `web/lib/constants.ts`:
```typescript
import { PublicKey } from '@solana/web3.js';

// Program ID - Updated after deployment
export const PROGRAM_ID = new PublicKey('6GJBgvTbE8wRN86iyfAPE8CEBqDNcbb7ReQ7ycacGJqq');

// FOGO Testnet
export const FOGO_TESTNET_RPC = 'https://testnet.fogo.io';

// USDC Mint (FOGO Testnet)
export const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy');

// Pyth Lazer Addresses (FOGO)
export const PYTH_PROGRAM = new PublicKey('pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt');
export const PYTH_STORAGE = new PublicKey('3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL');
export const PYTH_TREASURY = new PublicKey('upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr');

// Asset Mints (for PDA derivation)
export const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const;
```

### Program ID Update in lib.rs

If the deployed program ID differs from the current `declare_id!`, update it:
```rust
// anchor/programs/fogopulse/src/lib.rs
declare_id!("<NEW_PROGRAM_ID>");
```

After updating `declare_id!`, rebuild with `anchor build` (changes the program hash but doesn't require redeployment for testnet).

### Verification Commands

```bash
# Show program info
solana program show <PROGRAM_ID> --url https://testnet.fogo.io

# Expected output:
# Program Id: <PROGRAM_ID>
# Owner: BPFLoaderUpgradeab1e11111111111111111111111
# ProgramData Address: <DATA_ADDRESS>
# Authority: <YOUR_WALLET>
# Last Deployed In Slot: <SLOT>
# Data Length: <SIZE> bytes
# Balance: <RENT_SOL> SOL
```

### Project Structure Notes

**Modified Files:**
- `anchor/Anchor.toml` - Update program ID
- `web/lib/constants.ts` - Create with program ID and FOGO constants
- `anchor/programs/fogopulse/src/lib.rs` - Update declare_id! if needed

**No New Files Required** (constants.ts may be new depending on prior state)

### Previous Story Learnings

From Story 1.9 (FOGO Sessions SDK):
- Using anchor-lang 0.31.1 (downgraded from 0.32.1 for pyth-lazer-solana-contract 0.5.0 compatibility)
- `anchor_version = "0.31.1"` in Anchor.toml under `[toolchain]` fixes IDL build compatibility
- fogo-sessions-sdk 0.7.5 is fully compatible with anchor-lang 0.31.1

From Story 1.8 (Pyth Lazer):
- pyth-lazer-solana-contract 0.5.0 is used (has CPI module, v0.7.1+ does not)
- Ed25519 verification requires specific message format and instruction ordering

From Story 1.3 (FOGO Testnet):
- Anchor.toml uses `cluster = "localnet"` as workaround for FOGO
- Deploy using `solana program deploy` directly, not `anchor deploy`

### Deployment Size Estimates

Based on current program structure:
- GlobalConfig, Pool, Epoch, UserPosition, LpShare accounts
- Instructions: initialize, create_pool, create_epoch, buy_position, sell_position, claim_payout
- Pyth Lazer verification integration
- FOGO Sessions SDK integration

Estimated .so size: 250-400 KB (requires ~2-4 SOL for rent)

### Potential Issues

1. **Insufficient SOL for deployment:** Ensure wallet has at least 5 SOL from faucet
2. **Wrong cluster:** Verify Solana CLI is configured for testnet.fogo.io
3. **WSL path issues:** Use /mnt/d/... paths in WSL for Windows drives
4. **Program upgrade authority:** Default is deployer wallet - document for future upgrades

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Development Environment] - WSL/Windows split, deployment workflow
- [Source: _bmad-output/planning-artifacts/architecture.md#Anchor Configuration Limitation] - Anchor.toml workarounds
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.10] - Original story requirements
- [Source: _bmad-output/implementation-artifacts/1-9-integrate-fogo-sessions-sdk.md] - Previous story learnings
- [Source: docs/fogo-testnet-setup.md] - FOGO testnet configuration

## Dev Agent Record

### Agent Model Used

Claude Code (code review by Claude Opus 4.5)

### Debug Log References

#### Build Output (Task 1)
- Build completed successfully with `Finished 'release' profile [optimized]`
- No errors, no stack overflow warnings
- fogopulse.so size: 392,968 bytes (~384 KB)
- IDL generated: target/idl/fogopulse.json (41,264 bytes)
- 17 warnings (non-blocking):
  - `unexpected cfg condition value` - Anchor/Solana version compatibility warnings
  - `ambiguous glob re-exports` - Multiple handlers re-exported (stylistic)
  - `use of deprecated method realloc` - Anchor 0.31.1 uses older Solana API

#### Wallet Preparation (Task 2)
- Wallet: ~/.config/solana/fogo-testnet.json (exists)
- Balance: 40.656175145 SOL (sufficient for deployment)
- Solana CLI configured: RPC=https://testnet.fogo.io, commitment=confirmed

#### Deployment (Task 3)
- Program ID: D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5
- Signature: 2PEsbkCUjhzmAhKmyg6cwYjAGBX87ZEr543isVGxJWg5dXWjkR91MBvQyhTh9a22C2zAoZpAc3EucJ5FPvv7eeB9
- Deployed via: solana program deploy (NOT anchor deploy)

#### Configuration Updates (Task 4)
- anchor/Anchor.toml: Updated [programs.localnet] and [programs.devnet]
- web/src/lib/constants.ts: Updated PROGRAM_ID
- anchor/programs/fogopulse/src/lib.rs: Updated declare_id!
- Old ID: Ht3NLQDkJG4BLgsnUnyuWD2393wULyP5nEXx8AyXhiGr
- New ID: D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5

#### Deployment Verification (Task 5)
- Program queried successfully via `solana program show`
- Owner: BPFLoaderUpgradeab1e11111111111111111111111 (BPF Upgradeable Loader)
- ProgramData Address: H7413S1o5DB8NY5xvwuRdriNGY9RnKWSAscRawyDY3PF
- Authority: F7rNisi47NQm5m6hzmTqjVeomYoDjvYoCJb5YQ6hLU1U (upgrade authority)
- Last Deployed Slot: 741399817
- Data Length: 392,968 bytes (~384 KB)
- Rent Balance: 2.73626136 SOL

#### Program Keypair
- Location: `anchor/target/deploy/fogopulse-keypair.json`
- Public Key: D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5
- **CRITICAL**: Back up this keypair! Required for program upgrades.

### Completion Notes List

- ✅ Successfully deployed fogopulse program to FOGO testnet
- ✅ Program ID: D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5
- ✅ All configuration files updated with new program ID
- ✅ Program is executable and queryable via RPC

### File List

**Modified:**
- anchor/Anchor.toml - Updated program ID in [programs.localnet] and [programs.devnet]
- anchor/programs/fogopulse/src/lib.rs - Updated declare_id! macro
- web/src/lib/constants.ts - Updated PROGRAM_ID constant, added FOGO_TESTNET_RPC
- _bmad-output/implementation-artifacts/sprint-status.yaml - Story status updated to review

**Documentation Updated (code review fixes):**
- _bmad-output/project-context.md - Updated program ID references
- _bmad-output/planning-artifacts/architecture.md - Updated program ID references
- docs/on-chain-structure.md - Updated program ID references
- docs/fogo-testnet-setup.md - Updated program ID references
- docs/fogo-testnet-dev-notes.md - Updated program ID references

**Build Artifacts (not tracked in git):**
- anchor/target/deploy/fogopulse.so - Deployed program binary (392,968 bytes)
- anchor/target/idl/fogopulse.json - Generated IDL (41,264 bytes)

## Change Log

| Date | Change |
|------|--------|
| 2026-03-12 | Story created by create-story workflow |
| 2026-03-12 | Story implemented: Deployed fogopulse to FOGO testnet (D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5) |
| 2026-03-12 | Code review: Fixed 2 HIGH issues (missing FOGO_TESTNET_RPC, stale program IDs in docs), 2 MEDIUM issues (template variable, incomplete file list) |
| 2026-03-12 | Code review follow-up: Marked stale PDA addresses (GlobalConfig, Pools) as TBD pending Story 1.11, added program keypair documentation |
