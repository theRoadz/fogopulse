# Story 7.25: Optimize Firebase Feedback Fetching Performance

Status: done
Created: 2026-03-23
Epic: 7 - Platform Polish & UX
Sprint: Current

## Story

As a user,
I want the feedback page to load quickly and paginate smoothly,
so that browsing feedback doesn't feel laggy or unresponsive.

## Problem

The feedback system fetches data from Firestore via Next.js API routes with two performance bottlenecks:

1. **Double sequential queries per list request** — Every page load runs `query.count().get()` then `query.offset(offset).limit(limit).get()` back-to-back (`web/src/app/api/feedback/route.ts` lines 47-49, 76-78). These two Firestore round-trips execute sequentially, doubling API response time.

2. **Firestore `offset()` pagination is O(n)** — `offset(n)` reads and discards `n` documents before returning results. Page 5 at limit=20 reads 100 docs, bills for 100 reads, but returns only 20. Gets progressively slower and more expensive as users paginate deeper.

Additionally:
- **Overly broad cache invalidation** — Upvoting or replying invalidates the entire `['feedback']` query key (`use-upvote.ts` line 41, `use-create-reply.ts` line 53), triggering a full list refetch even though a detail-specific invalidation is already present.
- **Unbounded replies fetch** — The detail endpoint fetches ALL replies with no limit (`web/src/app/api/feedback/[id]/route.ts` lines 36-41), risking slow loads on heavily-discussed issues.

## Solution

### Core fix: Cursor-based pagination with `limit+1` trick
Replace `offset()` + `count()` with cursor-based pagination using `startAfter()`. Fetch `limit + 1` documents — if you get `limit + 1` back, `hasMore = true` and you trim the extra doc. This eliminates both the count query and the offset scan in a single change.

### Supporting fixes:
- **Parallel queries on first page** — When no cursor is provided (first page), run the count query in parallel with the data query (for displaying total count in the UI).
- **Targeted cache invalidation** — Remove the broad `['feedback']` invalidation from upvote/reply mutations. The detail-specific invalidation already updates the viewed issue.
- **Cap replies at 100** — Add `.limit(100)` to the replies subcollection query as a safety net.

### Existing Code to Reuse

| What | File | Usage |
|------|------|-------|
| Firebase Firestore client | `web/src/lib/firebase.ts` → `getDb()` | Existing — no changes needed |
| React Query infinite query | `web/src/hooks/use-feedback-list.ts` | Already uses `useInfiniteQuery` — designed for cursor pagination |
| Query keys | `web/src/lib/constants.ts` lines 162-180 | Existing `QUERY_KEYS.feedback()` and `feedbackDetail()` |

## Acceptance Criteria

1. **Given** a user opens the feedback page, **When** the list loads, **Then** the response time is noticeably faster than before (single Firestore query instead of two sequential ones)
2. **Given** a user scrolls to load more feedback, **When** page 5+ loads, **Then** it loads as fast as page 1 (cursor-based, no offset scan)
3. **Given** a user upvotes an issue from the detail view, **When** the mutation succeeds, **Then** only the detail view refetches (not the entire feedback list)
4. **Given** a user posts a reply, **When** the mutation succeeds, **Then** only the detail view refetches (not the entire feedback list)
5. **Given** an issue has many replies, **When** the detail page loads, **Then** at most 100 replies are returned (safety cap)
6. **Given** a first-page load with no cursor, **When** the API responds, **Then** the response still includes `total` count for UI display

## Tasks / Subtasks

### Task 1: Switch API route to cursor-based pagination (AC: #1, #2, #6)

- [x] 1.1: In `web/src/app/api/feedback/route.ts`, accept `cursor` + `cursorId` query params alongside existing `limit` params
- [x] 1.2: When `cursor` is provided — use `.startAfter(cursor, cursorId)` instead of `.offset()`, fetch `limit + 1` docs, derive `hasMore` from result length, trim extra doc before returning
- [x] 1.3: When no `cursor` (first page) — run count query and data query in parallel with `Promise.all()`, return `total` in response
- [x] 1.4: Deduplicated admin/non-admin into single query builder with conditional `where('visibility', '==', 'public')`
- [x] 1.5: Return `nextCursor` + `nextCursorId` in the response; added `orderBy(documentId)` as tiebreaker

