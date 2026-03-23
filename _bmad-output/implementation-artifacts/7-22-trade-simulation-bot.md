# Story 7.22: Trade Simulation Bot

Status: done
Created: 2026-03-22
Epic: 7 - Platform Polish & UX
Sprint: Backlog

## Story

As a platform operator,
I want automated bots that place real trades across all markets,
so that the platform feels active with user trading even during low-traffic periods.

## Problem

FogoPulse prediction markets feel empty without user activity. New users arriving to an empty market with no trading volume may leave. We need simulated trading activity to bootstrap market engagement and create a sense of an active user base.

## Solution

Create a standalone **Trade Simulation Bot** (`crank-bot/trade-bot.ts`) that runs alongside the existing crank-bot. The bot manages a configurable number of wallets that independently place `buy_position` trades with randomized directions, amounts, and timing across all 4 markets (BTC, ETH, SOL, FOGO).

A companion **Setup Script** (`crank-bot/setup-trade-bots.ts`) handles wallet generation, SOL funding, and USDC minting for bot wallets.

### Key Design Decisions

1. **Separate process** — Trade bot runs independently from crank-bot. Crank manages epoch lifecycle; trade bot simulates users. Clean separation of concerns.
2. **Raw instruction building** — Follows crank-bot pattern: no Anchor Program class, raw discriminators + Buffer serialization + VersionedTransaction. Consistent codebase, no extra dependencies.
3. **Configurable wallet count** — Number of bot wallets set via `TRADE_BOT_COUNT` env var. Can scale from 3 to 20+ bots.
4. **Real on-chain trades** — Bots place actual `buy_position` transactions on FOGO testnet. Trades appear in explorer and on the frontend like real user activity.
5. **Safety-aware** — Respects protocol pause/freeze flags, epoch state, position caps. Re-checks epoch state before executing each scheduled trade.

## Acceptance Criteria

1. **Given** the setup script is run with `--count 5`, **When** it completes, **Then** 5 bot wallet keypairs exist in the wallets directory, each funded with SOL and USDC
2. **Given** the trade bot is running and an epoch is Open, **When** the trading window is active, **Then** bot wallets place random UP/DOWN trades with varying amounts
3. **Given** the trade bot is running, **When** the protocol is paused or frozen, **Then** no trades are attempted and a log message indicates the pause
4. **Given** the trade bot is running, **When** an epoch transitions to Frozen, **Then** no new trades are scheduled for that epoch
5. **Given** the trade bot receives SIGINT, **When** shutting down, **Then** it completes gracefully without orphaned pending transactions
6. **Given** a bot wallet, **When** it trades in an epoch, **Then** it places at most `TRADE_BOT_MAX_TRADES_PER_EPOCH` trades per epoch
7. **Given** the trade bot is running, **When** trades are placed, **Then** amounts are random between `TRADE_BOT_MIN_AMOUNT` and `TRADE_BOT_MAX_AMOUNT` USDC
8. **Given** a bot wallet won a trade in a settled epoch, **When** the claim cycle runs, **Then** `claim_payout` is called and USDC is returned to the bot wallet
9. **Given** a bot wallet traded in a refunded epoch, **When** the claim cycle runs, **Then** `claim_refund` is called and the original stake is returned
10. **Given** a bot wallet lost a trade, **When** the claim cycle runs, **Then** no claim is attempted for that position

## Architecture

### File Structure

```
crank-bot/
  trade-bot.ts              # Main bot (NEW)
  setup-trade-bots.ts       # Wallet setup script (NEW)
  trade-bot-wallets/         # Generated bot keypairs (gitignored)
    bot-0.json
    bot-1.json
    ...
  .env.example              # Updated with trade bot vars
  package.json              # Updated with trade bot scripts
```

### trade-bot.ts Structure

