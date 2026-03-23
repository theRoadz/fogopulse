# Deployment Guide: FogoPulse Crank Bot on Fresh Ubuntu Server (Contabo)

## Prerequisites (Prepare BEFORE connecting to server)

1. **Pyth Access Token** - Get from https://pyth.network/developers
2. **Server SSH access** - Your server IP and credentials

---

## Step-by-Step Deployment

### Step 1: Connect to Server
```bash
ssh root@<your-server-ip>
```

### Step 2: Create Non-Root User (Security Best Practice)
```bash
adduser fogopulse
usermod -aG sudo fogopulse
su - fogopulse
```

### Step 3: Install Node.js 20.x LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # Verify: should show v20.x.x
```

### Step 4: Install Solana CLI and Create Wallet
```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Add to PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Create wallet
mkdir -p ~/.config/solana
solana-keygen new --outfile ~/.config/solana/fogo-testnet.json

# Set permissions
chmod 600 ~/.config/solana/fogo-testnet.json

# Get public address (copy this to fund at faucet)
solana-keygen pubkey ~/.config/solana/fogo-testnet.json
```

**Fund the wallet:** Go to https://faucet.fogo.io/ and paste your public address.

### Step 5: Create App Directory
```bash
mkdir -p ~/fogopulse-crank
cd ~/fogopulse-crank
```

### Step 6: Transfer Files from Local Machine
**Run these from YOUR LOCAL machine (not the server):**
```bash
cd D:\dev\fogopulse\crank-bot
scp crank-bot.ts package.json fogopulse@<server-ip>:~/fogopulse-crank/
```

### Step 7: Install Dependencies
```bash
cd ~/fogopulse-crank
npm install
```

### Step 8: Create Environment File
```bash
cat > .env << 'EOF'
# Required
PYTH_ACCESS_TOKEN=<paste-your-token-here>

# Optional (defaults shown)
WALLET_PATH=/home/fogopulse/.config/solana/fogo-testnet.json
POLL_INTERVAL_SECONDS=10
IDLE_POLL_INTERVAL_SECONDS=180
RPC_URL=https://testnet.fogo.io
POOL_ASSET=BTC
LOG_LEVEL=info
AUTO_CREATE_EPOCH=true
EOF

# Secure the file
chmod 640 .env
```

### Step 9: Test Manual Run
```bash
npx tsx crank-bot.ts --epoch
# Press Ctrl+C after verifying it connects and shows wallet balance
```

### Step 10: Create Systemd Service
```bash
sudo tee /etc/systemd/system/fogopulse-crank.service > /dev/null << 'EOF'
[Unit]
Description=FogoPulse Crank Bot
After=network.target

[Service]
Type=simple
User=fogopulse
WorkingDirectory=/home/fogopulse/fogopulse-crank
EnvironmentFile=/home/fogopulse/fogopulse-crank/.env
ExecStart=/usr/bin/npx tsx crank-bot.ts --epoch
# Use --epoch to auto-create epochs, or --no-epoch to only settle/close existing ones
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

### Step 11: Enable and Start Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable fogopulse-crank
sudo systemctl start fogopulse-crank
```

### Step 12: Verify Running
```bash
sudo systemctl status fogopulse-crank
sudo journalctl -u fogopulse-crank -f  # Live logs (Ctrl+C to exit)
```

---

## Common Commands

| Action | Command |
|--------|---------|
| View status | `sudo systemctl status fogopulse-crank` |
| View live logs | `sudo journalctl -u fogopulse-crank -f` |
| View last 100 logs | `sudo journalctl -u fogopulse-crank -n 100` |
| Stop bot | `sudo systemctl stop fogopulse-crank` |
| Restart bot | `sudo systemctl restart fogopulse-crank` |
| Disable autostart | `sudo systemctl disable fogopulse-crank` |
| List all fogopulse services | `sudo systemctl list-units --type=service \| grep fogopulse` |
| Status of all fogopulse services | `sudo systemctl status fogopulse-crank fogopulse-trade-bot` |
| Edit crank service file | `sudo nano /etc/systemd/system/fogopulse-crank.service` |
| Edit trade bot service file | `sudo nano /etc/systemd/system/fogopulse-trade-bot.service` |
| Reload after editing service | `sudo systemctl daemon-reload && sudo systemctl restart fogopulse-crank` |

> **nano shortcuts:** `Ctrl+O` then `Enter` to save, `Ctrl+X` to exit.

---

## Switching Epoch Mode

The crank bot supports two modes via CLI flags:

| Flag | Behavior |
|------|----------|
| `--epoch` | Auto-create new epochs when none exist (default for production) |
| `--no-epoch` | Only settle/close existing epochs, never create new ones |

**Note:** These flags are passed to `crank-bot.ts`, not to `systemctl`. You cannot use `systemctl start fogopulse-crank --epoch`.

To switch modes, edit the service file:
```bash
sudo nano /etc/systemd/system/fogopulse-crank.service
```

Change the `ExecStart` line to use the desired flag:
```bash
# With epoch creation:
ExecStart=/usr/bin/npx tsx crank-bot.ts --epoch

