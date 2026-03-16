---
title: "FOGO Pulse - Product Requirements Document"
version: "2.0"
status: "Complete"
author: "theRoad"
date: "2026-03-11"
classification:
  projectType: "blockchain_web3"
  domain: "fintech"
  complexity: "high"
  projectContext: "greenfield"
changelog:
  - version: "2.0"
    date: "2026-03-11"
    changes:
      - "FOGO chain identity clarified (not Solana)"
      - "Pool struct: added next_epoch_id, active_epoch, active_epoch_state, is_paused"
      - "Epoch lifecycle: advance_epoch instruction (settles + creates atomically)"
      - "Pyth Lazer: Ed25519 requirement, FOGO addresses, integration checklist"
      - "Development environment: WSL for Anchor, Windows for rest"
      - "Implementation dependencies: build order diagram"
      - "Hedging toggle: allow_hedging in GlobalConfig"
      - "Reference docs linked"
---

# Product Requirements Document - FOGO Pulse

**Version:** 2.0
**Status:** Complete
**Author:** theRoad
**Date:** 2026-03-11

---

## Executive Summary

FOGO Pulse is a short-duration binary prediction market built on FOGO chain, enabling users to trade the directional movement of crypto assets over configurable time windows (1, 5, or 15 minutes). Users take UP or DOWN positions on price direction, with continuous trading and early exit enabled by a constant-product AMM (CPMM). Settlement uses Pyth Lazer oracles with confidence-aware resolution - settlement uses BPS-based confidence thresholds to reject untrustworthy oracle data; exact price ties result in refunds.

**Target users:** Retail crypto traders seeking fast trading loops, DeFi-native users comfortable with AMM mechanics, and early FOGO ecosystem participants.

**Problem solved:** Existing short-duration prediction markets either lack trust infrastructure (settling on potentially manipulated or uncertain price data) or don't exist in emerging ecosystems like FOGO. Users want fast directional trades but need confidence the settlement is fair.

**Chain:** FOGO chain exclusively. This is NOT a Solana application - FOGO is an SVM-compatible chain with its own network, addresses, tokens, and Pyth oracle deployment. Development targets FOGO testnet from day one with no local devnet or Solana fallback.

### What Makes This Special

**Trust-first settlement:** The confidence-gated settlement mechanism ensures oracle data quality before determining outcomes - we reject untrustworthy oracle data rather than resolving on it. In a space where prediction markets have reputation problems, this signals credibility.

**Informed trading, not blind betting:** The product surfaces enough context (price, probability, pool depth, confidence indicators) for users to make actual trading decisions rather than gambling.

**First-mover on FOGO:** No comparable product exists on FOGO chain. Combined with Pyth Lazer's low-latency oracle infrastructure, this creates a strategic position in an emerging ecosystem.

**Configurable duration:** Architecture supports 1/5/15 minute epochs from day one, with 5-minute markets as the launch default.

## Project Classification

| Attribute | Value |
|-----------|-------|
| **Project Type** | Web3/DeFi Application (Web App + On-chain Programs) |
| **Domain** | Fintech / DeFi Trading |
| **Complexity** | High |
| **Project Context** | Greenfield |
| **Chain** | FOGO (SVM-compatible, NOT Solana) |
| **Development Network** | FOGO Testnet only (no local devnet) |
| **Oracle** | Pyth Lazer (Ed25519 format, FOGO-specific addresses) |
| **MVP Assets** | BTC/USD, ETH/USD, SOL/USD, FOGO/USD |

## Success Criteria

### User Success

Users experience fast, fair, and transparent trading:
- **Fast:** Trade execution completes within seconds of user action
- **Fair:** Settlement matches observable price data with no disputes or "mystery" outcomes
- **Transparent:** Users can verify start price, end price, confidence values, and settlement logic for every epoch they participate in

Success indicator: Users return after experiencing a refund (demonstrates trust in fairness).

### Business Success

| Timeframe | Target |
|-----------|--------|
| Month 1-2 | Prove mechanics - system runs stable, initial users onboarded |
| Month 3-4 | Build volume, iterate on UX based on user feedback |
| Month 6 | $1,000 daily trading volume |

Secondary metrics:
- 30+ unique traders (engagement breadth)
- Retention: traders returning within 24h and 7d (engagement depth)

