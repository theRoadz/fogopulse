# Story 7.2: Community Feedback & Issue Tracker

## Status: in-progress

## Description
Public feedback page where users can report bugs, errors, and suggestions. Users sign with their wallet to post, preventing spam. Issues are publicly visible except critical ones (hidden until resolved). Threaded replies allow community and admin interaction with status tracking.

## Story

As a FogoPulse user,
I want a feedback page where I can report bugs, submit suggestions, and see community issues,
so that I can communicate problems and ideas to the team and track their resolution.

## Acceptance Criteria

- [ ] **AC1:** Given I navigate to `/feedback`, When the page loads, Then I see a list of publicly visible feedback issues showing title, category badge, status badge, truncated wallet address, and relative timestamp.
- [ ] **AC2:** Given I am connected with a wallet, When I click "New Issue", Then a dialog appears with fields for title, category (Feedback / Bug / Critical / Feature Request), and description (textarea).
- [ ] **AC3:** Given I fill out the new issue form and submit, When my wallet prompts me to sign a message, Then the message includes `FogoPulse Feedback: {title} at {ISO timestamp}` and the form submits only after successful signature verification on the server.
- [ ] **AC4:** Given I am NOT connected with a wallet, When I try to create an issue or reply, Then a "Connect Wallet" prompt is shown instead of the form.
- [ ] **AC5:** Given an issue exists with `category: 'critical'`, When a non-admin user views the list, Then that issue is hidden from view until an admin sets its status to `resolved`.
- [ ] **AC6:** Given an issue exists with `category: 'critical'`, When an admin views the list, Then the critical issue is visible with a "Hidden from public" indicator badge.
- [ ] **AC7:** Given I click on an issue in the list, When the detail view opens, Then I see the full description, all threaded replies, and a reply form (if wallet connected).
- [ ] **AC8:** Given I submit a reply on an issue, When my wallet prompts me to sign, Then the reply is added to the thread with my wallet address and timestamp.
- [ ] **AC9:** Given an admin wallet (listed in `ADMIN_WALLETS` env var), When the admin views any issue, Then status change controls are available: Open, In Progress, Resolved, Won't Fix.
- [ ] **AC10:** Given an admin posts a reply, When other users view the thread, Then the admin reply shows an "Admin" badge next to the wallet address.
- [ ] **AC11:** Given a wallet has posted 5+ issues in the last hour, When the user tries to post another, Then a 429 error is returned with a "slow down" message (exact limit not revealed to user).
- [ ] **AC12:** Given the feedback list, When I use the category filter tabs, Then the list filters to show only issues of the selected category (or "All" for unfiltered).
- [ ] **AC13:** Given the feedback list, When I use the status filter, Then I can filter by Open, In Progress, Resolved, or All statuses.
- [ ] **AC14:** Given the server receives a POST to create an issue or reply, When the Ed25519 signature is verified, Then the server confirms the signature matches the claimed wallet public key before persisting to Firestore.
- [ ] **AC15:** Given the `/feedback` page, When I view it on mobile, Then the layout is responsive and usable on small screens.
- [ ] **AC16:** Given the feedback API routes, When unit tests run, Then all routes have tests covering auth, validation, rate limiting, admin checks, and critical visibility filtering.

## Architecture

### Three Layers (matching Story 7.1 pattern)
1. **API Routes** (`web/src/app/api/feedback/`) — CRUD operations for issues and replies, signature verification, admin checks, rate limiting
2. **Hooks** (`web/src/hooks/use-feedback-*.ts`) — TanStack Query queries and mutations with wallet signing
3. **Components** (`web/src/components/feedback/`) — UI for list, detail, create dialog, reply thread

### Storage: Firebase Firestore

**Why Firestore:** The app deploys on Vercel (serverless). SQLite won't work on ephemeral filesystems. Firestore provides a free tier, zero infrastructure, and works perfectly with serverless.

**Firestore Collections:**

