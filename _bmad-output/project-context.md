---
project_name: 'fogopulse'
user_name: 'theRoad'
date: '2026-03-11'
sections_completed:
  ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 42
optimized_for_llm: true
source_documents:
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Core Technologies

| Category | Technology | Version | Notes |
|----------|------------|---------|-------|
| **Chain** | FOGO (SVM-compatible) | - | NOT Solana - different addresses, tokens, Pyth deployment |
| **On-chain Framework** | Anchor | 0.31.1+ | Rust/Anchor programs |
| **Frontend Framework** | Next.js | 14+ | App Router |
| **Styling** | Tailwind CSS + shadcn/ui | - | Copy-paste components, full ownership |
| **State (UI)** | Zustand + Immer | - | Client-only state |
| **State (On-chain)** | TanStack Query | - | Server/on-chain data fetching |
| **Wallet** | @solana/wallet-adapter | - | Works with FOGO RPC |
| **Oracle** | Pyth Lazer | - | Ed25519 format ONLY |
| **Charts** | Lightweight Charts (TradingView) | - | Real-time trading view |
| **Repository** | Monorepo (pnpm workspaces) | - | anchor/ + web/ |

### FOGO-Specific Dependencies (Rust)

```toml
fogo-sessions-sdk = "0.7.5"
pyth-lazer-sdk = "*"
```

### FOGO Network Details

| Resource | Value |
|----------|-------|
| Testnet RPC | `https://testnet.fogo.io` |
| Faucet | `https://faucet.fogo.io/` |
| USDC Mint (Testnet) | `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy` |

---

## Critical Implementation Rules

### FOGO Chain Identity (CRITICAL)

**This is a FOGO application, NOT Solana.**

- Do NOT use Solana mainnet/devnet addresses, RPCs, or token mints
- FOGO is SVM-compatible but has its own network, addresses, and ecosystem
- Wallet adapters connect to FOGO RPC, not Solana networks
- All development targets FOGO testnet - no local devnet

### Pyth Lazer Oracle (CRITICAL)

**FOGO uses Ed25519 verification, NOT ECDSA.**

FOGO's Pyth deployment has **zero ECDSA signers registered**. Using ECDSA format will fail with "Untrusted signer" error.

**FOGO Pyth Lazer Addresses:**

| Account | Address |
|---------|---------|
| Pyth Program | `pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt` |
| Pyth Storage | `3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL` |
| Pyth Treasury | `upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr` |

**WebSocket Subscription:**
```typescript
client.subscribe({
  type: 'subscribe',
  priceFeedIds: [feedId],
  properties: ['price', 'confidence'],
  formats: ['solana'],  // Ed25519 format - REQUIRED for FOGO
  channel: 'fixed_rate@200ms',
  jsonBinaryEncoding: 'hex',
})
```

**Integration Checklist:**
- [ ] Use `formats: ['solana']` (Ed25519), NOT `leEcdsa`
- [ ] Use FOGO-specific Pyth addresses (not Solana mainnet)
- [ ] Install `@pythnetwork/pyth-lazer-solana-sdk`
- [ ] Use `createEd25519Instruction()` helper from SDK
- [ ] Ed25519 instruction MUST be first in transaction (index 0)
- [ ] Include `instructions_sysvar` account in Rust
- [ ] Use `VerifyMessage` CPI (NOT `VerifyEcdsaMessage`)
- [ ] pythMessageOffset = 12 (8 discriminator + 4 vec length) - NOTE: No epoch_id in instruction data

### FOGO Sessions Integration

All user-facing instructions MUST use dual-signature pattern from day one:

```rust
use fogo_sessions_sdk::Session;

let user_pubkey = Session::extract_user_from_signer_or_session(
    &ctx.accounts.user
)?;
```

This pattern:
- Returns wallet pubkey if valid session account
- Returns AccountInfo's pubkey if regular signer
- Errors on invalid/expired sessions

**No on-chain changes required** when adding Sessions to frontend - programs already support both signature types.

### Stack Overflow Prevention

Instructions with many accounts can exceed Solana's 4096 byte stack frame limit.