### Technical Success

Deterministic correctness: if inputs are valid, outputs are correct.
- Zero logic errors in settlement
- All failures traceable to oracle issues and handled via refund
- No exploit incidents
- Refund rate < 5% (indicates oracle/threshold tuning is correct)

### Measurable Outcomes

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Daily volume | $1,000 by month 6 | Core business viability signal |
| Unique traders | 30+ | Proves product-market fit beyond a few power users |
| Refund rate | < 5% | Confidence thresholds are correctly tuned |
| Invalid settlements | 0 | System correctness |
| Exploits | 0 | Security integrity |
| Return rate post-refund | > 50% | Trust signal - users believe system is fair |

## Product Scope

### Phase 1: MVP (Testnet)

**Core Capabilities:**
- 4 asset markets: BTC/USD, ETH/USD, SOL/USD, FOGO/USD
- 5-minute epochs (architecture supports 1/15 min, not implemented yet)
- CPMM binary AMM with continuous trading and early exit
- Pyth Lazer oracle with confidence-aware settlement
- Public LP support (single-token USDC, auto 50/50 split, auto-compounding)
- Persistent master pool per asset (no per-epoch isolation)
- ~15 second freeze window before settlement
- Per-wallet (5%) and per-side (30%) exposure caps
- Basic web UI: market view, trade ticket, positions, history, LP section
- Standard wallet adapter (Phantom, Nightly)
- On-chain programs built FOGO Sessions-ready
- LP withdrawal: request anytime, settled after epoch + 60s cooldown

### Phase 2: MVP (Mainnet)

- Single asset initially (BTC/USD)
- Same core mechanics as testnet
- Tightened risk parameters based on testnet learnings
- Geo-blocking enabled (US at minimum)
- Expand to additional assets once stability proven

### Phase 3: Growth

- 1-minute and 15-minute epoch options
- FOGO Sessions integration (gasless trading)
- Transferable LP tokens
- LP incentive programs
- Range markets (price within band)

### Phase 4: Vision

- Leverage / margin / liquidations
- Orderbook / CLOB hybrid
- Tokenized transferable outcome tokens
- Volatility markets ("move > X% in 5m")
- LMSR pricing model option

## User Journeys

### Journey 1: First-Time Trader (Marcus)

Marcus is a DeFi-native trader active in the FOGO ecosystem. He sees an announcement about FOGO Pulse - a new 5-minute prediction market. He's skeptical but curious.

**Opening Scene:** Marcus clicks through from the FOGO ecosystem announcement. Lands on FOGO Pulse. First thing he sees: live chart, current epoch countdown, probability display. No signup wall - just "Connect Wallet."

**Rising Action:** He connects his wallet. Watches one epoch play out without trading - sees the settlement happen, sees the prices recorded. He picks BTC/USD, sees pYES at 0.52 (slight UP bias), checks the pool depth, looks at the live chart. Decides to take a small UP position.

**Climax:** Epoch settles. He won. The UI shows exactly what happened: start price, end price, confidence values, his payout. Everything matches what he observed.

**Resolution:** Marcus trades again. He's hooked - not because he's winning, but because the loop is fast, the information is clear, and he trusts the settlement.

### Journey 2: Refund Experience (Marcus continued)

Marcus has been trading for a few days. An epoch he's in gets refunded due to an exact price tie.

**Opening Scene:** Marcus is in a position, watching the countdown. Epoch freezes, settles... but instead of WIN/LOSE, he sees "REFUNDED - Exact Tie."

**Rising Action:** He clicks "Why?" and sees the explanation: start price, end price, start price, end price, confidence values. The system explains: "The settlement price exactly matched the start price - we refunded since there's no clear winner."

**Climax:** His principal is back in his wallet. Fees were still taken (he knew this from the rules).

**Resolution:** Marcus thinks "that's fair." He trades the next epoch. This is the trust moment - he stays *because* of the refund experience, not despite it.

### Journey 3: Admin/Operator (Internal)

The protocol operator needs to manage the system - pause epochs if something goes wrong, tune thresholds, monitor health.

**Opening Scene:** Operator logs into admin dashboard. Sees: active epochs across 4 assets, volume, refund rates, oracle health status.

