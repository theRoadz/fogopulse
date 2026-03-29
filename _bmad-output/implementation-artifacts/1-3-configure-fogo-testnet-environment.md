# Story 1.3: Configure FOGO Testnet Environment

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the project configured for FOGO testnet,
so that I can develop and test against real chain infrastructure.

## Story Overview

This story completes the FOGO testnet configuration. The project already has:
- FOGO testnet as the default cluster in the frontend (`cluster-data-access.tsx`)
- Anchor.toml configured with localnet workaround and FOGO wallet path
- Basic program deployed to FOGO testnet (Ht3NLQDkJG4BLgsnUnyuWD2393wULyP5nEXx8AyXhiGr)

What needs to be done:
1. Create environment variable documentation in `.env.example`
2. Create frontend constants file (`web/src/lib/constants.ts`) with FOGO testnet addresses
3. Verify Solana CLI configuration points to FOGO testnet
4. Document the complete FOGO testnet setup for developers

**Current State Analysis:**

**Already Configured:**
- `cluster-data-access.tsx`: FOGO testnet as first/default cluster (`https://testnet.fogo.io`)
- `Anchor.toml`: Using localnet cluster workaround, wallet points to `~/.config/solana/fogo-testnet.json`
- Program deployed: `Ht3NLQDkJG4BLgsnUnyuWD2393wULyP5nEXx8AyXhiGr`
- Docs exist: `docs/fogo-testnet-setup.md`, `docs/fogo-testnet-dev-notes.md`

**Missing/Incomplete:**
- No `.env.example` file with documented environment variables
- No `web/src/lib/constants.ts` with USDC mint and program addresses
- No verification of Solana CLI pointing to FOGO testnet

## Acceptance Criteria

1. **AC1: Anchor.toml Configuration**
   - Uses `localnet` cluster with FOGO testnet RPC URL workaround
   - References `~/.config/solana/fogo-testnet.json` keypair
   - Program ID matches current deployment (or is documented)
   - *Note: Already configured in Story 1.1 code review - VERIFY ONLY*

2. **AC2: Solana CLI Configuration**
   - Solana CLI configured to use `https://testnet.fogo.io`
   - Documentation for setting up FOGO keypair
   - Verification commands documented
   - *Note: Documentation exists in docs/fogo-testnet-setup.md - VERIFY*

3. **AC3: Frontend Cluster Configuration**
   - FOGO testnet is the default cluster in `cluster-data-access.tsx`
   - Explorer URL generation works for custom clusters
   - *Note: Already configured in Story 1.1 - VERIFY ONLY*

4. **AC4: USDC Mint Constant**
   - USDC mint constant set to `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy`
   - Defined in `web/src/lib/constants.ts`
   - Accessible throughout the frontend codebase

5. **AC5: Environment Variables**
   - `.env.example` created with all required environment variables
   - Documentation for each variable
   - Cluster/network selection via environment variable
   - Mock data toggles documented

## Tasks / Subtasks

- [x] Task 1: Create constants.ts file (AC: 4)
  - [x] 1.1: Create `web/src/lib/constants.ts`
  - [x] 1.2: Add FOGO testnet USDC mint constant
  - [x] 1.3: Add program ID constant
  - [x] 1.4: Add Pyth Lazer program addresses (for future use)
  - [x] 1.5: Add asset mint constants (BTC, ETH, SOL, FOGO)
  - [x] 1.6: Add trading fee/cap constants (for reference)

- [x] Task 2: Create .env.example file (AC: 5)
  - [x] 2.1: Create `.env.example` in project root
  - [x] 2.2: Document NEXT_PUBLIC_SOLANA_CLUSTER variable
  - [x] 2.3: Document mock data toggle variables
  - [x] 2.4: Document Pyth access token placeholder (for later stories)

- [x] Task 3: Verify existing configurations (AC: 1, 2, 3)
  - [x] 3.1: Verify Anchor.toml has correct program ID
  - [x] 3.2: Verify cluster-data-access.tsx has FOGO as default
  - [x] 3.3: Verify explorer URL works for FOGO testnet
  - [x] 3.4: Document Solana CLI setup commands

- [x] Task 4: Build verification (AC: all)
  - [x] 4.1: Run `pnpm build` in web/ directory
  - [x] 4.2: Verify no TypeScript errors from constants imports
  - [x] 4.3: Verify frontend starts and connects to FOGO testnet

## Dev Notes

### Architecture Requirements Addressed

**From epics.md Story 1.3:**
- Anchor.toml uses `localnet` cluster with FOGO testnet RPC URL workaround
- Solana CLI configured to use `https://testnet.fogo.io`
- Frontend cluster configuration includes FOGO testnet as default
- USDC mint constant is set to `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy`
- Environment variables documented in `.env.example`

### FOGO Network Details

| Resource | Value |
|----------|-------|
| Testnet RPC | `https://testnet.fogo.io` |
| Faucet | `https://faucet.fogo.io/` |
| USDC Mint | `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy` |

