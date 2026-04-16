# Dashboard Queries Pagination & Search — Design

**Issue:** [#1081](https://github.com/mckinsey/agents-at-scale-ark/issues/1081) — Dashboard: Add pagination on queries and evals on dashboard to accomodate for large number of items with long ttl
**Branch:** `dashboard/pagination`
**Date:** 2026-04-16

## Problem

Users running ~4k queries/day with a 30-day TTL end up with ~46k Query CRDs in the cluster. The current Queries page (`/queries`) calls `GET /api/v1/queries` with no pagination params, loads every Query into the browser, and crashes the dashboard.

## Scope

- **In scope:** Server-side pagination + search for the Queries page in ark-dashboard and the backing `/api/v1/queries` endpoint in ark-api.
- **Out of scope:** Evaluations pagination (the Evaluations page was removed in #1323 as part of the marketplace migration); general sort/filter overhaul; bulk actions.

## Acceptance criteria (from issue)

1. Paginate queries — fetch a slice at a time, not the whole set.
2. Users see page controls and can move across pages.
3. Users can search queries by the actual query text.

## High-level approach

**In-memory paginate & filter in ark-api.** The route handler lists all Query CRDs for the namespace from the Kubernetes API once per request, filters by `search`, sorts newest-first, then slices for `page`/`page_size`. The dashboard receives at most one page worth of data per request, so the network + browser never touch the full 46k set.

Chosen over K8s continue-token pagination (breaks text search, no jump-to-page UX) and caching/index layers (staleness, memory complexity, overkill for current scale).

## API contract

`GET /api/v1/queries`

| Param | Type | Default | Notes |
|---|---|---|---|
| `namespace` | string | current context | existing |
| `page` | int ≥ 1 | 1 | page number |
| `page_size` | int 1–100 | 25 | values above 100 are clamped to 100; ≤ 0 rejected with 422 |
| `search` | string | — | case-insensitive substring match over input text |

**Response** (extends existing `QueryListResponse`):

```jsonc
{
  "items": [ /* QueryResponse, max page_size items */ ],
  "count": 25,          // items on THIS page (existing field, semantics clarified)
  "total": 1847,        // NEW — total matching items across all pages
  "page": 3,            // NEW — echoed back
  "page_size": 25       // NEW — echoed back
}
```

**Search semantics.** Match `query.input`:
- If `input` is a string: case-insensitive substring match.
- If `input` is an array of chat messages: concatenate `content` of each message and substring match.
- Empty/absent `search`: no filter.

**Sort.** Always `creationTimestamp` descending (newest-first). No sort knob on the API.

**Backwards compatibility.** Callers that pass no new params get page 1 of size 25 transparently. `count` field stays populated; `total`, `page`, `page_size` are additive.

## Dashboard state model

**URL structure:** `/queries?page=3&pageSize=25&q=hello`

- `q` in the URL, `search` on the wire — shorter URLs for the common case.
- Missing params default to `page=1`, `pageSize=25`, no search.
- Namespace remains in its existing route prefix (unchanged).

**State management:**
- Read `page`, `pageSize`, `q` from `useSearchParams`.
- Mutations via `router.replace()` (not `push`) so paginating and typing don't flood browser history.
- Search input debounced 400ms (matching the existing Marketplace page pattern) before it writes to the URL.

**Data fetching:**
- `useListQueries({ page, pageSize, search })` with query key `['queries', { page, pageSize, search }]`.
- `keepPreviousData: true` — page transitions don't show a "Loading..." flash; the old page stays visible with a subtle fetching indicator until the new page arrives.

**Service layer:**
- `queriesService.list({ page, pageSize, search })` builds `URLSearchParams` and calls `GET /api/v1/queries?page=..&page_size=..&search=..`.

**What this replaces.** `QueriesSection`'s current `useState<QueryResponse[]>` + client-side `sortedQueries` + local `setQueries`. All become server-driven; the component just renders what the hook returns.

## UI / UX

**Header** (existing pattern):
- Page title: `Queries (1,847)` — uses `total` from response.
- Create Query button (unchanged).

**New toolbar row** (above the table):
- Search input — left-aligned, ~300px, search icon, placeholder "Search query text...", debounced 400ms. Clear via backspace or × button.
- Refresh button — right-aligned (moved from current location above-right of the table).

**Table:** Unchanged columns (Name, Age, Target, Input, Output, Token Usage, Status, Actions). Sort chevrons removed — ordering is fixed server-side to newest-first.

**Pagination footer** (shown only when `total > pageSize`):

```
Showing 51-75 of 1,847    [Page size: 25 ▾]    ← 1 … 3 4 [5] 6 7 … 74 →
```

- Left: "Showing {from}-{to} of {total}" (reuses Marketplace page's wording).
- Middle: page size selector (options 10 / 25 / 50 / 100). Changing size resets to page 1.
- Right: Prev / numbered pages with ellipses / Next. Uses shadcn `Pagination` primitive if available in the dashboard; otherwise `Button`s matching the Marketplace style.

**Empty / edge states:**
- No queries at all: existing `Empty` component (unchanged).
- Search returns 0 rows: new empty variant — "No queries match '{search}'. Try a different search." with a "Clear search" button. Distinct from "No Queries Yet" so active searchers don't see the "Create Query" onboarding CTA.
- `page` > last page (e.g., bookmarked page 5, items since deleted): auto `router.replace` to page 1.

**Loading states:**
- First load: 25 skeleton rows to avoid layout shift when data arrives.
- Page transitions (`isFetching` && `keepPreviousData`): subtle top progress indicator or faded overlay; table stays visible.
- Search typing: debounce + small "Searching..." hint next to the input.

**Namespace change:** resets `page` to 1 and clears `q`, since namespace switch implies a new context.

## Files touched

**Backend (ark-api):**
- `services/ark-api/ark-api/.../queries.py` — route handler accepts new params, filters/sorts/slices.
- Response schema — new `total`, `page`, `page_size` fields.
- Tests alongside the route.

**Frontend (ark-dashboard):**
- `lib/services/queries.ts` — `list()` takes `{ page, pageSize, search }`.
- `lib/services/queries-hooks.ts` — `useListQueries` accepts params, uses `keepPreviousData`.
- `components/sections/queries-section.tsx` — server-driven; client sort/filter removed.
- `app/(dashboard)/queries/page.tsx` — reads URL params, renders toolbar (search + refresh) and pagination footer.
- Possibly new: `components/sections/queries-pagination.tsx` (or inline if short).
- Regenerated: `lib/api/generated/types.ts` from the updated OpenAPI spec.

## Testing

**Backend (ark-api):**
- `page_size=500` clamps to 100 in the response.
- `page=0` or negative → 422 validation error.
- `search` is case-insensitive substring over a string `input`.
- `search` matches the concatenated content of chat-message-array inputs.
- `total` reflects the filtered count, not the pre-filter total.
- Empty namespace returns `total: 0`, `items: []` (not 404).

**Frontend (ark-dashboard):**
- URL sync: changing page updates `?page=N`; reload restores state.
- Debounce: typing in search does not fire one request per keystroke.
- `keepPreviousData`: previous page stays visible during page-turn fetch.
- Changing page size resets page to 1.
- Empty-search-results state renders (not the onboarding empty state).
- Namespace switch resets `page` and clears `q`.

## Error handling

- API 422 (invalid page/page_size): toast error; reset to page 1.
- API 5xx / network: existing toast error pattern preserved.
- Stale page (`page` beyond `total`): detect in the component; `router.replace` to page 1.

## Out of scope (potential follow-ups)

- Evaluations pagination (page removed in #1323).
- Server-side sort beyond newest-first.
- Label-selector filtering in the UI.
- Bulk actions on paginated rows.