**Rising Action:** Refund rate on FOGO/USD is spiking (oracle confidence issues). Operator checks oracle health metrics, sees Pyth Lazer confidence is volatile for FOGO.

**Climax:** Operator pauses new epoch creation for FOGO/USD. Existing epochs continue to settlement. Users see "FOGO/USD temporarily paused - will resume when oracle stabilizes."

**Resolution:** Oracle stabilizes, operator resumes. No user funds were at risk. System worked as designed.

### Journey 4: Multi-Asset Trader (Priya)

Priya is an experienced crypto trader who trades across multiple assets based on her read of the market.

**Opening Scene:** Priya opens the app. Checks all 4 markets quickly - BTC, ETH, SOL, FOGO. Sees BTC is in a tight range (boring), but SOL just spiked and she thinks there's a reversal coming.

**Rising Action:** She takes a DOWN position on SOL/USD for the current epoch. While waiting, she notices ETH looks interesting too - takes an UP position on ETH for the next epoch starting in 2 minutes.

**Climax:** SOL epoch settles - she was right, DOWN wins. ETH epoch is still running.

**Resolution:** Priya checks her positions view - sees realized PnL from SOL, open position on ETH. She's managing a small portfolio of short-duration directional bets across assets.

### Journey 5: Liquidity Provider (Derek)

Derek is a DeFi yield farmer looking for new opportunities on FOGO. He's got USDC sitting idle and wants exposure to trading fees without actively trading.

**Opening Scene:** Derek discovers FOGO Pulse through the ecosystem. He sees LPs earn 70% of the 1.8% trading fee, auto-compounded.

**Rising Action:** Derek connects his wallet, navigates to the LP section. He sees current pool TVL, estimated APY based on recent volume, and the risk disclosure: "LP funds are exposed to directional imbalance - if traders consistently win, LP value decreases." He deposits 100 USDC. The system auto-splits 50/50 into YES/NO reserves and mints him LP shares.

**Climax:** Over the next week, Derek watches his LP position. Trading volume is decent. His share value has grown slightly from accumulated fees. One day, traders heavily bet UP and win - his position takes a small hit. But net over time, fees outpace losses.

**Resolution:** Derek decides to withdraw. He requests withdrawal during an active epoch. The system shows: "Withdrawal pending - will process after current epoch settles + 60s cooldown." Settlement happens, cooldown passes, his USDC is released. Clean exit.

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---------|----------------------|
| First-Time Trader | Wallet connect, live chart, market view, probability display, pool depth indicator, trade ticket, settlement transparency |
| Refund Experience | Refund explanation UI, confidence visualization, "Why?" detail view, clear status messaging |
| Admin/Operator | Admin dashboard, epoch controls (pause/resume), oracle health monitoring, threshold configuration, volume/refund metrics |
| Multi-Asset Trader | Multi-market view, quick asset switching, positions across assets, realized/unrealized PnL tracking |
| Liquidity Provider | LP deposit UI, USDC single-token deposit, pool TVL display, estimated APY, LP share tracking, withdrawal request flow, pending withdrawal status, cooldown timer, risk disclosure |

## Domain-Specific Requirements

### Regulatory & Compliance

**Testnet:**
- No geographic restrictions
- No KYC/AML requirements
- Experimental product status

**Mainnet:**
- Basic geo-blocking for restricted jurisdictions (US at minimum)
- No formal legal opinion planned for MVP (known risk)
- Monitor regulatory developments; adjust as needed

### Smart Contract Security

**No formal audit planned (budget constraint).** Mitigations:
- Thorough internal code review
- Comprehensive test coverage (unit, integration, fuzzing)
- Peer/community review before mainnet
- Consider bug bounty program (pay-on-discovery model)
- Keep mainnet liquidity minimal until confidence builds
- Incremental rollout: single asset first, expand with stability

### Treasury & Insurance Controls

| Account | Control | Actions Requiring Approval |
|---------|---------|---------------------------|
| Treasury (20% fees) | Multisig (TBD: 2-of-3 or 3-of-5) | Withdrawals, parameter changes |
| Insurance Buffer (10% fees) | Multisig | Payouts, emergency use |
| Protocol Admin | Multisig | Threshold tuning, fee changes, pause/resume |

### Emergency Controls

