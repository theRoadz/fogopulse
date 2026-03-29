# Story 1.2: Configure shadcn/ui and Theme System

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want shadcn/ui components with dark/light theme support,
so that the UI matches the design specifications and supports user preferences.

## Story Overview

This story completes the shadcn/ui configuration and theme system setup. The project already has a basic shadcn/ui installation from the create-solana-dapp scaffold with some components (button, card, dialog, dropdown-menu, input, label, sonner, table, alert). This story will:

1. Extend the theme system with FOGO Pulse brand colors per the UX Design Specification
2. Configure dark theme as the default (per AR29)
3. Install additional required shadcn/ui components needed for trading interface
4. Create a theme toggle component for dark/light switching
5. Configure Inter and JetBrains Mono fonts per UX specification

## Current State Analysis

**What Already Exists:**
- shadcn/ui initialized with `components.json` (new-york style, neutral base color)
- ThemeProvider already configured in `app-providers.tsx` with next-themes
- Basic components installed: button, card, dialog, dropdown-menu, input, label, sonner, table, alert
- CSS variables already set up in `globals.css` with light/dark theme support
- next-themes v0.4.6 already in dependencies

**What Needs to Be Done:**
- Extend color palette with FOGO brand colors (primary orange, up/down colors)
- Change default theme from "system" to "dark" (per UX requirement AR29)
- Install additional components: tabs, badge, tooltip, progress, skeleton, sheet, switch, collapsible, separator, avatar
- Create mode-toggle component for theme switching
- Add Inter and JetBrains Mono fonts
- Add custom semantic color tokens (--up, --down, --warning colors)

## Acceptance Criteria

1. **AC1: Dark Theme is Default**
   - When a new user visits the app, dark theme is active
   - ThemeProvider configured with `defaultTheme="dark"`
   - Light theme remains available via toggle

