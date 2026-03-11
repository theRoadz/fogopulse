# Context Handoff - PRD Edit Session

**Date:** 2026-03-11
**User:** theRoad
**Session:** PRD v2.0 Edit with PM Agent (John)

---

## What Was Completed

PRD updated from v1.0 to v2.0 and moved to `_bmad-output/planning-artifacts/prd.md`

### Key Changes Made to PRD:

1. **FOGO Chain Identity** - Explicit "NOT Solana", FOGO RPC endpoints, addresses
2. **Pool Struct** - Added:
   - `next_epoch_id: u64` - Counter for epoch sequencing
   - `active_epoch: Option<Pubkey>` - Current tradeable epoch
   - `active_epoch_state: u8` - 0=None, 1=Open, 2=Frozen
   - `is_paused: bool` - Pool-level pause
   - `is_frozen: bool` - Pool-level freeze
3. **GlobalConfig** - Added `allow_hedging: bool` (default false)
4. **Epoch Lifecycle** - New `advance_epoch` instruction that:
   - Settles old epoch (UP/DOWN/REFUND based on Pyth confidence)
   - Creates new epoch with fresh start_price
   - All atomic in one transaction
   - Two Pyth fetches: settlement price + start price
5. **Pyth Lazer** - Ed25519 requirement, FOGO addresses, integration checklist
6. **Dev Environment** - WSL for Anchor builds, Windows for Node/npm/frontend
7. **Implementation Dependencies** - Build order diagram added
8. **Pause/Freeze** - Both GlobalConfig level AND Pool level

---

## What Needs To Be Done Next

**Update `docs/architecture.md`** to align with PRD v2.0

### Gaps to Fix in architecture.md:

| Section | Current | Should Be |
|---------|---------|-----------|
| Pool struct | Missing new fields | Add `next_epoch_id`, `active_epoch`, `active_epoch_state`, `is_paused` |
| GlobalConfig | Missing `allow_hedging` | Add it |
| Epoch lifecycle | `create_epoch` + `settle_epoch` separate | `advance_epoch` (atomic settle+create) |
| Epoch states | 5 states | 3 in Pool (None/Open/Frozen), final states in Epoch account |
| Pyth section | Generic | Add Ed25519 checklist, FOGO addresses |
| Dev environment | Not specified | WSL for Anchor, Windows for rest |
| Pause/freeze | GlobalConfig only | Both global AND pool level |

### User Preferences Noted:

- Walk through each change (don't auto-apply without asking)
- Freeze window: 15 seconds (configurable)
- Fresh deployment planned (don't worry about old pools)
- Backpack wallet should be included with Phantom/Nightly

---

## File Locations

- **New PRD:** `_bmad-output/planning-artifacts/prd.md` (v2.0)
- **Old architecture:** `docs/architecture.md` (needs update)
- **Reference docs:**
  - `docs/on-chain-architecture.md`
  - `docs/pyth-lazer-ed25519-integration.md`
  - `docs/fogo-testnet-setup.md`
  - `docs/fogo-testnet-dev-notes.md`

---

## How to Continue

Tell the agent: "Update architecture.md to match PRD v2.0 - read this handoff file first"

Then read:
1. This file
2. `_bmad-output/planning-artifacts/prd.md`
3. `docs/architecture.md`

Diff and walk through changes with theRoad.