```
feedback/                          # Collection
  {issueId}/                       # Document
    walletAddress: string          # Poster's base58 pubkey
    category: string               # 'feedback' | 'bug' | 'critical' | 'feature-request'
    title: string
    description: string
    status: string                 # 'open' | 'in-progress' | 'resolved' | 'wont-fix'
    visibility: string             # 'public' | 'hidden'
    replyCount: number             # Denormalized for list display
    createdAt: Timestamp
    updatedAt: Timestamp
    signature: string              # Ed25519 signature (base64)

    replies/                       # Subcollection
      {replyId}/                   # Document
        walletAddress: string
        content: string
        isAdmin: boolean           # Snapshot at time of posting
        createdAt: Timestamp
        signature: string
```

**Firestore Security:** All access goes through API routes (server-side Firebase Admin SDK). No client-side Firebase SDK needed. This keeps `ADMIN_WALLETS` and write logic server-side.

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/feedback` | GET | List issues (query: category, status, page, limit). Excludes hidden criticals for non-admins. |
| `/api/feedback` | POST | Create issue. Verify wallet signature, enforce rate limit, auto-hide criticals. |
| `/api/feedback/[id]` | GET | Get single issue with replies. |
| `/api/feedback/[id]` | PATCH | Update status (admin only). Auto-unhide criticals when resolved. |
| `/api/feedback/[id]/reply` | POST | Create reply. Verify wallet signature, enforce rate limit. |
| `/api/feedback/admin-check` | GET | Check if wallet is admin. Returns `{ isAdmin: boolean }`. |

### Admin Detection
- `ADMIN_WALLETS` env var: comma-separated base58 pubkeys (server-side only)
- API routes check wallet against this list for admin operations
- `GET /api/feedback/admin-check?wallet=<address>` lets client know if connected wallet is admin (cached with long staleTime)
- Admin status is NEVER determined client-side — always server-verified

### Wallet Signature Flow
1. Client builds message: `FogoPulse Feedback: {title} at {ISO timestamp}`
2. Client calls `signMessage()` from wallet adapter (no on-chain tx, no gas)
3. Client sends `{ ..., walletAddress, signature, message }` to API
4. Server verifies Ed25519 signature using `tweetnacl` (transitive dep of `@solana/web3.js`)
5. Server validates timestamp is within 5-minute window (replay prevention)
6. On success, persists to Firestore

### Rate Limiting
- Server counts issues from same wallet in last hour via Firestore query
- Default limit: 5 issues per wallet per hour (`FEEDBACK_RATE_LIMIT` env var)
- Separate limit for replies: 20 per wallet per hour
- Vague error message on 429 (don't reveal exact limits)

### Critical Issue Visibility Logic
- On POST with `category: 'critical'`: auto-set `visibility: 'hidden'`
- On GET list: Firestore query excludes `category == 'critical' AND status != 'resolved'` UNLESS admin wallet header matches `ADMIN_WALLETS`
- On PATCH setting `status: 'resolved'`: also set `visibility: 'public'`

## Tasks / Subtasks

- [ ] Task 0: Firebase setup (PREREQUISITE)
  - [ ] 0.1: Install `firebase-admin` in `web/package.json`
  - [ ] 0.2: Create `web/src/lib/firebase.ts` — singleton Firebase Admin SDK initialization using `FIREBASE_SERVICE_ACCOUNT_KEY` env var (JSON string)
  - [ ] 0.3: Add `FIREBASE_SERVICE_ACCOUNT_KEY` to `web/.env.example` with documentation
  - [ ] 0.4: Create `web/src/types/feedback.ts` — TypeScript interfaces for `FeedbackIssue`, `FeedbackReply`, `IssueCategory`, `IssueStatus`

- [ ] Task 1: Signature verification utility (AC: 3, 8, 14)
  - [ ] 1.1: Create `web/src/lib/verify-signature.ts` — `verifyWalletSignature(message, signatureBase64, walletAddress): boolean` using tweetnacl Ed25519 verify
  - [ ] 1.2: Validate message format matches `FogoPulse Feedback: ...` or `FogoPulse Reply: ...`
  - [ ] 1.3: Validate timestamp within 5-minute window (replay prevention)
  - [ ] 1.4: Write tests for valid, expired, wrong-key, and tampered-message cases

- [ ] Task 2: API routes (AC: 1, 3, 5, 6, 9, 11, 14)
  - [ ] 2.1: Create `web/src/app/api/feedback/route.ts` — GET (list with filters, exclude hidden criticals) + POST (create with sig verify + rate limit)
  - [ ] 2.2: Create `web/src/app/api/feedback/[id]/route.ts` — GET (detail with replies) + PATCH (admin status update, auto-unhide resolved criticals)
  - [ ] 2.3: Create `web/src/app/api/feedback/[id]/reply/route.ts` — POST (create reply with sig verify)
  - [ ] 2.4: Create `web/src/app/api/feedback/admin-check/route.ts` — GET returns `{ isAdmin: boolean }`
  - [ ] 2.5: Create `web/src/lib/admin.ts` — `isAdminWallet(address): boolean` helper (checks ADMIN_WALLETS env var)
  - [ ] 2.6: Write tests for all API routes

- [ ] Task 3: Hooks (AC: 1, 2, 3, 7, 8, 9)
  - [ ] 3.1: Create `web/src/hooks/use-feedback-list.ts` — useQuery with category/status/page filters, query key `['feedback', filters]`
  - [ ] 3.2: Create `web/src/hooks/use-create-feedback.ts` — useMutation that calls signMessage then POSTs, invalidates feedback list on success
  - [ ] 3.3: Create `web/src/hooks/use-feedback-detail.ts` — useQuery for single issue + replies, query key `['feedback', id]`
  - [ ] 3.4: Create `web/src/hooks/use-create-reply.ts` — useMutation with wallet signing then POST reply
  - [ ] 3.5: Create `web/src/hooks/use-update-status.ts` — useMutation for admin PATCH status
  - [ ] 3.6: Create `web/src/hooks/use-is-admin.ts` — useQuery calling admin-check endpoint, staleTime 5 minutes
  - [ ] 3.7: Write tests for hooks

- [ ] Task 4: UI components (AC: 1, 2, 4, 5, 6, 7, 8, 10, 12, 13, 15)
  - [ ] 4.1: Create `web/src/components/feedback/feedback-feature.tsx` — main page with category tabs (All/Feedback/Bug/Critical/Feature Request), status filter dropdown, "New Issue" button, issue list
  - [ ] 4.2: Create `web/src/components/feedback/feedback-card.tsx` — compact card: title, category badge, status badge, truncated wallet, relative time, reply count
  - [ ] 4.3: Create `web/src/components/feedback/create-feedback-dialog.tsx` — Dialog with title input, category select, description textarea, submit triggers wallet signing
  - [ ] 4.4: Create `web/src/components/feedback/feedback-detail-dialog.tsx` — full issue detail with reply thread and reply form
  - [ ] 4.5: Create `web/src/components/feedback/reply-thread.tsx` — reply list with wallet address, admin badge, relative timestamp
  - [ ] 4.6: Create `web/src/components/feedback/reply-form.tsx` — textarea + submit button with wallet signing
  - [ ] 4.7: Create `web/src/lib/feedback-utils.ts` — `formatRelativeTime()`, `truncateWallet()` utilities
  - [ ] 4.8: Write tests for all components

- [ ] Task 5: Page route and navigation (AC: 1)
  - [ ] 5.1: Create `web/src/app/feedback/page.tsx` — renders FeedbackFeature
  - [ ] 5.2: Add `{ label: 'Feedback', path: '/feedback' }` to links array in `web/src/app/layout.tsx`

- [ ] Task 6: Environment configuration (AC: 9, 11)
  - [ ] 6.1: Add `ADMIN_WALLETS`, `FEEDBACK_RATE_LIMIT`, `FIREBASE_SERVICE_ACCOUNT_KEY` to `web/.env.example`
  - [ ] 6.2: Add feedback query keys to `QUERY_KEYS` in `web/src/lib/constants.ts`
  - [ ] 6.3: Add `FEEDBACK_RATE_LIMIT` constant (default 5, server-side only)

## Dev Notes

### Firebase Admin SDK Setup Pattern
```typescript
// web/src/lib/firebase.ts
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getFirebaseAdmin() {
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}')
    initializeApp({ credential: cert(serviceAccount) })
  }
  return getFirestore()
}