### Key Deployed Addresses (from docs/fogo-testnet-setup.md)

| Account | Address |
|---------|---------|
| Program | `Ht3NLQDkJG4BLgsnUnyuWD2393wULyP5nEXx8AyXhiGr` (current) |
| Pyth Lazer Program | `pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt` |
| Pyth Lazer Storage | `3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL` |
| Pyth Lazer Treasury | `upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr` |

### Asset Mints (for PDA derivation)

| Asset | Mint Address |
|-------|-------------|
| BTC | `4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY` |
| ETH | `8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE` |
| SOL | `CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP` |
| FOGO | `H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X` |

### Constants File Structure

```typescript
// web/src/lib/constants.ts
import { PublicKey } from '@solana/web3.js'

// Program ID
export const PROGRAM_ID = new PublicKey('Ht3NLQDkJG4BLgsnUnyuWD2393wULyP5nEXx8AyXhiGr')

// FOGO Testnet USDC Mint
export const USDC_MINT = new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy')

// Pyth Lazer Addresses (FOGO Testnet)
export const PYTH_LAZER_PROGRAM = new PublicKey('pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt')
export const PYTH_LAZER_STORAGE = new PublicKey('3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL')
export const PYTH_LAZER_TREASURY = new PublicKey('upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr')

// Asset Mints (for PDA derivation)
export const ASSET_MINTS = {
  BTC: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
  ETH: new PublicKey('8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE'),
  SOL: new PublicKey('CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP'),
  FOGO: new PublicKey('H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X'),
} as const

export type Asset = keyof typeof ASSET_MINTS

// Trading Constants (from GlobalConfig)
export const TRADING_FEE_BPS = 180  // 1.8%
export const PER_WALLET_CAP_BPS = 500  // 5%
export const PER_SIDE_CAP_BPS = 3000  // 30%
export const EPOCH_DURATION_SECONDS = 300  // 5 minutes
export const FREEZE_WINDOW_SECONDS = 15

// Fee Distribution
export const LP_FEE_SHARE_BPS = 7000  // 70%
export const TREASURY_FEE_SHARE_BPS = 2000  // 20%
export const INSURANCE_FEE_SHARE_BPS = 1000  // 10%

// PDA Seeds
export const SEEDS = {
  GLOBAL_CONFIG: Buffer.from('global_config'),
  POOL: Buffer.from('pool'),
  EPOCH: Buffer.from('epoch'),
  POSITION: Buffer.from('position'),
  LP_SHARE: Buffer.from('lp_share'),
} as const
```

### Environment Variables (.env.example)

```env
# FOGO Pulse Environment Variables
# Copy this file to .env.local and update values as needed

# =============================================================================
# NETWORK CONFIGURATION
# =============================================================================

# Default Solana cluster (fogo-testnet | devnet | mainnet-beta | localnet)
# FOGO testnet is set as default in cluster-data-access.tsx
# This variable can override the default for testing
NEXT_PUBLIC_SOLANA_CLUSTER=fogo-testnet

# =============================================================================
# MOCK DATA TOGGLES (Development Only)
# =============================================================================

# Set to 'true' to use mock data instead of real chain data
# Useful for UI development without chain connection
NEXT_PUBLIC_USE_MOCK_POOL=false
NEXT_PUBLIC_USE_MOCK_EPOCH=false
NEXT_PUBLIC_USE_MOCK_PRICE=false

# =============================================================================
# PYTH ORACLE CONFIGURATION
# =============================================================================

# Pyth Lazer WebSocket access token (required for live price feeds)
# Get a token from: https://docs.pyth.network/price-feeds/getting-started
# Required for: Story 1.8 (Pyth Integration), Story 2.4 (Price Feed)
PYTH_ACCESS_TOKEN=

# =============================================================================
# DEVELOPMENT FLAGS
# =============================================================================

# Enable verbose logging for debugging
NEXT_PUBLIC_DEBUG=false
```

### Previous Story Learnings (from Story 1.2)

**Code Review Process:**
- Fixed missing React imports in shadcn components
- Removed dead code (ThemeSelect replaced by ModeToggle)
- Updated File List in story to reflect all changes

**Patterns Established:**
- Use oklch color space for consistent color rendering
- Use next/font/google for font loading (Inter, JetBrains Mono)
- TooltipProvider must wrap app when using Tooltip component

### Existing Configuration (from Story 1.1 code review)

**cluster-data-access.tsx (already configured):**
```typescript
export const defaultClusters: SolanaCluster[] = [
  {
    name: 'fogo-testnet',
    endpoint: 'https://testnet.fogo.io',
    network: ClusterNetwork.Custom,
  },
  {
    name: 'devnet',
    endpoint: clusterApiUrl('devnet'),
    network: ClusterNetwork.Devnet,
  },
  { name: 'local', endpoint: 'http://localhost:8899' },
]
```