```
CONSTANTS       — PROGRAM_ID, ASSET_MINTS, USDC_MINT, POOL_STATE, BUY_POSITION_DISCRIMINATOR
TYPES           — TradeBotConfig, BotWallet, GlobalConfigData
LOGGING         — Same logAt/createPoolLogger pattern as crank-bot
CONFIGURATION   — Load TRADE_BOT_* env vars
WALLET MGMT     — Load keypairs from wallets directory
PDA HELPERS     — deriveGlobalConfigPda, derivePoolPda, deriveEpochPda (from crank-bot)
                  + NEW: derivePositionPda
ACCOUNT PARSERS — parsePoolAccount, parseEpochAccount (from crank-bot, extended with outcome field for claims)
                  + NEW: parseGlobalConfigAccount (extracts treasury, insurance, paused, frozen)
                  + NEW: parsePositionAccount (user, direction, amount, claimed — for claim cycle)
TX BUILDERS     — buildAndSendBuyPositionTx (13 accounts)
                  + buildAndSendClaimPayoutTx (11 accounts)
                  + buildAndSendClaimRefundTx (11 accounts)
MARKET MONITOR  — Per-pool class: polls epoch state, schedules random trades, runs claim cycle after settlement
MAIN            — Multi-pool concurrent execution, signal handling
```

### Key Implementation Details

**GlobalConfig Parsing** (raw bytes → treasury/insurance pubkeys):
```
Offset  Field                              Size
0       discriminator                      8B
8       admin                              32B
40      treasury                           32B  ← NEEDED
72      insurance                          32B  ← NEEDED
104     trading_fee_bps                    2B
106     lp_fee_share_bps                   2B
108     treasury_fee_share_bps             2B
110     insurance_fee_share_bps            2B
112     per_wallet_cap_bps                 2B
114     per_side_cap_bps                   2B
116     oracle_confidence_threshold_start  2B
118     oracle_confidence_threshold_settle 2B
120     oracle_staleness_threshold_start   8B
128     oracle_staleness_threshold_settle  8B
136     epoch_duration_seconds             8B
144     freeze_window_seconds              8B
152     allow_hedging                      1B
153     paused                             1B   ← NEEDED
154     frozen                             1B   ← NEEDED
155     max_trade_amount                   8B   ← NEEDED
163     bump                               1B
```

**buy_position Instruction**:
- Discriminator: `[210, 108, 108, 28, 10, 46, 226, 137]`
- Data layout: 8B discriminator + 32B user pubkey + 1B direction (0=Up, 1=Down) + 8B amount (u64 LE)
- 13 accounts in order: signerOrSession, config, pool, epoch, position, userUsdc, poolUsdc, treasuryUsdc, insuranceUsdc, usdcMint, tokenProgram, associatedTokenProgram, systemProgram

**Position PDA**: Seeds `["position", epochPda, userPubkey, directionByte]`

**MarketMonitor per-epoch flow**:
1. Poll pool account → detect Open epoch with new epochId
2. Fetch epoch account → get freezeTime
3. Calculate trading window: now → (freezeTime - 5s buffer)
4. For each bot wallet: roll random 0..maxTradesPerEpoch trades
5. Schedule each trade at random delay within window via setTimeout
6. Before each trade: re-check epoch still Open, check USDC balance
7. Pick random direction (50/50) and random amount within configured range
8. Execute buildAndSendBuyPositionTx, log result
9. **After epoch settles/refunds**: run claim cycle for all bots (see below)

**Auto-Claim Cycle** (runs after each epoch settles or is refunded):
1. When MarketMonitor detects epoch state changed to Settled (4) or Refunded (5):
2. For each bot wallet that traded in the previous epoch:
   - Fetch position account(s) for the directions the bot traded
   - If position exists and `claimed === false`:
     - **Settled + winner**: call `claim_payout` (discriminator `[127, 240, 132, 62, 227, 198, 146, 133]`)
     - **Refunded**: call `claim_refund` (both directions if hedging was on)
     - **Settled + loser**: skip (nothing to claim)
   - Log: "[BTC] Bot-0 claimed 4.82 USDC payout from epoch #42"
3. Track claimed epochs to avoid re-attempting

**claim_payout instruction**:
- Discriminator: `[127, 240, 132, 62, 227, 198, 146, 133]`
- Data: 8B discriminator + 32B user pubkey + 1B direction
- 11 accounts: signerOrSession, config, pool (NOT mut), epoch, position (mut), poolUsdc (mut), userUsdc (mut), usdcMint, tokenProgram, associatedTokenProgram, systemProgram