export const db = getFirebaseAdmin()
```

### TypeScript Interfaces
```typescript
// web/src/types/feedback.ts
export type IssueCategory = 'feedback' | 'bug' | 'critical' | 'feature-request'
export type IssueStatus = 'open' | 'in-progress' | 'resolved' | 'wont-fix'

export interface FeedbackIssue {
  id: string
  walletAddress: string
  category: IssueCategory
  title: string
  description: string
  status: IssueStatus
  visibility: 'public' | 'hidden'
  replyCount: number
  createdAt: string        // ISO 8601
  updatedAt: string
  isAdmin: boolean         // Whether poster is an admin wallet
}

export interface FeedbackReply {
  id: string
  issueId: string
  walletAddress: string
  content: string
  isAdmin: boolean
  createdAt: string
}

export interface FeedbackListResponse {
  issues: FeedbackIssue[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface FeedbackDetailResponse {
  issue: FeedbackIssue
  replies: FeedbackReply[]
}
```

### Wallet Signature Verification (Ed25519)
```typescript
// web/src/lib/verify-signature.ts
import nacl from 'tweetnacl'
import { PublicKey } from '@solana/web3.js'

export function verifyWalletSignature(
  message: string,
  signatureBase64: string,
  walletAddress: string
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message)
    const signatureBytes = Buffer.from(signatureBase64, 'base64')
    const publicKeyBytes = new PublicKey(walletAddress).toBytes()
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)
  } catch {
    return false
  }
}
```

### Client-Side Signing Pattern
```typescript
// In mutation hooks — use signMessage from wallet adapter
const { signMessage, publicKey } = useWallet()

