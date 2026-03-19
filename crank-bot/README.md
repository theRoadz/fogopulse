# FogoPulse Crank Bot

Standalone bot that manages the full epoch lifecycle for FogoPulse:
- **CREATE_EPOCH**: Creates new epoch when none exists
- **ADVANCE_EPOCH**: Transitions Open → Frozen at freeze_time
- **SETTLE_EPOCH**: Settles epoch at end_time with Pyth oracle price

Supports **multi-pool concurrent execution** — runs independent pool runners for BTC, ETH, SOL, and FOGO simultaneously in a single process, sharing a persistent Pyth WebSocket connection.

## Prerequisites

- Node.js 18+
- Wallet keypair with SOL for transaction fees
- Pyth Lazer API access token

## Local Setup (Windows/Linux/Mac)

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your values:
# - PYTH_ACCESS_TOKEN (required)
# - WALLET_PATH (optional, defaults to ~/.config/solana/fogo-testnet.json)

# Run the bot (will prompt for epoch creation mode)
npx tsx crank-bot.ts

# Or use CLI flags to skip prompt
npx tsx crank-bot.ts --epoch      # Enable epoch auto-creation
npx tsx crank-bot.ts --no-epoch   # Disable epoch auto-creation
```

## Multi-Pool Configuration

By default, the bot manages all 4 pools concurrently: BTC, ETH, SOL, FOGO.

```bash
# Run all pools (default)
POOL_ASSETS=BTC,ETH,SOL,FOGO npx tsx crank-bot.ts --epoch

# Run specific pools
POOL_ASSETS=BTC,SOL npx tsx crank-bot.ts --epoch

# CLI flag overrides env var
npx tsx crank-bot.ts --epoch --pools BTC,ETH

# Legacy single-pool mode (backward compatible)
POOL_ASSET=BTC npx tsx crank-bot.ts --epoch
```

**Config priority:** `--pools` CLI flag > `POOL_ASSETS` env var > `POOL_ASSET` env var > default (all 4)

Each pool gets an independent runner with:
- Its own cycle counter and polling interval
- Pool-prefixed logs (e.g., `[BTC] Cycle 1: ...`, `[ETH] Cycle 3: ...`)
- Independent error handling (one pool's failure doesn't affect others)
- Independent deterministic chaining (create → advance → settle → create)

All runners share:
- Single persistent Pyth WebSocket (with auto-reconnect)
- Single RPC connection
- Single wallet

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PYTH_ACCESS_TOKEN` | Yes | - | Pyth Lazer API token. Get from https://pyth.network/developers |
| `WALLET_PATH` | No | ~/.config/solana/fogo-testnet.json | Path to wallet keypair |
| `POLL_INTERVAL_SECONDS` | No | 10 | How often to check pool state (Open) |
| `IDLE_POLL_INTERVAL_SECONDS` | No | 180 | Poll interval when no epoch (3 min) |
| `RPC_URL` | No | https://testnet.fogo.io | Solana RPC endpoint |
| `POOL_ASSETS` | No | BTC,ETH,SOL,FOGO | Comma-separated pools to monitor |
| `POOL_ASSET` | No | BTC | Legacy single-pool (used if POOL_ASSETS not set) |
| `LOG_LEVEL` | No | info | Log verbosity (debug, info, warn, error) |
| `AUTO_CREATE_EPOCH` | No | true | Auto-create epochs (set to 'false' to disable) |

## CLI Flags

| Flag | Description |
|------|-------------|
| `--epoch` | Enable epoch auto-creation (overrides env var, skips prompt) |
| `--no-epoch` | Disable epoch auto-creation (overrides env var, skips prompt) |
| `--pools BTC,ETH` | Override which pools to run (overrides env vars) |

**Priority:** CLI flag > env var > interactive prompt

## Contabo Deployment (Linux VPS)

### 1. Setup Server

```bash
# SSH to server
ssh user@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create app directory
mkdir -p ~/fogopulse-crank
cd ~/fogopulse-crank
```

### 2. Deploy Files

From your local machine:
```bash
scp crank-bot.ts package.json .env user@your-server-ip:~/fogopulse-crank/
```

### 3. Setup Wallet

```bash
# On server
mkdir -p ~/.config/solana

# Copy wallet from local machine
scp ~/.config/solana/fogo-testnet.json user@your-server-ip:~/.config/solana/
```

### 4. Install Dependencies

```bash
cd ~/fogopulse-crank
npm install
```

### 5. Create Systemd Service

Create `/etc/systemd/system/fogopulse-crank.service`:

```ini
[Unit]
Description=FogoPulse Crank Bot
After=network.target

[Service]
Type=simple
User=<your-username>
WorkingDirectory=/home/<your-username>/fogopulse-crank
EnvironmentFile=/home/<your-username>/fogopulse-crank/.env
ExecStart=/usr/bin/npx tsx crank-bot.ts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 6. Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable fogopulse-crank
sudo systemctl start fogopulse-crank
```

