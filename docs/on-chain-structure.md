# On-Chain Architecture Reference

Comprehensive reference for FogoPulse on-chain account structures, PDA derivations, and key patterns.

---

## Account Structures

### GlobalConfig (Singleton)

The global configuration account controls system-wide parameters.

```rust
pub struct GlobalConfig {
    pub admin: Pubkey,                              // Admin authority
    pub treasury: Pubkey,                           // Treasury account
    pub insurance: Pubkey,                          // Insurance buffer account
    pub trading_fee_bps: u16,                       // 180 = 1.8%
    pub lp_fee_share_bps: u16,                      // 7000 = 70%
    pub treasury_fee_share_bps: u16,                // 2000 = 20%
    pub insurance_fee_share_bps: u16,               // 1000 = 10%
    pub per_wallet_cap_bps: u16,                    // 500 = 5%
    pub per_side_cap_bps: u16,                      // 3000 = 30%
    pub oracle_confidence_threshold_start_bps: u16, // 25 = 0.25%
    pub oracle_confidence_threshold_settle_bps: u16,// 80 = 0.8%
    pub oracle_staleness_threshold_start: i64,      // 3 seconds
    pub oracle_staleness_threshold_settle: i64,     // 10 seconds
    pub freeze_window_seconds: i64,                 // 15 seconds
    pub epoch_duration_seconds: i64,                // 300 = 5 minutes
    pub paused: bool,                               // Pause new epochs
    pub frozen: bool,                               // Emergency freeze
    pub bump: u8,
}
// Size: 155 bytes (8 discriminator + 147 data)
```

### Pool (Per Asset)

One pool per tradable asset. Pools are persistent across epochs.

```rust
pub struct Pool {
    pub yes_reserves: u64,      // YES token reserves
    pub no_reserves: u64,       // NO token reserves
    pub total_lp_shares: u64,   // Total LP shares issued
    pub asset_mint: Pubkey,     // Asset this pool tracks
    pub wallet_cap_bps: u16,    // Copied from GlobalConfig
    pub side_cap_bps: u16,      // Copied from GlobalConfig
    pub is_frozen: bool,        // Pool-specific freeze
    pub bump: u8,
}
// Size: 70 bytes
```

### Epoch (Per Pool, Per Time Period)

Epochs are time-bounded trading periods within a pool.

```rust
pub struct Epoch {
    pub pool: Pubkey,                              // Parent pool
    pub epoch_id: u64,                             // Sequential identifier
    pub state: EpochState,                         // Open, Frozen, Settling, Settled, Refunded
    pub start_time: i64,                           // Unix timestamp
    pub end_time: i64,                             // Unix timestamp
    pub freeze_time: i64,                          // end_time - freeze_window
    pub start_price: u64,                          // Oracle price at start
    pub start_confidence: u64,                     // Oracle confidence at start
    pub start_publish_time: i64,                   // Oracle timestamp at start
    pub settlement_price: Option<u64>,             // Oracle price at settlement
    pub settlement_confidence: Option<u64>,        // Oracle confidence at settlement
    pub settlement_publish_time: Option<i64>,      // Oracle timestamp at settlement
    pub outcome: Option<Outcome>,                  // Up, Down, or Refunded
    pub bump: u8,
}
// Size: 127 bytes
```

### UserPosition (Per User, Per Epoch)

Tracks a user's position within a specific epoch.

```rust
pub struct UserPosition {
    pub user: Pubkey,           // Wallet address
    pub epoch: Pubkey,          // Reference to epoch
    pub direction: Direction,   // Up or Down
    pub amount: u64,            // Position size in USDC
    pub shares: u64,            // Shares from CPMM
    pub entry_price: u64,       // Price paid per share
    pub claimed: bool,          // Payout claimed?
    pub bump: u8,
}
// Size: 99 bytes
```

---

## PDA Derivation Seeds

### Critical: Get These Right!