const timestamp = new Date().toISOString()
const message = `FogoPulse Feedback: ${title} at ${timestamp}`
const messageBytes = new TextEncoder().encode(message)
const signatureBytes = await signMessage!(messageBytes)
const signatureBase64 = Buffer.from(signatureBytes).toString('base64')

// POST to API with: { title, category, description, walletAddress: publicKey.toBase58(), signature: signatureBase64, message, timestamp }
```

### Query Keys (add to QUERY_KEYS in constants.ts)
```typescript
FEEDBACK: (filters?: Record<string, string>) => ['feedback', filters] as const,
FEEDBACK_DETAIL: (id: string) => ['feedback', id] as const,
FEEDBACK_ADMIN_CHECK: (wallet?: string) => ['feedback-admin', wallet] as const,
```

### Component Layout Wireframe
```
┌─────────────────────────────────────────────────┐
│ Community Feedback                [+ New Issue]  │
│                                                  │
│ [All] [Feedback] [Bug] [Critical] [Feature Req]  │
│ Status: [All ▾]                                  │
│                                                  │
│ ┌────────────────────────────────────────────┐   │
│ │ 🐛 Bug  |  Claim button not appearing      │   │
│ │ HkSz...fy9U  •  2h ago  •  3 replies      │   │
│ │ Status: Open                               │   │
│ └────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────┐   │
│ │ 💡 Feature  |  Add dark mode charts        │   │
│ │ 2GJ2...BTww  •  1d ago  •  1 reply        │   │
│ │ Status: In Progress                        │   │
│ └────────────────────────────────────────────┘   │
│                                                  │
│              [Load More]                         │
└─────────────────────────────────────────────────┘
```

### Category Badge Colors
- Feedback: Blue (`bg-blue-500/10 text-blue-500`)
- Bug: Orange (`bg-orange-500/10 text-orange-500`)
- Critical: Red (`bg-red-500/10 text-red-500`)
- Feature Request: Purple (`bg-purple-500/10 text-purple-500`)

### Status Badge Colors
- Open: Default/muted
- In Progress: Yellow (`bg-yellow-500/10 text-yellow-500`)
- Resolved: Green (`bg-green-500/10 text-green-500`)
- Won't Fix: Gray/muted

### shadcn/ui Components to Use (already installed)
- `Card`, `CardContent`, `CardHeader` — issue cards
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogTrigger` — create/detail modals
- `Button` — actions
- `Badge` — category and status badges
- `Input` — title field
- `Label` — form labels
- `Tabs`, `TabsList`, `TabsTrigger` — category filter tabs
- `DropdownMenu` — status filter
- `Separator` — between replies
- `Skeleton` — loading states