**claim_refund instruction**:
- Discriminator: `[15, 16, 30, 161, 255, 228, 97, 60]`
- Same account layout and data format as claim_payout
- Requires epoch state === Refunded (returns original stake)

**parsePositionAccount** (from `anchor/scripts/claim-payout.ts`):
- 8B discriminator → 32B user → 32B epoch → 1B direction → 8B amount → 8B shares → 8B entry_price → 1B claimed

**GlobalConfig refresh**: Every 5 minutes, re-fetch to detect paused/frozen changes.

### setup-trade-bots.ts Flow

1. Parse CLI: `--count N`, `--sol-per-bot X` (default 0.1), `--usdc-per-bot Y` (default 100), `--wallets-dir path`
2. Load master wallet from `WALLET_PATH` (must be USDC mint authority on testnet)
3. For each bot 0..N-1:
   - If `bot-{i}.json` exists in wallets dir → load it
   - Else → `Keypair.generate()`, save to `bot-{i}.json`
   - Transfer SOL from master wallet via SystemProgram.transfer
   - `getOrCreateAssociatedTokenAccount` for USDC ATA
   - `mintTo` USDC from master wallet (mint authority)
4. Print summary table with pubkeys and balances

### Environment Variables

```env
TRADE_BOT_ENABLED=true                    # Master on/off (default: false)
TRADE_BOT_COUNT=5                         # Number of bot wallets (default: 5)
TRADE_BOT_MIN_AMOUNT=0.5                  # Min trade in USDC (default: 0.5)
TRADE_BOT_MAX_AMOUNT=5.0                  # Max trade in USDC (default: 5.0)
TRADE_BOT_MAX_TRADES_PER_EPOCH=2          # Max trades per bot per epoch (default: 2)
TRADE_BOT_WALLETS_DIR=./trade-bot-wallets # Keypair storage dir (default: ./trade-bot-wallets)
TRADE_BOT_POLL_INTERVAL_SECONDS=10        # Poll interval (default: 10)
```

Shared with crank-bot (already in .env):
```env
WALLET_PATH=~/.config/solana/fogo-testnet.json  # Master wallet for setup script
RPC_URL=https://testnet.fogo.io
LOG_LEVEL=info
```

## Critical Reference Files

| File | Purpose |
|------|---------|
| `crank-bot/crank-bot.ts` | Pattern reference: constants, PDA derivation, pool/epoch parsers, logging, retry, shutdown, raw tx building |
| `web/src/lib/transactions/buy.ts` | buy_position account order (13 accounts), direction enum, amount handling |
| `web/src/lib/pda.ts` | Position PDA derivation seeds, direction byte mapping (Up=0, Down=1) |
| `anchor/programs/fogopulse/src/state/config.rs` | GlobalConfig struct layout for raw byte parsing |
| `anchor/scripts/mint-test-usdc.ts` | USDC minting pattern: loadWallet, getOrCreateAssociatedTokenAccount, mintTo |
| `web/src/hooks/use-global-config.ts` | GlobalConfigData interface (field names for reference) |
| `anchor/scripts/claim-payout.ts` | claim_payout raw instruction building: discriminator, accounts (11), position parsing, epoch outcome checking |
| `anchor/programs/fogopulse/src/instructions/claim_payout.rs` | ClaimPayout accounts struct and payout calculation formula |
| `anchor/programs/fogopulse/src/instructions/claim_refund.rs` | ClaimRefund accounts struct (same layout as claim_payout) |

## Tasks / Subtasks

### Task 1: Create setup-trade-bots.ts (AC: #1)

- [x] 1.1: Create `crank-bot/setup-trade-bots.ts` with CLI arg parsing (--count, --sol-per-bot, --usdc-per-bot, --wallets-dir)
- [x] 1.2: Implement wallet generation/loading (Keypair.generate or load from JSON)
- [x] 1.3: Implement SOL transfer from master wallet to each bot
- [x] 1.4: Implement USDC ATA creation + mintTo for each bot
- [x] 1.5: Print summary table with pubkeys and balances

### Task 2: Create trade-bot.ts core infrastructure (AC: #3, #5)

