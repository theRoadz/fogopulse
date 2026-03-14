# FogoPulse Crank Bot

Standalone bot that manages the full epoch lifecycle for FogoPulse:
- **CREATE_EPOCH**: Creates new epoch when none exists
- **ADVANCE_EPOCH**: Transitions Open → Frozen at freeze_time
- **SETTLE_EPOCH**: Settles epoch at end_time with Pyth oracle price

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

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PYTH_ACCESS_TOKEN` | Yes | - | Pyth Lazer API token. Get from https://pyth.network/developers |
| `WALLET_PATH` | No | ~/.config/solana/fogo-testnet.json | Path to wallet keypair |
| `POLL_INTERVAL_SECONDS` | No | 10 | How often to check pool state (Open) |
| `IDLE_POLL_INTERVAL_SECONDS` | No | 180 | Poll interval when no epoch (3 min) |
| `RPC_URL` | No | https://testnet.fogo.io | Solana RPC endpoint |
| `POOL_ASSET` | No | BTC | Pool to monitor (BTC, ETH, SOL) |
| `LOG_LEVEL` | No | info | Log verbosity (debug, info, warn, error) |
| `AUTO_CREATE_EPOCH` | No | true | Auto-create epochs (set to 'false' to disable) |

## CLI Flags

| Flag | Description |
|------|-------------|
| `--epoch` | Enable epoch auto-creation (overrides env var, skips prompt) |
| `--no-epoch` | Disable epoch auto-creation (overrides env var, skips prompt) |

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

The bot runs a continuous polling loop:

```
┌─────────────────────────────────────────────────────────────┐
│                        POLL CYCLE                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Fetch Pool     │
                    │  Account State  │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    ┌─────────┐        ┌──────────┐        ┌──────────┐
    │ No Epoch│        │   Open   │        │  Frozen  │
    │ (None)  │        │  State   │        │  State   │
    └────┬────┘        └────┬─────┘        └────┬─────┘
         │                  │                   │
         ▼                  ▼                   ▼
  CREATE_EPOCH        freeze_time?         end_time?
    (Pyth)               passed?            passed?
         │              │       │            │       │
         │             YES      NO          YES      NO
         │              │       │            │       │
         │              ▼       ▼            ▼       ▼
         │         ADVANCE   WAIT       SETTLE    WAIT
         │          EPOCH               EPOCH
         │              │               (Pyth)
         └──────────────┴────────────────────┘
                        │
                        ▼
                 SLEEP(POLL_INTERVAL)
                        │
                        └──────────► REPEAT
```

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

- **Crash resilience**: Main loop catches unhandled errors and continues
- **Retry logic**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Auto-restart**: PM2 (dev) or systemd (prod) restarts on crash
- **Recoverable errors**: RPC/Pyth timeouts → retry next cycle
- **Critical errors**: Insufficient balance, missing wallet → exit

## Logs

Example output:
```
[2026-03-14T12:00:00.000Z] [INFO] Pool: BTC
[2026-03-14T12:00:00.100Z] [INFO] Wallet: 7xK...3nM
[2026-03-14T12:00:00.200Z] [INFO] Balance: 0.5000 SOL
[2026-03-14T12:00:01.000Z] [INFO] Cycle 1: None → Action: CREATE_EPOCH
[2026-03-14T12:00:01.500Z] [INFO] Fetching Pyth price for epoch creation...
[2026-03-14T12:00:05.000Z] [INFO] Epoch 5 created. TX: 3xK...2mN
[2026-03-14T12:00:05.100Z] [INFO] Explorer: https://explorer.fogo.io/tx/3xK...2mN
```

## Troubleshooting

### "PYTH_ACCESS_TOKEN environment variable required"
Set your Pyth token in `.env` file or environment.

### "Pool not found"
The pool hasn't been created yet. Run pool creation scripts first.

### "Insufficient balance"
Get testnet SOL from https://faucet.fogo.io/

### Transaction fails with "InvalidEpochState"
Another crank may have already processed this action. Normal during concurrent operation.

## License

MIT
