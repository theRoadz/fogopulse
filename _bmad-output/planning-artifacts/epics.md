---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
  - "docs/pyth-lazer-ed25519-integration.md"
  - "docs/fogo-testnet-setup.md"
  - "docs/fogo-testnet-dev-notes.md"
  - "docs/on-chain-structure.md"
---

# FOGO Pulse - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for FOGO Pulse, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Market Trading (FR1-FR14)**
- FR1: Trader can view current epoch status for any asset (BTC/USD, ETH/USD, SOL/USD, FOGO/USD)
- FR2: Trader can view live price chart for selected asset
- FR3: Trader can view current probability (pYES/pNO) for active epoch
- FR4: Trader can view pool depth and liquidity for active epoch
- FR5: Trader can view epoch countdown timer
- FR6: Trader can take UP (YES) position on price direction
- FR7: Trader can take DOWN (NO) position on price direction
- FR8: Trader can view expected execution price before trade
- FR9: Trader can view estimated probability impact before trade
- FR10: Trader can view fee amount before trade
- FR11: Trader can view worst-case slippage before trade
- FR12: Trader can exit position early during trading window (sell back to pool)
- FR13: Trader can view cap warnings when approaching per-wallet or per-side limits
- FR14: Trader can switch between asset markets

**Position Management (FR15-FR20)**
- FR15: Trader can view open positions in current epoch(s)
- FR16: Trader can view positions across multiple assets simultaneously
- FR17: Trader can view realized PnL from settled trades
- FR18: Trader can view unrealized PnL for open positions
- FR19: Trader can claim payouts after epoch settlement
- FR20: Trader can view refund status when epoch is refunded

**Settlement & Transparency (FR21-FR27)**
- FR21: Trader can view start price and publish time for any epoch
- FR22: Trader can view settlement price and publish time after epoch closes
- FR23: Trader can view confidence values for start and end snapshots
- FR24: Trader can view settlement outcome (UP won / DOWN won / Refunded)
- FR25: Trader can view detailed refund explanation when confidence overlap occurs
- FR26: Trader can view confidence band visualization for refund scenarios
- FR27: Trader can view epoch history with outcomes

**Liquidity Provision (FR28-FR36)**
- FR28: LP can view pool TVL for each asset
- FR29: LP can view estimated APY based on recent volume
- FR30: LP can view risk disclosure before depositing
- FR31: LP can deposit USDC into pool (single-token, auto 50/50 split)
- FR32: LP can view their LP share and current value
- FR33: LP can request withdrawal at any time
- FR34: LP can view pending withdrawal status
- FR35: LP can view cooldown timer for pending withdrawal
- FR36: LP can receive withdrawal payout after epoch settlement + cooldown

**Wallet Integration (FR37-FR40)**
- FR37: User can connect Solana-compatible wallet (Phantom, Nightly, etc.)
- FR38: User can disconnect wallet
- FR39: User can view connected wallet address
- FR40: User can sign transactions for trades, LP deposits, and withdrawals

**Admin & Operations (FR41-FR51)**
- FR41: Admin can view active epochs across all assets
- FR42: Admin can view trading volume metrics per asset
- FR43: Admin can view refund rate metrics per asset
- FR44: Admin can view oracle health status per asset
- FR45: Admin can pause new epoch creation for specific asset
- FR46: Admin can resume epoch creation for paused asset
- FR47: Admin can configure fee percentage
- FR48: Admin can configure per-wallet cap percentage
- FR49: Admin can configure per-side exposure cap percentage
- FR50: Admin can configure oracle confidence thresholds
- FR51: Admin can trigger emergency freeze (halt all activity)

**System Capabilities (FR52-FR61)**
- FR52: System creates new epoch automatically when previous epoch enters freeze window
- FR53: System captures start price snapshot with confidence at epoch creation
- FR54: System enforces freeze window (no trading in final ~15 seconds)
- FR55: System captures settlement price snapshot with confidence at epoch end
- FR56: System determines outcome using confidence-aware resolution
- FR57: System processes refund when confidence bands overlap
- FR58: System enforces per-wallet position caps
- FR59: System enforces per-side exposure caps
- FR60: System distributes fees (70% LP, 20% treasury, 10% insurance)
- FR61: System processes pending LP withdrawals after settlement + cooldown

### Non-Functional Requirements

**Performance (NFR1-NFR5)**
- NFR1: Trade transactions confirm within FOGO chain block finality (~400ms)
- NFR2: UI updates pool state and probabilities within 1 second of on-chain change
- NFR3: Settlement executes within same block as valid oracle price availability
- NFR4: Price chart updates in real-time (WebSocket or polling ≤1 second)
- NFR5: Epoch countdown accurate to ±1 second

**Security (NFR6-NFR12)**
- NFR6: All user funds held in on-chain program accounts (not custodial)
- NFR7: Smart contracts support both wallet signatures and FOGO Sessions signatures
- NFR8: Admin functions protected by multisig (treasury, insurance, config changes)
- NFR9: Emergency pause/freeze callable by authorized admin
- NFR10: No private keys stored in frontend or backend
- NFR11: All transactions require explicit user wallet signature
- NFR12: Oracle price data verified on-chain before use

**Reliability (NFR13-NFR18)**
- NFR13: System operates 24/7 with continuous epoch creation
- NFR14: Oracle staleness triggers automatic refund (≤30 second wait, then refund)
- NFR15: Oracle confidence threshold breach triggers automatic refund
- NFR16: Settlement state machine prevents stuck/inconsistent states
- NFR17: Failed transactions do not corrupt pool or position state (atomic operations)
- NFR18: System recovers gracefully from RPC provider issues

**Scalability (NFR19-NFR22)**
- NFR19: System supports 100 concurrent traders at MVP launch
- NFR20: Pool architecture supports growth to 1000+ traders without redesign
- NFR21: Per-asset pools are independent (no cross-asset bottlenecks)
- NFR22: Frontend performs acceptably with 4 asset markets active simultaneously

**Integration (NFR23-NFR27)**
- NFR23: Pyth Lazer price feeds consumed with ≤3 second freshness for start snapshot
- NFR24: Pyth Lazer price feeds consumed with ≤10 second freshness for settlement
- NFR25: Solana wallet adapter supports Phantom, Backpack, Nightly, and standard Solana wallets
- NFR26: Frontend compatible with FOGO testnet and mainnet RPC endpoints
- NFR27: On-chain programs deployable to FOGO chain (SVM-compatible)

