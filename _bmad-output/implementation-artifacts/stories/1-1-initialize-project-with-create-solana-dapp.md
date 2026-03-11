# Story 1.1: Initialize Project with create-solana-dapp

## Story Information

| Field | Value |
|-------|-------|
| **Epic** | Epic 1: Project Foundation & Core Infrastructure |
| **Story ID** | 1.1 |
| **Story Key** | 1-1-initialize-project-with-create-solana-dapp |
| **Status** | Done |
| **Story Points** | 1 |
| **Priority** | P0 - Critical Path |

## User Story

**As a** developer
**I want** a properly structured monorepo with Anchor and Next.js
**So that** I have a solid foundation for building the FOGO Pulse application

## Story Overview

This is the foundational story for FOGO Pulse. It establishes the project structure by running `create-solana-dapp` with the counter template, which provides a proven monorepo setup with Anchor (for Solana/FOGO programs) and Next.js (for the frontend). The existing BMAD documentation directories must be preserved during scaffold generation.

## Acceptance Criteria

```gherkin
Feature: Project Initialization with create-solana-dapp

  Scenario: Successful project scaffolding with counter template
    Given a fresh project directory with existing _bmad/, _bmad-output/, docs/, and .claude/ directories
    When I run create-solana-dapp with the counter template
    Then a monorepo is created with anchor/ and web/ directories
    And pnpm workspaces are configured correctly
    And the existing _bmad/, _bmad-output/, docs/, and .claude/ directories are preserved
    And the project builds successfully with pnpm install && pnpm build

  Scenario: Anchor program builds successfully
    Given the project has been scaffolded
    When I run pnpm build in the anchor/ directory
    Then the Anchor program compiles without errors
    And IDL files are generated in target/idl/

  Scenario: Next.js frontend builds successfully
    Given the project has been scaffolded
    When I run pnpm build in the web/ directory
    Then the Next.js application builds without errors
    And static assets are generated in .next/

  Scenario: Monorepo workspace commands work
    Given the project has been scaffolded
    When I run pnpm install at the root level
    Then dependencies for both anchor/ and web/ are installed
    And workspace linking is configured correctly
```

## Technical Requirements

### Prerequisites
- Node.js 18+ installed
- pnpm 8+ installed (for workspace support)
- Rust toolchain with Solana CLI (can be installed separately)
- WSL2 recommended for Windows development

### Implementation Details

#### create-solana-dapp Command
```bash
npx create-solana-dapp@latest
# Select: counter template
# Name: fogopulse
# Framework: Next.js
# UI Framework: Tailwind CSS
```

#### Expected Directory Structure After Scaffolding
```
fogopulse/
├── _bmad/                      # PRESERVED - BMAD framework
├── _bmad-output/               # PRESERVED - Planning artifacts
├── docs/                       # PRESERVED - Documentation
├── .claude/                    # PRESERVED - Claude settings
├── anchor/                     # NEW - Anchor program workspace
│   ├── programs/
│   │   └── fogopulse/          # Renamed from counter
│   │       ├── src/
│   │       │   └── lib.rs
│   │       └── Cargo.toml
│   ├── tests/
│   ├── Anchor.toml
│   └── package.json
├── web/                        # NEW - Next.js frontend
│   ├── src/
│   │   ├── app/
│   │   └── components/
│   ├── package.json
│   ├── next.config.mjs
│   └── tailwind.config.ts
├── package.json                # Root workspace config
├── pnpm-workspace.yaml         # pnpm workspace definition
└── README.md
```

### Post-Scaffold Configuration

After running create-solana-dapp, the following modifications are required:

1. **Rename Program**: Change counter program references to "fogopulse"
   - Update `anchor/programs/counter/` → `anchor/programs/fogopulse/`
   - Update Anchor.toml program name
   - Update program ID references

2. **Configure for FOGO Testnet** (per project-context.md):
   - Anchor.toml: Keep `cluster = "localnet"` (Anchor limitation)
   - Add `[programs.devnet]` section for FOGO program ID alias
   - Configure wallet path for FOGO testnet

3. **Preserve Existing Directories**: Ensure scaffolding does not overwrite:
   - `_bmad/`
   - `_bmad-output/`
   - `docs/`
   - `.claude/`

### Technical Constraints

From `project-context.md`:

| Constraint | Detail |
|------------|--------|
| **Chain** | FOGO (SVM-compatible) - NOT Solana |
| **Anchor Version** | 0.31.1+ |
| **Next.js Version** | 14+ with App Router |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Package Manager** | pnpm with workspaces |
| **Development** | FOGO testnet (no local devnet) |

### FOGO Network Configuration

```toml
# Anchor.toml (final configuration)
[programs.localnet]
fogopulse = "PLACEHOLDER_PROGRAM_ID"

[programs.devnet]
fogopulse = "PLACEHOLDER_PROGRAM_ID"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/fogo-testnet.json"
```

Note: Actual program ID will be generated during first deployment to FOGO testnet.

## Dependencies

### Upstream Dependencies
- None (this is the first story)

### Downstream Dependencies
- **Story 1.2**: Install and Configure Development Dependencies
- **Story 1.3**: Configure shadcn/ui and Base Components
- **All subsequent stories** depend on this foundation

## Implementation Notes

### Key Decisions

1. **Counter Template Choice**: The counter template provides a minimal but complete setup with:
   - Working Anchor program structure
   - Next.js App Router setup
   - Wallet adapter integration
   - pnpm workspace configuration

2. **Program Renaming**: The counter program will be renamed to "fogopulse" but the actual program logic will be completely replaced in Epic 2.

3. **shadcn/ui Integration**: The template includes Tailwind CSS. shadcn/ui will be added in Story 1.3.