### Existing Hooks/Components to Reuse (DO NOT DUPLICATE)
- `useWallet()` from `@solana/wallet-adapter-react` — `publicKey`, `signMessage`, `connected`
- `cn()` from `web/src/lib/utils.ts` — className merging
- `toast` from `sonner` — success/error/warning notifications
- `WalletButton` from `web/src/components/wallet/wallet-button.tsx` — wallet connect prompt

### Anti-Spam Summary
1. **Wallet signature required** — proves wallet ownership, free (no gas)
2. **Rate limiting** — 5 issues/hour, 20 replies/hour per wallet
3. **Vague error messages** — don't reveal exact limits to prevent gaming
4. **Timestamp window** — 5-minute validity prevents signature replay

### Security Considerations
1. **Signature replay prevention:** Validate timestamp in signed message within 5-minute window
2. **Admin wallet list:** `ADMIN_WALLETS` is server-side only, never in client bundle
3. **Firebase credentials:** `FIREBASE_SERVICE_ACCOUNT_KEY` is server-side only
4. **Input sanitization:** Strip HTML tags from title/description before storage (XSS prevention)
5. **No client-side Firebase:** All Firestore access via API routes with Firebase Admin SDK

### Markdown Rendering
For MVP, render description and reply content as plain text with `whitespace-pre-wrap`. Markdown rendering can be added in a follow-up. Do NOT add a markdown library dependency.

### Relative Timestamp Utility
```typescript
// web/src/lib/feedback-utils.ts
export function formatRelativeTime(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function truncateWallet(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}
```

### Testing Strategy
- API route tests: mock Firebase Admin SDK, test signature verification, rate limiting, admin checks, critical visibility filtering
- Hook tests: mock `fetch`, test mutation flows, query invalidation, wallet signing flow
- Component tests: mock hooks, test loading/empty/populated/admin/disconnected states
- Signature verification tests: use known keypair to generate real Ed25519 signatures
- Follow co-located test pattern (test files next to source files)

## Files Created