### Additional Requirements

**From Architecture - Starter Template:**
- AR1: Use `create-solana-dapp` starter template with Next.js and counter template
- AR2: Swap DaisyUI for shadcn/ui after initialization
- AR3: Add FOGO Sessions SDK (`fogo-sessions-sdk@0.7.5`) to Anchor program
- AR4: Add Pyth Lazer SDK to Anchor program
- AR5: Configure monorepo structure with pnpm workspaces
- AR6: Preserve existing `_bmad/`, `_bmad-output/`, `docs/`, `.claude/` directories

**From Architecture - Development Environment:**
- AR7: Use WSL for Anchor CLI (build and deploy)
- AR8: Use Windows for Node/npm, frontend dev, TypeScript scripts
- AR9: Target FOGO testnet from day one (no local devnet)
- AR10: Use real Pyth Lazer oracle data (no mocks)

**From Architecture - On-Chain Patterns:**
- AR11: Use `Session::extract_user_from_signer_or_session` for all user-facing instructions
- AR12: Emit Anchor events for all state-changing operations
- AR13: Use Box<> for large accounts to prevent stack overflow
- AR14: Use ATA (Associated Token Account) pattern for pool USDC, not custom PDA

**From Architecture - Frontend Patterns:**
- AR15: Use TanStack Query for on-chain data fetching
- AR16: Use Zustand for UI state (theme, active asset, trade ticket)
- AR17: Use WebSocket for critical real-time data (epoch, positions)
- AR18: Use Pyth Hermes for frontend price display (same source as settlement)
- AR19: Use Lightweight Charts (TradingView) for price chart

**From Architecture - Pyth Lazer Integration (Critical):**
- AR20: Use Ed25519 format (`solana`), NOT ECDSA (`leEcdsa`)
- AR21: Use FOGO-specific Pyth addresses (not Solana mainnet)
- AR22: Use `createEd25519Instruction()` helper from SDK
- AR23: Ed25519 instruction MUST be first in transaction
- AR24: pythMessageOffset = 20 (8 discriminator + 8 epoch_id + 4 vec length)

**From UX Design:**
- AR25: Implement Direction 1 layout: Chart left (65%), Trade ticket right (35%)
- AR26: Use "Price to Beat" terminology for epoch start price
- AR27: Show delta indicator (▲/▼ $XX) for distance from target
- AR28: Implement confidence band visualization for refund explanations
- AR29: Support dark theme (default) and light theme (toggle)
- AR30: WCAG 2.1 AA accessibility compliance

**From Implementation Docs - Key Constants:**
- AR31: USDC Mint (FOGO Testnet): `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy`
- AR32: Pyth Lazer Program: `pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt`
- AR33: Pyth Lazer Storage: `3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL`
- AR34: Pyth Lazer Treasury: `upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr`

### FR Coverage Map

**Epic 1: Project Foundation & Core Infrastructure**
- AR1-AR14: Project setup, starter template, development environment, on-chain patterns
- AR20-AR24: Pyth Lazer Ed25519 integration
- AR31-AR34: FOGO testnet constants (USDC mint, Pyth addresses)

**Epic 2: Core Trading Experience**
- FR1: View current epoch status for any asset
- FR2: View live price chart for selected asset
- FR3: View current probability (pYES/pNO)
- FR4: View pool depth and liquidity
- FR5: View epoch countdown timer
- FR6: Take UP (YES) position
- FR7: Take DOWN (NO) position
- FR8: View expected execution price before trade
- FR9: View estimated probability impact before trade
- FR10: View fee amount before trade
- FR11: View worst-case slippage before trade
- FR14: Switch between asset markets
- FR37: Connect Solana-compatible wallet
- FR38: Disconnect wallet
- FR39: View connected wallet address
- FR40: Sign transactions
- FR52: System creates new epoch automatically
- FR53: System captures start price snapshot
- FR54: System enforces freeze window
- FR58: System enforces per-wallet position caps
- FR59: System enforces per-side exposure caps

**Epic 3: Settlement & Payouts**
- FR19: Claim payouts after epoch settlement
- FR20: View refund status when epoch is refunded
- FR21: View start price and publish time
- FR22: View settlement price and publish time
- FR23: View confidence values for snapshots
- FR24: View settlement outcome (UP/DOWN/Refunded)
- FR25: View detailed refund explanation
- FR26: View confidence band visualization
- FR55: System captures settlement price snapshot
- FR56: System determines outcome using confidence-aware resolution
- FR57: System processes refund when confidence bands overlap
- FR60: System distributes fees (70% LP, 20% treasury, 10% insurance)

**Epic 4: Position Management & History**
- FR12: Exit position early (sell back to pool)
- FR13: View cap warnings
- FR15: View open positions in current epoch(s)
- FR16: View positions across multiple assets
- FR17: View realized PnL from settled trades
- FR18: View unrealized PnL for open positions
- FR27: View epoch history with outcomes

**Epic 5: Liquidity Provision**
- FR28: View pool TVL for each asset
- FR29: View estimated APY
- FR30: View risk disclosure before depositing
- FR31: Deposit USDC into pool
- FR32: View LP share and current value
- FR33: Request withdrawal at any time
- FR34: View pending withdrawal status
- FR35: View cooldown timer
- FR36: Receive withdrawal payout after settlement + cooldown
- FR61: System processes pending LP withdrawals

**Epic 6: Admin & Operations**
- FR41: View active epochs across all assets
- FR42: View trading volume metrics per asset
- FR43: View refund rate metrics per asset
- FR44: View oracle health status per asset
- FR45: Pause new epoch creation for specific asset
- FR46: Resume epoch creation for paused asset
- FR47: Configure fee percentage
- FR48: Configure per-wallet cap percentage
- FR49: Configure per-side exposure cap percentage
- FR50: Configure oracle confidence thresholds
- FR51: Trigger emergency freeze

## Epic List

### Epic 1: Project Foundation & Core Infrastructure
**Goal:** Establish the complete development environment with deployed smart contracts on FOGO testnet, enabling all subsequent feature development.

**User Outcome:** Development team has a working monorepo with Anchor programs deployed to FOGO testnet, Pyth Lazer integration verified, and frontend scaffolding ready.

