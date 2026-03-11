# FOGO Testnet Development Notes

Key findings and lessons learned from integrating FogoPulse with FOGO testnet.

---

## Solana Stack Overflow Fix (Anchor Programs)

### The Problem

Instructions with many accounts can exceed Solana's 4096 byte stack frame limit:

```
Access violation in stack frame 5 at address 0x200005cf8 of size 8
```

This error occurs at very low compute units (e.g., 3168 CU), indicating failure during account deserialization, not instruction logic.

### How to Detect

Anchor build will warn you:

```
Error: Function Buy::try_accounts Stack offset of 4856 exceeded max offset of 4096 by 760 bytes
```

### The Fix

Wrap large `Account<>` types with `Box<>` to move them from stack to heap:

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

### When to Apply

- Instructions with 10+ accounts
- Accounts with large data structures
- Any time you see the stack offset warning during `anchor build`

---

## Browser-Compatible PDA Derivation

### The Problem

Node.js `Buffer` methods like `writeBigUInt64LE()` are not available in browser environments.

```typescript
// This FAILS in browsers
const epochIdBuffer = Buffer.alloc(8)
epochIdBuffer.writeBigUInt64LE(BigInt(epochId))
```

### The Fix

Use manual byte conversion with `Uint8Array`:

```typescript
// Browser-compatible approach
const epochIdBuffer = new Uint8Array(8)
let n = BigInt(epochId)
for (let i = 0; i < 8; i++) {
  epochIdBuffer[i] = Number(n & BigInt(0xff))
  n = n >> BigInt(8)
}
```

### When This Applies

Any PDA derivation that includes numeric values (epoch IDs, timestamps, etc.) used in frontend code.

---

## USDC Mint Authority on Testnet

### The Problem

You may not control the mint authority of an existing testnet token. If you can't mint tokens, you can't test trading flows.

### The Solution

Create a NEW mint with your wallet as mint authority:

```bash
# Create new mint with your wallet as authority
spl-token create-token --decimals 6

# Mint tokens to your wallet
spl-token mint <NEW_MINT_ADDRESS> 100000
```

### Why Existing Pools Still Work

The Pool struct does NOT store USDC mint directly - it only stores `asset_mint`:

```rust
pub struct Pool {
    pub yes_reserves: u64,
    pub no_reserves: u64,
    pub total_lp_shares: u64,
    pub asset_mint: Pubkey,  // Only asset_mint stored, not USDC
    // ...
}
```

USDC mint is referenced at runtime from constants, so updating frontend constants is sufficient.

### Files to Update When Changing USDC Mint

| File | Purpose |
|------|---------|
| `web/lib/constants.ts` | Frontend constants |
| `web/hooks/use-execute-trade.ts` | Trade execution |
| `anchor/scripts/mint-test-usdc.ts` | Minting script |
| `anchor/scripts/create-pools.ts` | Pool creation |

---

## PDA Architecture (Critical)

### On-Chain Seeds

```rust
// Pool: one per asset (persistent across epochs)
seeds = [b"pool", asset_mint.as_ref()]

// Epoch: per pool + epoch_id
seeds = [b"epoch", pool.key().as_ref(), &epoch_id.to_le_bytes()]

// Position: per epoch + user
seeds = [b"position", epoch.key().as_ref(), user.key().as_ref()]
```

### Frontend Derivation

```typescript
export const SEEDS = {
  CONFIG: Buffer.from('global_config'),
  POOL: Buffer.from('pool'),
  EPOCH: Buffer.from('epoch'),
  POSITION: Buffer.from('position'),
} as const

// Pool PDA - from asset mint, NOT epoch
export function derivePoolPda(assetMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.POOL, assetMint.toBuffer()],
    PROGRAM_ID
  )
}

// Epoch PDA - from pool + epoch ID
export function deriveEpochPda(poolPda: PublicKey, epochId: number): [PublicKey, number] {
  const epochIdBuffer = new Uint8Array(8)
  let n = BigInt(epochId)
  for (let i = 0; i < 8; i++) {
    epochIdBuffer[i] = Number(n & BigInt(0xff))
    n = n >> BigInt(8)
  }
  return PublicKey.findProgramAddressSync(
    [SEEDS.EPOCH, poolPda.toBuffer(), epochIdBuffer],
    PROGRAM_ID
  )
}
```