### Task 2: Update client hook for cursor pagination (AC: #1, #2)

- [x] 2.1: In `web/src/hooks/use-feedback-list.ts`, change `pageParam` from page number to `{ cursor, cursorId }` object (or `undefined` for first page)
- [x] 2.2: Update `getNextPageParam` to return `{ cursor: lastPage.nextCursor, cursorId: lastPage.nextCursorId }`
- [x] 2.3: Update `queryFn` to pass `cursor` + `cursorId` query params

### Task 3: Fix overly broad cache invalidation (AC: #3, #4)

- [x] 3.1: In `web/src/hooks/use-upvote.ts`, removed broad `['feedback']` invalidation — kept detail-specific
- [x] 3.2: In `web/src/hooks/use-create-reply.ts`, removed broad `['feedback']` invalidation — kept detail-specific

### Task 4: Cap replies fetch (AC: #5)

- [x] 4.1: In `web/src/app/api/feedback/[id]/route.ts`, added `.limit(100)` to replies subcollection query

## Dev Notes

### Key files to modify
- `web/src/app/api/feedback/route.ts` — main list endpoint, lines 34-91
- `web/src/hooks/use-feedback-list.ts` — client hook, lines 26-39
- `web/src/hooks/use-upvote.ts` — line 41
- `web/src/hooks/use-create-reply.ts` — line 53
- `web/src/app/api/feedback/[id]/route.ts` — line 40

### Cursor pagination pattern
```typescript
// Fetch limit + 1 to determine hasMore
const snapshot = await query.limit(limit + 1).get()
const hasMore = snapshot.docs.length > limit
const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs
const nextCursor = docs.length > 0 ? docs[docs.length - 1].data().createdAt : undefined
```

### startAfter usage
Firestore `startAfter()` requires the value to match the `orderBy` field. Since we order by `createdAt` (desc), pass the ISO timestamp string directly:
```typescript
if (cursor) {
  query = query.startAfter(cursor)
}
```

### Response shape change
The response adds `nextCursor` field. `page` field becomes less meaningful with cursor pagination but can be kept for backwards compatibility or removed.

## File List

| File | Action | Description |
|------|--------|-------------|
| `web/src/app/api/feedback/route.ts` | MODIFIED | Cursor-based pagination with startAfter + limit+1 trick, parallel first-page queries, documentId tiebreaker |
| `web/src/app/api/feedback/route.test.ts` | MODIFIED | Updated mock chain: replaced `offset` with `startAfter` |
| `web/src/hooks/use-feedback-list.ts` | MODIFIED | Switch pageParam from number to `{ cursor, cursorId }` object |
| `web/src/hooks/use-upvote.ts` | MODIFIED | Remove broad ['feedback'] invalidation |
| `web/src/hooks/use-create-reply.ts` | MODIFIED | Remove broad ['feedback'] invalidation |
| `web/src/app/api/feedback/[id]/route.ts` | MODIFIED | Add .limit(100) to replies query |
| `web/src/types/feedback.ts` | MODIFIED | Made `total` optional, removed `page`, added `nextCursor` + `nextCursorId` |
| `web/src/lib/firebase.ts` | MODIFIED | Added `getFieldPath()` export for FieldPath.documentId() |

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Implementation Notes
- Deduplicated admin/non-admin query paths into single builder with conditional visibility filter
- Added `FieldPath.documentId()` as secondary orderBy to prevent document skipping on duplicate `createdAt` timestamps
- Client pageParam changed from simple string to `{ cursor, cursorId }` object to support tiebreaker
- Code review found and fixed: broken test mocks, duplicate timestamp edge case, stale JSDoc, missing type file in File List

## Change Log

- **2026-03-23**: Story created. Root cause: sequential double-query + offset pagination. Fix: cursor-based pagination with limit+1 trick.
- **2026-03-23**: Implementation complete. Code review fixed: test mock chain (H1), duplicate timestamp tiebreaker (H2), stale JSDoc (M1), story bookkeeping (M2, L1).
