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