---

## Pool Token Accounts: Use ATA, Not Custom PDA

### Wrong Approach

```typescript
// DON'T DO THIS - custom PDA for pool USDC
seeds = ["pool_usdc", epoch]
```

### Correct Approach

Use Associated Token Account (ATA) with PDA owner:

```typescript
import { getAssociatedTokenAddress } from '@solana/spl-token'

const poolUsdc = await getAssociatedTokenAddress(
  usdcMint,  // USDC mint
  poolPda,   // Pool PDA as owner
  true       // allowOwnerOffCurve = true (required for PDA owners)
)
```

The `allowOwnerOffCurve = true` parameter is critical when the token account owner is a PDA.

---

## Anchor Instruction Naming Convention

### On-Chain (Rust)

```rust
// snake_case in Rust
pub fn buy_position(ctx: Context<Buy>, ...) -> Result<()>
```

### Frontend (TypeScript)

Anchor automatically converts to camelCase in the IDL:

```typescript
// camelCase in TypeScript
await program.methods
  .buyPosition(direction, amount, minSharesOut)
  .accounts({...})
  .rpc()
```

### Common Mistake

Assuming the instruction name is `buy` when it's actually `buy_position` -> `buyPosition`.

---

## Environment-Based Mock Data Toggle

### Configuration

```env
# web/.env.local
NEXT_PUBLIC_USE_MOCK_POOL=false
NEXT_PUBLIC_USE_MOCK_EPOCH=false
```

### Usage Pattern

```typescript
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_POOL === 'true'

export function usePool(asset: Asset) {
  if (USE_MOCK) {
    return { data: MOCK_POOL_DATA, isLoading: false }
  }
  // Fetch real data from chain
}
```

### Defaults

- Development: Mock data enabled (faster iteration)
- Production: Real chain data

---

## Key Testnet Addresses (FOGO)

| Account | Address |
|---------|---------|
| Program | `6GJBgvTbE8wRN86iyfAPE8CEBqDNcbb7ReQ7ycacGJqq` |
| GlobalConfig | `29iqRjEUTFhFHnqUqyk2frF3p52bAzjrbcRvYdbgsdi3` |
| USDC Mint | `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy` |
| BTC Pool | `G8RK2T9LGKe1CavtvEWbXgkHzKFEYPYnNPcQL91FRFpE` |
| ETH Pool | `EBWAWhf5q3eEx1hdJRtVZNm2oHF6WhX9BdGo9aTpviCs` |
| SOL Pool | `G9sE5RtaLLRoNfQ4nrthQQUKyxQfpcAgvExavvwR8KVH` |
| FOGO Pool | `FYeD5NdHtNFxhRqKqdN5pF3j4GU9iihFGWcgemf2eJ78` |

---

## Useful Scripts

### Mint Test USDC

```bash
cd anchor
npx ts-node scripts/mint-test-usdc.ts <WALLET_ADDRESS>
```

### Create Epoch (requires Pyth Lazer token)

```bash
cd anchor
PYTH_ACCESS_TOKEN=xxx npx ts-node scripts/create-epoch.ts --asset BTC --epoch-id 0
```

### Check Epoch States

```bash
npx ts-node scripts/check-epochs.ts
```

### Check/Create ATAs

```bash
npx ts-node scripts/check-atas.ts
```

### Rebuild & Redeploy Program

```bash
anchor build
solana program deploy target/deploy/fogopulse.so \
  --keypair ~/.config/solana/fogo-testnet.json \
  --program-id target/deploy/fogopulse-keypair.json
```

---

## Related Documentation

- [Pyth Lazer Ed25519 Integration](./pyth-lazer-ed25519-integration.md) - Oracle integration specifics
- Original story: `_bmad-output/implementation-artifacts/2-4-test-buy-position-frontend.md`
