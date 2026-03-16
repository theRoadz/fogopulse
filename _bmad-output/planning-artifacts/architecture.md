---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
  - "docs/idea.md"
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-03-03'
project_name: 'fogopulse'
user_name: 'theRoad'
date: '2026-03-03'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The PRD defines 61 functional requirements spanning 6 domains:
- Market Trading (FR1-FR14): Core trading interface with real-time price display, probability visualization, epoch countdown, and binary position entry (UP/DOWN)
- Position Management (FR15-FR20): Multi-asset position tracking with realized/unrealized PnL and claim/refund workflows
- Settlement & Transparency (FR21-FR27): Pyth oracle confidence visualization, settlement outcome display, and detailed refund explanations
- Liquidity Provision (FR28-FR36): Single-token USDC deposits with auto 50/50 split, share tracking, and time-delayed withdrawal
- Wallet Integration (FR37-FR40): Standard Solana wallet adapter with connect/disconnect and transaction signing
- Admin & Operations (FR41-FR51): Operational controls for pause/resume, threshold tuning, and emergency freeze
- System Automation (FR52-FR61): Automated epoch lifecycle, oracle snapshot capture, cap enforcement, and fee distribution

**Non-Functional Requirements:**
27 NFRs define architectural constraints:
- Performance (NFR1-5): ~400ms trade confirmation, ≤1s UI updates, real-time price streaming
- Security (NFR6-12): Non-custodial on-chain funds, multisig admin, FOGO Sessions signature support
- Reliability (NFR13-18): 24/7 operation, oracle staleness auto-refund, atomic transactions
- Scalability (NFR19-22): 100 concurrent traders MVP, 1000+ design headroom, isolated per-asset pools
- Integration (NFR23-27): Pyth Lazer (3s/10s freshness), Solana wallet adapter, FOGO testnet/mainnet

**UX/Design Requirements:**
- Dark/Light mode with user selection and system preference detection (dark default)
- FOGO brand palette: #080420 (background), #c3fba5 (primary/UP), #ff4500 (accent/DOWN)
- Trading terminal aesthetic (Hyperliquid-inspired) with high information density
- WCAG 2.1 AA accessibility compliance
- Responsive: Desktop-first Terminal Pro layout, mobile-functional
- Custom components: DirectionButton, EpochCountdown, ConfidenceIndicator, TradeTicket, ConfidenceBandViz

**Scale & Complexity:**
- Primary domain: Full-stack Web3/DeFi
- Complexity level: High
- Estimated architectural components: 8-10 major components (5 on-chain programs, 3-4 frontend modules)

### Technical Constraints & Dependencies

| Constraint | Impact |
|------------|--------|
| FOGO Chain (SVM-compatible) | Must use Anchor framework, Solana program patterns |
| Pyth Lazer Oracle | Custom integration for low-latency price + confidence data |
| FOGO Sessions Readiness | Programs must support dual signature types from day one |
| Testnet-first | All development on FOGO testnet before mainnet |
| No Formal Audit | Extensive testing and code review required as mitigation |
| Budget Constraint (<$500 seed) | Conservative risk parameters, dynamic caps |

### Cross-Cutting Concerns Identified

1. **Oracle Dependency** - Pyth Lazer affects epoch initialization, trading decisions, settlement, and refund logic. Must handle staleness, confidence thresholds, and verification across all touchpoints.

2. **Real-time State Synchronization** - Frontend must reflect on-chain state (epoch status, probability, positions, settlements) with ≤1s latency. Requires WebSocket or aggressive polling strategy.

3. **Transaction Error Handling** - Wallet rejections, network failures, and on-chain errors need consistent recovery patterns across all user actions.

4. **Cap Enforcement** - Per-wallet (5%) and per-side (30%) limits must be enforced on-chain AND shown proactively in UI to prevent failed transactions.

5. **Fee Distribution Pipeline** - 70/20/10 split (LP/Treasury/Insurance) on every trade, with LP portion auto-compounding into pool reserves.

6. **Epoch Lifecycle Management** - State machine (INIT → OPEN → FROZEN → SETTLING → SETTLED/REFUNDED) must be consistent across programs and UI.

7. **Theming System** - Dark/light mode with CSS variables, system preference detection, and user override. Must apply consistently across all components including charts.

## Starter Template Evaluation

### Primary Technology Domain

**Full-stack Web3/DeFi** based on project requirements:
- On-chain programs: Rust/Anchor on FOGO (SVM-compatible)
- Frontend: Next.js + React + TypeScript
- Styling: Tailwind CSS + shadcn/ui

### Technical Preferences Established