**ARs covered:** AR1-AR14, AR20-AR24, AR31-AR34
**NFRs addressed:** NFR26, NFR27

---

### Epic 2: Core Trading Experience
**Goal:** Enable traders to connect their wallet, view real-time market data, and take UP/DOWN positions on asset price direction within active epochs.

**User Outcome:** Traders can execute the core trading loop - observe market state, make a directional prediction, enter a position, and watch the epoch countdown.

**FRs covered:** FR1-FR11, FR14, FR37-FR40, FR52-FR54, FR58-FR59
**NFRs addressed:** NFR1-NFR5, NFR6, NFR10-NFR12, NFR23-NFR27
**ARs addressed:** AR15-AR19, AR25-AR27

---

### Epic 3: Settlement & Payouts
**Goal:** Complete the trading loop with transparent settlement, confidence-aware refunds, and payout claiming.

**User Outcome:** Traders see exactly what happened when an epoch settles, understand why they won/lost/got refunded with full price and confidence transparency, and can claim their payouts.

**FRs covered:** FR19-FR26, FR55-FR57, FR60
**NFRs addressed:** NFR13-NFR17

---

### Epic 4: Position Management & History
**Goal:** Provide comprehensive position tracking, early exit capability, and historical trading data.

**User Outcome:** Traders can manage positions across multiple assets, exit early if desired, track PnL, and review their complete trading history.

**FRs covered:** FR12-FR13, FR15-FR18, FR27
**ARs addressed:** AR28-AR30

---

### Epic 5: Liquidity Provision
**Goal:** Enable liquidity providers to deposit USDC, earn trading fees, and manage their LP positions.

**User Outcome:** LPs can provide liquidity to any asset pool, track their share value and fee earnings, and withdraw with proper cooldown handling.

**FRs covered:** FR28-FR36, FR61
**NFRs addressed:** NFR19-NFR22

---

### Epic 6: Admin & Operations
**Goal:** Provide protocol operators with monitoring, configuration, and emergency controls.

**User Outcome:** Operators can monitor system health across all assets, adjust protocol parameters, pause/resume markets, and handle emergencies.

**FRs covered:** FR41-FR51
**NFRs addressed:** NFR8-NFR9

---

## Epic 1: Project Foundation & Core Infrastructure

Establish the complete development environment with deployed smart contracts on FOGO testnet, enabling all subsequent feature development.

### Story 1.1: Initialize Project with create-solana-dapp

As a developer,
I want a properly structured monorepo with Anchor and Next.js,
So that I have a solid foundation for building the FOGO Pulse application.

**Acceptance Criteria:**

**Given** a fresh project directory
**When** I run create-solana-dapp with the counter template
**Then** a monorepo is created with `anchor/` and `web/` directories
**And** pnpm workspaces are configured correctly
**And** the existing `_bmad/`, `_bmad-output/`, `docs/`, and `.claude/` directories are preserved
**And** the project builds successfully with `pnpm install && pnpm build`

---

### Story 1.2: Configure shadcn/ui and Theme System

As a developer,
I want shadcn/ui components with dark/light theme support,
So that the UI matches the design specifications and supports user preferences.

**Acceptance Criteria:**

**Given** the initialized Next.js project
**When** I configure shadcn/ui and remove DaisyUI
**Then** shadcn/ui is installed with the default configuration
**And** Tailwind CSS is configured for shadcn/ui
**And** a theme provider supports dark mode (default) and light mode toggle
**And** the base layout renders correctly in both themes
**And** AR29 (dark theme default, light theme toggle) is satisfied

---

### Story 1.3: Configure FOGO Testnet Environment

As a developer,
I want the project configured for FOGO testnet,
So that I can develop and test against real chain infrastructure.

**Acceptance Criteria:**

**Given** the monorepo structure
**When** I configure FOGO testnet settings
**Then** Anchor.toml uses `localnet` cluster with FOGO testnet RPC URL workaround
**And** Solana CLI is configured to use `https://testnet.fogo.io`
**And** frontend cluster configuration includes FOGO testnet as default
**And** USDC mint constant is set to `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy`
**And** environment variables are documented in `.env.example`

---

### Story 1.4: Implement GlobalConfig Account Structure

As a developer,
I want the GlobalConfig account structure implemented,
So that protocol-wide parameters can be stored and managed on-chain.

**Acceptance Criteria:**

**Given** the Anchor program scaffold
**When** I implement the GlobalConfig account
**Then** the struct includes all fields: admin, treasury, insurance, fee parameters, cap parameters, oracle thresholds, timing parameters, paused, frozen, bump
**And** the account size is calculated correctly (155 bytes)
**And** PDA derivation uses seed `b"global_config"`
**And** an `initialize` instruction creates the GlobalConfig with admin as signer
**And** the instruction emits a `GlobalConfigInitialized` event

---

### Story 1.5: Implement Pool Account Structure

As a developer,
I want the Pool account structure implemented,
So that per-asset liquidity pools can be created and managed.

**Acceptance Criteria:**

**Given** the GlobalConfig account exists
**When** I implement the Pool account and create_pool instruction
**Then** the Pool struct includes: yes_reserves, no_reserves, total_lp_shares, asset_mint, wallet_cap_bps, side_cap_bps, is_frozen, bump
**And** PDA derivation uses seeds `[b"pool", asset_mint.as_ref()]`
**And** `create_pool` instruction requires admin signature (verified against GlobalConfig)
**And** pool caps are copied from GlobalConfig at creation
**And** the instruction emits a `PoolCreated` event
**And** Box<> is used for large accounts to prevent stack overflow

---

### Story 1.6: Implement Epoch Account Structure

As a developer,
I want the Epoch account structure implemented,
So that time-bounded trading periods can be created within pools.

**Acceptance Criteria:**

**Given** the Pool account exists
**When** I implement the Epoch account and create_epoch instruction
**Then** the Epoch struct includes: pool, epoch_id, state, start_time, end_time, freeze_time, start_price, start_confidence, start_publish_time, settlement fields (Option types), outcome, bump
**And** PDA derivation uses seeds `[b"epoch", pool.key().as_ref(), &epoch_id.to_le_bytes()]`
**And** EpochState enum includes: Open, Frozen, Settling, Settled, Refunded
**And** `create_epoch` is permissionless (anyone can call)
**And** timing is calculated: end_time = start_time + epoch_duration_seconds, freeze_time = end_time - freeze_window_seconds
**And** the instruction emits an `EpochCreated` event