**Pause Capability:**
- Stops new epoch creation
- Existing epochs continue to settlement
- Triggered by: Admin (single key for speed, or multisig for mainnet)
- Use case: Oracle issues, suspected exploit, system instability

**Freeze Capability (Nuclear Option):**
- Halts all activity including settlements
- Funds locked until resolution
- Triggered by: Multisig only
- Use case: Confirmed exploit, critical vulnerability

**Recovery Process:**
- Assess situation and root cause
- Determine if funds are safe
- Either resume normal operation or initiate emergency withdrawal
- Post-mortem and fix before resuming

### Risk Mitigations Summary

| Risk | Mitigation |
|------|------------|
| Oracle manipulation | BPS-based confidence gate rejects untrustworthy oracle data |
| MEV/last-second sniping | ~15 second freeze window |
| Whale dominance | Per-wallet caps (5% of pool) |
| One-sided exposure | Per-side caps (30% of pool) |
| Smart contract exploit | Code review, testing, minimal initial liquidity, pause/freeze controls |
| Regulatory action | Geo-blocking, minimal mainnet exposure initially |

## Web3/Blockchain Technical Requirements

### Chain & Network

**CRITICAL: This is a FOGO application, not Solana.**

FOGO is an SVM-compatible chain - it runs Solana programs but has its own network, addresses, and ecosystem. Do NOT use Solana mainnet/devnet addresses, RPCs, or token mints.

| Environment | Network | RPC Endpoint |
|-------------|---------|--------------|
| Development | FOGO Testnet | `https://testnet.fogo.io` |
| Production | FOGO Mainnet | `https://rpc.fogo.io` (TBD) |

**FOGO Network Details:**
| Resource | Value |
|----------|-------|
| Testnet RPC | `https://testnet.fogo.io` |
| Faucet | `https://faucet.fogo.io/` |
| USDC Mint (Testnet) | `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy` |

**FOGO Characteristics:**
- SVM-compatible (runs Solana/Anchor programs unchanged)
- Anchor framework for program development
- Pyth Lazer oracle with FOGO-specific deployment (different addresses than Solana)
- Solana wallet adapters work but connect to FOGO RPC

**Development Constraint:** No local devnet. All development and testing targets FOGO testnet directly with real Pyth Lazer oracle data.

### Wallet Integration

**MVP Implementation:**
- Standard Solana wallet adapter (`@solana/wallet-adapter`) - works with FOGO
- Wallets connect to FOGO RPC, not Solana networks
- Supported wallets: Phantom, Backpack, Nightly, other Solana-compatible wallets
- Browser extension wallets only (MVP)
- Frontend must configure wallet adapter with FOGO testnet endpoint

**Architecture for Future FOGO Sessions:**
- On-chain programs built with `fogo-sessions-sdk` crate from day one
- Use `Session::extract_user_from_signer_or_session` pattern in all user-facing instructions
- Programs accept both regular wallet signatures AND session key signatures
- Frontend can switch to FOGO Sessions without on-chain changes

**Growth (FOGO Sessions Integration):**
- Frontend: `@fogo/sessions-sdk-react`
- `<FogoSessionProvider />`, `<SessionButton />`, `useSession().sendTransaction()`
- Register domain with FOGO paymaster
- Configure program IDs and paymaster filters
- Result: gasless trading for users

### Smart Contract Architecture

**Programs (Anchor-based):**

| Program | Responsibility |
|---------|----------------|
| Market Coordinator | Creates epochs, enforces lifecycle, stores global config |
| Pool Program | Manages persistent liquidity pool per asset, handles LP deposits/withdrawals |
| Trading Program | Executes buy/sell swaps, enforces caps, handles positions |
| Settlement Program | Oracle integration, settlement logic, payout distribution |
| Treasury/Insurance | Fee collection, insurance buffer management |

**Key Accounts:**
- Pool accounts (per asset): YES/NO reserves, LP share tracking
- Epoch accounts: start snapshot, state, positions
- Config account: fees, caps, thresholds (admin-controlled)
- Treasury/Insurance PDAs

### On-Chain Account Model

Core account structures for on-chain state. See `docs/on-chain-architecture.md` for complete details including PDA seeds and size calculations.

**GlobalConfig (Singleton)**
System-wide parameters controlled by admin.