**Detection (Anchor build warning):**
```
Error: Function Buy::try_accounts Stack offset of 4856 exceeded max offset of 4096 by 760 bytes
```

**Fix:** Wrap large `Account<>` types with `Box<>`:

```rust
// BEFORE (stack overflow)
pub user_usdc: Account<'info, TokenAccount>,
pub config: Account<'info, GlobalConfig>,

// AFTER (fixed)
pub user_usdc: Box<Account<'info, TokenAccount>>,
pub config: Box<Account<'info, GlobalConfig>>,
```

**When to Apply:**
- Instructions with 10+ accounts
- Accounts with large data structures
- Any time you see the stack offset warning

### Pool Token Account Pattern

Use Associated Token Account (ATA) with PDA owner, NOT a custom PDA.

**WRONG:**
```rust
// DON'T DO THIS - custom PDA for pool USDC
seeds = [b"pool_usdc", epoch.as_ref()]
```

**CORRECT (Rust):**
```rust
#[account(
    init,
    payer = admin,
    associated_token::mint = usdc_mint,
    associated_token::authority = pool,  // Pool PDA as owner
)]
pub pool_usdc: Account<'info, TokenAccount>,
```

**CORRECT (TypeScript):**
```typescript
const poolUsdc = await getAssociatedTokenAddress(
  usdcMint,
  poolPda,
  true  // allowOwnerOffCurve = true (REQUIRED for PDA owners)
)
```

### Browser-Compatible PDA Derivation

Node.js `Buffer` methods like `writeBigUInt64LE()` are not available in browser environments.

**DON'T DO THIS (fails in browser):**
```typescript
const epochIdBuffer = Buffer.alloc(8)
epochIdBuffer.writeBigUInt64LE(BigInt(epochId))
```

**DO THIS (browser-compatible):**
```typescript
const epochIdBuffer = new Uint8Array(8)
let n = BigInt(epochId)
for (let i = 0; i < 8; i++) {
  epochIdBuffer[i] = Number(n & BigInt(0xff))
  n = n >> BigInt(8)
}
```

### Anchor Configuration Limitation

Anchor 0.31.1 does NOT support custom cluster names like `fogo-testnet`.

**Workaround:**
1. Keep `cluster = "localnet"` in `Anchor.toml`
2. Use `[programs.devnet]` as an alias for FOGO program ID
3. Deploy using `solana program deploy` directly (NOT `anchor deploy`)

```toml
# Anchor.toml
[programs.localnet]
fogopulse = "D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5"

[programs.devnet]
fogopulse = "D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/fogo-testnet.json"
```

---

## Implementation Patterns

### Naming Conventions

#### Anchor (Rust)

| Category | Convention | Example |
|----------|------------|---------|
| Account Names | PascalCase, singular | `Pool`, `Epoch`, `UserPosition` |
| Instruction Names | snake_case verbs | `buy`, `sell`, `create_epoch`, `settle_epoch` |
| Event Names | PascalCase, past tense | `TradeExecuted`, `EpochSettled` |
| Error Enums | PascalCase with descriptive messages | `EpochNotOpen`, `OracleStale` |
| Rust Enums | PascalCase variants | `EpochState::Open`, `Direction::Up` |

#### TypeScript/Frontend

| Category | Convention | Example |
|----------|------------|---------|
| Files & Directories | kebab-case | `trade-ticket.tsx`, `use-epoch.ts` |
| Component Names | PascalCase functions | `TradeTicket`, `EpochCountdown` |
| Hook Names | camelCase with `use` prefix | `useEpoch`, `usePythPrice` |
| Zustand Stores | `use` prefix + `Store` | `useUIStore`, `useTradeStore` |
| TypeScript Types | PascalCase, no `I` prefix | `Epoch`, not `IEpoch` |
| Constants | SCREAMING_SNAKE_CASE | `TRADING_FEE_BPS`, `PYTH_FEED_IDS` |

### Import Order (ESLint enforced)

```typescript
// 1. React/Next.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 2. External libraries
import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';

// 3. Internal aliases (@/)
import { useEpoch } from '@/hooks/use-epoch';
import { TradeTicket } from '@/components/trade-ticket';

// 4. Relative imports
import { formatPrice } from './utils';

// 5. Types (type-only imports)
import type { Epoch, Direction } from '@/types';
```