| Category | Decision |
|----------|----------|
| Frontend Framework | Next.js (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Hosting | Vercel |
| Repository Structure | Monorepo (pnpm workspaces) |
| On-chain Framework | Anchor (Rust) |
| Wallet Integration | @solana/wallet-adapter (MVP), @fogo/sessions-sdk-react (Growth) |
| Oracle | Pyth Lazer SDK |

### Starter Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **create-solana-dapp** | Official Solana Foundation CLI | Monorepo, Anchor integration, wallet adapter pre-wired | Uses DaisyUI (need to swap to shadcn) |
| Turborepo + Manual | Start with Turborepo, add Anchor manually | Full control, shadcn from start | More manual setup, no Solana integration |
| Next.js + Manual Anchor | Start with Next.js + shadcn, add Anchor workspace | Perfect shadcn setup | Most manual work |

### Selected Starter: create-solana-dapp

**Rationale:**
- Official, well-maintained by Solana Foundation (v4.7.0)
- Monorepo structure with pnpm workspaces out of the box
- Anchor + Next.js integration battle-tested
- Wallet adapter pre-configured
- Community support and examples available
- One-time effort to swap DaisyUI → shadcn/ui

### Initialization Command

```bash
# 1. Create project in temp location (preserve existing planning artifacts)
cd D:\dev\2026
pnpm create solana-dapp@latest fogopulse-temp

# Select options:
# - Framework: Next.js
# - Template: counter (provides Anchor example to learn from)

# 2. Merge generated structure into existing fogopulse/
# (preserving _bmad/, _bmad-output/, docs/, .claude/, .agents/, .gemini/)
xcopy /E /I fogopulse-temp\* fogopulse\

# 3. Remove temp folder
rm -rf fogopulse-temp

# 4. Navigate to project
cd fogopulse
```

### Post-Initialization Setup

```bash
# 1. Add FOGO Sessions SDK to Anchor program
cd anchor/programs/fogopulse
cargo add fogo-sessions-sdk@0.7.5

# 2. Add Pyth Lazer SDK
cargo add pyth-lazer-sdk

# 3. Swap DaisyUI → shadcn/ui in web/
cd ../../web
pnpm remove daisyui
pnpm dlx shadcn@latest init

# 4. Configure FOGO theming in tailwind.config.ts
```

### .gitignore Additions

```gitignore
# BMAD and AI agent configurations
_bmad/
.agents/
.claude/
.gemini/
```

### Project Structure

```
fogopulse/
├── anchor/                         # Rust/Anchor programs
│   ├── programs/
│   │   └── fogopulse/
│   │       ├── Cargo.toml          # + fogo-sessions-sdk, pyth-lazer-sdk
│   │       └── src/
│   │           ├── lib.rs
│   │           ├── instructions/   # All use Session::extract_user_from_signer_or_session
│   │           └── state/
│   ├── tests/
│   ├── Anchor.toml
│   └── Cargo.toml
├── web/                            # Next.js frontend
│   ├── app/                        # App Router
│   ├── components/
│   │   └── ui/                     # shadcn components
│   ├── providers/
│   │   ├── wallet-provider.tsx     # MVP: @solana/wallet-adapter
│   │   └── session-provider.tsx    # Growth: @fogo/sessions-sdk-react
│   ├── lib/
│   └── package.json
├── _bmad/                          # BMAD workflow configs (gitignored)
├── _bmad-output/                   # Planning artifacts
├── docs/                           # Project documentation
├── .claude/                        # Claude Code configs (gitignored)
├── .agents/                        # Agent configs (gitignored)
├── .gemini/                        # Gemini configs (gitignored)
├── pnpm-workspace.yaml
├── package.json
└── turbo.json                      # Optional: add for caching
```

### FOGO Sessions Integration Strategy

**On-Chain (Rust/Anchor) - From Day One:**

```rust
// Cargo.toml
[dependencies]
fogo-sessions-sdk = "0.7.5"

// In all user-facing instructions:
use fogo_sessions_sdk::Session;

let user_pubkey = Session::extract_user_from_signer_or_session(
    &ctx.accounts.user
)?;
```

This pattern:
- Returns wallet pubkey if valid session account
- Returns AccountInfo's pubkey if regular signer
- Errors on invalid/expired sessions

**Frontend - Phased Approach:**

| Phase | Wallet Integration | User Experience |
|-------|-------------------|-----------------|
| MVP (Testnet) | @solana/wallet-adapter | Users sign each transaction |
| Growth (Mainnet) | + @fogo/sessions-sdk-react | Gasless, one-click trading |

**No on-chain changes required** when adding Sessions to frontend - programs already support both signature types.

### Pre-Mainnet Requirements

1. Register domain with FOGO team (whitelist program IDs)
2. Configure paymaster filters (sponsored transaction rules)
3. Test session flows on FOGO testnet

**Note:** Project initialization using this approach should be the first implementation story.

## Core Architectural Decisions

### Decision Summary

| Category | Decision | Rationale |
|----------|----------|-----------|
| On-Chain Serialization | Borsh (Anchor default) | Standard, well-supported, no accounts large enough for zero-copy |
| Event Logging | Anchor Events | Simple, parseable, sufficient for MVP indexing |
| Client State | Zustand + TanStack Query | Zustand for UI state, TanStack Query for on-chain data (included in starter) |
| On-Chain Sync | Hybrid (WebSocket + Polling) | WebSocket for critical (epoch, positions), polling for rest |
| Price Data Source | Pyth Hermes WebSocket | Same source as settlement oracle - ensures price consistency |
| Chart Library | Lightweight Charts (TradingView) | Professional trading terminal aesthetic, real-time capable |
| Error Handling | Toast + Inline + Status | Toast for feedback, inline for validation, status in positions panel |
| RPC Resilience | Primary + Fallback + Retry | Failover with exponential backoff |
| Testing | Anchor + Vitest + Playwright | Anchor tests for programs, Vitest for components, Playwright for E2E (Growth) |

### Data Architecture

#### On-Chain State (Anchor Accounts)

**Serialization:** Borsh (Anchor default)
- All accounts use standard Borsh serialization
- No zero-copy needed - largest account (Pool) well under size threshold

**GlobalConfig (Singleton):**

System-wide parameters controlled by admin. One account for the entire protocol.

| Field | Type | Description |
|-------|------|-------------|
| admin | Pubkey | Admin authority (multisig on mainnet) |
| treasury | Pubkey | Treasury account for fee collection |
| insurance | Pubkey | Insurance buffer account |
| trading_fee_bps | u16 | Trading fee (180 = 1.8%) |
| lp_fee_share_bps | u16 | LP share of fees (7000 = 70%) |
| treasury_fee_share_bps | u16 | Treasury share of fees (2000 = 20%) |
| insurance_fee_share_bps | u16 | Insurance share of fees (1000 = 10%) |
| per_wallet_cap_bps | u16 | Max position per wallet (500 = 5%) |
| per_side_cap_bps | u16 | Max exposure per side (3000 = 30%) |
| oracle_confidence_threshold_start_bps | u16 | Max confidence ratio for epoch start (25 = 0.25%) |
| oracle_confidence_threshold_settle_bps | u16 | Max confidence ratio for settlement (80 = 0.8%) |
| oracle_staleness_threshold_start | i64 | Max oracle age for epoch start (3 seconds) |
| oracle_staleness_threshold_settle | i64 | Max oracle age for settlement (10 seconds) |
| epoch_duration_seconds | i64 | Epoch length (300 = 5 min) |
| freeze_window_seconds | i64 | No-trade window before settlement (15) |
| allow_hedging | bool | If true, users can hold both UP and DOWN positions (default: false) |
| paused | bool | Pause new epoch creation globally |
| frozen | bool | Emergency freeze all activity globally |
| bump | u8 | PDA bump |

**Hedging Behavior:**

| `allow_hedging` | Behavior |
|-----------------|----------|
| `false` (default) | User can only hold ONE direction per epoch. Second position in opposite direction fails. |
| `true` | User can hold both UP and DOWN positions in same epoch. |

**MVP:** Hedging disabled. Simplifies position tracking and prevents wash trading.

**Pool Account (Per Asset):**

One persistent pool per tradable asset. Stores reserves, LP tracking, and active epoch state.

| Field | Type | Description |
|-------|------|-------------|
| asset_mint | Pubkey | Asset this pool tracks (e.g., BTC mint) |
| yes_reserves | u64 | YES token reserves |
| no_reserves | u64 | NO token reserves |
| total_lp_shares | u64 | Total LP shares issued |
| next_epoch_id | u64 | Counter for next epoch creation (starts at 0) |
| active_epoch | Option<Pubkey> | Current active epoch PDA, or None if no active epoch |
| active_epoch_state | u8 | Cached state: 0=None, 1=Open, 2=Frozen |
| wallet_cap_bps | u16 | Max position per wallet (copied from GlobalConfig at creation) |
| side_cap_bps | u16 | Max exposure per side (copied from GlobalConfig at creation) |
| is_paused | bool | Pool-level pause - blocks all trading in this pool |
| is_frozen | bool | Pool-level freeze - blocks everything including settlement |
| bump | u8 | PDA bump |

**Why this design:**
- **One fetch to check status:** Read pool to know if epoch is active and what state it's in
- **No account scanning:** `active_epoch` points directly to the current epoch
- **Efficient epoch creation:** `next_epoch_id` provides the ID atomically
- **Duplicate prevention:** PDA seeds include epoch_id - same pool + epoch_id = same address (fails if exists)
- **Granular control:** Pause one pool (e.g., FOGO/USD oracle issues) without affecting others

**Pause/Freeze Hierarchy:**

| Level | Field | Effect |
|-------|-------|--------|
| Global | `GlobalConfig.paused` | Blocks all trading across all pools |
| Global | `GlobalConfig.frozen` | Nuclear option - halts ALL activity |
| Pool | `Pool.is_paused` | Blocks trading in this specific pool |
| Pool | `Pool.is_frozen` | Halts this specific pool completely |

Check before any trade:
```rust
if global_config.paused || global_config.frozen || pool.is_paused || pool.is_frozen {
    return Err(TradingPaused);
}
```

**Pool Token Account (USDC):**

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
import { getAssociatedTokenAddress } from '@solana/spl-token'

const poolUsdc = await getAssociatedTokenAddress(
  usdcMint,
  poolPda,
  true  // allowOwnerOffCurve = true (REQUIRED for PDA owners)
)
```

The `allowOwnerOffCurve = true` parameter is critical when the token account owner is a PDA.

#### Epoch Lifecycle

**Continuous Epoch Flow:**

```
Epoch N: |-------Open (5 min)-------|--Frozen (15s)--|
                                                     ↓
                                          `advance_epoch` called
                                          (settles N, creates N+1)
                                                     ↓
Epoch N+1:                                           |-------Open-------|--Frozen--|
```

**Key Principle:** Users need to see the start price before trading. Without it, they can't decide UP or DOWN. Therefore, `advance_epoch` must complete before trading can begin on the new epoch.

**The `advance_epoch` Instruction:**

This is the core instruction that keeps epochs running continuously.

**When to call:** After current epoch's `end_time` has passed.

**What it does (atomic, single transaction):**

1. **Fetch Pyth oracle** - Get current price + confidence
2. **Settle old epoch:**
   - Check confidence against threshold
   - If confident: Compare settlement_price vs start_price → UP/DOWN
   - If uncertain: Mark as Refunded
   - Update old epoch account with outcome
3. **Create new epoch:**
   - Use `pool.next_epoch_id` as new epoch's ID
   - Store Pyth price as `start_price` (this is what users trade against)
   - Set state to Open
4. **Update pool:**
   - `active_epoch = new_epoch_pda`
   - `active_epoch_state = 1 (Open)`
   - `next_epoch_id += 1`

**Two Pyth snapshots in one transaction:**
- Settlement price (for old epoch) - validates against settlement threshold
- Start price (for new epoch) - validates against start threshold

**`create_epoch` Instruction (First Epoch Only):**

Used only to create the very first epoch for a pool, when `pool.active_epoch` is None.

1. Check `pool.active_epoch_state == 0`
2. Fetch Pyth oracle for start_price
3. Create epoch with `pool.next_epoch_id`
4. Update pool: `active_epoch = epoch_pda`, `active_epoch_state = 1`, `next_epoch_id += 1`

**Permissionless Operations:**
- `create_epoch` - Anyone can call (first epoch only)
- `advance_epoch` - Anyone can call after `end_time` (enables crank bots/keepers)

**Crank Bot Responsibility:**
A crank bot should monitor epochs and call `advance_epoch` immediately when `end_time` passes. This ensures continuous trading with minimal gaps. If bot is down, any user or keeper can call it.

**Epoch Account (Per Pool, Per Time Period):**

Time-bounded trading periods within a pool.

| Field | Type | Description |
|-------|------|-------------|
| pool | Pubkey | Parent pool reference |
| epoch_id | u64 | Sequential identifier within pool |
| state | EpochState | Open, Frozen, Settled, Refunded |
| start_time | i64 | Unix timestamp epoch begins |
| end_time | i64 | Unix timestamp epoch ends |
| freeze_time | i64 | When trading stops (end_time - freeze_window) |
| start_price | u64 | Oracle price at epoch creation |
| start_confidence | u64 | Oracle confidence at epoch creation |
| settlement_price | Option<u64> | Oracle price at settlement |
| settlement_confidence | Option<u64> | Oracle confidence at settlement |
| outcome | Option<Outcome> | Up, Down, or Refunded |

**State Model (Two Levels):**

Pool caches active epoch state for efficient reads:

| Pool.active_epoch_state | Meaning |
|-------------------------|---------|
| 0 (None) | No active epoch - waiting for `create_epoch` or `advance_epoch` |
| 1 (Open) | Active trading period |
| 2 (Frozen) | Freeze window - no trading (~15 sec before end) |

Epoch account stores final settlement state:

| Epoch.state | Description |
|-------------|-------------|
| Open | Trading active (while epoch is current) |
| Frozen | In freeze window (while epoch is current) |
| Settled | Settlement complete - outcome determined |
| Refunded | Oracle uncertain or tie - all positions refunded |

| Epoch.outcome | Description |
|---------------|-------------|
| Up | UP won - settlement_price > start_price |
| Down | DOWN won - settlement_price < start_price |
| Refunded | Exact price tie |

**Settlement Outcomes (determined by Pyth confidence):**

| Condition | Outcome |
|-----------|---------|
| Confidence OK + settlement_price > start_price | UP wins |
| Confidence OK + settlement_price < start_price | DOWN wins |
| Confidence OK + settlement_price = start_price | Refund (tie) |

**How to Check Current Epoch Status (Single Fetch):**

```typescript
const pool = await program.account.pool.fetch(poolPda)

if (pool.activeEpochState === 0) {
  // No active epoch - waiting for advance_epoch or create_epoch
  // UI shows: "Next epoch starting soon..." or "Create first epoch"
} else if (pool.activeEpochState === 1) {
  // Open - trading allowed
  // Fetch epoch to show start_price
  const epoch = await program.account.epoch.fetch(pool.activeEpoch)
  // UI shows: "BTC started at $95,000 - predict UP or DOWN"
} else if (pool.activeEpochState === 2) {
  // Frozen - no trading, waiting for advance_epoch
  // UI shows: "Epoch ending... settlement in progress"
}
```

**UserPosition Account (Per User, Per Epoch):**

Tracks a user's position within a specific epoch.

| Field | Type | Description |
|-------|------|-------------|
| user | Pubkey | Wallet address |
| epoch | Pubkey | Reference to epoch |
| direction | Direction | Up or Down |
| amount | u64 | Position size in USDC |
| shares | u64 | Shares from CPMM |
| entry_price | u64 | Price paid per share |
| claimed | bool | Payout claimed? |
| bump | u8 | PDA bump |

PDA seeds: `["position", epoch, user]`

**LpShare Account (Per User, Per Pool):**

Tracks a user's LP position in a pool.

| Field | Type | Description |
|-------|------|-------------|
| user | Pubkey | Wallet address |
| pool | Pubkey | Reference to pool |
| shares | u64 | LP shares owned |
| deposited_amount | u64 | Total USDC deposited |
| pending_withdrawal | u64 | Shares pending withdrawal |
| withdrawal_requested_at | Option<i64> | When withdrawal was requested |
| bump | u8 | PDA bump |

PDA seeds: `["lp_share", user, pool]`

**Account Sizes (with 8-byte discriminator):**

| Account | Size (bytes) |
|---------|-------------|
| GlobalConfig | 155 |
| Pool | ~90 (with new fields) |
| Epoch | 127 |
| UserPosition | 99 |
| LpShare | 106 |

**Event Logging:** Anchor Events
```rust
#[event]
pub struct TradeExecuted {
    pub epoch: Pubkey,
    pub user: Pubkey,
    pub direction: Direction,
    pub amount: u64,
    pub price: u64,
    pub timestamp: i64,
}

// Emit in instruction
emit!(TradeExecuted { ... });
```

Events emitted for:
- TradeExecuted (buy/sell)
- EpochCreated
- EpochSettled
- EpochRefunded
- LPDeposited
- LPWithdrawn

#### Frontend State

**UI State (Zustand):**
```typescript
// stores/ui-store.ts
interface UIStore {
  activeAsset: Asset;
  theme: 'dark' | 'light' | 'system';
  tradeTicket: {
    direction: 'up' | 'down' | null;
    amount: number;
  };
  setActiveAsset: (asset: Asset) => void;
  setTheme: (theme: Theme) => void;
  // ...
}
```

**On-Chain Data (TanStack Query):**
```typescript
// hooks/use-epoch.ts
const { data: epoch } = useQuery({
  queryKey: ['epoch', assetMint, epochId],
  queryFn: () => fetchEpochAccount(connection, epochPda),
  refetchInterval: 1000, // Polling fallback
});
```

### Real-Time Data Strategy

#### Price Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Pyth Network                           │
│                                                             │
│  Pyth Lazer (On-Chain)          Pyth Hermes (Off-Chain)    │
│         │                              │                    │
│         ▼                              ▼                    │
│  Settlement Oracle              WebSocket Stream            │
│  (program reads)                (frontend subscribes)       │
└─────────────────────────────────────────────────────────────┘
                │                        │
                ▼                        ▼
         On-Chain Settlement      Frontend Display
         (source of truth)        (same price source)
```

**Implementation:**
```typescript
// hooks/use-pyth-price.ts
import { PriceServiceConnection } from '@pythnetwork/price-service-client';

const connection = new PriceServiceConnection('https://hermes.pyth.network');

export function usePythPrice(feedId: string) {
  const [price, setPrice] = useState<PriceFeed | null>(null);

  useEffect(() => {
    connection.subscribePriceFeedUpdates([feedId], (priceFeed) => {
      setPrice(priceFeed);
    });
    return () => connection.unsubscribePriceFeedUpdates([feedId]);
  }, [feedId]);

  return {
    price: price?.price,
    confidence: price?.confidence,
    publishTime: price?.publishTime
  };
}
```

#### On-Chain State Sync

**WebSocket Subscriptions (Real-time critical):**
- Active epoch account (state, countdown)
- User position accounts
- Pool reserves (probability calculation)

**Polling (Less time-sensitive):**
- Epoch history
- LP positions
- Settlement results

```typescript
// hooks/use-epoch-subscription.ts
useEffect(() => {
  const subscriptionId = connection.onAccountChange(
    epochPda,
    (accountInfo) => {
      const epoch = program.coder.accounts.decode('Epoch', accountInfo.data);
      queryClient.setQueryData(['epoch', epochId], epoch);
    }
  );
  return () => connection.removeAccountChangeListener(subscriptionId);
}, [epochPda]);
```

### Chart Implementation

**Library:** Lightweight Charts (TradingView)

```typescript
// components/price-chart.tsx
import { createChart, ColorType } from 'lightweight-charts';

const chart = createChart(container, {
  layout: {
    background: { type: ColorType.Solid, color: '#080420' },
    textColor: '#ffffff',
  },
  grid: {
    vertLines: { color: 'rgba(255,255,255,0.1)' },
    horzLines: { color: 'rgba(255,255,255,0.1)' },
  },
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '#c3fba5',      // FOGO green
  downColor: '#ff4500',    // FOGO orange
  borderVisible: false,
  wickUpColor: '#c3fba5',
  wickDownColor: '#ff4500',
});
```

**Features:**
- Real-time candle updates from Pyth Hermes
- Epoch boundaries marked on time axis
- Start price horizontal line overlay
- Confidence indicator badge
- Dark/light mode theming

### Oracle Integration (Pyth Lazer)

**CRITICAL: FOGO uses Ed25519 verification, NOT ECDSA**

FOGO's Pyth deployment has **zero ECDSA signers registered**. Using ECDSA format will fail with "Untrusted signer" error. You MUST use Ed25519 (`solana` format).

**FOGO Pyth Lazer Addresses:**

| Account | Address | Description |
|---------|---------|-------------|
| Pyth Program | `pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt` | Verification program |
| Pyth Storage | `3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL` | Trusted signers list |
| Pyth Treasury | `upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr` | Fee collection |

**Do NOT use Solana mainnet Pyth addresses - they are different.**

**FOGO's Registered Ed25519 Signers:**
- `HaXscpSUcbCLSnPQB8Z7H6idyANxp1mZAXTbHeYpfrJJ`
- `9gKEEcFzSd1PDYBKWAKZi4Sq4ZCUaVX5oTr8kEjdwsfR`

These are the trusted signers in FOGO's Pyth storage. Messages signed by other keys will fail verification.

**Price Feeds:**
- BTC/USD, ETH/USD, SOL/USD, FOGO/USD
- Use Pyth MCP server to look up feed IDs during development

**WebSocket Subscription (Frontend/Scripts):**

```typescript
import { PythLazerClient } from '@pythnetwork/pyth-lazer-sdk'

client.subscribe({
  type: 'subscribe',
  priceFeedIds: [feedId],
  properties: ['price', 'confidence'],
  formats: ['solana'],  // Ed25519 format - REQUIRED for FOGO
  channel: 'fixed_rate@200ms',
  jsonBinaryEncoding: 'hex',
})
```

**On-Chain Verification (Rust):**

```rust
// Required accounts
#[account(address = sysvar_instructions::ID)]
pub instructions_sysvar: AccountInfo<'info>,

// Verification CPI
pyth_lazer_solana_contract::cpi::verify_message(
    CpiContext::new(pyth_program, cpi_accounts),
    pyth_message,
    ed25519_instruction_index,  // 0 (Ed25519 ix must be first)
    signature_index,            // 0
)?;
```

**Transaction Structure:**

```
Transaction:
  [0] Ed25519 signature verification instruction (MUST be first)
  [1] create_epoch / advance_epoch instruction (contains pyth_message)
```

**Pyth Solana Message Format (CRITICAL):**

The `solana` format message has a specific byte layout. Getting this wrong causes authorization errors.

```
Bytes 0-3:     4-byte magic prefix (varies per message)
Bytes 4-67:    64-byte Ed25519 signature
Bytes 68-99:   32-byte Ed25519 public key
Bytes 100-101: 2-byte message size (u16 LE)
Bytes 102+:    Actual payload (price data)
```

**Common Mistake:** Assuming signature starts at byte 0. It doesn't - there's a 4-byte magic prefix first.

**Do NOT embed signature data in Ed25519 instruction:**

```typescript
// DON'T DO THIS - embeds data IN the instruction
const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
  publicKey: pubkeyBytes,
  message: payloadBytes,
  signature: signatureBytes,
})
// Error: Ed25519 error 0x2 (InvalidSignature)
```

Pyth's `verify_message` CPI expects the Ed25519 instruction to REFERENCE data in another instruction via offset pointers, not embed the data directly.

**Use the SDK helper instead:**

```typescript
import { createEd25519Instruction } from '@pythnetwork/pyth-lazer-solana-sdk'

// Build your instruction FIRST to know the data layout
const createEpochIx = await program.methods
  .createEpoch(new BN(epochId), pythMessage, 0, 0)
  .instruction()

// Calculate offset: 8 (discriminator) + 8 (epoch_id) + 4 (vec length) = 20
const pythMessageOffset = 20

// Create Ed25519 instruction that REFERENCES data in create_epoch instruction
// instructionIndex=1 because: [ed25519_ix, create_epoch_ix]
const ed25519Ix = createEd25519Instruction(pythMessage, 1, pythMessageOffset)

// ORDER MATTERS: Ed25519 first, then your instruction
const tx = new VersionedTransaction(
  new TransactionMessage({
    instructions: [ed25519Ix, createEpochIx],
  }).compileToV0Message()
)
```

**Integration Checklist:**

- [ ] Use `formats: ['solana']` (Ed25519), NOT `leEcdsa`
- [ ] Use FOGO-specific Pyth addresses (not Solana mainnet)
- [ ] Install `@pythnetwork/pyth-lazer-solana-sdk`
- [ ] Use `createEd25519Instruction()` helper from SDK
- [ ] Ed25519 instruction MUST be first in transaction (index 0)
- [ ] Include `instructions_sysvar` account in Rust
- [ ] Use `VerifyMessage` CPI (NOT `VerifyEcdsaMessage`)
- [ ] pythMessageOffset = 20 (8 discriminator + 8 epoch_id + 4 vec length)

**Validation Thresholds:**

| Check | Start Snapshot | Settlement Snapshot |
|-------|----------------|---------------------|
| Freshness | ≤ 3 seconds | ≤ 10 seconds |
| Confidence ratio | < 0.25% | < 0.8% (else reject settlement) |

**Detailed Integration Guide:** See `docs/pyth-lazer-ed25519-integration.md`

**Debugging Scripts:**
- `anchor/scripts/check-pyth-storage.ts` - Inspect FOGO Pyth storage account and registered signers
- `anchor/scripts/test-pyth-formats.ts` - Test both ECDSA and Ed25519 formats

### Error Handling Patterns

#### Transaction Errors

```typescript
// lib/transaction-handler.ts
async function executeTransaction(tx: Transaction) {
  try {
    const signature = await sendTransaction(tx);
    toast.success('Transaction submitted');

    await confirmTransaction(signature);
    toast.success('Transaction confirmed');

    return { success: true, signature };
  } catch (error) {
    if (error.message.includes('User rejected')) {
      toast.error('Transaction cancelled');
    } else if (error.message.includes('insufficient funds')) {
      toast.error('Insufficient funds');
    } else {
      toast.error('Transaction failed. Please try again.');
      console.error('Transaction error:', error);
    }
    return { success: false, error };
  }
}
```

#### RPC Resilience

```typescript
// lib/rpc-connection.ts
const RPC_ENDPOINTS = [
  'https://rpc.fogo.io',           // Primary
  'https://rpc-backup.fogo.io',    // Fallback
];

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  backoffMs = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(backoffMs * Math.pow(2, i));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| **Anchor Programs** | `anchor test` | Unit tests, integration tests, fuzzing |
| **Frontend Components** | Vitest + React Testing Library | Component rendering, interactions |
| **Hooks** | Vitest | State management, data fetching |
| **E2E (Growth)** | Playwright | Critical user flows |

**Critical Test Scenarios (from PRD):**
1. Settlement with pending LP withdrawals
2. Settlement when pool is heavily imbalanced
3. Refund scenario (exact tie)
4. User with positions in all 4 assets settling near-simultaneously
5. LP in one asset + trader in another (same user)

### Development Environment

**Target Environment: FOGO Testnet from Day One**

No local devnet. No mock oracles. All development and testing happens on FOGO testnet with real Pyth Lazer data.

| Tool | Environment | Purpose |
|------|-------------|---------|
| Anchor CLI | WSL | Build and deploy Rust programs |
| Solana CLI | WSL | Program deployment, account inspection |
| Node/npm | Windows | Frontend dev, TypeScript scripts |
| Pyth MCP Server | Windows | Look up price feed IDs, test oracle queries |
| FOGO Faucet | Browser | Get testnet tokens (`https://faucet.fogo.io/`) |

**Why WSL for Anchor:**
- Anchor CLI has Linux dependencies that don't work natively on Windows
- Build with `anchor build` in WSL
- Deploy with `solana program deploy` in WSL

**Why No Local Devnet:**
- Pyth Lazer requires real WebSocket connection to Pyth servers
- FOGO-specific Pyth addresses only exist on FOGO networks
- Testing on real network catches integration issues early
- Eliminates "works locally, fails on testnet" problems

**Development Workflow:**

1. Build program: `anchor build` (in WSL)
2. Deploy to FOGO testnet: `solana program deploy target/deploy/fogopulse.so` (in WSL)
3. Run scripts: `npx ts-node scripts/create-epoch.ts` (Windows or WSL)
4. Frontend dev: `pnpm dev` (Windows)

**FOGO Network Details:**

| Resource | Value |
|----------|-------|
| Testnet RPC | `https://testnet.fogo.io` |
| Faucet | `https://faucet.fogo.io/` |
| USDC Mint (Testnet) | `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy` |

**Key Reference Addresses (FOGO Testnet):**

| Account | Address |
|---------|---------|
| Program | `D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5` |
| GlobalConfig | TBD - created in Story 1.11 |

**Asset Mints (for PDA derivation):**

| Asset | Mint Address |
|-------|-------------|
| BTC | `4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY` |
| ETH | `8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE` |
| SOL | `CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP` |
| FOGO | `H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X` |

**Note:** Pool addresses will be derived fresh on new deployments using `[b"pool", asset_mint]` seeds.

**Reference Docs:**
- `docs/fogo-testnet-setup.md` - Network configuration
- `docs/fogo-testnet-dev-notes.md` - Development lessons learned

**Anchor Configuration Limitation:**

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

### Stack Overflow Prevention

Instructions with many accounts can exceed Solana's 4096 byte stack frame limit.

**Detection (Anchor build warning):**
```
Error: Function Buy::try_accounts Stack offset of 4856 exceeded max offset of 4096 by 760 bytes
```

**Runtime Error:**
```
Access violation in stack frame 5 at address 0x200005cf8 of size 8
```

This error occurs at very low compute units (e.g., 3168 CU), indicating failure during account deserialization, not instruction logic.

**Fix:** Wrap large `Account<>` types with `Box<>` to move from stack to heap:

```rust
// BEFORE (stack overflow)
pub user_usdc: Account<'info, TokenAccount>,
pub config: Account<'info, GlobalConfig>,
pub pool: Account<'info, Pool>,

// AFTER (fixed)
pub user_usdc: Box<Account<'info, TokenAccount>>,
pub config: Box<Account<'info, GlobalConfig>>,
pub pool: Box<Account<'info, Pool>>,
```

**When to Apply:**
- Instructions with 10+ accounts
- Accounts with large data structures
- Any time you see the stack offset warning during `anchor build`

### Decision Impact Analysis

**Implementation Sequence:**

Build order matters. Each layer depends on the previous.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FOUNDATION LAYER                            │
├─────────────────────────────────────────────────────────────────────┤
│  GlobalConfig (singleton)                                           │
│    └── initialize: admin, fees, caps, thresholds                    │
│                                                                     │
│  Pool (per asset)  [REQUIRES: GlobalConfig]                         │
│    └── create_pool: asset_mint, initial reserves                    │
│                                                                     │
│  Pyth Integration  [REQUIRES: FOGO testnet access]                  │
│    └── Ed25519 verification, price feeds                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          EPOCH LAYER                                │
├─────────────────────────────────────────────────────────────────────┤
│  create_epoch  [REQUIRES: Pool, Pyth]                               │
│    └── First epoch creation with oracle snapshot                    │
│                                                                     │
│  advance_epoch  [REQUIRES: Pool, Pyth, existing epoch]              │
│    └── Settle previous + create new (continuous operation)          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         TRADING LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  buy_position  [REQUIRES: Open epoch]                               │
│  sell_position [REQUIRES: Open epoch, existing position]            │
│  claim_payout  [REQUIRES: Settled epoch, winning position]          │
│  claim_refund  [REQUIRES: Refunded epoch, any position]             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           LP LAYER                                  │
├─────────────────────────────────────────────────────────────────────┤
│  deposit_lp    [REQUIRES: Pool]                                     │
│  withdraw_lp   [REQUIRES: Pool, LP shares, epoch settled/none]      │
└─────────────────────────────────────────────────────────────────────┘
```

**Critical Path:**

1. **GlobalConfig** → Must exist before any pool creation
2. **Pool** → Must exist before any epoch creation
3. **Epoch with start_price** → Must exist before any trading
4. **Pyth integration** → Required for epoch creation and settlement

**Common Mistake:** Attempting to build trading UI before pool/epoch infrastructure exists. Without `pool.active_epoch` pointing to a valid epoch with `start_price`, there's nothing to trade against.

**Suggested Implementation Order:**

| Phase | What | Why |
|-------|------|-----|
| 1 | Project setup (monorepo, Anchor, Next.js, shadcn) | Foundation |
| 2a | GlobalConfig account + initialize instruction | System-wide settings |
| 2b | Pool account + create_pool instruction | Per-asset pool structure |
| 2c | Deploy to FOGO testnet | Program exists on-chain |
| 2d | Initialize GlobalConfig on testnet | Config account exists |
| 2e | Create pools for each asset (BTC, ETH, SOL, FOGO) | Pool accounts exist |
| 3 | Pyth Lazer integration (Ed25519 verification) | Required for epochs |
| 4 | create_epoch instruction + deploy + test | First epoch with start_price |
| 5 | Basic frontend (wallet connect, pool display) | Can now show real data |
| 6 | buy/sell instructions + Trade Ticket UI | Core trading |
| 7 | advance_epoch instruction | Settlement + continuous epochs |
| 8 | claim_payout/claim_refund + Positions UI | Complete trading loop |
| 9 | LP deposit/withdraw + LP dashboard | Liquidity provision |
| 10 | Admin controls + pause/freeze | Operational safety |

**Phase 2 Detail (Foundation Must Be Complete Before Epochs):**

```
2a: Write GlobalConfig struct + initialize instruction
2b: Write Pool struct + create_pool instruction
2c: anchor build && solana program deploy (WSL)
2d: Run script: initialize_global_config.ts
2e: Run script: create_pool.ts for each asset
    └── Now you have: GlobalConfig + 4 Pool accounts on FOGO testnet
    └── Pool.active_epoch = None, Pool.next_epoch_id = 0
```

Only after Phase 2e completes can you create epochs.

**Cross-Component Dependencies:**

```
Pyth Hermes ──────┬──► Price Chart
                  │
                  └──► Confidence Indicator

Pyth Lazer (on-chain) ──► Settlement Logic ──► Refund/Payout

Zustand Store ◄──► Trade Ticket ◄──► Transaction Handler

TanStack Query ◄──► WebSocket/Polling ◄──► On-Chain Accounts
```

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 12 areas where AI agents could make different choices, addressed below.

### Naming Patterns

#### Anchor (Rust) Naming

**Account Names:** PascalCase, singular, descriptive

```rust
// GOOD
pub struct Pool { ... }
pub struct Epoch { ... }
pub struct UserPosition { ... }
pub struct GlobalConfig { ... }

// BAD
pub struct PoolAccount { ... }  // Redundant "Account"
pub struct user_position { ... } // snake_case
pub struct Positions { ... }     // Plural
```

**Instruction Names:** snake_case verbs

```rust
// GOOD
pub fn buy(ctx: Context<Buy>, amount: u64) -> Result<()>
pub fn sell(ctx: Context<Sell>, amount: u64) -> Result<()>
pub fn create_epoch(ctx: Context<CreateEpoch>) -> Result<()>
pub fn settle_epoch(ctx: Context<SettleEpoch>) -> Result<()>

// BAD
pub fn BuyPosition(...) // PascalCase
pub fn user_buy(...) // Redundant prefix
```

**Event Names:** PascalCase, past tense

```rust
// GOOD
#[event]
pub struct TradeExecuted { ... }
pub struct EpochSettled { ... }
pub struct LPDeposited { ... }

// BAD
pub struct trade_executed { ... } // snake_case
pub struct ExecuteTrade { ... }   // Present tense
```

**Error Enums:** PascalCase variants with descriptive messages

```rust
#[error_code]
pub enum FogoPulseError {
    #[msg("Epoch is not in Open state")]
    EpochNotOpen,
    #[msg("Trading window is frozen")]
    TradingFrozen,
    #[msg("Exceeds per-wallet cap")]
    ExceedsWalletCap,
    #[msg("Exceeds per-side exposure cap")]
    ExceedsSideCap,
    #[msg("Oracle price is stale")]
    OracleStale,
    #[msg("Confidence too low for settlement")]
    ConfidenceTooLow,
}
```

**Rust Enums:** PascalCase variants

```rust
pub enum EpochState {
    Open,
    Frozen,
    Settling,
    Settled,
    Refunded,
}

pub enum Direction {
    Up,
    Down,
}
```

#### TypeScript/Frontend Naming

**Files & Directories:** kebab-case for files

```
web/
├── components/
│   ├── trade-ticket.tsx       # kebab-case file
│   ├── epoch-countdown.tsx
│   └── ui/                    # shadcn components
│       ├── button.tsx
│       └── card.tsx
├── hooks/
│   ├── use-epoch.ts           # use- prefix for hooks
│   ├── use-pyth-price.ts
│   └── use-position.ts
├── stores/
│   ├── ui-store.ts            # -store suffix
│   └── trade-store.ts
├── lib/
│   ├── constants.ts
│   ├── utils.ts
│   └── program.ts
```

**Component Names:** PascalCase functions

```typescript
// GOOD
export function TradeTicket() { ... }
export function EpochCountdown() { ... }
export function ConfidenceIndicator() { ... }

// BAD
export function tradeTicket() { ... }  // camelCase
export function Trade_Ticket() { ... } // Snake_Case
```

**Hook Names:** camelCase with `use` prefix

```typescript
// GOOD
export function useEpoch(epochPda: PublicKey) { ... }
export function usePythPrice(feedId: string) { ... }
export function useUserPositions(wallet: PublicKey) { ... }

// BAD
export function getEpoch(...) { ... }     // Missing use prefix
export function UseEpoch(...) { ... }     // PascalCase
```

**Zustand Store Names:** camelCase with `use` prefix

```typescript
// GOOD
interface UIStore {
  activeAsset: Asset;
  theme: Theme;
}
export const useUIStore = create<UIStore>((set) => ({ ... }));

// BAD
export const UIStore = create(...);        // Missing use prefix
export const useUI = create(...);          // Missing Store indication
```

**TypeScript Types:** PascalCase, no `I` prefix

```typescript
// GOOD
type Asset = 'BTC' | 'ETH' | 'SOL' | 'FOGO';
type Direction = 'up' | 'down';
type EpochState = 'open' | 'frozen' | 'settling' | 'settled' | 'refunded';

interface Epoch {
  publicKey: PublicKey;
  startPrice: BN;
  endPrice: BN | null;
  state: EpochState;
}

// BAD
type asset = 'BTC' | 'ETH';        // lowercase
interface IEpoch { ... }           // Hungarian notation
```

**Constants:** SCREAMING_SNAKE_CASE

```typescript
// GOOD
export const TRADING_FEE_BPS = 180; // 1.8%
export const PER_WALLET_CAP_BPS = 500; // 5%
export const PER_SIDE_CAP_BPS = 3000; // 30%
export const FREEZE_WINDOW_SECONDS = 60;

export const PYTH_FEED_IDS = {
  BTC_USD: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH_USD: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
} as const;

// BAD
export const tradingFeeBps = 180;   // camelCase
```

### Structure Patterns

#### Test Organization

**Anchor Tests:** Co-located in `anchor/tests/`

```
anchor/
├── programs/
│   └── fogopulse/
│       └── src/
├── tests/
│   ├── fogopulse.ts           # Main test file
│   ├── buy-sell.test.ts       # Feature-specific tests
│   ├── settlement.test.ts
│   └── helpers/
│       └── setup.ts
```

**Frontend Tests:** Co-located with source files

```
web/
├── components/
│   ├── trade-ticket.tsx
│   └── trade-ticket.test.tsx  # Co-located test
├── hooks/
│   ├── use-epoch.ts
│   └── use-epoch.test.ts      # Co-located test
```

#### Import Organization

**Import Order (enforced by ESLint):**

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

### Format Patterns

#### API/RPC Response Handling

**On-chain account fetching:**

```typescript
// Pattern: Null-safe account fetching with type inference
async function fetchEpoch(
  connection: Connection,
  epochPda: PublicKey
): Promise<Epoch | null> {
  const accountInfo = await connection.getAccountInfo(epochPda);
  if (!accountInfo) return null;

  return program.coder.accounts.decode('Epoch', accountInfo.data);
}
```

**Error response structure:**

```typescript
// Pattern: Consistent error shape for transaction handlers
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
```

#### Date/Time Handling

**On-chain:** Unix timestamps (i64 seconds)

```rust
pub struct Epoch {
    pub start_time: i64,      // Unix timestamp
    pub end_time: i64,        // Unix timestamp
    pub freeze_time: i64,     // Unix timestamp
}
```

**Frontend:** Convert to JS Date for display

```typescript
// Pattern: Centralized timestamp conversion
function formatEpochTime(timestamp: BN): string {
  const date = new Date(timestamp.toNumber() * 1000);
  return date.toLocaleTimeString();
}
```

#### Browser-Compatible PDA Derivation

Node.js `Buffer` methods like `writeBigUInt64LE()` are not available in browser environments.

**DON'T DO THIS (fails in browser):**
```typescript
const epochIdBuffer = Buffer.alloc(8)
epochIdBuffer.writeBigUInt64LE(BigInt(epochId))
```

**DO THIS (browser-compatible):**
```typescript
// Manual byte conversion with Uint8Array
const epochIdBuffer = new Uint8Array(8)
let n = BigInt(epochId)
for (let i = 0; i < 8; i++) {
  epochIdBuffer[i] = Number(n & BigInt(0xff))
  n = n >> BigInt(8)
}
```

**Complete PDA derivation example:**
```typescript
export function deriveEpochPda(poolPda: PublicKey, epochId: number): [PublicKey, number] {
  const epochIdBuffer = new Uint8Array(8)
  let n = BigInt(epochId)
  for (let i = 0; i < 8; i++) {
    epochIdBuffer[i] = Number(n & BigInt(0xff))
    n = n >> BigInt(8)
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), poolPda.toBuffer(), epochIdBuffer],
    PROGRAM_ID
  )
}
```

**When this applies:** Any PDA derivation that includes numeric values (epoch IDs, timestamps, etc.) used in frontend code.

### Communication Patterns

#### Event Naming (Anchor)

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

#### State Update Patterns (Zustand)

**Immutable updates with Immer:**

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export const useUIStore = create<UIStore>()(
  immer((set) => ({
    activeAsset: 'BTC',
    tradeTicket: { direction: null, amount: 0 },

    setDirection: (direction) =>
      set((state) => {
        state.tradeTicket.direction = direction;
      }),

    resetTradeTicket: () =>
      set((state) => {
        state.tradeTicket = { direction: null, amount: 0 };
      }),
  }))
);
```