| File | Purpose |
|------|---------|
| `web/src/lib/firebase.ts` | Firebase Admin SDK singleton initialization |
| `web/src/types/feedback.ts` | TypeScript interfaces for feedback data model |
| `web/src/lib/verify-signature.ts` | Ed25519 wallet signature verification |
| `web/src/lib/admin.ts` | Admin wallet detection (server-side) |
| `web/src/lib/feedback-utils.ts` | Relative time formatting, wallet truncation |
| `web/src/app/api/feedback/route.ts` | GET list issues, POST create issue |
| `web/src/app/api/feedback/[id]/route.ts` | GET issue detail, PATCH status update |
| `web/src/app/api/feedback/[id]/reply/route.ts` | POST create reply |
| `web/src/app/api/feedback/admin-check/route.ts` | GET admin status check |
| `web/src/hooks/use-feedback-list.ts` | Query hook for paginated issue list |
| `web/src/hooks/use-create-feedback.ts` | Mutation hook for creating issues |
| `web/src/hooks/use-feedback-detail.ts` | Query hook for single issue + replies |
| `web/src/hooks/use-create-reply.ts` | Mutation hook for posting replies |
| `web/src/hooks/use-update-status.ts` | Mutation hook for admin status changes |
| `web/src/hooks/use-is-admin.ts` | Query hook for admin detection |
| `web/src/app/feedback/page.tsx` | Page route shell |
| `web/src/components/feedback/feedback-feature.tsx` | Main feedback page component |
| `web/src/components/feedback/feedback-card.tsx` | Issue card component |
| `web/src/components/feedback/create-feedback-dialog.tsx` | New issue dialog |
| `web/src/components/feedback/feedback-detail-dialog.tsx` | Issue detail with thread |
| `web/src/components/feedback/reply-thread.tsx` | Reply list display |
| `web/src/components/feedback/reply-form.tsx` | Reply input form |
| `web/src/lib/verify-signature.test.ts` | Signature verification tests |
| `web/src/app/api/feedback/route.test.ts` | API route tests |
| `web/src/app/api/feedback/admin-check/route.test.ts` | Admin check route tests |
| `web/src/lib/feedback-constants.ts` | Server-only rate limit constants |
| `web/src/components/ui/textarea.tsx` | shadcn Textarea component |

## Files Modified

| File | Change |
|------|--------|
| `web/package.json` | Add `firebase-admin` dependency |
| `web/src/lib/constants.ts` | Add feedback keys to `QUERY_KEYS` |
| `web/src/app/layout.tsx` | Add Feedback nav link to `links` array |
| `web/.env.example` | Add `ADMIN_WALLETS`, `FEEDBACK_RATE_LIMIT`, `FIREBASE_SERVICE_ACCOUNT_KEY` |
| `web/src/hooks/index.ts` | Export feedback hooks |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Change Log

#### 2026-03-16 — Code Review Fixes (AI Review)

**H1 — Critical visibility filtering moved server-side** (`web/src/app/api/feedback/route.ts`)
Non-admin GET now runs two Firestore queries (non-critical + resolved-critical) and merges results, eliminating client-side filtering that broke pagination and leaked data.

**H2 — Race condition on replyCount fixed** (`web/src/app/api/feedback/[id]/reply/route.ts`)
Replaced read-then-write pattern with `FieldValue.increment(1)` for atomic counter updates.

**H3 — Removed duplicate tweetnacl dependency** (`web/package.json`)
Removed direct `tweetnacl` dep; it's already a transitive dep of `@solana/web3.js`.

**H4 — Added signature verification to PATCH endpoint** (`web/src/app/api/feedback/[id]/route.ts`, `web/src/hooks/use-update-status.ts`)
PATCH now requires Ed25519 wallet signature to prove admin identity, preventing status spoofing.

**H5 — Fixed "Load More" to accumulate results** (`web/src/hooks/use-feedback-list.ts`, `web/src/components/feedback/feedback-feature.tsx`)
Converted from `useQuery` with page state to `useInfiniteQuery`, so Load More appends rather than replaces.

**M1/M2/M3 — Updated File List** (story document)
Added missing files: `web/src/hooks/index.ts`, `web/src/components/ui/textarea.tsx`, `web/src/app/api/feedback/admin-check/route.test.ts`. Removed claimed-but-nonexistent test files.

**M4 — Server-only rate limit constants** (`web/src/lib/feedback-constants.ts`)
Moved `FEEDBACK_RATE_LIMIT` and `FEEDBACK_REPLY_RATE_LIMIT` from shared `constants.ts` to new `feedback-constants.ts` to avoid `process.env` access in client bundles.

**UI — Widened feedback page container** (`web/src/components/feedback/feedback-feature.tsx`)
Changed `max-w-3xl` → `max-w-5xl` for a wider layout.