### Transaction Handler Pattern

```typescript
interface TransactionResult<T = void> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  signature?: string;
}

async function executeTradeTransaction(
  direction: Direction,
  amount: number
): Promise<TransactionResult> {
  // 1. Validate inputs
  if (!wallet.connected) {
    return { success: false, error: { code: 'NOT_CONNECTED', message: 'Wallet not connected', recoverable: true } };
  }

  // 2. Build transaction
  const tx = await buildTradeTransaction(direction, amount);

  // 3. Execute with toast feedback
  toast.loading('Confirming trade...');

  try {
    const signature = await sendTransaction(tx);
    await confirmTransaction(signature);
    toast.success('Trade confirmed!');
    return { success: true, signature };
  } catch (error) {
    toast.error(getErrorMessage(error));
    return { success: false, error: parseError(error) };
  }
}
```

### Event Naming (Anchor)

| Event | When Emitted |
|-------|--------------|
| `TradeExecuted` | After successful buy/sell |
| `EpochCreated` | When new epoch initialized |
| `EpochFrozen` | When epoch enters freeze window |
| `EpochSettled` | After successful settlement |
| `EpochRefunded` | When epoch settles as refund |
| `LPDeposited` | After LP adds liquidity |
| `LPWithdrawn` | After LP withdraws |
| `ConfigUpdated` | When admin changes config |

---

## On-Chain Account Model

### PDA Seeds

```
GlobalConfig: ["global_config"]
Pool:         ["pool", asset_mint]
Epoch:        ["epoch", pool, epoch_id.to_le_bytes()]
UserPosition: ["position", epoch, user]
LpShare:      ["lp_share", user, pool]
```

### Key Accounts

**GlobalConfig (Singleton):**
- admin, treasury, insurance pubkeys
- trading_fee_bps (180 = 1.8%)
- per_wallet_cap_bps (500 = 5%)
- per_side_cap_bps (3000 = 30%)
- epoch_duration_seconds (300 = 5 min)
- freeze_window_seconds (15)
- allow_hedging (false for MVP)
- paused, frozen flags

**Pool (Per Asset):**
- asset_mint, yes_reserves, no_reserves
- total_lp_shares, next_epoch_id
- active_epoch (Option<Pubkey>)
- active_epoch_state (0=None, 1=Open, 2=Frozen)
- is_paused, is_frozen

**Epoch (Per Pool, Per Time Period):**
- pool, epoch_id, state
- start_time, end_time, freeze_time
- start_price, start_confidence
- settlement_price, settlement_confidence
- outcome (Option<Up|Down|Refunded>)

### Pause/Freeze Hierarchy

Check before any trade:
```rust
if global_config.paused || global_config.frozen || pool.is_paused || pool.is_frozen {
    return Err(TradingPaused);
}
```

---

## Development Environment

### Build Environment Split

| Tool | Environment | Purpose |
|------|-------------|---------|
| Anchor CLI | WSL | Build and deploy Rust programs |
| Solana CLI | WSL | Program deployment, account inspection |
| Node/npm | Windows | Frontend dev, TypeScript scripts |
| Pyth MCP Server | Windows | Look up price feed IDs |

### Development Workflow

1. Build program: `anchor build` (in WSL)
2. Deploy to FOGO testnet: `solana program deploy target/deploy/fogopulse.so` (in WSL)
3. Run scripts: `npx ts-node scripts/create-epoch.ts` (Windows or WSL)
4. Frontend dev: `pnpm dev` (Windows)

### No Local Devnet

All development and testing happens on FOGO testnet with real Pyth Lazer data. Why:
- Pyth Lazer requires real WebSocket connection to Pyth servers
- FOGO-specific Pyth addresses only exist on FOGO networks
- Testing on real network catches integration issues early

---

## Implementation Dependencies (Build Order)