### Process Patterns

#### Loading State Naming

```typescript
// Pattern: Consistent loading state shape
interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

// TanStack Query provides this automatically
const { data, isLoading, isError, error } = useQuery(...);
```

#### Transaction Flow Pattern

```typescript
// Pattern: All transactions follow this flow
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

### Enforcement Guidelines

**All AI Agents MUST:**

1. Follow naming conventions exactly as documented above
2. Use co-located tests for frontend, `anchor/tests/` for programs
3. Use `Session::extract_user_from_signer_or_session` for all user-facing instructions
4. Emit Anchor events for all state-changing operations
5. Use SCREAMING_SNAKE_CASE for constants, PascalCase for types
6. Return `TransactionResult` shape from all transaction handlers
7. Use TanStack Query for on-chain data, Zustand for UI state only

**Pattern Enforcement:**

- ESLint + Prettier configured in starter template
- Clippy for Rust linting
- Pre-commit hooks validate naming and formatting
- PR reviews check pattern compliance

### Pattern Quick Reference

| Category | Pattern | Example |
|----------|---------|---------|
| Rust Account | PascalCase singular | `Pool`, `Epoch`, `UserPosition` |
| Rust Instruction | snake_case verb | `buy`, `settle_epoch` |
| Rust Event | PascalCase past | `TradeExecuted`, `EpochSettled` |
| Rust Enum | PascalCase variant | `EpochState::Open` |
| Rust Error | PascalCase descriptive | `EpochNotOpen`, `OracleStale` |
| TS File | kebab-case | `trade-ticket.tsx` |
| TS Component | PascalCase function | `TradeTicket` |
| TS Hook | use prefix | `useEpoch`, `usePythPrice` |
| TS Type | PascalCase no prefix | `Epoch`, not `IEpoch` |
| TS Constant | SCREAMING_SNAKE | `TRADING_FEE_BPS` |
| TS Store | use prefix + Store | `useUIStore` |

## Project Structure & Boundaries

### Complete Project Directory Structure

```
fogopulse/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Build + test on PR
│       └── deploy.yml                # Vercel deployment
├── .gitignore
├── .env.example
├── README.md
├── package.json                      # Root workspace config
├── pnpm-workspace.yaml
├── turbo.json                        # Optional: task caching
│
├── anchor/                           # ═══ ON-CHAIN PROGRAMS ═══
│   ├── Anchor.toml
│   ├── Cargo.toml
│   ├── programs/
│   │   └── fogopulse/
│   │       ├── Cargo.toml            # + fogo-sessions-sdk, pyth-lazer-sdk
│   │       └── src/
│   │           ├── lib.rs            # Program entry point
│   │           ├── state/
│   │           │   ├── mod.rs
│   │           │   ├── pool.rs       # Pool account
│   │           │   ├── epoch.rs      # Epoch account
│   │           │   ├── position.rs   # UserPosition account
│   │           │   ├── config.rs     # GlobalConfig account
│   │           │   └── lp.rs         # LP share account
│   │           ├── instructions/
│   │           │   ├── mod.rs
│   │           │   ├── initialize.rs # Initialize pool + config
│   │           │   ├── create_epoch.rs  # First epoch only
│   │           │   ├── advance_epoch.rs # Atomic settle + create
│   │           │   ├── buy.rs
│   │           │   ├── sell.rs
│   │           │   ├── claim.rs
│   │           │   ├── lp_deposit.rs
│   │           │   ├── lp_withdraw.rs
│   │           │   └── admin/
│   │           │       ├── mod.rs
│   │           │       ├── pause.rs
│   │           │       ├── update_config.rs
│   │           │       └── emergency_freeze.rs
│   │           ├── errors.rs         # FogoPulseError enum
│   │           ├── events.rs         # Anchor events
│   │           └── utils/
│   │               ├── mod.rs
│   │               ├── cpmm.rs       # AMM math
│   │               ├── oracle.rs     # Pyth Lazer helpers
│   │               └── caps.rs       # Cap calculation
│   └── tests/
│       ├── fogopulse.ts              # Main integration tests
│       ├── trading.test.ts           # Buy/sell tests
│       ├── settlement.test.ts        # Settlement + refund tests
│       ├── lp.test.ts                # LP deposit/withdraw tests
│       ├── caps.test.ts              # Cap enforcement tests
│       └── helpers/
│           ├── setup.ts              # Test setup utilities
│           └── mocks.ts              # Mock accounts/oracle
│
├── web/                              # ═══ NEXT.JS FRONTEND ═══
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts            # FOGO brand colors
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── components.json               # shadcn/ui config
│   ├── .env.local                    # Local env vars
│   ├── .env.example
│   │
│   ├── app/                          # App Router
│   │   ├── layout.tsx                # Root layout + providers
│   │   ├── page.tsx                  # Landing/redirect
│   │   ├── globals.css               # Tailwind + theme vars
│   │   ├── trade/
│   │   │   └── page.tsx              # Main trading terminal
│   │   ├── portfolio/
│   │   │   └── page.tsx              # Positions + history
│   │   ├── lp/
│   │   │   └── page.tsx              # LP dashboard
│   │   └── admin/
│   │       └── page.tsx              # Admin controls
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── header.tsx            # Nav + wallet button
│   │   │   ├── footer.tsx
│   │   │   └── sidebar.tsx           # Asset selector
│   │   ├── trading/
│   │   │   ├── price-chart.tsx       # Lightweight Charts
│   │   │   ├── trade-ticket.tsx      # Direction + amount input
│   │   │   ├── direction-button.tsx  # UP/DOWN buttons
│   │   │   ├── epoch-countdown.tsx   # Timer display
│   │   │   ├── probability-display.tsx
│   │   │   └── confidence-indicator.tsx
│   │   ├── positions/
│   │   │   ├── positions-table.tsx
│   │   │   ├── position-row.tsx
│   │   │   ├── claim-button.tsx
│   │   │   └── pnl-display.tsx
│   │   ├── lp/
│   │   │   ├── deposit-form.tsx
│   │   │   ├── withdraw-form.tsx
│   │   │   ├── lp-stats.tsx
│   │   │   └── pool-depth.tsx
│   │   ├── wallet/
│   │   │   ├── connect-button.tsx
│   │   │   └── wallet-info.tsx
│   │   └── shared/
│   │       ├── asset-selector.tsx
│   │       ├── amount-input.tsx
│   │       └── loading-spinner.tsx
│   │
│   ├── hooks/
│   │   ├── use-epoch.ts              # Current epoch data
│   │   ├── use-pool.ts               # Pool reserves
│   │   ├── use-positions.ts          # User positions
│   │   ├── use-pyth-price.ts         # Pyth Hermes WebSocket
│   │   ├── use-lp-shares.ts          # LP share data
│   │   ├── use-transaction.ts        # Transaction execution
│   │   └── use-epoch-subscription.ts # WebSocket subscription
│   │
│   ├── stores/
│   │   ├── ui-store.ts               # Theme, active asset, modals
│   │   └── trade-store.ts            # Trade ticket state
│   │
│   ├── lib/
│   │   ├── constants.ts              # Fee rates, caps, feed IDs
│   │   ├── utils.ts                  # Formatting, math helpers
│   │   ├── program.ts                # Anchor program instance
│   │   ├── pdas.ts                   # PDA derivation helpers
│   │   ├── rpc.ts                    # RPC connection + failover
│   │   └── transactions/
│   │       ├── buy.ts
│   │       ├── sell.ts
│   │       ├── claim.ts
│   │       ├── lp-deposit.ts
│   │       └── lp-withdraw.ts
│   │
│   ├── types/
│   │   ├── index.ts                  # Re-exports
│   │   ├── accounts.ts               # On-chain account types
│   │   ├── ui.ts                     # UI-specific types
│   │   └── api.ts                    # API response types
│   │
│   ├── providers/
│   │   ├── wallet-provider.tsx       # @solana/wallet-adapter
│   │   ├── query-provider.tsx        # TanStack Query
│   │   ├── theme-provider.tsx        # Dark/light mode
│   │   └── session-provider.tsx      # FOGO Sessions (Growth)
│   │
│   └── public/
│       ├── favicon.ico
│       └── assets/
│           ├── logo.svg
│           └── icons/
│
├── _bmad/                            # BMAD configs (gitignored)
├── _bmad-output/                     # Planning artifacts
│   └── planning-artifacts/
│       ├── prd.md
│       ├── ux-design-specification.md
│       └── architecture.md
├── docs/
│   └── idea.md
├── .claude/                          # Claude configs (gitignored)
├── .agents/                          # Agent configs (gitignored)
└── .gemini/                          # Gemini configs (gitignored)
```

### Architectural Boundaries

#### On-Chain Boundaries

| Boundary | Components | Communication |
|----------|------------|---------------|
| **Pool State** | `pool.rs`, `cpmm.rs` | Direct account reads/writes |
| **Epoch Lifecycle** | `epoch.rs`, `create_epoch.rs`, `settle_epoch.rs` | State machine transitions |
| **User Actions** | `buy.rs`, `sell.rs`, `claim.rs` | Via signed transactions |
| **LP Actions** | `lp_deposit.rs`, `lp_withdraw.rs` | Via signed transactions |
| **Oracle** | `oracle.rs`, Pyth Lazer accounts | CPI to Pyth program |
| **Admin** | `admin/*.rs` | Multisig required |

#### Frontend Boundaries

| Boundary | Location | Responsibility |
|----------|----------|----------------|
| **Pages** | `app/**/page.tsx` | Route handling, layout |
| **Components** | `components/` | UI rendering, user interaction |
| **Hooks** | `hooks/` | Data fetching, subscriptions |
| **Stores** | `stores/` | Client-only state |
| **Transactions** | `lib/transactions/` | Building + sending txs |
| **Types** | `types/` | Shared type definitions |

### Requirements to Structure Mapping

#### FR → File Mapping

| Requirement Category | Primary Files |
|---------------------|---------------|
| **Market Trading (FR1-FR14)** | `components/trading/*`, `hooks/use-epoch.ts`, `instructions/buy.rs`, `instructions/sell.rs` |
| **Position Management (FR15-FR20)** | `components/positions/*`, `hooks/use-positions.ts`, `instructions/claim.rs` |
| **Settlement & Transparency (FR21-FR27)** | `components/trading/confidence-indicator.tsx`, `instructions/settle_epoch.rs`, `utils/oracle.rs` |
| **Liquidity Provision (FR28-FR36)** | `components/lp/*`, `hooks/use-lp-shares.ts`, `instructions/lp_*.rs` |
| **Wallet Integration (FR37-FR40)** | `components/wallet/*`, `providers/wallet-provider.tsx` |
| **Admin & Operations (FR41-FR51)** | `app/admin/page.tsx`, `instructions/admin/*` |
| **System Automation (FR52-FR61)** | `instructions/create_epoch.rs`, `instructions/settle_epoch.rs` |

#### Cross-Cutting Concerns → Location

| Concern | Files |
|---------|-------|
| **Oracle Integration** | `utils/oracle.rs`, `hooks/use-pyth-price.ts`, `lib/constants.ts` |
| **FOGO Sessions** | `providers/session-provider.tsx`, all `instructions/*.rs` (dual-signature pattern) |
| **Error Handling** | `errors.rs`, `lib/transactions/*.ts`, `components/ui/toast.tsx` |
| **Theming** | `app/globals.css`, `tailwind.config.ts`, `providers/theme-provider.tsx` |
| **Cap Enforcement** | `utils/caps.rs`, `components/trading/trade-ticket.tsx` |

### Integration Points

#### Price Data Flow

```
Pyth Hermes (off-chain)
        │
        ▼
hooks/use-pyth-price.ts ──► components/trading/price-chart.tsx
        │                          │
        │                          ▼
        │                   components/trading/confidence-indicator.tsx
        │
        │    (same source)
        │
        ▼
Pyth Lazer (on-chain) ──► utils/oracle.rs ──► instructions/settle_epoch.rs
```

#### Transaction Flow

```
components/trading/trade-ticket.tsx
        │
        ▼ (user clicks)
hooks/use-transaction.ts
        │
        ▼ (build tx)
lib/transactions/buy.ts
        │
        ▼ (sign + send)
providers/wallet-provider.tsx ──► FOGO RPC
        │
        ▼ (on-chain)
programs/fogopulse/instructions/buy.rs
        │
        ▼ (emit event)
events.rs ──► TanStack Query invalidation ──► UI update
```

### File Organization Summary

#### Configuration Files

| File | Purpose |
|------|---------|
| `anchor/Anchor.toml` | Anchor workspace config, program IDs, RPC endpoints |
| `web/next.config.ts` | Next.js config, env vars, rewrites |
| `web/tailwind.config.ts` | FOGO brand colors, shadcn theme |
| `web/components.json` | shadcn/ui configuration |
| `.env.example` | Documented env vars template |

#### Source Organization

| Directory | Contents |
|-----------|----------|
| `anchor/programs/fogopulse/src/state/` | Account struct definitions |
| `anchor/programs/fogopulse/src/instructions/` | Instruction handlers |
| `anchor/programs/fogopulse/src/utils/` | Shared helpers (math, oracle, caps) |
| `web/components/` | React components by feature |
| `web/hooks/` | Custom React hooks |
| `web/lib/` | Non-React utilities |

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices work together without conflicts:
- Next.js (App Router) + shadcn/ui: Native support
- Anchor (Rust) + FOGO Sessions SDK: Designed for Anchor programs
- TanStack Query + Zustand: Complementary (server state vs client state)
- Pyth Hermes (frontend) + Pyth Lazer (on-chain): Same price source ensures consistency
- @solana/wallet-adapter + FOGO Sessions: Sessions layer on top of standard adapter
- Lightweight Charts + Tailwind CSS: Themeable, no conflicts

**Pattern Consistency:**
All implementation patterns align with chosen technologies:
- Rust naming conventions follow Anchor standards
- TypeScript naming follows React/Next.js conventions
- Hook patterns use standard React conventions
- Event naming uses Anchor event conventions
- Error handling integrates with TanStack Query patterns

**Structure Alignment:**
Project structure fully supports all architectural decisions:
- Monorepo structure with `anchor/` + `web/` + `pnpm-workspace.yaml`
- Feature-based component organization
- Co-located tests for frontend, centralized tests for Anchor
- Clear separation of concerns with defined boundaries

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**
All 61 functional requirements have architectural support:

| FR Category | Files | Coverage |
|-------------|-------|----------|
| Market Trading (FR1-FR14) | `instructions/buy.rs`, `sell.rs`, `components/trading/*` | ✅ Full |
| Position Management (FR15-FR20) | `state/position.rs`, `instructions/claim.rs`, `components/positions/*` | ✅ Full |
| Settlement & Transparency (FR21-FR27) | `instructions/settle_epoch.rs`, `utils/oracle.rs`, `confidence-indicator.tsx` | ✅ Full |
| Liquidity Provision (FR28-FR36) | `state/lp.rs`, `instructions/lp_*.rs`, `components/lp/*` | ✅ Full |
| Wallet Integration (FR37-FR40) | `providers/wallet-provider.tsx`, `components/wallet/*` | ✅ Full |
| Admin & Operations (FR41-FR51) | `instructions/admin/*`, `app/admin/page.tsx` | ✅ Full |
| System Automation (FR52-FR61) | `instructions/create_epoch.rs`, `settle_epoch.rs` | ✅ Full |

**Non-Functional Requirements Coverage:**
All 27 NFRs are architecturally addressed:
- Performance (NFR1-5): Hybrid WebSocket/polling, Pyth Hermes real-time, ~400ms FOGO finality
- Security (NFR6-12): On-chain funds, FOGO Sessions dual-signature, multisig admin
- Reliability (NFR13-18): RPC failover, oracle staleness handling, atomic transactions
- Scalability (NFR19-22): Per-asset pool isolation, stateless frontend
- Integration (NFR23-27): Pyth Lazer SDK, wallet adapter, FOGO testnet/mainnet config

### Implementation Readiness Validation ✅

**Decision Completeness:**
- ✅ Technology stack with versions documented
- ✅ On-chain state model (Anchor accounts) defined
- ✅ API patterns (RPC + on-chain instructions) specified
- ✅ Authentication (wallet-based + Sessions) covered
- ✅ Error handling patterns documented
- ✅ Testing strategy (Anchor + Vitest + Playwright) defined

**Structure Completeness:**
- ✅ All directories and files defined in complete tree
- ✅ File naming conventions documented
- ✅ Integration points mapped with flow diagrams
- ✅ Component boundaries clearly defined

**Pattern Completeness:**
- ✅ Naming conventions for Rust + TypeScript covered
- ✅ State management patterns (Zustand + TanStack Query) specified
- ✅ Transaction flow pattern with toast feedback documented
- ✅ All Anchor events listed with emit triggers

### Gap Analysis Results

**Critical Gaps:** None found

**Important Gaps (Address during implementation):**
1. **Keeper/Cron Service** - Epoch automation not fully specified
   - Mitigation: Manual trigger for MVP, add keeper service in Growth phase
2. **Testnet vs Mainnet RPC URLs** - Specific endpoints not documented
   - Mitigation: Use `.env` files, document during project initialization

**Nice-to-Have (Post-MVP):**
- Monitoring/Analytics (Dune dashboard, Sentry)
- Documentation site (Docusaurus)
- Mobile app (React Native)

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (High complexity, Full-stack Web3/DeFi)
- [x] Technical constraints identified (FOGO chain, Pyth Lazer, Sessions)
- [x] Cross-cutting concerns mapped (7 concerns identified)

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified (Anchor, Next.js, shadcn/ui, etc.)
- [x] Integration patterns defined (Pyth, wallet adapter, Sessions)
- [x] Performance considerations addressed (WebSocket, polling, caching)

**✅ Implementation Patterns**
- [x] Naming conventions established (Rust + TypeScript)
- [x] Structure patterns defined (file organization, imports)
- [x] Communication patterns specified (events, state updates)
- [x] Process patterns documented (error handling, transactions)

**✅ Project Structure**
- [x] Complete directory structure defined (~100 files mapped)
- [x] Component boundaries established (on-chain vs frontend)
- [x] Integration points mapped (price flow, transaction flow)
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
1. Consistent price source - Pyth Hermes for display, Pyth Lazer for settlement
2. FOGO Sessions from day one - No on-chain refactoring needed for Growth phase
3. Clear separation - Anchor programs vs Next.js frontend with defined boundaries
4. Comprehensive patterns - Naming, structure, and process patterns documented
5. Requirements traceability - FR/NFR → file mapping complete

**Areas for Future Enhancement:**
1. Keeper service for automated epoch management
2. Indexer integration (Helius/Shyft) for historical data
3. Mobile-responsive improvements
4. Analytics dashboard

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Use `Session::extract_user_from_signer_or_session` for all user-facing instructions
- Emit Anchor events for all state-changing operations
- Refer to this document for all architectural questions

**First Implementation Priority:**

```bash
# 1. Initialize project with create-solana-dapp
cd D:\dev\2026
pnpm create solana-dapp@latest fogopulse-temp
# Select: Next.js, counter template

# 2. Merge into existing fogopulse/ (preserving _bmad/, docs/, etc.)
xcopy /E /I fogopulse-temp\* fogopulse\
rm -rf fogopulse-temp

# 3. Add FOGO SDKs
cd fogopulse/anchor/programs/fogopulse
cargo add fogo-sessions-sdk@0.7.5
cargo add pyth-lazer-sdk

# 4. Swap DaisyUI → shadcn/ui
cd ../../web
pnpm remove daisyui
pnpm dlx shadcn@latest init

# 5. Update .gitignore
# Add: _bmad/, .agents/, .claude/, .gemini/

# 6. Configure FOGO theming in tailwind.config.ts
```