---

### Story 1.7: Implement UserPosition Account Structure

As a developer,
I want the UserPosition account structure implemented,
So that user positions within epochs can be tracked.

**Acceptance Criteria:**

**Given** the Epoch account exists
**When** I implement the UserPosition account
**Then** the struct includes: user, epoch, direction, amount, shares, entry_price, claimed, bump
**And** Direction enum includes: Up, Down
**And** PDA derivation uses seeds `[b"position", epoch.key().as_ref(), user.key().as_ref()]`
**And** account size is calculated correctly (99 bytes)
**And** the structure supports the buy_position instruction (to be implemented in Epic 2)

---

### Story 1.8: Integrate Pyth Lazer Ed25519 Verification

As a developer,
I want Pyth Lazer oracle verification integrated,
So that epoch creation can capture verified price snapshots.

**Acceptance Criteria:**

**Given** the Epoch account structure
**When** I integrate Pyth Lazer verification into create_epoch
**Then** the instruction accepts pyth_message bytes, ed25519_instruction_index, and signature_index
**And** FOGO-specific Pyth addresses are used (Program: `pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt`, Storage: `3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL`, Treasury: `upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr`)
**And** Ed25519 format (`solana`) is used, NOT ECDSA
**And** instructions_sysvar account is included for Ed25519 verification
**And** VerifyMessage CPI is called to verify the signature
**And** SolanaMessage is deserialized to extract price and confidence
**And** start_price and start_confidence are populated from verified oracle data

---

### Story 1.9: Integrate FOGO Sessions SDK

As a developer,
I want FOGO Sessions SDK integrated,
So that user-facing instructions support both wallet and session signatures.

**Acceptance Criteria:**

**Given** the Anchor program with user-facing instructions
**When** I integrate FOGO Sessions SDK
**Then** `fogo-sessions-sdk@0.7.5` is added to Cargo.toml
**And** user-facing instructions (buy_position, sell_position, claim_payout) use `Session::extract_user_from_signer_or_session`
**And** admin-only instructions (initialize, create_pool) do NOT use session extraction
**And** the pattern is documented in code comments for future developers

---

### Story 1.10: Deploy Program to FOGO Testnet

As a developer,
I want the program deployed to FOGO testnet,
So that I can verify the on-chain structures work correctly.

**Acceptance Criteria:**

**Given** all account structures are implemented
**When** I build and deploy the program
**Then** `anchor build` completes without errors or stack overflow warnings
**And** `solana program deploy target/deploy/fogopulse.so` succeeds on FOGO testnet
**And** the program ID is recorded and updated in Anchor.toml and frontend constants
**And** the deployed program can be queried via RPC

---

### Story 1.11: Initialize GlobalConfig and Create Test Pools

As a developer,
I want initialization scripts that set up the protocol,
So that the system is ready for trading development.

**Acceptance Criteria:**

**Given** the program is deployed to FOGO testnet
**When** I run initialization scripts
**Then** GlobalConfig is initialized with testnet parameters (1.8% fee, 70/20/10 split, 5% wallet cap, 30% side cap, 300s epoch, 15s freeze)
**And** BTC, ETH, SOL, and FOGO pools are created
**And** pool USDC token accounts are created using ATA pattern (with allowOwnerOffCurve=true)
**And** all account addresses are logged and documented
**And** a verification script confirms all accounts exist and have correct data

---

## Epic 2: Core Trading Experience

Enable traders to connect their wallet, view real-time market data, and take UP/DOWN positions on asset price direction within active epochs.

### Story 2.1: Implement buy_position Instruction

As a trader,
I want to take a position on price direction,
So that I can profit from correctly predicting whether the price will go up or down.

**Acceptance Criteria:**

**Given** an epoch in Open state and a connected wallet with USDC
**When** I call buy_position with direction (Up/Down) and amount
**Then** USDC is transferred from user to pool token account
**And** shares are calculated using CPMM formula (amount * opposite_reserves / same_reserves)
**And** a UserPosition account is created with direction, amount, shares, and entry_price
**And** pool reserves are updated (same_side += amount)
**And** per-wallet cap is enforced (user position <= wallet_cap_bps of pool total)
**And** per-side cap is enforced (side total <= side_cap_bps of pool total)
**And** FOGO Sessions signature extraction is used for user identification
**And** a `PositionOpened` event is emitted
**And** the instruction fails if epoch is not in Open state

---

### Story 2.2: Implement Wallet Connection UI

As a trader,
I want to connect my Solana wallet,
So that I can sign transactions and interact with the protocol.

**Acceptance Criteria:**

**Given** the Next.js application with wallet adapter
**When** I click the connect wallet button
**Then** a modal displays supported wallets (Phantom, Backpack, Nightly, etc.)
**And** I can select and connect my preferred wallet
**And** the connected wallet address is displayed (truncated format)
**And** I can disconnect my wallet via a dropdown menu
**And** wallet state persists across page refreshes
**And** FR37-FR40 (wallet integration) are satisfied

---

### Story 2.3: Create Asset Selector and Market Layout

As a trader,
I want to switch between asset markets,
So that I can trade on different price predictions.

**Acceptance Criteria:**

**Given** the main trading page
**When** I view the market interface
**Then** the layout follows Direction 1: Chart left (65%), Trade ticket right (35%)
**And** asset tabs (BTC, ETH, SOL, FOGO) are displayed prominently
**And** clicking an asset tab switches the active market
**And** the URL updates to reflect the selected asset (e.g., /trade/btc)
**And** chart and trade ticket update to show selected asset data
**And** FR14 (switch between asset markets) is satisfied
**And** AR25 (Direction 1 layout) is satisfied

---

### Story 2.4: Integrate Pyth Hermes Price Feed

As a trader,
I want to see real-time price data,
So that I can make informed trading decisions.

**Acceptance Criteria:**

**Given** the trading interface with a selected asset
**When** the page loads
**Then** a WebSocket connection to Pyth Hermes is established
**And** live price updates are received and displayed
**And** price updates within 1 second of oracle publication (NFR4)
**And** the current price is prominently displayed with USD formatting
**And** price change (24h or since epoch start) is shown with color coding
**And** AR18 (Pyth Hermes for frontend) is satisfied