```
FOUNDATION LAYER
├── GlobalConfig (singleton)
│   └── initialize: admin, fees, caps, thresholds
├── Pool (per asset)  [REQUIRES: GlobalConfig]
│   └── create_pool: asset_mint, initial reserves
└── Pyth Integration  [REQUIRES: FOGO testnet access]
    └── Ed25519 verification, price feeds

EPOCH LAYER [REQUIRES: Foundation]
├── create_epoch  [REQUIRES: Pool, Pyth]
│   └── First epoch creation with oracle snapshot
└── advance_epoch  [REQUIRES: Pool, Pyth, existing epoch]
    └── Settle previous + create new (continuous operation)

TRADING LAYER [REQUIRES: Epoch]
├── buy_position  [REQUIRES: Open epoch]
├── sell_position [REQUIRES: Open epoch, existing position]
├── claim_payout  [REQUIRES: Settled epoch, winning position]
└── claim_refund  [REQUIRES: Refunded epoch, any position]

LP LAYER [REQUIRES: Pool]
├── deposit_lp    [REQUIRES: Pool]
└── withdraw_lp   [REQUIRES: Pool, LP shares, epoch settled/none]
```

**Critical Path:**
1. GlobalConfig must exist before any pool creation
2. Pool must exist before any epoch creation
3. Epoch with start_price must exist before any trading
4. Pyth integration required for epoch creation and settlement

**Common Mistake:** Attempting to build trading UI before pool/epoch infrastructure exists.

---

## Testing Requirements

### Critical Test Scenarios

1. Settlement with pending LP withdrawals
2. Settlement when pool is heavily imbalanced
3. Refund scenario (confidence overlap)
4. User with positions in all 4 assets settling near-simultaneously
5. LP in one asset + trader in another (same user)

### Test Organization

- Anchor tests: `anchor/tests/` (centralized)
- Frontend tests: Co-located with source files (e.g., `use-epoch.test.ts`)

---

## UI/UX Rules

### Color System (Dark Theme Default)

| Token | Hex | Usage |
|-------|-----|-------|
| `--background` | #0a0a0b | Main canvas |
| `--foreground` | #fafafa | Primary text |
| `--primary` | #f7931a | Brand accent, price line, CTAs |
| `--up` | #22c55e | UP buttons, wins, positive delta |
| `--down` | #ef4444 | DOWN buttons, losses, negative delta |
| `--warning` | #f59e0b | Freeze state, cautions |

### Component Pattern

Always check shadcn MCP for component implementations before coding. Use shadcn/ui base components, customize as needed.

### Key Custom Components

- `PriceChart` - Smooth line with target line, position markers
- `EpochCountdown` - MM:SS with freeze warning
- `ProbabilityBar` - UP/DOWN probability visualization
- `TradeTicket` - Direction + amount + preview + confirm
- `SettlementExplainer` - Refund explanation with confidence bands

---

## Enforcement Summary

**All AI Agents MUST:**

1. Use FOGO addresses, NOT Solana addresses
2. Use Ed25519 format for Pyth Lazer, NOT ECDSA
3. Use `Session::extract_user_from_signer_or_session` for all user-facing instructions
4. Follow naming conventions exactly as documented
5. Emit Anchor events for all state-changing operations
6. Use TanStack Query for on-chain data, Zustand for UI state only
7. Return `TransactionResult` shape from all transaction handlers
8. Use Box<> for large Account types to prevent stack overflow
9. Use browser-compatible PDA derivation (no Buffer methods)
10. Build in dependency order (Foundation -> Epoch -> Trading -> LP)

---

## Reference Documents

| Document | Description |
|----------|-------------|
| `_bmad-output/planning-artifacts/architecture.md` | Complete architecture decisions, account model, patterns |
| `_bmad-output/planning-artifacts/prd.md` | Functional and non-functional requirements |
| `_bmad-output/planning-artifacts/ux-design-specification.md` | UI components, user journeys, design system |
| `docs/pyth-lazer-ed25519-integration.md` | Pyth integration details (to be created) |
| `docs/fogo-testnet-setup.md` | Network configuration (to be created) |

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Use FOGO addresses, never Solana addresses
- Use Ed25519 format for Pyth, never ECDSA
- Update this file if new patterns emerge during implementation

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review after each major implementation milestone
- Remove rules that become obvious over time
- Add new "gotchas" discovered during development

---

_Last Updated: 2026-03-11_
