# FOGO Testnet Setup Guide

Configuration and deployment guide for FogoPulse on FOGO testnet.

---

## FOGO Network Overview

FOGO is **SVM-compatible** (Solana Virtual Machine), which means:
- Existing Anchor programs compile unchanged
- Solana wallet adapters work with FOGO
- Pyth oracles use the same price feed IDs as Solana
- Only RPC endpoints and token mints differ

---

## Network Configuration

| Setting | Value |
|---------|-------|
| **RPC Endpoint** | `https://testnet.fogo.io` |
| **Faucet** | `https://faucet.fogo.io/` |
| **USDC Mint** | `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy` |

### Faucet Tokens

The FOGO faucet provides:
- Native FOGO (for transaction fees)
- FOGO SPL tokens
- fUSD tokens

---

## Pyth Oracle Support

FOGO testnet has multiple Pyth programs deployed. **FogoPulse uses Pyth Lazer** for oracle price verification.

### Pyth Programs on FOGO

| Program | Address | Used by FogoPulse? |
|---------|---------|-------------------|
| Receiver Program (legacy) | `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` | No |
| Price Feed Program (legacy) | `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT` | No |
| **Pyth Lazer Program** | `pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt` | **Yes** |
| Pyth Lazer Storage | `3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL` | **Yes** |
| Pyth Lazer Treasury | `upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr` | **Yes** |

### Why We Use Pyth Lazer (Not Legacy Pyth)

FogoPulse uses **`pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt`** (Pyth Lazer) because:
- It matches the `pyth-lazer-solana-contract` Rust crate's expected interface
- The FOGO-specific legacy program (`pythWSnswVUd...`) has a different instruction layout
- Using the legacy program returns `InstructionFallbackNotFound` error

**Important:** The Pyth Lazer program on FOGO is Solana's deployment - same program ID as Solana mainnet.

**Note:** For detailed Pyth Lazer integration specifics, see [pyth-lazer-ed25519-integration.md](./pyth-lazer-ed25519-integration.md).

---

## Solana CLI Configuration

### Set Up FOGO Testnet

```bash
# Set Solana CLI to FOGO testnet
solana config set --url https://testnet.fogo.io

# Create a new keypair for FOGO testnet
solana-keygen new --outfile ~/.config/solana/fogo-testnet.json

# Set the keypair as default
solana config set --keypair ~/.config/solana/fogo-testnet.json

# Verify configuration
solana config get
```

### Get Testnet Tokens

```bash
# Check balance
solana balance

# Get tokens from faucet (visit https://faucet.fogo.io/)
```

---

## Anchor Configuration Limitation

**Important:** Anchor 0.31.1 does NOT support custom cluster names like `fogo-testnet`.

### Workaround

1. Keep `cluster = "localnet"` in `Anchor.toml` (for Anchor compatibility)
2. Use `[programs.devnet]` section as an alias for your FOGO program ID
3. Deploy using `solana program deploy` directly (not `anchor deploy`)

### Anchor.toml Configuration

```toml
[features]
seeds = false
skip-lint = false

[programs.localnet]
fogopulse = "D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5"

[programs.devnet]
fogopulse = "D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/fogo-testnet.json"
```

---

## Program Deployment

### Build and Deploy

```bash
# Build the program
anchor build

# Deploy to FOGO testnet (NOT anchor deploy)
solana program deploy target/deploy/fogopulse.so

# Or deploy with specific keypair
solana program deploy target/deploy/fogopulse.so \
  --keypair ~/.config/solana/fogo-testnet.json \
  --program-id target/deploy/fogopulse-keypair.json
```

### Current Deployment

| Item | Value |
|------|-------|
| Program ID | `D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5` |
| GlobalConfig PDA | TBD - created in Story 1.11 |

---

## Frontend Configuration

### Cluster Data Access

Add FOGO testnet as the first entry in `defaultClusters`:

```typescript
// web/components/cluster/cluster-data-access.tsx
const defaultClusters: Cluster[] = [
  {
    name: 'fogo-testnet',
    endpoint: 'https://testnet.fogo.io',
    network: ClusterNetwork.Custom,
  },
  // ... other clusters
]
```

### USDC Mint Configuration

Configure cluster-specific USDC mints:

```typescript
// web/lib/constants.ts
export const USDC_MINTS: Record<string, PublicKey> = {
  'fogo-testnet': new PublicKey('6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy'),
  'devnet': new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
  // ...
}
```

### Environment Variables

Create `web/.env.local`:

```env
# Optional: Override default cluster
NEXT_PUBLIC_SOLANA_CLUSTER=fogo-testnet

# Mock data toggles (false for real chain data)
NEXT_PUBLIC_USE_MOCK_POOL=false
NEXT_PUBLIC_USE_MOCK_EPOCH=false
```

---

## GlobalConfig Initialization

### Initialize Script

```bash
cd anchor
npx ts-node scripts/initialize-fogo-testnet.ts
```

### Current Configuration Values

| Parameter | Value |
|-----------|-------|
| Trading Fee | 1.8% |
| LP Fee Share | 70% |
| Treasury Fee Share | 20% |
| Insurance Fee Share | 10% |
| Per Wallet Cap | 5% |
| Per Side Cap | 30% |
| Epoch Duration | 300 seconds (5 min) |
| Freeze Window | 15 seconds |
| Paused | false |
| Frozen | false |

---

## Explorer Links

FOGO testnet transactions can be viewed on Solana explorers with a custom RPC parameter:

```typescript
// Generate explorer URL for FOGO testnet
const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent('https://testnet.fogo.io')}`
```

**Important:** Don't hardcode explorer URLs to devnet - detect the current cluster and generate the correct URL.

---

## Troubleshooting

### "Account not found" after deployment

If you change a struct size (e.g., GlobalConfig from 147 to 155 bytes), existing accounts become incompatible. Solutions:
1. Migrate existing accounts (complex)
2. Fresh deploy with new program ID (simpler for testnet)

### Lost keypair

If you lose the program keypair, you cannot upgrade the program. Fresh deploy required.

### Cross-platform script paths

Don't hardcode Unix paths like `process.env.HOME`. Use:

```typescript
import os from 'os'
import path from 'path'

const keypairPath = path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')
```

---

## Key Deployed Addresses

| Account | Address |
|---------|---------|
| Program | `D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5` |
| GlobalConfig | TBD - created in Story 1.11 |
| USDC Mint | `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy` |
| BTC Pool | TBD - created in Story 1.11 |
| ETH Pool | TBD - created in Story 1.11 |
| SOL Pool | TBD - created in Story 1.11 |
| FOGO Pool | TBD - created in Story 1.11 |

---

## Related Documentation

- [FOGO Testnet Dev Notes](./fogo-testnet-dev-notes.md) - General development lessons
- [Pyth Lazer Ed25519 Integration](./pyth-lazer-ed25519-integration.md) - Oracle integration
- [FOGO Official Docs](https://docs.fogo.io/) - Official FOGO documentation

---

## Source

Extracted from Story 1.1.1: `_bmad-output/implementation-artifacts/1-1.1-configure-fogo-testnet.md`
