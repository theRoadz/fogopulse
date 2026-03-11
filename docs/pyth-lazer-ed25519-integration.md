# Pyth Lazer Ed25519 Integration on FOGO (Lessons Learned)

This document captures lessons learned from integrating Pyth Lazer oracle verification on FOGO testnet. **Read this entire document before attempting any Pyth Lazer integration on FOGO.**

## Overview

Creating epochs in FogoPulse requires Pyth Lazer oracle price verification:
1. Subscribe to Pyth Lazer WebSocket for signed price data
2. Pass the signed message to the on-chain `create_epoch` instruction
3. Verify the signature via CPI to Pyth's verification contract

---

## What FAILED (Don't Repeat These Mistakes)

### FAILURE 1: Using ECDSA Verification (`leEcdsa` format)

**Initial Approach:**
```typescript
// DON'T DO THIS
client.subscribe({
  formats: ['leEcdsa'],  // WRONG for FOGO
  // ...
})
```

**Why It Failed:**
- FOGO's Pyth storage (`3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL`) has **zero ECDSA signers registered**
- Production Pyth Lazer signs ECDSA messages with `26fb61a864c758ae9fba027a96010480658385b9`
- This signer is NOT in FOGO's trusted signer list
- Error: "Untrusted signer" from Pyth verification CPI

**Debugging Command:**
```bash
# Check FOGO Pyth storage for registered signers
node -e "
const { Connection, PublicKey } = require('@solana/web3.js');
const connection = new Connection('https://testnet.fogo.io');
const STORAGE = new PublicKey('3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL');

async function check() {
  const info = await connection.getAccountInfo(STORAGE);
  // Parse storage account to find numTrustedEcdsaSigners
  // Result: numTrustedEcdsaSigners = 0
}
check();
"
```

---

### FAILURE 2: Using Wrong Treasury Address

**Initial Approach:**
```rust
// DON'T DO THIS - Solana mainnet treasury
const PYTH_TREASURY_ID: Pubkey = pubkey!("Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak");
```

**Why It Failed:**
- FOGO has its own treasury address: `upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr`
- The treasury is a constraint in the Pyth storage account
- Error: Treasury constraint violated

---

### FAILURE 3: Embedding Signature Data in Ed25519 Instruction

**Initial Approach:**
```typescript
// DON'T DO THIS
const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
  publicKey: pubkeyBytes,
  message: payloadBytes,
  signature: signatureBytes,
})
```

**Why It Failed:**
- `Ed25519Program.createInstructionWithPublicKey` embeds all data IN the Ed25519 instruction itself
- Pyth's `verify_message` CPI expects the Ed25519 instruction to REFERENCE data in another instruction
- The Ed25519 instruction uses offset pointers, not embedded data
- Error: `Ed25519 error 0x2 (InvalidSignature)`

---

### FAILURE 4: Wrong Message Format Parsing

**Initial Assumption:**
```typescript
// DON'T DO THIS - wrong format
const signatureBytes = pythMessage.slice(0, 64)
const pubkeyBytes = pythMessage.slice(64, 96)
const payloadBytes = pythMessage.slice(96)
```

**Why It Failed:**
- Pyth Lazer `solana` format has a **4-byte magic prefix** before the signature
- The actual format is different from assumed
- Error: Signature verification fails because wrong bytes were parsed

---

## What SUCCEEDED (The Correct Approach)

### SUCCESS 1: Use Ed25519 Format (`solana`) Instead of ECDSA

**FOGO has Ed25519 signers registered:**
- Signer 0: `HaXscpSUcbCLSnPQB8Z7H6idyANxp1mZAXTbHeYpfrJJ`
- Signer 1: `9gKEEcFzSd1PDYBKWAKZi4Sq4ZCUaVX5oTr8kEjdwsfR` (raw: `80efc1f4...820c2e6c`)

**Correct Subscription:**
```typescript
client.subscribe({
  type: 'subscribe',
  subscriptionId: 1,
  priceFeedIds: [feedId],
  properties: ['price', 'confidence'],
  formats: ['solana'],  // Ed25519 format - CORRECT!
  deliveryFormat: 'json',
  channel: 'fixed_rate@200ms',
  jsonBinaryEncoding: 'hex',
})
```

---

### SUCCESS 2: Understand Pyth Solana Message Format

**Correct Format (discovered via SDK source):**
```
Bytes 0-3:     4-byte magic prefix (varies per message)
Bytes 4-67:    64-byte Ed25519 signature
Bytes 68-99:   32-byte Ed25519 public key
Bytes 100-101: 2-byte message size (u16 LE)
Bytes 102+:    Actual payload (price data)
```

**Source:** `@pythnetwork/pyth-lazer-solana-sdk/dist/cjs/ed25519.cjs`
```javascript
const MAGIC_LEN = 4;
const SIGNATURE_LEN = 64;
const PUBKEY_LEN = 32;
const MESSAGE_SIZE_LEN = 2;
```