**Explorer URL handling (already configured):**
```typescript
case ClusterNetwork.Custom:
default:
  suffix = `custom&customUrl=${encodeURIComponent(cluster.endpoint)}`
  break
```

### Git Commit Pattern (from previous stories)

Story 1.2 commit format:
```
Story 1.2: Configure shadcn/ui and theme system

- Add FOGO brand colors (primary orange, up/down/warning) using oklch
- [additional bullet points for each major change]

Code review: All ACs verified, X issues fixed, build passes.
```

### Project Structure Notes

- Constants go in: `web/src/lib/constants.ts`
- Utils go in: `web/src/lib/utils.ts` (already exists with cn function)
- Environment variables: `.env.example` at project root
- Documentation: `docs/` folder

### Testing Standards

- Verify constants import correctly in components
- Verify PublicKey objects are valid (base58 check)
- Verify frontend builds without TypeScript errors
- Verify FOGO testnet connection works

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#FOGO Network Details]
- [Source: _bmad-output/planning-artifacts/architecture.md#Key Reference Addresses]
- [Source: _bmad-output/project-context.md#FOGO Network Details]
- [Source: docs/fogo-testnet-setup.md - Complete FOGO setup guide]
- [Source: docs/fogo-testnet-dev-notes.md - Development lessons learned]
- [Source: web/src/components/cluster/cluster-data-access.tsx - Cluster config]
- [Source: anchor/Anchor.toml - Anchor configuration]

## Dependencies

### Upstream Dependencies
- **Story 1.1**: Initialize Project with create-solana-dapp - COMPLETED
  - Provides: Monorepo structure, basic cluster configuration
- **Story 1.2**: Configure shadcn/ui and Theme System - COMPLETED
  - Provides: Theme system, shadcn components

### Downstream Dependencies
- **Story 1.4**: Implement GlobalConfig Account Structure
- **Story 1.8**: Integrate Pyth Lazer Ed25519 Verification (uses PYTH constants)
- **Story 2.4**: Integrate Pyth Hermes Price Feed (uses PYTH_ACCESS_TOKEN)
- **Story 2.2**: Implement Wallet Connection UI (uses cluster config)

## Out of Scope

- Program deployment (handled in Story 1.10)
- GlobalConfig initialization (handled in Story 1.11)
- Pool creation (handled in Story 1.11)
- Pyth Lazer integration (handled in Story 1.8)

## Success Metrics

| Metric | Target |
|--------|--------|
| constants.ts created | Yes, with all addresses |
| .env.example created | Yes, with documentation |
| Build succeeds | `pnpm build` exits 0 |
| No TypeScript errors | Clean compilation |
| Constants importable | From any web/src file |

## Story Progress Tracking

### Checklist
- [x] `web/src/lib/constants.ts` created with all addresses
- [x] USDC mint constant correct (`6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy`)
- [x] Program ID constant correct
- [x] Pyth Lazer addresses added
- [x] Asset mints added
- [x] Trading constants added
- [x] `.env.example` created at project root
- [x] All environment variables documented
- [x] Anchor.toml verified (localnet workaround)
- [x] cluster-data-access.tsx verified (FOGO default)
- [x] Build passes (`pnpm build` in web/)
- [x] No TypeScript errors

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None required - straightforward implementation with no debugging needed.

### Completion Notes List

- Created `web/src/lib/constants.ts` with all FOGO testnet addresses (PROGRAM_ID, USDC_MINT, Pyth Lazer addresses, asset mints, trading constants, PDA seeds)
- Created `.env.example` at project root with documented environment variables for cluster selection, mock data toggles, and Pyth configuration
- Verified existing configurations: Anchor.toml uses localnet workaround with correct program ID, cluster-data-access.tsx has FOGO as default cluster, explorer URL generation works for custom clusters
- Build verification passed: `pnpm build` completes successfully, TypeScript compiles without errors

### File List

**Created:**
- `web/src/lib/constants.ts` - FOGO testnet constants (program ID, USDC mint, Pyth addresses, asset mints, trading constants, PDA seeds)
- `.env.example` - Environment variable documentation

**Verified (no changes needed):**
- `web/src/components/cluster/cluster-data-access.tsx` - FOGO testnet default cluster (already configured)
- `anchor/Anchor.toml` - Localnet workaround with FOGO wallet path (already configured)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-11 | SM Agent (Claude Opus 4.5) | Initial story creation with comprehensive context |
| 2026-03-11 | Dev Agent (Claude Opus 4.5) | Story implementation complete - created constants.ts and .env.example, verified existing configs, build passes |
| 2026-03-11 | Code Review (Claude Opus 4.5) | Code review APPROVED - All ACs verified, constants/env scaffolded for future use, build passes |

---

## Metadata

| Field | Value |
|-------|-------|
| **Created** | 2026-03-11 |
| **Epic** | 1 - Project Foundation & Core Infrastructure |
| **Sprint** | 1 |
| **Story Points** | 1 |
| **Priority** | P0 - Critical Path |