---

### Story 2.5: Implement Price Chart Component

As a trader,
I want to see a price chart for the selected asset,
So that I can analyze price trends before trading.

**Acceptance Criteria:**

**Given** the trading page with Pyth price feed connected
**When** I view the chart area
**Then** TradingView Lightweight Charts renders the price history
**And** the chart shows candlestick or line chart (configurable)
**And** the epoch start price ("Price to Beat") is marked with a horizontal line
**And** real-time price updates animate smoothly on the chart
**And** the chart is responsive and fills the 65% width allocation
**And** FR2 (view live price chart) is satisfied
**And** AR19 (Lightweight Charts) is satisfied

---

### Story 2.6: Create Epoch Status Display

As a trader,
I want to see the current epoch status,
So that I know how much time remains and what price I need to beat.

**Acceptance Criteria:**

**Given** an active epoch for the selected asset
**When** I view the epoch status area
**Then** the countdown timer shows time remaining until epoch end
**And** the timer updates every second with ±1 second accuracy (NFR5)
**And** the epoch state is displayed (Open, Frozen, Settling, Settled)
**And** the "Price to Beat" (start_price) is prominently shown
**And** a delta indicator shows current price distance from target (▲/▼ $XX)
**And** the freeze window is indicated (e.g., "Trading closes in X seconds")
**And** FR1, FR5 (epoch status, countdown) are satisfied
**And** AR26, AR27 (Price to Beat terminology, delta indicator) are satisfied

---

### Story 2.7: Implement Pool State Display

As a trader,
I want to see pool probabilities and depth,
So that I can understand the current market sentiment.

**Acceptance Criteria:**

**Given** an active pool with trading activity
**When** I view the pool state display
**Then** current probabilities (pYES/pNO) are calculated from reserves and displayed
**And** probabilities are shown as percentages (e.g., "UP: 65% / DOWN: 35%")
**And** pool depth/liquidity is displayed (total USDC in pool)
**And** a visual representation (progress bar or pie chart) shows the probability split
**And** the display updates within 1 second of on-chain changes (NFR2)
**And** FR3, FR4 (probability, pool depth) are satisfied

---

### Story 2.8: Create Trade Ticket Component

As a trader,
I want a clear interface to enter my trade,
So that I can quickly take a position.

**Acceptance Criteria:**

**Given** the trade ticket panel (35% right side)
**When** I interact with the trade ticket
**Then** I can select direction (UP or DOWN) with clear visual buttons
**And** I can enter USDC amount with numeric input
**And** quick amount buttons (25%, 50%, 75%, Max) are available
**And** my USDC balance is displayed
**And** the selected direction is visually highlighted
**And** input validation prevents invalid amounts (negative, exceeds balance)
**And** FR6, FR7 (take UP/DOWN position) are satisfied

---

### Story 2.9: Implement Trade Execution Flow

As a trader,
I want to submit my trade and see confirmation,
So that I know my position was opened successfully.

**Acceptance Criteria:**

**Given** a valid trade ticket with direction and amount
**When** I click the trade button
**Then** the transaction is built with buy_position instruction
**And** the wallet prompts for signature
**And** a loading state is shown during transaction confirmation
**And** on success, a toast notification confirms the trade
**And** the position appears in my positions list
**And** on failure, an error message explains what went wrong
**And** the UI updates to reflect new pool state
**And** FR40 (sign transactions) is satisfied

---

### Story 2.10: Add Trade Preview Calculations

As a trader,
I want to see expected outcomes before trading,
So that I can make informed decisions.

**Acceptance Criteria:**

**Given** a trade amount entered in the trade ticket
**When** the amount changes
**Then** expected execution price is calculated and displayed
**And** estimated probability impact is shown (how much pYES/pNO will change)
**And** fee amount is calculated (1.8% of trade amount)
**And** worst-case slippage is estimated and displayed
**And** shares to receive are calculated and shown
**And** calculations update in real-time as amount changes
**And** FR8, FR9, FR10, FR11 (preview calculations) are satisfied

---

### Story 2.11: Implement Epoch Auto-Creation

As a system,
I want epochs created automatically,
So that trading can continue seamlessly.

**Acceptance Criteria:**

**Given** the current epoch is in Frozen state or no epoch exists
**When** a trader visits the trading page
**Then** the frontend detects the need for a new epoch
**And** the frontend fetches a fresh Pyth Lazer price via WebSocket
**And** the create_epoch transaction is built with Ed25519 instruction first
**And** pythMessageOffset is correctly calculated (20 bytes)
**And** the transaction is submitted (can be signed by any wallet)
**And** on success, the new epoch becomes active
**And** FR52, FR53, FR54 (automatic epoch creation, price snapshot, freeze window) are satisfied

---

## Epic 3: Settlement & Payouts

Complete the trading loop with transparent settlement, confidence-aware refunds, and payout claiming.

### Story 3.1: Implement settle_epoch Instruction

As a system,
I want epochs to be settled with verified oracle prices,
So that outcomes are determined fairly and transparently.

**Acceptance Criteria:**

**Given** an epoch that has reached its end_time
**When** settle_epoch is called with a fresh Pyth Lazer message
**Then** the oracle signature is verified via Ed25519 CPI
**And** settlement_price, settlement_confidence, and settlement_publish_time are recorded
**And** oracle staleness is checked (≤10 seconds for settlement per NFR24)
**And** oracle confidence threshold is checked (≤0.8% per GlobalConfig)
**And** the outcome is determined: Up if settlement_price > start_price, Down otherwise
**And** epoch state transitions to Settled
**And** a `EpochSettled` event is emitted with outcome and prices
**And** FR55, FR56 (settlement price capture, outcome determination) are satisfied

---

### Story 3.2: Implement Confidence-Aware Refund Logic

As a trader,
I want automatic refunds when price confidence is uncertain,
So that I'm protected from unfair outcomes in ambiguous situations.

**Acceptance Criteria:**

**Given** an epoch being settled
**When** the confidence bands of start and settlement prices overlap
**Then** the outcome is set to Refunded instead of Up/Down
**And** epoch state transitions to Refunded
**And** all positions become eligible for full refund (original amount)
**And** a `EpochRefunded` event is emitted with confidence details
**And** the refund reason is stored for UI display
**And** FR57 (process refund when confidence bands overlap) is satisfied
**And** NFR14, NFR15 (oracle staleness/confidence triggers refund) are satisfied