2. **AC2: Brand Colors Configured**
   - Primary color set to FOGO orange (#f7931a / oklch equivalent)
   - Success/UP color configured (green #22c55e)
   - Destructive/DOWN color configured (red #ef4444)
   - Warning color configured (amber #f59e0b)
   - Chart line color configured (orange/amber)

3. **AC3: Theme Toggle Functional**
   - Mode toggle component exists in `components/shared/mode-toggle.tsx`
   - Toggle switches between dark and light themes with single click (no dropdown, no System option)
   - Uses View Transition API for circular reveal animation (light/dark spreading from click position)
   - Graceful fallback to instant switch on unsupported browsers (Firefox)
   - Theme preference persists across sessions

4. **AC4: Additional Components Installed**
   - All required trading UI components installed via shadcn CLI:
     - tabs (for asset switching, positions/history)
     - badge (for status indicators)
     - tooltip (for info hints)
     - progress (for probability bar base)
     - skeleton (for loading states)
     - sheet (for mobile navigation)
     - switch (for toggles)
     - collapsible (for expandable sections)
     - separator (for visual dividers)
     - avatar (for asset icons)
     - scroll-area (for scrollable lists)

5. **AC5: Typography Configured**
   - Inter font loaded and set as primary sans-serif
   - JetBrains Mono loaded for monospace (price displays, countdowns)
   - Font variables available: `--font-sans`, `--font-mono`

6. **AC6: Build Succeeds**
   - `pnpm build` completes without errors in web/ directory
   - No TypeScript errors
   - Both dark and light themes render correctly

## Tasks / Subtasks

- [x] Task 1: Update globals.css with FOGO brand colors (AC: 2)
  - [x] 1.1: Add primary orange color tokens (--primary in both themes)
  - [x] 1.2: Add UP/success color tokens (--up, --up-foreground, --up-muted)
  - [x] 1.3: Add DOWN/destructive enhancement (--down as alias)
  - [x] 1.4: Add warning color tokens (--warning, --warning-foreground)
  - [x] 1.5: Add chart color tokens (--chart-line, --chart-target, --chart-grid)
  - [x] 1.6: Register new colors in @theme inline block

- [x] Task 2: Configure dark theme as default (AC: 1)
  - [x] 2.1: Update ThemeProvider in app-providers.tsx (defaultTheme="dark")
  - [x] 2.2: Verify dark theme variables are properly styled for FOGO

- [x] Task 3: Install additional shadcn components (AC: 4)
  - [x] 3.1: Run `npx shadcn@latest add tabs badge tooltip progress skeleton`
  - [x] 3.2: Run `npx shadcn@latest add sheet switch collapsible separator avatar scroll-area`
  - [x] 3.3: Verify all components installed in components/ui/

- [x] Task 4: Create mode-toggle component (AC: 3)
  - [x] 4.1: Create components/shared/mode-toggle.tsx with single-click toggle button
  - [x] 4.2: Add Sun/Moon icons from lucide-react (removed Monitor/System option)
  - [x] 4.3: Implement theme switching with useTheme hook + View Transition API circular reveal animation
  - [x] 4.4: Add toggle to app header/layout

- [x] Task 5: Configure typography with custom fonts (AC: 5)
  - [x] 5.1: Add Inter font via next/font/google
  - [x] 5.2: Add JetBrains Mono font via next/font/google
  - [x] 5.3: Apply font variables to body and css custom properties
  - [x] 5.4: Update globals.css with font-family references

- [x] Task 6: Verify build and themes (AC: 6)
  - [x] 6.1: Run pnpm build in web/
  - [x] 6.2: Visual verification of dark theme rendering
  - [x] 6.3: Visual verification of light theme rendering
  - [x] 6.4: Verify theme toggle persists preference

## Dev Notes

### Architecture Requirements Addressed
- **AR29**: Dark theme default, light theme toggle - THIS IS THE PRIMARY GOAL
- **AR25**: Direction 1 layout uses shadcn Card, Tabs components (foundation for future stories)

### Color Specification (from UX Design Specification)

**Dark Theme (Primary):**
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | oklch(0.04 0 0) / #0a0a0b | Main canvas background |
| `--background-secondary` | oklch(0.08 0 0) / #141415 | Cards, elevated surfaces |
| `--primary` | oklch(0.75 0.18 55) / #f7931a | Brand accent, price line, CTAs |
| `--up` | oklch(0.7 0.2 145) / #22c55e | UP buttons, wins, positive delta |
| `--down` | oklch(0.6 0.23 25) / #ef4444 | DOWN buttons, losses, negative delta |
| `--warning` | oklch(0.78 0.17 75) / #f59e0b | Freeze state, cautions |

### Typography Specification
- **Primary Font**: Inter (sans-serif) - for UI text
- **Monospace Font**: JetBrains Mono - for prices, countdowns, tabular data
- Price displays use `font-mono` class with tabular figures

### Existing Components Analysis

**Already Installed (from Story 1.1):**
```
components/ui/
├── alert.tsx
├── button.tsx
├── card.tsx
├── dialog.tsx
├── dropdown-menu.tsx
├── input.tsx
├── label.tsx
├── sonner.tsx
└── table.tsx
```

**Need to Install for Trading UI:**
- `tabs` - Asset switching (BTC/ETH/SOL/FOGO), Positions/History toggle
- `badge` - State indicators (OPEN, FROZEN, WON, LOST, REFUNDED)
- `tooltip` - Info hints for terms, probability explanation
- `progress` - Base for ProbabilityBar component
- `skeleton` - Loading states during data fetch
- `sheet` - Mobile navigation, LP panel
- `switch` - Theme toggle, auto-compound toggle
- `collapsible` - "Why?" expansion in refund explanation
- `separator` - Visual dividers in trade ticket
- `avatar` - Asset icons (BTC, ETH, SOL, FOGO)
- `scroll-area` - Scrollable position lists

### Mode Toggle Implementation Pattern

Based on shadcn documentation, the mode toggle should use this pattern:

```tsx
"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### Project Structure Notes

**Component Organization:**
- shadcn/ui primitives go in: `web/src/components/ui/`
- Custom trading components go in: `web/src/components/trading/` (future stories)
- Shared utilities go in: `web/src/components/shared/` (mode-toggle goes here)

**Font Loading (Next.js Pattern):**
Fonts should be loaded in `layout.tsx` using next/font/google for optimal performance:

```tsx
import { Inter, JetBrains_Mono } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})
```

### Testing Standards

- Verify dark theme loads by default on fresh visit
- Verify theme toggle cycles through light/dark/system
- Verify theme preference persists in localStorage
- Verify all installed components render without errors
- Verify fonts load correctly (inspect computed styles)

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Visual Design Foundation]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Color System]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Typography System]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design System Foundation]
- [Source: _bmad-output/planning-artifacts/architecture.md#AR29]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2]
- [Source: web/src/components/app-providers.tsx - ThemeProvider config]
- [Source: web/src/app/globals.css - CSS variables]
- [Source: web/components.json - shadcn config]
- [Docs: shadcn/ui dark mode Next.js setup]
- [Docs: next-themes ThemeProvider configuration]

## Dependencies

### Upstream Dependencies
- **Story 1.1**: Initialize Project with create-solana-dapp - COMPLETED
  - Provides: Next.js scaffold, basic shadcn/ui setup, ThemeProvider

### Downstream Dependencies
- **Story 1.3**: Configure FOGO Testnet Environment
- **Story 2.2**: Implement Wallet Connection UI (uses Button, Dialog)
- **Story 2.3**: Create Asset Selector and Market Layout (uses Tabs, Card)
- **Story 2.6**: Create Epoch Status Display (uses Badge)
- **Story 2.8**: Create Trade Ticket Component (uses Card, Button, Progress)

## Out of Scope

- Custom trading components (PriceChart, TradeTicket, etc.) - future stories
- Actual trading functionality - Epic 2
- Mobile-specific responsive layouts - future optimization
- Animation system beyond theme transitions - future enhancement
- Chart library integration (Lightweight Charts) - Story 2.5

## Success Metrics

| Metric | Target |
|--------|--------|
| Dark theme on first visit | Yes |
| Theme toggle functional | Single-click Light/Dark toggle with circular reveal animation |
| New components installed | 11 additional components |
| Build succeeds | `pnpm build` exits 0 |
| Fonts loaded | Inter + JetBrains Mono |
| No console errors | Clean browser console |

## Story Progress Tracking

### Checklist
- [x] globals.css updated with FOGO brand colors
- [x] ThemeProvider set to defaultTheme="dark"
- [x] All 11 additional shadcn components installed
- [x] mode-toggle.tsx component created
- [x] Mode toggle added to app layout/header
- [x] Inter font configured via next/font
- [x] JetBrains Mono font configured via next/font
- [x] Build passes (`pnpm build` in web/)
- [x] Dark theme renders correctly
- [x] Light theme renders correctly
- [x] Theme toggle persists preference

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- **Task 1 (globals.css)**: Added FOGO brand colors using oklch color space. Primary set to orange (oklch(0.75 0.18 55)), UP color to green (oklch(0.7 0.2 145)), DOWN to red (oklch(0.6 0.23 25)), and warning to amber (oklch(0.78 0.17 75)). Added chart-specific colors (--chart-line, --chart-target, --chart-grid). Dark theme background updated to deeper black (oklch(0.04 0 0)) per UX spec.

- **Task 2 (Dark theme default)**: Updated ThemeProvider in app-providers.tsx from `defaultTheme="system"` to `defaultTheme="dark"`. Removed duplicate ThemeProvider from app-layout.tsx to avoid conflicts.

- **Task 3 (shadcn components)**: Installed 11 additional components via shadcn CLI: tabs, badge, tooltip, progress, skeleton, sheet, switch, collapsible, separator, avatar, scroll-area. Added TooltipProvider wrapper in app-providers.tsx as required by tooltip component.

- **Task 4 (mode-toggle)**: Created ModeToggle component in components/shared/mode-toggle.tsx with Sun/Moon icons from lucide-react. Originally used dropdown menu with Light/Dark/System; later simplified to single-click toggle with View Transition API circular reveal animation (dark/light spreads from click position). Removed System option and dropdown. Replaced old ThemeSelect with ModeToggle in app-header.tsx.

- **Task 5 (Typography)**: Added Inter and JetBrains Mono fonts via next/font/google in layout.tsx. Applied font CSS variables (--font-sans, --font-mono) to body className. Registered font variables in @theme inline block in globals.css.

- **Task 6 (Build verification)**: `pnpm build` completed successfully with no TypeScript errors. Dev server starts correctly. All static pages generated successfully.

### File List

| File | Action | Description |
|------|--------|-------------|
| `web/src/app/globals.css` | Modify | Added FOGO brand colors (primary, up, down, warning), chart colors, font variables |
| `web/src/app/layout.tsx` | Modify | Added Inter and JetBrains Mono font configuration via next/font/google |
| `web/src/components/app-providers.tsx` | Modify | Changed defaultTheme to "dark", added TooltipProvider |
| `web/src/components/app-layout.tsx` | Modify | Removed duplicate ThemeProvider wrapper |
| `web/src/components/app-header.tsx` | Modify | Replaced ThemeSelect import/usage with ModeToggle |
| `web/src/components/shared/mode-toggle.tsx` | Create | Theme toggle component with dropdown menu |
| `web/src/components/ui/tabs.tsx` | Create | shadcn tabs component |
| `web/src/components/ui/badge.tsx` | Create | shadcn badge component |
| `web/src/components/ui/tooltip.tsx` | Create | shadcn tooltip component |
| `web/src/components/ui/progress.tsx` | Create | shadcn progress component |
| `web/src/components/ui/skeleton.tsx` | Create | shadcn skeleton component |
| `web/src/components/ui/sheet.tsx` | Create | shadcn sheet component |
| `web/src/components/ui/switch.tsx` | Create | shadcn switch component |
| `web/src/components/ui/collapsible.tsx` | Create | shadcn collapsible component |
| `web/src/components/ui/separator.tsx` | Create | shadcn separator component |
| `web/src/components/ui/avatar.tsx` | Create | shadcn avatar component |
| `web/src/components/ui/scroll-area.tsx` | Create | shadcn scroll-area component |
| `web/package.json` | Modify | Added radix-ui dependencies for new shadcn components |
| `pnpm-lock.yaml` | Modify | Lockfile updated with new dependencies |
| `web/src/components/theme-select.tsx` | Delete | Removed dead code (replaced by mode-toggle) |

---

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5 (Code Review Agent)
**Date:** 2026-03-11
**Outcome:** ✅ APPROVED (with fixes applied)

### Review Summary

All 6 Acceptance Criteria verified as implemented. All tasks marked complete were validated against actual code.

### Issues Found & Fixed

| Severity | Issue | Resolution |
|----------|-------|------------|
| MEDIUM | Dead code `theme-select.tsx` not deleted | Deleted file |
| MEDIUM | `collapsible.tsx` missing React import | Added `import * as React from "react"` |
| MEDIUM | `skeleton.tsx` missing React import and `"use client"` | Added both |
| LOW | File List missing `package.json` and `pnpm-lock.yaml` | Updated File List above |

### Verification

- ✅ Build passes after all fixes (`pnpm build` exits 0)
- ✅ All ACs validated against implementation
- ✅ All tasks verified as actually completed
- ✅ No security issues identified
- ✅ Code quality consistent with shadcn patterns

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-11 | SM Agent | Initial story creation |
| 2026-03-11 | Dev Agent (Claude Opus 4.5) | Implemented all tasks: FOGO brand colors, dark theme default, 11 shadcn components, mode-toggle, typography. Build verified. |
| 2026-03-11 | Code Review Agent (Claude Opus 4.5) | Review completed: Fixed 3 MEDIUM issues (dead code, missing imports), updated File List, all ACs verified. Status → done. |
| 2026-03-29 | Dev Agent (Claude Opus 4.6) | Simplified theme toggle: removed dropdown & System option, added single-click toggle with View Transition API circular reveal animation. Updated app-providers.tsx (removed enableSystem, disableTransitionOnChange), globals.css (view transition CSS), mode-toggle.tsx (rewritten). |

---

## Metadata

| Field | Value |
|-------|-------|
| **Created** | 2026-03-11 |
| **Epic** | 1 - Project Foundation & Core Infrastructure |
| **Sprint** | 1 |
| **Story Points** | 2 |
| **Priority** | P0 - Critical Path |