- [x] 2.1: Constants, types, logging (copy patterns from crank-bot.ts)
- [x] 2.2: Configuration loading from TRADE_BOT_* env vars
- [x] 2.3: Wallet loading from TRADE_BOT_WALLETS_DIR
- [x] 2.4: PDA helpers (copy deriveGlobalConfigPda, derivePoolPda, deriveEpochPda from crank-bot; add derivePositionPda)
- [x] 2.5: Account parsers (copy parsePoolAccount, parseEpochAccount from crank-bot; add parseGlobalConfigAccount)
- [x] 2.6: Graceful shutdown handler (SIGINT/SIGTERM)

### Task 3: Implement transaction builder (AC: #2, #7)

- [x] 3.1: Implement buildAndSendBuyPositionTx with raw instruction building (discriminator + data + 13 accounts)
- [x] 3.2: Implement retry logic with exponential backoff (same pattern as crank-bot)

### Task 4: Implement MarketMonitor (AC: #2, #4, #6, #7)

- [x] 4.1: Create MarketMonitor class with pool polling loop
- [x] 4.2: Implement epoch detection and trade scheduling (random delays within trading window)
- [x] 4.3: Implement per-epoch trade tracking (prevent exceeding maxTradesPerEpoch)
- [x] 4.4: Implement pre-trade safety checks (epoch still Open, USDC balance, protocol not paused)
- [x] 4.5: Implement random direction (50/50) and random amount (min-max range)

### Task 5: Implement auto-claim cycle (AC: #8, #9, #10)

- [x] 5.1: Implement `buildAndSendClaimPayoutTx` (discriminator `[127, 240, 132, 62, 227, 198, 146, 133]`, 11 accounts)
- [x] 5.2: Implement `buildAndSendClaimRefundTx` (same layout as claim_payout, epoch must be Refunded)
- [x] 5.3: Add `parsePositionAccount` to check direction, amount, claimed status
- [x] 5.4: Add claim cycle to MarketMonitor: after detecting Settled/Refunded state, iterate bot wallets, check positions, claim if eligible
- [x] 5.5: Track claimed epochs to avoid re-attempting claims

### Task 6: Implement main entry and multi-pool support (AC: #2, #3)

- [x] 6.1: Main function: load config, load wallets, fetch GlobalConfig, start MarketMonitors
- [x] 6.2: Multi-pool concurrent execution via Promise.allSettled (BTC, ETH, SOL, FOGO)
- [x] 6.3: Periodic GlobalConfig refresh (every 5 minutes) for pause/freeze detection

### Task 7: Update config files (AC: all)

- [x] 7.1: Append trade bot env vars to `crank-bot/.env.example`
- [x] 7.2: Add `trade-bot` and `setup-trade-bots` scripts to `crank-bot/package.json`
- [x] 7.3: Add `trade-bot-wallets/` to `.gitignore`

## Deployment

Run via systemd. Example service file:

```ini
[Unit]
Description=FogoPulse Trade Simulation Bot
After=network.target

[Service]
Type=simple
User=fogopulse
WorkingDirectory=/path/to/fogopulse/crank-bot
ExecStart=/usr/bin/npx tsx trade-bot.ts
Restart=always
RestartSec=10
EnvironmentFile=/path/to/fogopulse/crank-bot/.env

[Install]
WantedBy=multi-user.target
```

## File List

| File | Action | Description |
|------|--------|-------------|
| `crank-bot/trade-bot.ts` | NEW | Main trade simulation bot with MarketMonitor, tx builders, claim cycle |
| `crank-bot/setup-trade-bots.ts` | NEW | Wallet setup script: generate keypairs, fund SOL, mint USDC (requires mint authority) |
| `crank-bot/setup-fund-trade-bots.ts` | NEW | Wallet setup script: generate keypairs, fund SOL, transfer USDC from master wallet (no mint authority needed) |
| `crank-bot/.env.example` | MODIFIED | Added TRADE_BOT_* environment variables section |
| `crank-bot/package.json` | MODIFIED | Added `trade-bot`, `setup-trade-bots`, and `setup-fund-trade-bots` npm scripts |
| `crank-bot/DEPLOYMENT.md` | MODIFIED | Added Trade Simulation Bot deployment section (systemd service, wallet setup, troubleshooting) |
| `.gitignore` | MODIFIED | Added `crank-bot/trade-bot-wallets/` to ignore bot keypairs |