---

### Story 3.3: Implement claim_payout Instruction

As a winning trader,
I want to claim my payout after settlement,
So that I receive my winnings.

**Acceptance Criteria:**

**Given** an epoch in Settled state with a determined outcome
**When** a winning position holder calls claim_payout
**Then** the payout amount is calculated (proportional share of losing side + original stake)
**And** USDC is transferred from pool to user
**And** the position's claimed flag is set to true
**And** FOGO Sessions signature extraction is used
**And** a `PayoutClaimed` event is emitted
**And** the instruction fails if already claimed or position is on losing side
**And** FR19 (claim payouts after settlement) is satisfied

---

### Story 3.4: Implement claim_refund Instruction

As a trader in a refunded epoch,
I want to claim my refund,
So that I recover my original stake.

**Acceptance Criteria:**

**Given** an epoch in Refunded state
**When** any position holder calls claim_refund
**Then** the original position amount is returned to user
**And** USDC is transferred from pool to user
**And** the position's claimed flag is set to true
**And** FOGO Sessions signature extraction is used
**And** a `RefundClaimed` event is emitted
**And** the instruction fails if already claimed
**And** FR20 (view refund status) is satisfied

---

### Story 3.5: Implement Fee Distribution

As a protocol,
I want fees distributed correctly after settlement,
So that LPs, treasury, and insurance receive their shares.

**Acceptance Criteria:**

**Given** an epoch being settled with trading fees collected
**When** settlement completes
**Then** total fees are calculated from all positions in the epoch
**And** 70% of fees go to LP reserve (increases pool value)
**And** 20% of fees go to treasury account
**And** 10% of fees go to insurance account
**And** fee distribution is atomic with settlement
**And** a `FeesDistributed` event is emitted with breakdown
**And** FR60 (fee distribution 70/20/10) is satisfied

---

### Story 3.6: Create Settlement Status UI

As a trader,
I want to see settlement details after an epoch ends,
So that I understand exactly what happened.

**Acceptance Criteria:**

**Given** a settled or refunded epoch
**When** I view the epoch details
**Then** the start price and publish time are displayed
**And** the settlement price and publish time are displayed
**And** confidence values for both snapshots are shown
**And** the outcome (UP won / DOWN won / Refunded) is clearly indicated
**And** the settlement timestamp is displayed
**And** FR21, FR22, FR23, FR24 (settlement transparency) are satisfied

---

### Story 3.7: Create Confidence Band Visualization

As a trader,
I want a visual explanation of refund scenarios,
So that I understand why an epoch was refunded.

**Acceptance Criteria:**

**Given** a refunded epoch
**When** I view the refund explanation
**Then** a visual diagram shows start price with confidence band
**And** settlement price with confidence band is overlaid
**And** the overlap region is highlighted
**And** text explains: "Settlement was too close to call with confidence"
**And** exact confidence values and prices are shown
**And** FR25, FR26 (refund explanation, confidence visualization) are satisfied
**And** AR28 (confidence band visualization) is satisfied

---

### Story 3.8: Create Claim Payout UI

As a trader,
I want a clear interface to claim my winnings or refunds,
So that I can easily collect what I'm owed.

**Acceptance Criteria:**

**Given** I have an unclaimed position in a settled/refunded epoch
**When** I view my positions
**Then** a "Claim" button is displayed for eligible positions
**And** the claimable amount is shown (payout or refund)
**And** clicking Claim initiates the appropriate transaction (claim_payout or claim_refund)
**And** loading state is shown during confirmation
**And** success toast confirms the claim
**And** the position updates to show "Claimed" status
**And** FR19 (claim payouts) is satisfied

---

### Story 3.9: Display Settlement History

As a trader,
I want to see past epoch outcomes,
So that I can review historical performance.

**Acceptance Criteria:**

**Given** the trading interface
**When** I view the epoch history section
**Then** recent epochs are listed with their outcomes
**And** each entry shows: epoch ID, start price, settlement price, outcome
**And** the list is paginated or scrollable for many epochs
**And** clicking an epoch shows full settlement details
**And** my positions in each epoch are indicated (if any)
**And** FR27 (view epoch history with outcomes) is satisfied

---

## Epic 4: Position Management & History

Provide comprehensive position tracking, early exit capability, and historical trading data.

### Story 4.1: Implement sell_position Instruction

As a trader,
I want to exit my position early,
So that I can lock in profits or cut losses before settlement.

**Acceptance Criteria:**

**Given** an open position in an epoch that is still in Open state
**When** I call sell_position with my position
**Then** shares are sold back to the pool using CPMM formula
**And** USDC is transferred from pool to user (minus fees)
**And** pool reserves are updated (same_side -= sell_amount)
**And** the position amount and shares are reduced (or position closed if full exit)
**And** FOGO Sessions signature extraction is used
**And** a `PositionClosed` or `PositionReduced` event is emitted
**And** the instruction fails if epoch is not in Open state
**And** FR12 (exit position early) is satisfied

---

### Story 4.2: Create Active Positions Panel

As a trader,
I want to see my open positions,
So that I can monitor my current exposure.

**Acceptance Criteria:**

**Given** I have positions in active epochs
**When** I view the positions panel
**Then** all my open positions are listed
**And** each position shows: asset, direction (UP/DOWN), amount, shares
**And** the epoch countdown is shown for each position
**And** positions are grouped or sortable by asset
**And** the panel updates in real-time as positions change
**And** FR15 (view open positions in current epochs) is satisfied

---

### Story 4.3: Implement Position PnL Calculations

As a trader,
I want to see my unrealized profit/loss,
So that I can make informed decisions about holding or exiting.

**Acceptance Criteria:**

**Given** an open position in an active epoch
**When** I view the position details
**Then** unrealized PnL is calculated based on current pool probabilities
**And** the calculation shows: current_value - entry_amount
**And** PnL is displayed in both USDC amount and percentage
**And** positive PnL is shown in green, negative in red
**And** PnL updates as pool state changes
**And** FR18 (view unrealized PnL) is satisfied

---

### Story 4.4: Create Multi-Asset Position View