---

### SUCCESS 3: Use Pyth SDK Helper for Ed25519 Instruction

**Install the SDK:**
```bash
pnpm add @pythnetwork/pyth-lazer-solana-sdk
```

**Correct Implementation:**
```typescript
import { createEd25519Instruction } from '@pythnetwork/pyth-lazer-solana-sdk'

// Build create_epoch instruction FIRST to know the data layout
const createEpochIx = await program.methods
  .createEpoch(new BN(epochId), pythMessage, 0, 0)
  .accountsStrict({/* ... */})
  .instruction()

// Calculate offset where pythMessage starts in create_epoch instruction data
// Anchor layout: 8 (discriminator) + 8 (epoch_id u64) + 4 (vec length prefix) = 20
const pythMessageOffset = 20

// Create Ed25519 instruction that REFERENCES data in create_epoch instruction
// instructionIndex=1 because: [ed25519_ix, create_epoch_ix]
const ed25519Ix = createEd25519Instruction(pythMessage, 1, pythMessageOffset)

// Transaction order: Ed25519 FIRST, then create_epoch
const tx = new VersionedTransaction(
  new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [ed25519Ix, createEpochIx],  // ORDER MATTERS!
  }).compileToV0Message()
)
```

---

### SUCCESS 4: Correct Rust Side for Ed25519 Verification

**Required Imports:**
```rust
use pyth_lazer_solana_contract::protocol::message::SolanaMessage;
use anchor_lang::solana_program::sysvar::instructions as sysvar_instructions;
```

**Required Account:**
```rust
#[derive(Accounts)]
pub struct CreateEpoch<'info> {
    // ... other accounts ...

    /// Instructions sysvar (required for Ed25519 verification)
    #[account(address = sysvar_instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}
```

**Verification CPI:**
```rust
let cpi_accounts = pyth_lazer_solana_contract::cpi::accounts::VerifyMessage {
    payer: ctx.accounts.payer.to_account_info(),
    storage: ctx.accounts.pyth_storage.to_account_info(),
    treasury: ctx.accounts.pyth_treasury.to_account_info(),
    system_program: ctx.accounts.system_program.to_account_info(),
    instructions_sysvar: ctx.accounts.instructions_sysvar.to_account_info(),
};

pyth_lazer_solana_contract::cpi::verify_message(
    CpiContext::new(ctx.accounts.pyth_program.to_account_info(), cpi_accounts),
    pyth_message.clone(),
    ed25519_instruction_index.into(),  // 0 (first instruction)
    signature_index.into(),             // 0 (first signature)
)?;

// Parse the verified message
let solana_message = SolanaMessage::deserialize_slice(&pyth_message)?;
let payload = PayloadData::deserialize_slice_le(&solana_message.payload)?;
```

---

## FOGO-Specific Pyth Addresses

```rust
pub mod fogo_pyth {
    pub const PYTH_PROGRAM_ID: Pubkey = pubkey!("pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt");
    pub const PYTH_STORAGE_ID: Pubkey = pubkey!("3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL");
    pub const PYTH_TREASURY_ID: Pubkey = pubkey!("upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr");
}
```

| Account | Address |
|---------|---------|
| Pyth Program | `pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt` |
| Pyth Storage | `3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL` |
| Pyth Treasury | `upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr` |

---

## Integration Checklist

- [ ] Use `formats: ['solana']` (Ed25519), NOT `leEcdsa`
- [ ] Use FOGO-specific Pyth addresses (not Solana mainnet)
- [ ] Install `@pythnetwork/pyth-lazer-solana-sdk`
- [ ] Use `createEd25519Instruction()` helper (NOT `Ed25519Program.createInstructionWithPublicKey`)
- [ ] Ed25519 instruction MUST be first in transaction
- [ ] Instruction index for ed25519 = 0, for create_epoch = 1
- [ ] pythMessageOffset = 20 (8 discriminator + 8 epoch_id + 4 vec length)
- [ ] Include `instructions_sysvar` account in Rust
- [ ] Use `VerifyMessage` CPI (NOT `VerifyEcdsaMessage`)

---

## Debugging Scripts

Two debugging scripts were created during this integration:

1. **`anchor/scripts/check-pyth-storage.ts`** - Inspect FOGO Pyth storage account
   ```bash
   npx ts-node scripts/check-pyth-storage.ts
   ```

2. **`anchor/scripts/test-pyth-formats.ts`** - Test both ECDSA and Ed25519 formats
   ```bash
   npx ts-node scripts/test-pyth-formats.ts
   ```

---

## Source

This document was extracted from Story 2.4 implementation notes. See `_bmad-output/implementation-artifacts/2-4-test-buy-position-frontend.md` for the full implementation context.