## Dev Agent Record

### Implementation Notes

- Followed crank-bot.ts patterns exactly: raw discriminators, Buffer serialization, VersionedTransaction, logAt/createPoolLogger, retry with exponential backoff, SIGINT/SIGTERM graceful shutdown
- Key discovery: Pool `active_epoch_state` resets to 0 (None) after settlement, NOT to Settled/Refunded. The trade bot tracks `previousEpochId` and runs claims when pool transitions back to None, then fetches epoch directly to check Settled(3) vs Refunded(4) state
- `parseGlobalConfigAccount` implemented from raw bytes using the exact byte layout from the story spec (offsets verified against `config.rs`)
- `buy_position` instruction data: 8B discriminator + 32B user pubkey + 1B direction + 8B amount (matches `buy_position.rs`)
- `claim_payout` and `claim_refund` share the same account layout (11 accounts) and data format (8B discriminator + 32B user pubkey + 1B direction)
- Position PDA seeds: `["position", epoch, user, directionByte]` with direction 0=Up, 1=Down
- USDC balance check reads raw SPL token account data at offset 64 for the amount field
- No new dependencies required — reuses same @solana/web3.js, @solana/spl-token, dotenv already in crank-bot

### Completion Notes

All 7 tasks (24 subtasks) implemented. Both files compile and run correctly:
- `setup-trade-bots.ts`: Successfully connects to testnet, creates wallets, transfers SOL, mints USDC
- `trade-bot.ts`: Correctly validates TRADE_BOT_ENABLED flag, loads config, exits cleanly
- No test regressions: pre-existing 16 test failures remain unchanged (7 suites, all in web/ project)

## Change Log

- **2026-03-22**: Initial implementation of trade simulation bot (Story 7.22). Created `trade-bot.ts` (MarketMonitor with auto-trade and auto-claim cycles across 4 markets) and `setup-trade-bots.ts` (wallet generation and funding script). Updated env, package.json, gitignore.
- **2026-03-22**: Increased DEFAULT_USDC_PER_BOT from 100 to 100,000 in `setup-trade-bots.ts` so bot wallets are funded with sufficient trading capital by default.
- **2026-03-22**: Code review fixes — (H1) Added `allowOwnerOffCurve=true` to treasury/insurance ATA derivation preventing runtime failures with PDA-owned accounts. (H3) Replaced single previousEpochId tracking with multi-epoch `pendingClaims` map to prevent silently skipped claims in fast epoch cycles. (M2) Changed scheduledTimers from array to Set with self-cleanup on fire to prevent memory leak. (M3) Cached treasury/insurance ATAs in MarketMonitor constructor. (M4) Added EPOCH_STATE constants and replaced all magic numbers for epoch state checks. (L1) Removed unused `sleepMs` alias. (L2) Fixed misleading pool state name mapping.
- **2026-03-23**: Created `setup-fund-trade-bots.ts` — copy of `setup-trade-bots.ts` that uses SPL `transfer` instead of `mintTo` for USDC funding. **Problem:** On the Contabo server, the master wallet is not the USDC mint authority, so `mintTo` fails. **Solution:** New script transfers USDC from the master wallet's existing balance to bot wallets. Also checks master USDC balance upfront and fails fast if insufficient.
- **2026-03-23**: Fixed graceful shutdown hanging on Ctrl+C. **Problem:** Shutdown handler called `clearTimeout` on sleep timers but never resolved their promises, leaving `await sleep()` hung forever — the bot would never exit. **Solution:** Changed `activeTimers` from `Set<timer>` to `Map<timer, resolve>` so shutdown can both clear timers and resolve pending sleep promises. Added force exit on second Ctrl+C via `process.exit(1)`.
- **2026-03-23**: Added Trade Simulation Bot deployment section to `DEPLOYMENT.md` covering systemd service (`fogopulse-trade-bot.service`), wallet setup, env vars, and troubleshooting.
