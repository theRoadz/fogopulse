# Story 1.11: Initialize GlobalConfig and Create Test Pools

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want initialization scripts that set up the protocol,
So that the system is ready for trading development.

## Acceptance Criteria

1. GlobalConfig is initialized with testnet parameters (1.8% fee, 70/20/10 split, 5% wallet cap, 30% side cap, 300s epoch, 15s freeze)
2. BTC, ETH, SOL, and FOGO pools are created
3. Pool USDC token accounts are created using ATA pattern (with allowOwnerOffCurve=true)
4. All account addresses are logged and documented
5. A verification script confirms all accounts exist and have correct data

## Tasks / Subtasks

- [x] Task 1: Create initialization TypeScript script (AC: #1)
  - [x] Subtask 1.1: Create `scripts/initialize-protocol.ts` with initialize instruction call
  - [x] Subtask 1.2: Set testnet parameters: trading_fee_bps=180, lp=7000, treasury=2000, insurance=1000
  - [x] Subtask 1.3: Set cap parameters: per_wallet_cap_bps=500, per_side_cap_bps=3000
  - [x] Subtask 1.4: Set timing: epoch_duration_seconds=300, freeze_window_seconds=15
  - [x] Subtask 1.5: Set oracle thresholds: start_bps=25 (0.25%), settle_bps=80 (0.8%)
  - [x] Subtask 1.6: Set staleness: start=3s, settle=10s
  - [x] Subtask 1.7: Set allow_hedging=false for MVP
  - [x] Subtask 1.8: Use deployer wallet as admin, treasury, and insurance for testnet

- [x] Task 2: Create pool creation script (AC: #2)
  - [x] Subtask 2.1: Create `scripts/create-pools.ts` with create_pool instruction calls
  - [x] Subtask 2.2: Create BTC pool using ASSET_MINTS.BTC (4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY)
  - [x] Subtask 2.3: Create ETH pool using ASSET_MINTS.ETH (8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE)
  - [x] Subtask 2.4: Create SOL pool using ASSET_MINTS.SOL (CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP)
  - [x] Subtask 2.5: Create FOGO pool using ASSET_MINTS.FOGO (H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X)

- [x] Task 3: Create pool USDC ATA accounts (AC: #3)
  - [x] Subtask 3.1: Create `scripts/create-pool-usdc-accounts.ts` (or include in create-pools.ts)
  - [x] Subtask 3.2: Use getAssociatedTokenAddress with allowOwnerOffCurve=true for each pool PDA
  - [x] Subtask 3.3: Create ATA using createAssociatedTokenAccountInstruction from @solana/spl-token
  - [x] Subtask 3.4: USDC Mint: 6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy

- [x] Task 4: Create verification script (AC: #5)
  - [x] Subtask 4.1: Create `scripts/verify-protocol.ts` to check all accounts
  - [x] Subtask 4.2: Verify GlobalConfig exists and has correct parameters
  - [x] Subtask 4.3: Verify all 4 pool accounts exist with correct asset_mint values
  - [x] Subtask 4.4: Verify pool USDC ATAs exist (may have 0 balance initially)
  - [x] Subtask 4.5: Log all account addresses with labels

- [x] Task 5: Document all addresses (AC: #4)
  - [x] Subtask 5.1: Update `web/src/lib/constants.ts` with GlobalConfig PDA address
  - [x] Subtask 5.2: Update `web/src/lib/constants.ts` with Pool PDA addresses
  - [x] Subtask 5.3: Update `docs/fogo-testnet-setup.md` with all initialized account addresses
  - [x] Subtask 5.4: Log transaction signatures for all initialization operations

- [x] Task 6: Run scripts and verify (AC: #1-5)
  - [x] Subtask 6.1: Run `npx tsx scripts/initialize-protocol.ts` on FOGO testnet
  - [x] Subtask 6.2: Run `npx tsx scripts/create-pools.ts` on FOGO testnet
  - [x] Subtask 6.3: Run `npx tsx scripts/verify-protocol.ts` to confirm setup
  - [x] Subtask 6.4: Commit constants and documentation updates

## Quick Start TL;DR

**What you'll do:**
1. Create 3 TypeScript scripts in `anchor/scripts/`
2. Run them from WSL to initialize the protocol on FOGO testnet
3. Update constants.ts and docs with the resulting addresses

**Scripts to create:**
- `initialize-protocol.ts` - One GlobalConfig account
- `create-pools.ts` - Four Pool accounts + their USDC ATAs
- `verify-protocol.ts` - Check everything worked

**Commands to run (in WSL):**
```bash
# Setup (one-time)
cd /mnt/d/dev/fogopulse/anchor
mkdir -p scripts
pnpm add -D tsx

# Execute (in order)
npx tsx scripts/initialize-protocol.ts
npx tsx scripts/create-pools.ts
npx tsx scripts/verify-protocol.ts
```

**Result:** Protocol ready for epoch creation (Epic 2)

## Dev Notes

### Build Environment (CRITICAL)

**Scripts MUST run in WSL (not Windows):**
- Anchor scripts require WSL for consistent path handling and wallet access
- Working directory: `/mnt/d/dev/fogopulse/anchor`
- Wallet path `~/.config/solana/fogo-testnet.json` works correctly in WSL
- Use `npx tsx scripts/<script>.ts` to run TypeScript scripts

**Script Directory Setup (Required First):**
```bash
# In WSL
cd /mnt/d/dev/fogopulse/anchor
mkdir -p scripts
pnpm add -D tsx
```

**Program is already deployed (Story 1.10):**
- Program ID: `D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5`
- No rebuild or redeployment needed for this story

### GlobalConfig Initialization Parameters

**Fee Parameters:**
```typescript
const params = {
  tradingFeeBps: 180,           // 1.8% trading fee
  lpFeeShareBps: 7000,          // 70% to LP
  treasuryFeeShareBps: 2000,    // 20% to treasury
  insuranceFeeShareBps: 1000,   // 10% to insurance
}
// Note: Fee shares MUST sum to 10000 (100%)
```

**Cap Parameters:**
```typescript
const caps = {
  perWalletCapBps: 500,    // 5% max position per wallet
  perSideCapBps: 3000,     // 30% max exposure per side
}
```

**Timing Parameters:**
```typescript
const timing = {
  epochDurationSeconds: 300,    // 5 minutes
  freezeWindowSeconds: 15,      // 15 seconds freeze before settlement
}
```

**Oracle Thresholds:**
```typescript
const oracle = {
  oracleConfidenceThresholdStartBps: 25,   // 0.25% max confidence ratio for epoch start
  oracleConfidenceThresholdSettleBps: 80,  // 0.8% max confidence ratio for settlement
  oracleStalenessThresholdStart: 3,        // 3 seconds max age for start
  oracleStalenessThresholdSettle: 10,      // 10 seconds max age for settlement
}
```

**Other:**
```typescript
const other = {
  allowHedging: false,  // MVP: users can only hold ONE direction per epoch
}
```

### PDA Derivation

**GlobalConfig PDA:**
```typescript
const [globalConfigPda, globalConfigBump] = PublicKey.findProgramAddressSync(
  [Buffer.from('global_config')],
  PROGRAM_ID
)
```

**Pool PDA:**
```typescript
const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
  [Buffer.from('pool'), assetMint.toBuffer()],
  PROGRAM_ID
)
```

**Pool USDC ATA:**
```typescript
import { getAssociatedTokenAddress } from '@solana/spl-token'

const poolUsdcAta = await getAssociatedTokenAddress(
  USDC_MINT,    // mint
  poolPda,      // owner
  true          // allowOwnerOffCurve = true (REQUIRED for PDA owners)
)
```

### Key Constants (from constants.ts)

```typescript
export const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
export const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')
export const FOGO_TESTNET_RPC = 'https://testnet.fogo.io'

export const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
}
```

### Script Structure Pattern

```typescript
// scripts/initialize-protocol.ts
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor'
import fs from 'fs'

// Load IDL and wallet
const idl = JSON.parse(fs.readFileSync('target/idl/fogopulse.json', 'utf8'))
const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(
    process.env.WALLET_PATH || '~/.config/solana/fogo-testnet.json',
    'utf8'
  )))
)

// Setup connection and provider
const connection = new Connection('https://testnet.fogo.io', 'confirmed')
const provider = new AnchorProvider(
  connection,
  new Wallet(wallet),
  { commitment: 'confirmed' }
)
const program = new Program(idl, PROGRAM_ID, provider)

// Execute instruction...
```

### Instruction Calls

**Required Imports (add to all scripts):**
```typescript
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor'
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token'
import fs from 'fs'
```

**Initialize GlobalConfig:**
```typescript
const tx = await program.methods
  .initialize(
    treasury,                           // Pubkey - treasury account
    insurance,                          // Pubkey - insurance account
    tradingFeeBps,                      // u16 - 180
    lpFeeShareBps,                      // u16 - 7000
    treasuryFeeShareBps,                // u16 - 2000
    insuranceFeeShareBps,               // u16 - 1000
    perWalletCapBps,                    // u16 - 500
    perSideCapBps,                      // u16 - 3000
    oracleConfidenceThresholdStartBps,  // u16 - 25
    oracleConfidenceThresholdSettleBps, // u16 - 80
    new BN(oracleStalenessThresholdStart),   // i64 - 3
    new BN(oracleStalenessThresholdSettle),  // i64 - 10
    new BN(epochDurationSeconds),       // i64 - 300
    new BN(freezeWindowSeconds),        // i64 - 15
    allowHedging                        // bool - false
  )
  .accounts({
    admin: wallet.publicKey,
    globalConfig: globalConfigPda,
    systemProgram: SystemProgram.programId,
  })
  .rpc()
```

**Create Pool:**
```typescript
const tx = await program.methods
  .createPool()
  .accounts({
    admin: wallet.publicKey,
    globalConfig: globalConfigPda,
    assetMint: ASSET_MINTS.BTC,
    pool: btcPoolPda,
    systemProgram: SystemProgram.programId,
  })
  .rpc()
```

**Create Pool USDC ATA:**
```typescript
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress
} from '@solana/spl-token'

const poolUsdcAta = await getAssociatedTokenAddress(
  USDC_MINT,
  poolPda,
  true  // allowOwnerOffCurve
)

const tx = new Transaction().add(
  createAssociatedTokenAccountInstruction(
    wallet.publicKey,  // payer
    poolUsdcAta,       // associatedToken
    poolPda,           // owner
    USDC_MINT          // mint
  )
)
await sendAndConfirmTransaction(connection, tx, [wallet])
```

### Testnet Wallet Requirements

- Wallet must have sufficient SOL for rent and transaction fees
- Estimated costs:
  - GlobalConfig rent: ~0.002 SOL
  - Each Pool rent: ~0.002 SOL
  - Each USDC ATA rent: ~0.002 SOL
  - Transaction fees: ~0.000005 SOL per tx
- Total estimated: ~0.02 SOL minimum
- Get testnet SOL from https://faucet.fogo.io/

### Project Structure Notes

**Files to Create:**
- `anchor/scripts/initialize-protocol.ts` - Initialize GlobalConfig
- `anchor/scripts/create-pools.ts` - Create all 4 pools
- `anchor/scripts/create-pool-usdc-accounts.ts` - Create USDC ATAs (can be combined with create-pools.ts)
- `anchor/scripts/verify-protocol.ts` - Verification script

**Files to Modify:**
- `web/src/lib/constants.ts` - Add GlobalConfig PDA and Pool PDA addresses
- `docs/fogo-testnet-setup.md` - Document initialized account addresses

**Directory:** Scripts should go in `anchor/scripts/` following project convention

### Constants.ts Updates

**Add to `web/src/lib/constants.ts` after SEEDS section:**
```typescript
// =============================================================================
// INITIALIZED ACCOUNTS (Story 1.11)
// =============================================================================

export const GLOBAL_CONFIG_PDA = new PublicKey('<ADDRESS_FROM_SCRIPT>')

export const POOL_PDAS = {
  BTC: new PublicKey('<BTC_POOL_ADDRESS>'),
  ETH: new PublicKey('<ETH_POOL_ADDRESS>'),
  SOL: new PublicKey('<SOL_POOL_ADDRESS>'),
  FOGO: new PublicKey('<FOGO_POOL_ADDRESS>'),
} as const

export const POOL_USDC_ATAS = {
  BTC: new PublicKey('<BTC_POOL_USDC_ATA>'),
  ETH: new PublicKey('<ETH_POOL_USDC_ATA>'),
  SOL: new PublicKey('<SOL_POOL_USDC_ATA>'),
  FOGO: new PublicKey('<FOGO_POOL_USDC_ATA>'),
} as const
```

These addresses are deterministic (PDAs), but hardcoding them makes frontend queries faster.

### Previous Story Learnings (from Story 1.10)

1. **Program is deployed:** D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5
2. **IDL location:** `anchor/target/idl/fogopulse.json`
3. **Wallet location:** `~/.config/solana/fogo-testnet.json`
4. **Anchor version:** 0.31.1 (use @coral-xyz/anchor npm package)
5. **No anchor deploy:** Use scripts directly, program already deployed

### Git Commit History (Last 5 Relevant)

| Commit | Summary |
|--------|---------|
| 06067dc | Story 1.10: Deploy Program to FOGO Testnet |
| c1c7b40 | Story 1.9: Integrate FOGO Sessions SDK |
| e773650 | Story 1.8.1: Document Pyth Lazer version research findings |
| c39ee9b | Story 1.8: Integrate Pyth Lazer Ed25519 verification |
| 7ee0ef6 | Story 1.7: Implement UserPosition account structure |

Key observations:
- Story 1.10 completed deployment successfully
- Story 1.9 added FOGO Sessions SDK integration
- Program structure is complete with all account structures

### Error Handling Patterns

**Check if GlobalConfig already exists:**
```typescript
const globalConfigInfo = await connection.getAccountInfo(globalConfigPda)
if (globalConfigInfo) {
  console.log('GlobalConfig already initialized at:', globalConfigPda.toBase58())
  // Optionally fetch and display current config
  return
}
```

**Check if Pool already exists:**
```typescript
const poolInfo = await connection.getAccountInfo(poolPda)
if (poolInfo) {
  console.log(`Pool for ${asset} already exists at:`, poolPda.toBase58())
  continue  // Skip to next asset
}
```

### Common Errors and Solutions

**1. "already in use" - Account Already Initialized:**
```
Error: failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0
```
Solution: Account exists. Use the check patterns above to skip or fetch existing data.

**2. Insufficient SOL for Rent:**
```
Error: Attempt to debit an account but found no record of a prior credit.
```
Solution: Get more SOL from https://faucet.fogo.io/

**3. "Unauthorized" - Admin Mismatch:**
```
Error: custom program error: 0x1770 (Unauthorized)
```
Solution: Ensure wallet matches GlobalConfig.admin. For create_pool, you must use the same wallet that called initialize.

**4. Connection/RPC Timeout:**
```
Error: failed to get recent blockhash
```
Solution: Retry the script. FOGO testnet may have intermittent issues.

### Validation Requirements

**Verify GlobalConfig:**
```typescript
const config = await program.account.globalConfig.fetch(globalConfigPda)
console.log('GlobalConfig:')
console.log('  Admin:', config.admin.toBase58())
console.log('  Trading Fee:', config.tradingFeeBps, 'bps')
console.log('  LP Fee Share:', config.lpFeeShareBps, 'bps')
console.log('  Epoch Duration:', config.epochDurationSeconds.toString(), 'seconds')
// ... etc
```

**Verify Pool:**
```typescript
const pool = await program.account.pool.fetch(poolPda)
console.log(`Pool ${asset}:`)
console.log('  Asset Mint:', pool.assetMint.toBase58())
console.log('  Yes Reserves:', pool.yesReserves.toString())
console.log('  No Reserves:', pool.noReserves.toString())
console.log('  Next Epoch ID:', pool.nextEpochId.toString())
console.log('  Active Epoch:', pool.activeEpoch ? pool.activeEpoch.toBase58() : 'None')
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] - GlobalConfig and Pool account structures
- [Source: _bmad-output/planning-artifacts/architecture.md#Pool Token Account Pattern] - ATA pattern with allowOwnerOffCurve
- [Source: _bmad-output/planning-artifacts/architecture.md#Development Environment] - Script execution workflow
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.11] - Original story requirements
- [Source: _bmad-output/implementation-artifacts/1-10-deploy-program-to-fogo-testnet.md] - Deployment details and learnings
- [Source: _bmad-output/project-context.md#FOGO Network Details] - Testnet RPC and faucet URLs
- [Source: anchor/programs/fogopulse/src/instructions/initialize.rs] - Initialize instruction implementation
- [Source: anchor/programs/fogopulse/src/instructions/create_pool.rs] - Create pool instruction implementation

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Initial attempt failed with `DeclaredProgramIdMismatch` error - IDL had stale program ID
- Required program rebuild and redeploy to sync `declare_id!` with deployed address
- Used raw transaction building instead of Anchor Program class due to IDL version mismatch with npm package

### Completion Notes List

- Created `anchor/scripts/initialize-protocol.ts` - Initializes GlobalConfig with testnet parameters using raw TransactionInstruction
- Created `anchor/scripts/create-pools.ts` - Creates BTC, ETH, SOL, FOGO pools and their USDC ATAs
- Created `anchor/scripts/verify-protocol.ts` - Verifies all accounts exist with correct data, outputs code snippet for constants.ts
- All scripts use raw instruction encoding to avoid Anchor npm package version conflicts
- GlobalConfig initialized with all parameters matching AC#1
- All 4 pools created with correct asset_mint values (AC#2)
- All 4 pool USDC ATAs created using allowOwnerOffCurve=true pattern (AC#3)
- All addresses documented in constants.ts and fogo-testnet-setup.md (AC#4)
- Verification script confirms all accounts exist and have correct data (AC#5)

### File List

- anchor/scripts/initialize-protocol.ts (new)
- anchor/scripts/create-pools.ts (new)
- anchor/scripts/verify-protocol.ts (new)
- anchor/package.json (modified - added tsx, @solana/spl-token)
- web/src/lib/constants.ts (modified - added GLOBAL_CONFIG_PDA, POOL_PDAS, POOL_USDC_ATAS)
- docs/fogo-testnet-setup.md (modified - added all deployed addresses)

### Change Log

| Date | Change |
|------|--------|
| 2026-03-12 | Story 1.11 completed - Protocol initialized on FOGO testnet |
| 2026-03-12 | Code review passed - Added missing TX signatures to docs, all ACs verified |

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5
**Date:** 2026-03-12
**Outcome:** ✅ APPROVED

### Acceptance Criteria Verification

| AC# | Requirement | Status |
|-----|-------------|--------|
| 1 | GlobalConfig initialized with testnet parameters | ✅ Verified - All params correct |
| 2 | BTC, ETH, SOL, FOGO pools created | ✅ Verified - All 4 pools exist |
| 3 | Pool USDC ATAs with allowOwnerOffCurve=true | ✅ Verified - Correct pattern |
| 4 | All addresses logged and documented | ✅ Fixed - Added missing TX sigs |
| 5 | Verification script confirms accounts | ✅ Verified - Comprehensive checks |

### Issues Found and Resolution

**Fixed During Review:**
- [HIGH] Missing transaction signatures for Pool/ATA creation → Added to fogo-testnet-setup.md

**Accepted as Technical Debt (Low Priority):**
- [MEDIUM] Duplicate constants across 3 scripts → Acceptable for initialization scripts (run once)
- [MEDIUM] pnpm-lock.yaml not in File List → Expected dependency side effect
- [LOW] Inconsistent console formatting → Cosmetic only
- [LOW] Dev Notes mention separate ATA script → Implementation correctly combined

### Code Quality Notes

- Scripts are idempotent and check for existing accounts
- Good error handling with exit codes
- Fee share validation prevents misconfiguration
- Verification script outputs ready-to-paste constants