# Without epoch creation:
ExecStart=/usr/bin/npx tsx crank-bot.ts --no-epoch
```

Then reload and restart:
```bash
sudo systemctl daemon-reload
sudo systemctl restart fogopulse-crank
```

---

## Updating the Crank Bot

When you've made changes to `crank-bot.ts` locally and need to deploy them to the server:

### 1. Transfer the updated file from your local machine
```bash
scp D:/dev/fogopulse/crank-bot/crank-bot.ts fogopulse@<server-ip>:/home/fogopulse/fogopulse-crank/crank-bot.ts
```

To update multiple files at once:
```bash
scp D:/dev/fogopulse/crank-bot/crank-bot.ts D:/dev/fogopulse/crank-bot/package.json fogopulse@<server-ip>:/home/fogopulse/fogopulse-crank/
```

### 2. SSH into the server and restart
```bash
ssh fogopulse@<server-ip>
sudo systemctl restart fogopulse-crank
```

### 3. Verify the update
```bash
sudo journalctl -u fogopulse-crank -f
```

> **Note:** If `package.json` changed (new dependencies), run `cd ~/fogopulse-crank && npm install` before restarting.

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| "PYTH_ACCESS_TOKEN required" | Check `.env` file has valid token |
| "Failed to load wallet" | Verify wallet path and permissions (chmod 600) |
| "Insufficient balance" | Fund wallet at https://faucet.fogo.io/ |
| "Pool not found" | Pool hasn't been created on-chain yet |
| "InvalidEpochState" | Another crank bot already processed this action (normal if running multiple bots) |
| Service won't start | Check `sudo journalctl -u fogopulse-crank -n 50` |

---

## Security Checklist

- [x] Run as non-root user (`fogopulse`)
- [x] Wallet file permissions: 600
- [x] `.env` file permissions: 640
- [x] Systemd auto-restart on failure
- [x] Logs via journald (not world-readable files)

---

## Files on Server After Deployment

```
/home/fogopulse/
├── fogopulse-crank/
│   ├── crank-bot.ts
│   ├── package.json
│   ├── package-lock.json
│   ├── .env
│   └── node_modules/
└── .config/solana/
    └── fogo-testnet.json

/etc/systemd/system/
└── fogopulse-crank.service
```

---

---

# Trade Simulation Bot Deployment

The trade bot runs alongside the crank bot on the same server, sharing the same Node.js install, wallet, and `.env` file.

## Prerequisites

- Crank bot already deployed (Steps 1–7 above completed)
- Master wallet is the USDC mint authority on testnet

## Step 1: Transfer Trade Bot Files

**From your LOCAL machine:**
```bash
cd D:\dev\fogopulse\crank-bot
scp trade-bot.ts setup-fund-trade-bots.ts fogopulse@<server-ip>:~/fogopulse-crank/
```

## Step 2: Set Up Bot Wallets on Server

```bash
cd ~/fogopulse-crank
npx tsx setup-fund-trade-bots.ts --count 5
```

This generates 5 keypairs in `./trade-bot-wallets/`, funds each with 0.1 SOL, and transfers 100,000 USDC per wallet from the master wallet's balance.

> **Note:** This script uses SPL `transfer` (not `mintTo`), so the master wallet must hold enough USDC. Use `setup-trade-bots.ts` locally if your wallet is the USDC mint authority.

To customize:
```bash
npx tsx setup-fund-trade-bots.ts --count 10 --sol-per-bot 0.2 --usdc-per-bot 50000
```

## Step 3: Add Trade Bot Env Vars

Append to your existing `.env`:
```bash
cat >> .env << 'EOF'