### 7. Monitor

```bash
# Check status
sudo systemctl status fogopulse-crank

# View live logs
sudo journalctl -u fogopulse-crank -f

# View recent logs
sudo journalctl -u fogopulse-crank -n 100

# Restart
sudo systemctl restart fogopulse-crank

# Stop
sudo systemctl stop fogopulse-crank
```

## How It Works

The bot runs independent pool runners concurrently:

```
┌─────────────────────────────────────────────────────────────┐
│                    CRANK BOT STARTUP                         │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌────────────┐  ┌────────────┐  ┌────────────┐
       │ PoolRunner │  │ PoolRunner │  │ PoolRunner │  ...
       │   [BTC]    │  │   [ETH]    │  │   [SOL]    │
       └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
             │               │               │
             ▼               ▼               ▼
      Independent      Independent      Independent
      polling loop     polling loop     polling loop
```

Each runner follows this state machine per cycle:

```
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    ┌─────────┐        ┌──────────┐        ┌──────────┐
    │ No Epoch│        │   Open   │        │  Frozen  │
    └────┬────┘        └────┬─────┘        └────┬─────┘
         │                  │                   │
         ▼                  ▼                   ▼
  CREATE_EPOCH        ADVANCE_EPOCH        SETTLE_EPOCH
    (Pyth)               │                  (Pyth)
         │                ▼                   │
         └──────► CHAIN LOOP ◄────────────────┘
                  (deterministic)
```

**Deterministic chaining:** Once a CREATE is triggered, the bot chains:
create → sleep(freezeTime) → advance → sleep(endTime) → settle → create → ...
without polling, until shutdown or error.

## Running with PM2 (Recommended for Development)

PM2 provides auto-restart on crash, log management, and background daemon operation.

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot (opens a node window briefly on Windows - this is normal)
pm2 start ecosystem.config.cjs

# Monitor logs
pm2 logs fogopulse-crank
pm2 logs fogopulse-crank --lines 50  # Last 50 lines

# Check status
pm2 status

# Save process list (persists across terminal close)
pm2 save

# Stop the bot
pm2 stop fogopulse-crank

# Remove from PM2
pm2 delete fogopulse-crank

# Kill PM2 daemon entirely
pm2 kill
```

**Note:** PM2 runs as a background daemon. You can close all terminals and the bot keeps running. Open a new terminal and run `pm2 status` to verify.

## Error Handling

- **Crash resilience**: Each pool runner catches unhandled errors and continues independently
- **Retry logic**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Auto-restart**: PM2 (dev) or systemd (prod) restarts on crash
- **Recoverable errors**: RPC/Pyth timeouts → retry next cycle
- **Critical errors**: Insufficient balance, missing wallet → all runners exit
- **Pyth WS fallback**: If persistent WebSocket drops, auto-reconnects with backoff; individual price fetches fall back to one-shot connections

## Logs

Example output (multi-pool):
```
[2026-03-18T12:00:00.000Z] [INFO] Pools: BTC, ETH, SOL, FOGO
[2026-03-18T12:00:00.100Z] [INFO] Wallet: 7xK...3nM
[2026-03-18T12:00:00.200Z] [INFO] Balance: 0.5000 SOL
[2026-03-18T12:00:00.300Z] [INFO] PythPriceManager: Connected to Pyth Lazer WebSocket
[2026-03-18T12:00:00.400Z] [INFO] PythPriceManager: Subscribed to feeds: [1, 2, 5, 2923]
[2026-03-18T12:00:01.000Z] [INFO] [BTC] Cycle 1: None → Action: CREATE_EPOCH
[2026-03-18T12:00:01.100Z] [INFO] [ETH] Cycle 1: Open, waiting 120s
[2026-03-18T12:00:01.500Z] [INFO] [BTC] Epoch 5 created. TX: 3xK...2mN
[2026-03-18T12:00:02.000Z] [INFO] [SOL] Cycle 1: Frozen → Action: SETTLE_EPOCH
[2026-03-18T12:00:02.100Z] [INFO] [FOGO] Cycle 1: None → Action: CREATE_EPOCH
```

## Troubleshooting

### "PYTH_ACCESS_TOKEN environment variable required"
Set your Pyth token in `.env` file or environment.

### "Pool not found"
The pool hasn't been created yet. Run pool creation scripts first.

### "Insufficient balance"
Get testnet SOL from https://faucet.fogo.io/. With multi-pool, you need at least 0.01 SOL per pool.

### Transaction fails with "InvalidEpochState"
Another crank may have already processed this action. Normal during concurrent operation.

### "PythPriceManager: WebSocket closed"
The persistent connection dropped. Auto-reconnect is built in. Individual fetches fall back to one-shot connections.

## License

MIT