As a trader,
I want to see positions across all assets at once,
So that I can manage my complete portfolio.

**Acceptance Criteria:**

**Given** I have positions in multiple asset pools
**When** I view the portfolio dashboard
**Then** positions across BTC, ETH, SOL, FOGO are displayed
**And** total portfolio value is calculated and shown
**And** aggregate unrealized PnL is displayed
**And** each asset section is collapsible/expandable
**And** quick links to trade each asset are available
**And** FR16 (view positions across multiple assets) is satisfied

---

### Story 4.5: Implement Early Exit UI

As a trader,
I want an interface to sell my position,
So that I can easily exit before settlement.

**Acceptance Criteria:**

**Given** an open position in an active epoch
**When** I click "Exit" or "Sell" on my position
**Then** a modal or panel shows the exit preview
**And** expected return amount is calculated and displayed
**And** fees for early exit are shown
**And** slippage warning is displayed if significant
**And** confirming initiates the sell_position transaction
**And** success/failure feedback is provided
**And** FR12 (exit position early) is satisfied

---

### Story 4.6: Add Cap Warning Indicators

As a trader,
I want warnings when I'm approaching position limits,
So that I know before my trade might be rejected.

**Acceptance Criteria:**

**Given** the trade ticket with an entered amount
**When** the amount approaches per-wallet or per-side caps
**Then** a warning indicator appears (yellow/orange)
**And** the warning explains which cap is being approached
**And** the remaining capacity before hitting the cap is shown
**And** if the cap would be exceeded, the trade button is disabled
**And** an error message explains why the trade cannot proceed
**And** FR13 (view cap warnings) is satisfied

---

### Story 4.7: Create Trading History View

As a trader,
I want to see my past trades,
So that I can review my performance over time.

**Acceptance Criteria:**

**Given** I have completed trades (settled epochs)
**When** I view my trading history
**Then** past positions are listed with settlement details
**And** each entry shows: asset, direction, amount, outcome, PnL
**And** realized PnL is calculated (payout_received - amount_invested)
**And** history is filterable by asset and time range
**And** aggregate statistics are shown (total PnL, win rate)
**And** FR17 (view realized PnL) is satisfied

---

## Epic 5: Liquidity Provision

Enable liquidity providers to deposit USDC, earn trading fees, and manage their LP positions.

### Story 5.1: Implement LpShare Account Structure

As a developer,
I want LP share tracking on-chain,
So that liquidity providers have verifiable ownership records.

**Acceptance Criteria:**

**Given** the Anchor program with Pool accounts
**When** I implement the LpShare account
**Then** the struct includes: user, pool, shares, pending_withdrawal, withdrawal_requested_at, bump
**And** PDA derivation uses seeds `[b"lp_share", user.key().as_ref(), pool.key().as_ref()]`
**And** account size is calculated correctly (106 bytes)
**And** the structure supports deposit, withdrawal request, and withdrawal processing

---

### Story 5.2: Implement deposit_liquidity Instruction

As a liquidity provider,
I want to deposit USDC into a pool,
So that I can earn trading fees.

**Acceptance Criteria:**

**Given** a pool and a user with USDC
**When** I call deposit_liquidity with an amount
**Then** USDC is transferred from user to pool token account
**And** the deposit is automatically split 50/50 between YES and NO reserves
**And** LP shares are calculated proportionally to pool value
**And** an LpShare account is created or updated for the user
**And** pool.total_lp_shares is incremented
**And** FOGO Sessions signature extraction is used
**And** a `LiquidityDeposited` event is emitted
**And** FR31 (deposit USDC into pool) is satisfied

---

### Story 5.3: Implement request_withdrawal Instruction

As a liquidity provider,
I want to request a withdrawal,
So that I can begin the process of removing my liquidity.

**Acceptance Criteria:**

**Given** an LpShare account with shares
**When** I call request_withdrawal with a share amount
**Then** pending_withdrawal is set to the requested amount
**And** withdrawal_requested_at is set to current timestamp
**And** the shares remain in the pool (not immediately withdrawn)
**And** FOGO Sessions signature extraction is used
**And** a `WithdrawalRequested` event is emitted
**And** the instruction fails if pending withdrawal already exists
**And** FR33 (request withdrawal at any time) is satisfied

---

### Story 5.4: Implement process_withdrawal Instruction

As a liquidity provider,
I want to complete my withdrawal after cooldown,
So that I receive my USDC.

**Acceptance Criteria:**

**Given** a pending withdrawal that has passed the cooldown period
**When** I call process_withdrawal
**Then** the cooldown period is verified (e.g., 1 epoch must have settled)
**And** USDC value is calculated from shares at current pool value
**And** USDC is transferred from pool to user
**And** LP shares are burned (total_lp_shares decremented)
**And** pending_withdrawal is reset to 0
**And** FOGO Sessions signature extraction is used
**And** a `WithdrawalProcessed` event is emitted
**And** FR36 (receive withdrawal payout after cooldown) is satisfied
**And** FR61 (system processes pending LP withdrawals) is satisfied

---

### Story 5.5: Create LP Dashboard

As a liquidity provider,
I want to see my LP positions and pool metrics,
So that I can monitor my investments.

**Acceptance Criteria:**

**Given** pools with liquidity
**When** I view the LP dashboard
**Then** each pool shows: TVL (total USDC), my share, my share value
**And** estimated APY is displayed based on recent trading volume
**And** my total LP value across all pools is shown
**And** recent fee earnings are displayed
**And** FR28, FR29, FR32 (TVL, APY, share value) are satisfied

---

### Story 5.6: Create Deposit Interface

As a liquidity provider,
I want a clear interface to deposit liquidity,
So that I understand the risks and can invest confidently.

**Acceptance Criteria:**

**Given** the LP dashboard with deposit option
**When** I initiate a deposit
**Then** a risk disclosure is displayed before proceeding
**And** the disclosure explains: impermanent loss risk, withdrawal cooldown, fee structure
**And** I must acknowledge the risks before depositing
**And** I can enter the USDC amount to deposit
**And** expected LP shares are calculated and shown
**And** confirming initiates the deposit_liquidity transaction
**And** FR30 (view risk disclosure) is satisfied

---

### Story 5.7: Create Withdrawal Interface

As a liquidity provider,
I want to manage my withdrawal process,
So that I can track when my funds will be available.

