# FogoPulse

Short-duration binary prediction market on the FOGO chain.

Trade the direction of crypto assets (BTC, ETH, SOL, FOGO) over 1, 5, or 15-minute epochs. Take UP or DOWN positions, and get paid when you're right.

## How It Works

1. **Pick an asset** - BTC/USD, ETH/USD, SOL/USD, or FOGO/USD
2. **Choose a direction** - Will the price go UP or DOWN?
3. **Enter a position** - Trade against a constant-product AMM
4. **Wait for settlement** - Oracle snapshots the price at epoch end
5. **Collect winnings** - Winners split the losing side's stake (minus fees)

The system uses **Pyth Lazer oracles** for price data. If oracle confidence is too wide at settlement, the epoch refunds everyone - no forced losers on uncertain data.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Chain | FOGO (SVM-compatible) |
| Smart Contracts | Rust + Anchor |
| Frontend | Next.js 16, TypeScript, Tailwind, shadcn/ui |
| State | Zustand, React Query, Jotai |
| Wallet | Solana Wallet Adapter (Phantom, Nightly, Backpack) |
| Oracle | Pyth Lazer + Hermes |
| Charts | Lightweight Charts |

## Project Structure

```
fogopulse/
├── anchor/          # Rust/Anchor smart contracts
├── web/             # Next.js frontend
├── crank-bot/       # Epoch lifecycle automation
└── docs/            # Technical documentation
```

## Current Progress

### Completed

**Foundation & Infrastructure**
- Project scaffolding with create-solana-dapp
- Dark/light theme system with shadcn/ui
- FOGO testnet deployment
- All core account structures (GlobalConfig, Pool, Epoch, UserPosition)
- Pyth Lazer Ed25519 signature verification
- FOGO Sessions SDK integration (gasless tx ready)

**Trading Core**
- buy_position instruction with CPMM pricing
- Wallet connection UI
- Asset selector with multi-market support
- Real-time price chart with smooth curves
- Epoch countdown and status display
- Pool state visualization (liquidity depth, probability)
- Trade ticket with preview calculations
- Full trade execution flow
- Per-wallet (5%) and per-side (30%) position caps

**Settlement & Automation**
- advance_epoch instruction (freeze trading)
- settle_epoch instruction (oracle-based resolution)
- Confidence-aware refund logic
- Standalone crank bot for epoch lifecycle
- Pool auto-rebalancing on settlement
- Admin force-close for emergencies

### In Progress

- Claim payout/refund UI
- Settlement status display
- Confidence band visualization

### Upcoming

- Position management dashboard
- Liquidity provision (LP deposit/withdraw)
- Trading history
- Admin monitoring dashboard

## Development

```bash
# Install dependencies
pnpm install

# Start frontend dev server
pnpm dev

# Build Anchor programs (requires WSL on Windows)
pnpm anchor-build

# Run crank bot
cd crank-bot && npm start
```

## Architecture Highlights

- **Constant-Product AMM**: Pricing via x*y=k curve
- **Epoch State Machine**: INIT → OPEN → FROZEN → SETTLING → SETTLED/REFUNDED
- **Fee Distribution**: 70% LPs, 20% Treasury, 10% Insurance
- **Trust-First Settlement**: Refund on uncertain oracle data rather than force outcomes

---

Built on FOGO chain. Powered by Pyth oracles.