```rust
// GlobalConfig (singleton)
seeds = [b"global_config"]

// Pool (per asset) - uses ASSET MINT, not epoch!
seeds = [b"pool", asset_mint.as_ref()]

// Epoch (per pool, per epoch_id)
seeds = [b"epoch", pool.key().as_ref(), &epoch_id.to_le_bytes()]

// UserPosition (per user, per epoch)
seeds = [b"position", epoch.key().as_ref(), user.key().as_ref()]

// LpShare (per user, per pool)
seeds = [b"lp_share", user.key().as_ref(), pool.key().as_ref()]
```

### Common Mistake: Pool PDA Derivation

**WRONG** (was a bug that had to be fixed):
```rust
// DON'T DO THIS - pools are NOT per-epoch
seeds = [b"pool", epoch.key().as_ref()]
```

**CORRECT:**
```rust
// Pools are per-asset, persistent across epochs
seeds = [b"pool", asset_mint.as_ref()]
```

---

## Pool USDC Token Account

### Use ATA, Not Custom PDA

**WRONG:**
```rust
// DON'T DO THIS - custom PDA for pool USDC
seeds = [b"pool_usdc", epoch.as_ref()]
```

**CORRECT:**
```rust
// Use Associated Token Account with PDA owner
#[account(
    init,
    payer = admin,
    associated_token::mint = usdc_mint,
    associated_token::authority = pool,  // Pool PDA as owner
)]
pub pool_usdc: Account<'info, TokenAccount>,
```

In TypeScript:
```typescript
import { getAssociatedTokenAddress } from '@solana/spl-token'

const poolUsdc = await getAssociatedTokenAddress(
  usdcMint,
  poolPda,
  true  // allowOwnerOffCurve = true (required for PDA owners)
)
```

---

## Epoch Creation

### Permissionless Design

`create_epoch` is intentionally **permissionless** - anyone can call it. This enables:
- Crank bots to automate epoch creation
- Keepers to ensure continuous trading
- No dependency on centralized operators

### Oracle Requirements

| Check | Start Epoch | Settle Epoch |
|-------|-------------|--------------|
| Staleness | ≤ 3 seconds | ≤ 10 seconds |
| Confidence Ratio | < 0.25% | < 0.8% |

### Timing Calculation

```rust
start_time = current_timestamp
end_time = start_time + epoch_duration_seconds  // 300 = 5 min
freeze_time = end_time - freeze_window_seconds  // -15 seconds
```

### Epoch States

```rust
pub enum EpochState {
    Open,      // Trading allowed
    Frozen,    // In freeze window, no new trades
    Settling,  // Settlement in progress
    Settled,   // Outcome determined, payouts available
    Refunded,  // Oracle failed, positions refunded
}
```

---

## Pool Creation (Admin Only)

### Admin Verification Pattern

```rust
#[account(
    seeds = [GlobalConfig::SEED],
    bump = config.bump,
    constraint = config.admin == admin.key() @ FogoPulseError::Unauthorized
)]
pub config: Account<'info, GlobalConfig>,
```

### Caps Inheritance

Pool caps are copied from GlobalConfig at creation time:
- `wallet_cap_bps` - Max position per wallet (5%)
- `side_cap_bps` - Max exposure per side (30%)

### Initial Reserves

Pools start with balanced reserves:
```rust
pool.yes_reserves = initial_reserves;
pool.no_reserves = initial_reserves;
```

---

## Naming Conventions

### Accounts
- **PascalCase, singular**: `Pool`, `Epoch`, `UserPosition`, `GlobalConfig`
- **Never**: `PoolAccount`, `user_position`, `Positions`

### Instructions
- **snake_case verbs**: `initialize`, `buy_position`, `create_epoch`, `settle_epoch`
- **Never**: `BuyPosition`, `CreateEpoch`

### Events
- **PascalCase, past tense**: `PoolCreated`, `EpochSettled`, `TradeExecuted`

### Errors
- **PascalCase with `#[msg]`**: `Unauthorized`, `OracleStale`, `InvalidReserves`

---

## Stack Overflow Prevention

Instructions with many accounts can exceed Solana's 4096 byte stack frame limit.

### Detection

Anchor build warning:
```
Error: Function Buy::try_accounts Stack offset of 4856 exceeded max offset of 4096 by 760 bytes
```

### Solution