**Acceptance Criteria:**

**Given** my LP position with shares
**When** I initiate a withdrawal
**Then** I can enter the number of shares to withdraw
**And** the equivalent USDC value is displayed
**And** requesting starts the cooldown timer
**And** pending withdrawal status is shown with countdown
**And** once cooldown completes, a "Complete Withdrawal" button appears
**And** FR34, FR35 (pending status, cooldown timer) are satisfied

---

### Story 5.8: Implement APY Calculation

As a liquidity provider,
I want to see estimated APY,
So that I can evaluate the pool's profitability.

**Acceptance Criteria:**

**Given** historical trading volume data
**When** APY is calculated
**Then** recent trading volume (7-day or 30-day) is aggregated
**And** fees earned by LPs (70% of trading fees) are calculated
**And** APY is projected: (fees / TVL) * (365 / period_days)
**And** APY is displayed with a disclaimer about variability
**And** historical APY chart may be shown
**And** FR29 (view estimated APY) is satisfied

---

## Epic 6: Admin & Operations

Provide protocol operators with monitoring, configuration, and emergency controls.

### Story 6.1: Implement update_config Instruction

As an admin,
I want to update protocol parameters,
So that I can adjust fees, caps, and thresholds as needed.

**Acceptance Criteria:**

**Given** an initialized GlobalConfig and admin wallet
**When** I call update_config with new parameters
**Then** admin signature is verified against GlobalConfig.admin
**And** fee percentage can be updated (trading_fee_bps)
**And** per-wallet cap can be updated (per_wallet_cap_bps)
**And** per-side cap can be updated (per_side_cap_bps)
**And** oracle confidence thresholds can be updated
**And** epoch duration and freeze window can be updated
**And** a `ConfigUpdated` event is emitted with changed values
**And** FR47, FR48, FR49, FR50 (configure fees, caps, thresholds) are satisfied

---

### Story 6.2: Implement pause_pool Instruction

As an admin,
I want to pause a specific pool,
So that I can stop new epoch creation without affecting other pools.

**Acceptance Criteria:**

**Given** an active pool and admin wallet
**When** I call pause_pool for a specific asset
**Then** admin signature is verified against GlobalConfig.admin
**And** pool.is_frozen is set to true
**And** new epochs cannot be created for this pool
**And** existing epochs continue to settle normally
**And** trading in existing open epochs continues
**And** a `PoolPaused` event is emitted
**And** FR45 (pause new epoch creation) is satisfied

---

### Story 6.3: Implement resume_pool Instruction

As an admin,
I want to resume a paused pool,
So that trading can continue after an issue is resolved.

**Acceptance Criteria:**

**Given** a paused pool and admin wallet
**When** I call resume_pool for the paused asset
**Then** admin signature is verified against GlobalConfig.admin
**And** pool.is_frozen is set to false
**And** new epochs can be created again
**And** a `PoolResumed` event is emitted
**And** FR46 (resume epoch creation) is satisfied

---

### Story 6.4: Implement emergency_freeze Instruction

As an admin,
I want to freeze all protocol activity,
So that I can halt everything in case of a critical issue.

**Acceptance Criteria:**

**Given** the GlobalConfig and admin wallet
**When** I call emergency_freeze
**Then** admin signature is verified against GlobalConfig.admin
**And** GlobalConfig.frozen is set to true
**And** all trading instructions fail with "Protocol frozen" error
**And** all new epoch creation fails
**And** only claim instructions remain functional (users can withdraw funds)
**And** a `ProtocolFrozen` event is emitted
**And** FR51 (trigger emergency freeze) is satisfied
**And** NFR9 (emergency pause callable by admin) is satisfied

---

### Story 6.5: Create Admin Dashboard

As an admin,
I want to see system status at a glance,
So that I can monitor protocol health.

**Acceptance Criteria:**

**Given** the admin interface
**When** I view the admin dashboard
**Then** active epochs across all assets are displayed
**And** each pool shows: current epoch state, time remaining, position counts
**And** oracle health status is shown (last update time, confidence)
**And** any warnings or alerts are prominently displayed
**And** FR41, FR44 (view active epochs, oracle health) are satisfied

---

### Story 6.6: Create Configuration Panel

As an admin,
I want to modify protocol parameters through a UI,
So that I can adjust settings without command-line tools.

**Acceptance Criteria:**

**Given** the admin dashboard
**When** I access the configuration panel
**Then** current parameter values are displayed
**And** I can edit: trading fee %, wallet cap %, side cap %
**And** I can edit oracle confidence thresholds
**And** I can edit epoch duration and freeze window
**And** changes require wallet signature to submit
**And** success/failure feedback is provided
**And** FR47, FR48, FR49, FR50 (configure parameters) are satisfied

---

### Story 6.7: Create Pool Management UI

As an admin,
I want to manage individual pools,
So that I can pause/resume specific markets.

**Acceptance Criteria:**

**Given** the admin dashboard
**When** I view pool management
**Then** all pools are listed with their status (active/paused)
**And** each pool has Pause/Resume toggle buttons
**And** pausing requires wallet signature confirmation
**And** a confirmation modal warns about the impact
**And** pool status updates immediately after transaction confirms
**And** FR45, FR46 (pause/resume pools) are satisfied

---

### Story 6.8: Create Emergency Controls UI

As an admin,
I want prominent emergency controls,
So that I can act quickly in a crisis.

**Acceptance Criteria:**

**Given** the admin dashboard
**When** I access emergency controls
**Then** the global freeze button is prominently displayed
**And** it requires multi-step confirmation (type "FREEZE" to confirm)
**And** current frozen status is clearly shown
**And** an unfreeze option is available when frozen
**And** emergency contact information is displayed
**And** FR51 (trigger emergency freeze) is satisfied

---

### Story 6.9: Add Metrics and Monitoring

As an admin,
I want to see detailed metrics,
So that I can analyze protocol performance.

**Acceptance Criteria:**

**Given** the admin dashboard
**When** I view the metrics section
**Then** trading volume per asset is displayed (24h, 7d, 30d)
**And** refund rate is calculated and shown per asset
**And** oracle health metrics show update frequency and confidence history
**And** fee revenue is tracked and displayed
**And** metrics can be exported or displayed in charts
**And** FR42, FR43 (volume metrics, refund rate metrics) are satisfied