| Field | Type | Description |
|-------|------|-------------|
| admin | Pubkey | Admin authority (multisig on mainnet) |
| treasury | Pubkey | Treasury account for fee collection |
| insurance | Pubkey | Insurance buffer account |
| trading_fee_bps | u16 | Trading fee (180 = 1.8%) |
| lp_fee_share_bps | u16 | LP share of fees (7000 = 70%) |
| per_wallet_cap_bps | u16 | Max position per wallet (500 = 5%) |
| per_side_cap_bps | u16 | Max exposure per side (3000 = 30%) |
| epoch_duration_seconds | i64 | Epoch length (300 = 5 min) |
| freeze_window_seconds | i64 | No-trade window before settlement (15) |
| allow_hedging | bool | If true, users can hold both UP and DOWN positions (default: false) |
| paused | bool | Pause new epoch creation |
| frozen | bool | Emergency freeze all activity |

**Pool (Per Asset)**
One pool per tradable asset. Persistent across epochs.

| Field | Type | Description |
|-------|------|-------------|
| asset_mint | Pubkey | Asset this pool tracks (e.g., BTC mint) |
| yes_reserves | u64 | YES token reserves |
| no_reserves | u64 | NO token reserves |
| total_lp_shares | u64 | Total LP shares issued |
| next_epoch_id | u64 | Counter for next epoch creation (starts at 0) |
| active_epoch | Option<Pubkey> | Current active epoch PDA, or None if no active epoch |
| active_epoch_state | u8 | Cached state: 0=None, 1=Open, 2=Frozen |
| is_paused | bool | Pool-level pause - blocks all trading in this pool |
| is_frozen | bool | Pool-level freeze - blocks everything including settlement |

**Pause/Freeze Hierarchy:**

| Level | Field | Effect |
|-------|-------|--------|
| Global | `GlobalConfig.paused` | Blocks all trading across all pools |
| Global | `GlobalConfig.frozen` | Nuclear option - halts ALL activity |
| Pool | `Pool.is_paused` | Blocks trading in this specific pool |
| Pool | `Pool.is_frozen` | Halts this specific pool completely |

**Check before any trade:**
```rust
if global_config.paused || global_config.frozen || pool.is_paused || pool.is_frozen {
    return Err(TradingPaused);
}
```

**Why this design:**
- **One fetch to check status:** Read pool to know if epoch is active and what state it's in
- **No account scanning:** `active_epoch` points directly to the current epoch
- **Efficient epoch creation:** `next_epoch_id` provides the ID atomically
- **Duplicate prevention:** PDA seeds include epoch_id - same pool + epoch_id = same address (fails if exists)
- **Granular control:** Pause one pool (e.g., FOGO/USD oracle issues) without affecting others

**Epoch (Per Pool, Per Time Period)**
Time-bounded trading periods within a pool.

| Field | Type | Description |
|-------|------|-------------|
| pool | Pubkey | Parent pool reference |
| epoch_id | u64 | Sequential identifier within pool |
| state | EpochState | Open, Frozen, Settling, Settled, Refunded |
| start_time | i64 | Unix timestamp epoch begins |
| end_time | i64 | Unix timestamp epoch ends |
| freeze_time | i64 | When trading stops (end_time - freeze_window) |
| start_price | u64 | Oracle price at epoch creation |
| start_confidence | u64 | Oracle confidence at epoch creation |
| settlement_price | Option<u64> | Oracle price at settlement |
| settlement_confidence | Option<u64> | Oracle confidence at settlement |
| outcome | Option<Outcome> | Up, Down, or Refunded |

**UserPosition (Per User, Per Epoch)**
Tracks user's position within a specific epoch.

| Field | Type | Description |
|-------|------|-------------|
| user | Pubkey | Wallet address |
| epoch | Pubkey | Reference to epoch |
| direction | Direction | Up or Down |
| amount | u64 | Position size in USDC |
| shares | u64 | Shares received from CPMM |
| claimed | bool | Payout claimed? |

**Hedging Behavior:**

| `allow_hedging` | Behavior |
|-----------------|----------|
| `false` (default) | User can only hold ONE direction per epoch. Second position in opposite direction fails. |
| `true` | User can hold both UP and DOWN positions in same epoch. |

**MVP:** Hedging disabled (`allow_hedging = false`). This simplifies position tracking and prevents wash trading. Can be enabled via admin config change if needed in future.