### Verification Steps

After implementation, verify:

```bash
# 1. Root level build works
cd fogopulse
pnpm install
pnpm build

# 2. Anchor builds
cd anchor
anchor build

# 3. Frontend builds
cd ../web
pnpm build

# 4. Preserved directories exist
ls -la ../_bmad/ ../_bmad-output/ ../docs/ ../.claude/
```

### Anti-Patterns to Avoid

From `project-context.md`:
- DO NOT use Solana mainnet/devnet addresses
- DO NOT attempt to use local devnet (use FOGO testnet)
- DO NOT install wallet dependencies that conflict with FOGO

## Architecture References

### From architecture.md - Repository Structure

> **Monorepo Structure (pnpm workspaces)**
> - `anchor/` - Anchor programs (Rust)
> - `web/` - Next.js frontend (TypeScript)
> - `packages/` - Shared utilities (optional)

### From architecture.md - Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| On-chain Framework | Anchor | 0.31.1+ |
| Frontend Framework | Next.js | 14+ |
| Styling | Tailwind CSS + shadcn/ui | - |
| Package Manager | pnpm | 8+ |

## Out of Scope

- Actual FOGO Pulse program implementation (Epic 2)
- shadcn/ui component installation (Story 1.3)
- FOGO Sessions SDK integration (Story 1.4)
- Pyth Lazer integration (Story 1.5)
- Any trading functionality

## Success Metrics

| Metric | Target |
|--------|--------|
| `pnpm install` | Completes without errors |
| `pnpm build` (root) | Completes without errors |
| `anchor build` | Generates IDL successfully |
| `pnpm build` (web) | Generates .next/ directory |
| Preserved directories | All 4 directories intact |

## Story Progress Tracking

### Checklist
- [x] Run create-solana-dapp with counter template
- [x] Verify scaffold created anchor/ and web/ directories
- [x] Verify _bmad/, _bmad-output/, docs/, .claude/ preserved
- [x] Rename program from "counter" to "fogopulse"
- [x] Configure Anchor.toml for FOGO (per constraints)
- [x] Run pnpm install successfully
- [x] Run pnpm build successfully (root)
- [x] Run anchor build successfully
- [x] Run pnpm build successfully (web/)
- [x] Initialize git repository if not present
- [x] Commit scaffold with meaningful message

---

## Dev Agent Record

### File List

| File | Action | Description |
|------|--------|-------------|
| `anchor/` | Created | Anchor program workspace |
| `anchor/programs/fogopulse/src/lib.rs` | Created | Counter program (renamed to fogopulse) |
| `anchor/programs/fogopulse/Cargo.toml` | Created | Rust package configuration |
| `anchor/Anchor.toml` | Created | Anchor configuration with FOGO settings |
| `anchor/package.json` | Created | Anchor workspace npm scripts |
| `anchor/src/index.ts` | Created | TypeScript exports for program |
| `anchor/src/fogopulse-exports.ts` | Created | Program ID and helper functions |
| `anchor/tests/fogopulse.test.ts` | Created | Anchor program tests |
| `anchor/target/idl/fogopulse.json` | Generated | Program IDL |
| `anchor/target/types/fogopulse.ts` | Generated | TypeScript types |
| `web/` | Created | Next.js frontend workspace |
| `web/src/app/` | Created | Next.js App Router pages |
| `web/src/components/` | Created | React components |
| `web/src/components/fogopulse/` | Created | Program-specific UI components |
| `web/src/components/cluster/cluster-data-access.tsx` | Modified | Added FOGO testnet cluster |
| `web/package.json` | Created | Frontend dependencies |
| `web/tsconfig.json` | Created | TypeScript config with @project/anchor alias |
| `package.json` | Created | Root workspace configuration |
| `pnpm-workspace.yaml` | Created | pnpm workspace definition |
| `.gitignore` | Modified | Added Anchor and AI tooling ignores |

### Implementation Notes

- Used `create-solana-dapp` counter template as base scaffold
- Renamed all "counter" references to "fogopulse"
- Configured Anchor.toml for FOGO testnet with `cluster = "localnet"` (Anchor limitation)
- Updated to Anchor 0.32.1 to resolve Solana SDK compatibility issues
- Frontend cluster configuration updated with FOGO testnet as default
- Program ID: `Ht3NLQDkJG4BLgsnUnyuWD2393wULyP5nEXx8AyXhiGr`

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-11 | Dev Agent | Initial implementation - scaffold created |
| 2026-03-11 | Dev Agent | Updated Anchor to 0.32.1, ran anchor build successfully |
| 2026-03-11 | Code Review (AI) | Fixed: Renamed test file from counter.test.ts to fogopulse.test.ts |
| 2026-03-11 | Code Review (AI) | Fixed: Updated test imports from Counter to Fogopulse types |
| 2026-03-11 | Code Review (AI) | Fixed: Removed stale counter.json and counter.ts artifacts |
| 2026-03-11 | Code Review (AI) | Fixed: Added FOGO testnet cluster configuration to frontend |
| 2026-03-11 | Code Review (AI) | Fixed: Removed accidental 'nul' file |
| 2026-03-11 | Code Review (AI) | Fixed: Removed unnecessary .clone() on u8 in lib.rs |
| 2026-03-11 | Code Review (AI) | Updated story status to Done, marked all checklist items complete |

---

## Metadata

| Field | Value |
|-------|-------|
| **Created** | 2026-03-11 |
| **Completed** | 2026-03-11 |
| **Epic** | 1 - Project Foundation & Core Infrastructure |
| **Sprint** | 1 |
| **Dev Agent** | AI Dev Agent |