Wrap large accounts with `Box<>`:

```rust
// BEFORE (stack overflow)
pub pool: Account<'info, Pool>,
pub epoch: Account<'info, Epoch>,

// AFTER (heap allocated)
pub pool: Box<Account<'info, Pool>>,
pub epoch: Box<Account<'info, Epoch>>,
```

---

## FOGO Sessions Pattern

For user-facing instructions (buy, sell, claim), use FOGO Sessions:

```rust
use fogo_sessions_sdk::Session;

let user_pubkey = Session::extract_user_from_signer_or_session(&ctx.accounts.user)?;
```

**Note:** Admin-only instructions (initialize, create_pool) do NOT use this pattern.

---

## Account Size Calculations

Always include 8-byte discriminator:

```rust
pub const LEN: usize = 8 +  // discriminator
    32 +                     // Pubkey fields
    8 +                      // u64 fields
    1 +                      // bool/u8/enum fields
    9;                       // Option<T> = 1 + sizeof(T)
```

### Current Sizes

| Account | Size (bytes) |
|---------|-------------|
| GlobalConfig | 155 |
| Pool | 70 |
| Epoch | 127 |
| UserPosition | 99 |
| LpShare | 106 |

---

## Deployed Addresses (FOGO Testnet)

| Account | Address |
|---------|---------|
| Program | `6GJBgvTbE8wRN86iyfAPE8CEBqDNcbb7ReQ7ycacGJqq` |
| GlobalConfig | `29iqRjEUTFhFHnqUqyk2frF3p52bAzjrbcRvYdbgsdi3` |
| USDC Mint | `6jzddTQNDh2RPuav88r19gdSGmGnbH6EWa2NXgLV8cAy` |
| BTC Pool | `G8RK2T9LGKe1CavtvEWbXgkHzKFEYPYnNPcQL91FRFpE` |
| ETH Pool | `EBWAWhf5q3eEx1hdJRtVZNm2oHF6WhX9BdGo9aTpviCs` |
| SOL Pool | `G9sE5RtaLLRoNfQ4nrthQQUKyxQfpcAgvExavvwR8KVH` |
| FOGO Pool | `FYeD5NdHtNFxhRqKqdN5pF3j4GU9iihFGWcgemf2eJ78` |

### Asset Mints

| Asset | Mint Address |
|-------|-------------|
| BTC | `4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY` |
| ETH | `8YKezdYaajd3bHuENCUBjwowfEsTV6iDeZLVsHSnPpZE` |
| SOL | `CYZxBEe7U5gBAfcGat91qjJ96xHdJ5CWJYvDmkFKyiPP` |
| FOGO | `H9Y6TpfVEMiAEATkbUrsECzi3ZrCSLt6poruEFzNf89X` |

---

## Mainnet Migration Notes

### Admin Transfer

For testnet, single-signer admin is acceptable. Before mainnet:
1. Deploy fresh on mainnet
2. Set initial admin to Squads multisig
3. No code changes needed - just different initialization parameters

### Struct Size Changes

If you change a struct size (e.g., add fields to GlobalConfig), existing accounts become incompatible:
- **Option 1:** Migrate existing accounts (complex)
- **Option 2:** Fresh deploy with new program ID (simpler for testnet)

The original GlobalConfig was 147 bytes, then changed to 155 bytes after adding `epoch_duration_seconds`, requiring a fresh deploy.

---

## Related Documentation

- [FOGO Testnet Setup](./fogo-testnet-setup.md) - Network configuration
- [FOGO Testnet Dev Notes](./fogo-testnet-dev-notes.md) - General development lessons
- [Pyth Lazer Ed25519 Integration](./pyth-lazer-ed25519-integration.md) - Oracle integration

---

## Source

Extracted from:
- Story 2.1: `_bmad-output/implementation-artifacts/2-1-create-on-chain-pool-and-epoch-account-structures.md`
- Story 5.1: `_bmad-output/implementation-artifacts/5-1-implement-epoch-creation-with-oracle-snapshot.md`
- Story 7.0: `_bmad-output/implementation-artifacts/7-0-create-pool-admin.md`