**PDA (Program Derived Address) Derivation Seeds:**

PDAs are deterministic account addresses computed from seeds. Given the same seeds, you always get the same address. This eliminates the need for on-chain mappings.

```
GlobalConfig: ["global_config"]
Pool:         ["pool", asset_mint]
Epoch:        ["epoch", pool, epoch_id.to_le_bytes()]
UserPosition: ["position", epoch, user]
```

### Epoch Lifecycle

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

**State Machine:**

```
┌─────────┐   freeze_time    ┌─────────┐   end_time + advance_epoch   ┌──────────┐
│  Open   │ ────────────────▶│ Frozen  │ ───────────────────────────▶│ Settled  │
└─────────┘  (auto by time)  └─────────┘                              └──────────┘
     ▲                                                                      │
     │                            (advance_epoch creates new epoch)         │
     └──────────────────────────────────────────────────────────────────────┘
```

**Settlement Outcomes (determined by Pyth confidence):**

| Condition | Outcome |
|-----------|---------|
| Confidence OK + settlement_price > start_price | UP wins |
| Confidence OK + settlement_price < start_price | DOWN wins |
| Confidence OK + settlement_price = start_price | Refund (tie) |

**State Definitions:**

| State | Value | Description | Trading Allowed |
|-------|-------|-------------|-----------------|
| None | 0 | No active epoch (waiting for `advance_epoch` or first `create_epoch`) | No |
| Open | 1 | Active trading period | Yes |
| Frozen | 2 | Freeze window - no trading (~15 sec before end) | No |

**Epoch account also stores final state:**

| Epoch State | Description |
|-------------|-------------|
| Settled (UP) | UP won - UP position holders can claim |
| Settled (DOWN) | DOWN won - DOWN position holders can claim |
| Refunded | All positions refunded (oracle uncertain or tie) |

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

### Gas Optimization

**MVP Approach:** Keep it reasonable, optimize later based on usage patterns

**Considerations:**
- Minimize account creation (reuse where possible)
- Batch operations where feasible (e.g., settlement + payout)
- Compute unit optimization if hitting limits
- LP auto-compounding avoids claim transaction costs

### Technical Risk Assessment

| Risk Area | Level | Mitigation |
|-----------|-------|------------|
| Pyth Lazer integration | Medium | Lazer examples available, well-documented confidence handling |
| Settlement state machine | Medium | Atomic transactions, clear state transitions, thorough testing |
| Persistent pool + settlements | Low-Medium | Post-settlement withdrawals only, per-side caps, atomic updates |
| Multi-asset concurrency | Low | Pools fully isolated, no shared state |
| CPMM math | Low | Standard Uniswap V2 pattern, well-understood |

### Critical Test Scenarios

1. Settlement with pending LP withdrawals
2. Settlement when pool is heavily imbalanced
3. Refund scenario (exact tie)
4. User with positions in all 4 assets settling near-simultaneously
5. LP in one asset + trader in another (same user)

### Development Environment

**Target Environment: FOGO Testnet from Day One**

No local devnet. No mock oracles. All development and testing happens on FOGO testnet with real Pyth Lazer data.

| Requirement | Details |
|-------------|---------|
| **Chain** | FOGO Testnet (`https://testnet.fogo.io`) |
| **Oracle** | Real Pyth Lazer (no mocks) |
| **Anchor CLI** | WSL only (for Anchor builds and deploys) |
| **Other Tools** | Windows (Node, npm, frontend, scripts) |
| **Wallet** | FOGO testnet wallet with faucet tokens |

**Required Tools:**

| Tool | Environment | Purpose |
|------|-------------|---------|
| Anchor CLI | WSL | Build and deploy Rust programs |
| Solana CLI | WSL | Program deployment, account inspection |
| Node/npm | Windows | Frontend dev, TypeScript scripts |
| Pyth MCP Server | Windows | Look up price feed IDs, test oracle queries |
| FOGO Faucet | Browser | Get testnet tokens (`https://faucet.fogo.io/`) |

**Why No Local Devnet:**
- Pyth Lazer requires real WebSocket connection to Pyth servers
- FOGO-specific Pyth addresses only exist on FOGO networks
- Testing on real network catches integration issues early
- Eliminates "works locally, fails on testnet" problems