# Trade Bot Configuration
TRADE_BOT_ENABLED=true
TRADE_BOT_COUNT=5
TRADE_BOT_MIN_AMOUNT=0.5
TRADE_BOT_MAX_AMOUNT=5.0
TRADE_BOT_MAX_TRADES_PER_EPOCH=2
TRADE_BOT_WALLETS_DIR=./trade-bot-wallets
TRADE_BOT_POLL_INTERVAL_SECONDS=10
EOF
```

> **Note:** `TRADE_BOT_COUNT` must match the `--count` you used in setup.

## Step 4: Test Manual Run

```bash
npx tsx trade-bot.ts
# Verify it loads wallets, connects to RPC, and starts monitoring markets
# Press Ctrl+C to stop
```

## Step 5: Create Systemd Service

```bash
sudo tee /etc/systemd/system/fogopulse-trade-bot.service > /dev/null << 'EOF'
[Unit]
Description=FogoPulse Trade Simulation Bot
After=network.target

[Service]
Type=simple
User=fogopulse
WorkingDirectory=/home/fogopulse/fogopulse-crank
EnvironmentFile=/home/fogopulse/fogopulse-crank/.env
ExecStart=/usr/bin/npx tsx trade-bot.ts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

## Step 6: Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable fogopulse-trade-bot
sudo systemctl start fogopulse-trade-bot
```

## Step 7: Verify Running

```bash
sudo systemctl status fogopulse-trade-bot
sudo journalctl -u fogopulse-trade-bot -f
```

## Trade Bot Commands

| Action | Command |
|--------|---------|
| View status | `sudo systemctl status fogopulse-trade-bot` |
| View live logs | `sudo journalctl -u fogopulse-trade-bot -f` |
| View last 100 logs | `sudo journalctl -u fogopulse-trade-bot -n 100` |
| Stop bot | `sudo systemctl stop fogopulse-trade-bot` |
| Restart bot | `sudo systemctl restart fogopulse-trade-bot` |
| Disable autostart | `sudo systemctl disable fogopulse-trade-bot` |

## Updating the Trade Bot

**From your LOCAL machine:**
```bash
scp D:/dev/fogopulse/crank-bot/trade-bot.ts fogopulse@<server-ip>:/home/fogopulse/fogopulse-crank/trade-bot.ts
```

**On the SERVER:**
```bash
sudo systemctl restart fogopulse-trade-bot
sudo journalctl -u fogopulse-trade-bot -f
```

## Adding More Bot Wallets

To add more wallets later, just increase `--count` and re-run setup. Existing wallets are loaded (not overwritten), only new ones are created:
```bash
npx tsx setup-trade-bots.ts --count 10
```
Then update `TRADE_BOT_COUNT=10` in `.env` and restart the service.

## Trade Bot Troubleshooting

| Error | Solution |
|-------|----------|
| "TRADE_BOT_ENABLED is not set" | Add `TRADE_BOT_ENABLED=true` to `.env` |
| "Failed to load bot wallet" | Check `TRADE_BOT_COUNT` matches actual wallet files in `trade-bot-wallets/` |
| "Insufficient USDC balance" | Re-run `setup-trade-bots.ts` to mint more USDC |
| "fetch failed" on RPC | Transient RPC issue — the bot auto-retries, or restart manually |
| Bot not placing trades | Check epoch is in Open state and `TRADE_BOT_MAX_TRADES_PER_EPOCH` isn't exceeded |

## Files on Server After Full Deployment

```
/home/fogopulse/
├── fogopulse-crank/
│   ├── crank-bot.ts
│   ├── trade-bot.ts
│   ├── setup-trade-bots.ts
│   ├── package.json
│   ├── package-lock.json
│   ├── .env
│   ├── node_modules/
│   └── trade-bot-wallets/
│       ├── bot-0.json
│       ├── bot-1.json
│       └── ...
└── .config/solana/
    └── fogo-testnet.json

/etc/systemd/system/
├── fogopulse-crank.service
└── fogopulse-trade-bot.service
```

---

## Alternative: Transfer Existing Wallet

If you want to use an existing wallet instead of creating a new one:

**From your LOCAL machine:**
```bash
scp ~/.config/solana/fogo-testnet.json fogopulse@<server-ip>:~/.config/solana/
```

**On the SERVER:**
```bash
chmod 600 ~/.config/solana/fogo-testnet.json
```