**Development Workflow:**

1. Build program locally: `anchor build` (in WSL)
2. Deploy to FOGO testnet: `solana program deploy target/deploy/fogopulse.so`
3. Run scripts against FOGO: `npx ts-node scripts/create-epoch.ts`
4. Test frontend against FOGO testnet RPC

**Reference Docs:**
- `docs/fogo-testnet-setup.md` - Network configuration
- `docs/fogo-testnet-dev-notes.md` - Development lessons learned

### Implementation Dependencies

**Build Order Matters.** Pool and epoch infrastructure must exist before any trading functionality works.

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

## Functional Requirements

### Market Trading

- **FR1:** Trader can view current epoch status for any asset (BTC/USD, ETH/USD, SOL/USD, FOGO/USD)
- **FR2:** Trader can view live price chart for selected asset
- **FR3:** Trader can view current probability (pYES/pNO) for active epoch
- **FR4:** Trader can view pool depth and liquidity for active epoch
- **FR5:** Trader can view epoch countdown timer
- **FR6:** Trader can take UP (YES) position on price direction
- **FR7:** Trader can take DOWN (NO) position on price direction
- **FR8:** Trader can view expected execution price before trade
- **FR9:** Trader can view estimated probability impact before trade
- **FR10:** Trader can view fee amount before trade
- **FR11:** Trader can view worst-case slippage before trade
- **FR12:** Trader can exit position early during trading window (sell back to pool)
- **FR13:** Trader can view cap warnings when approaching per-wallet or per-side limits
- **FR14:** Trader can switch between asset markets

### Position Management

- **FR15:** Trader can view open positions in current epoch(s)
- **FR16:** Trader can view positions across multiple assets simultaneously
- **FR17:** Trader can view realized PnL from settled trades
- **FR18:** Trader can view unrealized PnL for open positions
- **FR19:** Trader can claim payouts after epoch settlement
- **FR20:** Trader can view refund status when epoch is refunded

### Settlement & Transparency

- **FR21:** Trader can view start price and publish time for any epoch
- **FR22:** Trader can view settlement price and publish time after epoch closes
- **FR23:** Trader can view confidence values for start and end snapshots
- **FR24:** Trader can view settlement outcome (UP won / DOWN won / Refunded)
- **FR25:** Trader can view detailed refund explanation when an exact tie occurs
- **FR26:** Trader can view confidence band visualization for refund scenarios
- **FR27:** Trader can view epoch history with outcomes

### Liquidity Provision

- **FR28:** LP can view pool TVL for each asset
- **FR29:** LP can view estimated APY based on recent volume
- **FR30:** LP can view risk disclosure before depositing
- **FR31:** LP can deposit USDC into pool (single-token, auto 50/50 split)
- **FR32:** LP can view their LP share and current value
- **FR33:** LP can request withdrawal at any time
- **FR34:** LP can view pending withdrawal status
- **FR35:** LP can view cooldown timer for pending withdrawal
- **FR36:** LP can receive withdrawal payout after epoch settlement + cooldown

### Wallet Integration

- **FR37:** User can connect Solana-compatible wallet (Phantom, Nightly, etc.)
- **FR38:** User can disconnect wallet
- **FR39:** User can view connected wallet address
- **FR40:** User can sign transactions for trades, LP deposits, and withdrawals

### Admin & Operations

- **FR41:** Admin can view active epochs across all assets
- **FR42:** Admin can view trading volume metrics per asset
- **FR43:** Admin can view refund rate metrics per asset
- **FR44:** Admin can view oracle health status per asset
- **FR45:** Admin can pause new epoch creation for specific asset
- **FR46:** Admin can resume epoch creation for paused asset
- **FR47:** Admin can configure fee percentage
- **FR48:** Admin can configure per-wallet cap percentage
- **FR49:** Admin can configure per-side exposure cap percentage
- **FR50:** Admin can configure oracle confidence thresholds
- **FR51:** Admin can trigger emergency freeze (halt all activity)

### System Capabilities

- **FR52:** System creates new epoch automatically when previous epoch enters freeze window
- **FR53:** System captures start price snapshot with confidence at epoch creation
- **FR54:** System enforces freeze window (no trading in final ~15 seconds)
- **FR55:** System captures settlement price snapshot with confidence at epoch end
- **FR56:** System determines outcome using confidence-aware resolution
- **FR57:** System processes refund when settlement price exactly equals start price
- **FR58:** System enforces per-wallet position caps
- **FR59:** System enforces per-side exposure caps
- **FR60:** System distributes fees (70% LP, 20% treasury, 10% insurance)
- **FR61:** System processes pending LP withdrawals after settlement + cooldown

## Non-Functional Requirements

### Performance

- **NFR1:** Trade transactions confirm within FOGO chain block finality (~400ms)
- **NFR2:** UI updates pool state and probabilities within 1 second of on-chain change
- **NFR3:** Settlement executes within same block as valid oracle price availability
- **NFR4:** Price chart updates in real-time (WebSocket or polling ≤1 second)
- **NFR5:** Epoch countdown accurate to ±1 second

### Security

- **NFR6:** All user funds held in on-chain program accounts (not custodial)
- **NFR7:** Smart contracts support both wallet signatures and FOGO Sessions signatures
- **NFR8:** Admin functions protected by multisig (treasury, insurance, config changes)
- **NFR9:** Emergency pause/freeze callable by authorized admin
- **NFR10:** No private keys stored in frontend or backend
- **NFR11:** All transactions require explicit user wallet signature
- **NFR12:** Oracle price data verified on-chain before use

### Reliability

- **NFR13:** System operates 24/7 with continuous epoch creation
- **NFR14:** Oracle staleness triggers automatic refund (≤30 second wait, then refund)
- **NFR15:** Oracle confidence threshold breach rejects settlement attempt (crank retries)
- **NFR16:** Settlement state machine prevents stuck/inconsistent states
- **NFR17:** Failed transactions do not corrupt pool or position state (atomic operations)
- **NFR18:** System recovers gracefully from RPC provider issues

### Scalability

- **NFR19:** System supports 100 concurrent traders at MVP launch
- **NFR20:** Pool architecture supports growth to 1000+ traders without redesign
- **NFR21:** Per-asset pools are independent (no cross-asset bottlenecks)
- **NFR22:** Frontend performs acceptably with 4 asset markets active simultaneously

### Integration

- **NFR23:** Pyth Lazer price feeds consumed with ≤3 second freshness for start snapshot
- **NFR24:** Pyth Lazer price feeds consumed with ≤10 second freshness for settlement
- **NFR25:** Solana wallet adapter supports Phantom, Backpack, Nightly, and standard Solana wallets
- **NFR26:** Frontend compatible with FOGO testnet and mainnet RPC endpoints
- **NFR27:** On-chain programs deployable to FOGO chain (SVM-compatible)

---

## Reference Resources

### External Documentation

**Pyth & Oracle:**
- [Pyth Documentation](https://docs.pyth.network/)
- [Pyth Lazer Examples](https://github.com/pyth-network/pyth-examples/tree/main/lazer)
- [Pyth Price Structure](https://docs.pyth.network/price-feeds/core/price-structure)

**FOGO Chain:**
- [Building on FOGO](https://docs.fogo.io/user-guides/building-on-fogo.html)
- [FOGO Sessions](https://docs.fogo.io/fogo-sessions.html)
- [Pyth Lazer on FOGO](https://docs.fogo.io/ecosystem/pyth-lazer-oracle.html)

**Development:**
- [Anchor Framework](https://book.anchor-lang.com/)
- [Solana Wallet Adapter](https://github.com/solana-labs/wallet-adapter)
- [Uniswap V2 AMM Math](https://docs.uniswap.org/contracts/v2/concepts/protocol-overview/how-uniswap-works)

### Project Implementation Docs

These documents contain hard-won lessons from implementation. **Read before coding.**

| Document | Description |
|----------|-------------|
| `docs/on-chain-architecture.md` | Account structures, PDA seeds, naming conventions, deployed addresses |
| `docs/pyth-lazer-ed25519-integration.md` | Pyth Lazer on FOGO - Ed25519 format, checklist, common failures |
| `docs/fogo-testnet-setup.md` | Network configuration, CLI setup, deployment commands |
| `docs/fogo-testnet-dev-notes.md` | Stack overflow fixes, browser-compatible PDA derivation, ATA patterns |

---

*Document generated via BMAD Method PRD workflow*
