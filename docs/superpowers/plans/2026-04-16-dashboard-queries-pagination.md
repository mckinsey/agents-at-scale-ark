# Dashboard Queries Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side pagination and case-insensitive text search to the Queries dashboard, eliminating the crash seen at ~46k Query CRDs.

**Architecture:** ark-api's `GET /api/v1/queries` lists all Query CRDs for a namespace, filters by `search` (substring over `input` text), sorts newest-first by `creationTimestamp`, slices for `page`/`page_size`, and returns `{items, count, total, page, page_size}`. The dashboard reads `page`, `pageSize`, `q` from the URL (`router.replace` on change), debounces search 400ms, calls the paginated endpoint via React Query with `keepPreviousData`, and renders the existing `components/ui/pagination.tsx` footer.

**Tech Stack:** FastAPI + Pydantic (backend); Next.js 15 App Router + React Query 5 + shadcn UI (frontend); openapi-typescript for regenerated types.

**Spec:** `docs/superpowers/specs/2026-04-16-dashboard-queries-pagination-design.md`

---

## Phase 1 — Backend (ark-api)

### Task 1: Extend `QueryListResponse` with pagination fields

**Files:**
- Modify: `services/ark-api/ark-api/src/ark_api/models/queries.py` (class `QueryListResponse`, lines 88-91)

- [ ] **Step 1: Update the Pydantic model**

Replace the existing `QueryListResponse` class (lines 88-91) with:

```python
class QueryListResponse(BaseModel):
    """Response for listing queries."""
    items: List[QueryResponse]
    count: int
    total: int = 0
    page: int = 1
    page_size: int = 25
```

Defaults are set so the model is backwards-compatible with any code that still constructs it with only `items` and `count` (e.g. during refactors).

- [ ] **Step 2: Commit**

```bash
git add services/ark-api/ark-api/src/ark_api/models/queries.py
git commit -m "feat(ark-api): add pagination fields to QueryListResponse"
```

---

### Task 2: Add paginated list handler in ark-api

**Files:**
- Modify: `services/ark-api/ark-api/src/ark_api/api/v1/queries.py` (function `list_queries`, lines 85-97)
- Create: `services/ark-api/ark-api/tests/api/test_queries_pagination.py`

- [ ] **Step 1: Write the failing tests**

Create `services/ark-api/ark-api/tests/api/test_queries_pagination.py`:

```python
"""Tests for /v1/queries pagination and search."""
import os
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

os.environ["AUTH_MODE"] = "open"


def _query_item(name: str, input_text, offset_seconds: int = 0):
    """Build a fake ark_client query list item (has to_dict)."""
    item = AsyncMock()
    created = (datetime(2026, 1, 1, tzinfo=timezone.utc)
               + timedelta(seconds=offset_seconds)).isoformat().replace("+00:00", "Z")
    item.to_dict = lambda: {
        "metadata": {
            "name": name,
            "namespace": "default",
            "creationTimestamp": created,
        },
        "spec": {"type": "user", "input": input_text},
        "status": {"phase": "done"},
    }
    return item


class TestQueriesPagination(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    def _patch_ark_client(self, items):
        """Patch with_ark_client so queries.a_list returns the given items."""
        ark = AsyncMock()
        ark.queries.a_list = AsyncMock(return_value=items)
        ctx = AsyncMock()
        ctx.__aenter__.return_value = ark
        ctx.__aexit__.return_value = None
        return patch("ark_api.api.v1.queries.with_ark_client", return_value=ctx)

    def test_default_page_and_size(self):
        items = [_query_item(f"q-{i}", f"input {i}", i) for i in range(30)]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["page"], 1)
        self.assertEqual(body["page_size"], 25)
        self.assertEqual(body["total"], 30)
        self.assertEqual(body["count"], 25)
        self.assertEqual(len(body["items"]), 25)

    def test_page_two_returns_remainder(self):
        items = [_query_item(f"q-{i}", f"input {i}", i) for i in range(30)]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?page=2")
        body = r.json()
        self.assertEqual(body["page"], 2)
        self.assertEqual(body["count"], 5)
        self.assertEqual(len(body["items"]), 5)

    def test_page_size_clamped_to_100(self):
        items = [_query_item(f"q-{i}", "x", i) for i in range(200)]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?page_size=500")
        body = r.json()
        self.assertEqual(body["page_size"], 100)
        self.assertEqual(len(body["items"]), 100)

    def test_page_zero_returns_422(self):
        with self._patch_ark_client([]):
            r = self.client.get("/v1/queries?page=0")
        self.assertEqual(r.status_code, 422)

    def test_page_size_zero_returns_422(self):
        with self._patch_ark_client([]):
            r = self.client.get("/v1/queries?page_size=0")
        self.assertEqual(r.status_code, 422)

    def test_sort_newest_first(self):
        items = [
            _query_item("old", "old", 0),
            _query_item("new", "new", 1000),
            _query_item("mid", "mid", 500),
        ]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries")
        names = [it["name"] for it in r.json()["items"]]
        self.assertEqual(names, ["new", "mid", "old"])

    def test_search_string_input_case_insensitive(self):
        items = [
            _query_item("q1", "Hello World", 0),
            _query_item("q2", "goodbye", 1),
            _query_item("q3", "HELLO there", 2),
        ]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?search=hello")
        body = r.json()
        self.assertEqual(body["total"], 2)
        names = sorted(it["name"] for it in body["items"])
        self.assertEqual(names, ["q1", "q3"])

    def test_search_chat_messages_input(self):
        messages = [
            {"role": "user", "content": "what is the weather?"},
            {"role": "assistant", "content": "I don't know"},
        ]
        items = [
            _query_item("q1", messages, 0),
            _query_item("q2", [{"role": "user", "content": "unrelated"}], 1),
        ]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?search=weather")
        body = r.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["name"], "q1")

    def test_total_reflects_filtered_count(self):
        items = [_query_item(f"q-{i}", "match" if i < 3 else "no", i) for i in range(10)]
        with self._patch_ark_client(items):
            r = self.client.get("/v1/queries?search=match&page=1&page_size=2")
        body = r.json()
        self.assertEqual(body["total"], 3)
        self.assertEqual(body["count"], 2)

    def test_empty_namespace_returns_empty_page(self):
        with self._patch_ark_client([]):
            r = self.client.get("/v1/queries")
        body = r.json()
        self.assertEqual(body["total"], 0)
        self.assertEqual(body["items"], [])
        self.assertEqual(r.status_code, 200)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/ark-api/ark-api
uv run pytest tests/api/test_queries_pagination.py -v
```

Expected: all fail because new params aren't supported and response lacks `total`/`page`/`page_size`.

- [ ] **Step 3: Implement the paginated handler**

In `services/ark-api/ark-api/src/ark_api/api/v1/queries.py`:

(a) Add a helper just above `list_queries` (before line 85):

```python
def _extract_search_text(spec_input) -> str:
    """Flatten query input to a single lowercase string for substring search."""
    if spec_input is None:
        return ""
    if isinstance(spec_input, str):
        return spec_input.lower()
    if isinstance(spec_input, list):
        parts = []
        for msg in spec_input:
            if not isinstance(msg, dict):
                continue
            content = msg.get("content")
            if isinstance(content, str):
                parts.append(content)
            elif isinstance(content, list):
                for piece in content:
                    if isinstance(piece, dict) and isinstance(piece.get("text"), str):
                        parts.append(piece["text"])
        return " ".join(parts).lower()
    return ""


def _creation_timestamp_key(item_dict: dict):
    """Sort key: newest-first; items without a timestamp sort last."""
    ts = item_dict.get("metadata", {}).get("creationTimestamp")
    if not ts:
        return datetime.min.replace(tzinfo=None)
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
```

(b) Replace the existing `list_queries` function (lines 85-97) with:

```python
@router.get("", response_model=QueryListResponse)
@handle_k8s_errors(operation="list", resource_type="query")
async def list_queries(
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(25, ge=1, le=500, description="Items per page (clamped to 100)"),
    search: Optional[str] = Query(None, description="Case-insensitive substring match over query input text"),
) -> QueryListResponse:
    """List queries in a namespace with pagination and text search."""
    effective_page_size = min(page_size, 100)
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.queries.a_list()
        raw_items = [item.to_dict() for item in result]

        if search:
            needle = search.lower()
            raw_items = [
                item for item in raw_items
                if needle in _extract_search_text(item.get("spec", {}).get("input"))
            ]

        raw_items.sort(key=_creation_timestamp_key, reverse=True)

        total = len(raw_items)
        start = (page - 1) * effective_page_size
        end = start + effective_page_size
        page_items = [query_to_response(item) for item in raw_items[start:end]]

        return QueryListResponse(
            items=page_items,
            count=len(page_items),
            total=total,
            page=page,
            page_size=effective_page_size,
        )
```

Note the `le=500` on `page_size` — FastAPI rejects absurd values but we still clamp to 100 in code for callers under 500. The `Query` validator gives a friendly 422; the clamp gives graceful behavior for values 101-500.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/ark-api/ark-api
uv run pytest tests/api/test_queries_pagination.py -v
```

Expected: all 10 tests pass.

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

```bash
cd services/ark-api/ark-api
make test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add services/ark-api/ark-api/src/ark_api/api/v1/queries.py \
        services/ark-api/ark-api/tests/api/test_queries_pagination.py
git commit -m "feat(ark-api): add pagination and text search to list queries (#1081)"
```

---

### Task 3: Regenerate the OpenAPI spec

**Files:**
- Regenerate: `services/ark-api/ark-api/openapi.json`

- [ ] **Step 1: Regenerate**

```bash
cd services/ark-api/ark-api
uv run python generate_openapi.py
```

- [ ] **Step 2: Confirm the new params appear**

```bash
cd services/ark-api/ark-api
grep -A2 '"page_size"' openapi.json | head -10
```

Expected: `page_size` parameter definition appears under `/v1/queries`.

- [ ] **Step 3: Commit**

```bash
git add services/ark-api/ark-api/openapi.json
git commit -m "chore(ark-api): regenerate openapi spec for queries pagination"
```

---

## Phase 2 — Dashboard types regeneration

### Task 4: Regenerate dashboard TypeScript types

**Files:**
- Regenerate: `services/ark-dashboard/ark-dashboard/lib/api/generated/types.ts`

- [ ] **Step 1: Find the regeneration command**

```bash
cat services/ark-dashboard/ark-dashboard/package.json | grep -E '"(generate|openapi|types)"'
```

Expected: a script like `"generate:types": "openapi-typescript ..."` or similar. If none exists, use the root Makefile target (check `make help` in `services/ark-dashboard/`).

- [ ] **Step 2: Run regeneration**

Run the identified script, e.g.:

```bash
cd services/ark-dashboard/ark-dashboard
npm run generate:types    # or whatever the discovered script name is
```

- [ ] **Step 3: Verify new fields in types.ts**

```bash
grep -A3 "QueryListResponse:" services/ark-dashboard/ark-dashboard/lib/api/generated/types.ts | head -15
```

Expected: `total`, `page`, `page_size` appear in the `QueryListResponse` schema definition.

- [ ] **Step 4: Verify query params on list endpoint**

```bash
grep -B1 -A15 "list_queries_v1_queries_get" services/ark-dashboard/ark-dashboard/lib/api/generated/types.ts | head -25
```

Expected: the `query` block under `parameters` now shows `page`, `page_size`, and `search` alongside `namespace`.

- [ ] **Step 5: Commit**

```bash
git add services/ark-dashboard/ark-dashboard/lib/api/generated/types.ts
git commit -m "chore(dashboard): regenerate types for queries pagination"
```

---

## Phase 3 — Dashboard service + hook

### Task 5: Update `queriesService.list` to accept pagination params

**Files:**
- Modify: `services/ark-dashboard/ark-dashboard/lib/services/queries.ts` (lines 10-14)

- [ ] **Step 1: Define a params interface and update `list`**

Replace lines 10-14 of `services/ark-dashboard/ark-dashboard/lib/services/queries.ts` with:

```typescript
export interface ListQueriesParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export const queriesService = {
  async list(params: ListQueriesParams = {}): Promise<QueryListResponse> {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set('page', String(params.page));
    if (params.pageSize !== undefined) search.set('page_size', String(params.pageSize));
    if (params.search) search.set('search', params.search);
    const qs = search.toString();
    const response = await apiClient.get<QueryListResponse>(
      `/api/v1/queries${qs ? `?${qs}` : ''}`,
    );
    return response;
  },
```

Keep all other methods (`get`, `create`, `update`, `delete`, `cancel`, `getStatus`, `streamQueryStatus`) unchanged.

- [ ] **Step 2: Type-check**

```bash
cd services/ark-dashboard/ark-dashboard
npm run build
```

Expected: may fail on consumers until Task 6; if it compiles cleanly (because TS treats existing callers as `list()` with no args → ok), proceed.

- [ ] **Step 3: Commit**

```bash
git add services/ark-dashboard/ark-dashboard/lib/services/queries.ts
git commit -m "feat(dashboard): accept pagination params in queriesService.list"
```

---

### Task 6: Update `useListQueries` to pass params and keep previous data

**Files:**
- Modify: `services/ark-dashboard/ark-dashboard/lib/services/queries-hooks.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListQueriesParams } from './queries';
import { queriesService } from './queries';

export const useListQueries = (params: ListQueriesParams = {}) => {
  return useQuery({
    queryKey: ['list-all-queries', params],
    queryFn: () => queriesService.list(params),
    placeholderData: keepPreviousData,
  });
};
```

`placeholderData: keepPreviousData` is the React Query 5 spelling of "keep the old page visible while the new one loads". Do not use the v4 `keepPreviousData: true` option — it is removed in v5.

- [ ] **Step 2: Type-check**

```bash
cd services/ark-dashboard/ark-dashboard
npm run build
```

Expected: build succeeds. The existing callsite `useListQueries()` in `queries/page.tsx` and `queries-section.tsx` still works (params defaults to `{}`).

- [ ] **Step 3: Commit**

```bash
git add services/ark-dashboard/ark-dashboard/lib/services/queries-hooks.ts
git commit -m "feat(dashboard): wire pagination params into useListQueries"
```

---

## Phase 4 — Dashboard UI

### Task 7: Make the Queries page URL-driven with toolbar and pagination

**Files:**
- Modify: `services/ark-dashboard/ark-dashboard/app/(dashboard)/queries/page.tsx` (complete rewrite of this file)

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `services/ark-dashboard/ark-dashboard/app/(dashboard)/queries/page.tsx` with:

```tsx
'use client';

import { Plus, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { QueriesSection } from '@/components/sections/queries-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useListQueries } from '@/lib/services/queries-hooks';

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const SEARCH_DEBOUNCE_MS = 400;

function parsePage(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function parsePageSize(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, 100);
}

export default function QueriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queriesSectionRef = useRef<{ openAddEditor: () => void }>(null);

  const page = parsePage(searchParams.get('page'));
  const pageSize = parsePageSize(searchParams.get('pageSize'));
  const urlSearch = searchParams.get('q') ?? '';

  const [searchInput, setSearchInput] = useState<string>(urlSearch);

  const { data } = useListQueries({
    page,
    pageSize,
    search: urlSearch || undefined,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageTitle = data ? `Queries (${total})` : 'Queries';

  const updateParams = useMemo(
    () => (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?');
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (searchInput === urlSearch) return;
    const t = setTimeout(() => {
      updateParams({ q: searchInput || null, page: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, urlSearch, updateParams]);

  useEffect(() => {
    if (total === 0) return;
    if (page > totalPages) {
      updateParams({ page: null });
    }
  }, [page, total, totalPages, updateParams]);

  const handlePageChange = (next: number) => {
    updateParams({ page: next === 1 ? null : String(next) });
  };

  const handlePageSizeChange = (next: number) => {
    updateParams({
      pageSize: next === DEFAULT_PAGE_SIZE ? null : String(next),
      page: null,
    });
  };

  const handleClearSearch = () => {
    setSearchInput('');
    updateParams({ q: null, page: null });
  };

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Queries"
        actions={
          <Button onClick={() => queriesSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Create Query
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between">
          <h1 className="text-xl">{pageTitle}</h1>
          <div className="relative w-[300px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search query text..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <QueriesSection
          ref={queriesSectionRef}
          searchTerm={urlSearch}
          onClearSearch={handleClearSearch}
        />

        {total > pageSize && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            itemsPerPage={pageSize}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handlePageSizeChange}
            itemsPerPageOptions={PAGE_SIZE_OPTIONS}
          />
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Confirm it won't compile yet**

```bash
cd services/ark-dashboard/ark-dashboard
npm run build
```

Expected: fails on `QueriesSection` not accepting `searchTerm`/`onClearSearch`. That is addressed in Task 8; continue.

- [ ] **Step 3: Do not commit yet**

This task depends on Task 8 to compile. Commit after Task 8.

---

### Task 8: Convert `QueriesSection` to server-driven and add search-empty state

**Files:**
- Modify: `services/ark-dashboard/ark-dashboard/components/sections/queries-section.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `services/ark-dashboard/ark-dashboard/components/sections/queries-section.tsx` with:

```tsx
'use client';

import {
  ArrowUpRightIcon,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { toast } from 'sonner';

import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { components } from '@/lib/api/generated/types';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { queriesService } from '@/lib/services/queries';
import { useListQueries } from '@/lib/services/queries-hooks';
import { getResourceEventsUrl } from '@/lib/utils/events';
import { formatAge } from '@/lib/utils/time';

type QueryResponse = components['schemas']['QueryResponse'];

type OutputViewMode = 'content' | 'raw';

interface QueriesSectionProps {
  readonly searchTerm: string;
  readonly onClearSearch: () => void;
}

const DEFAULT_PAGE_SIZE = 25;

function parsePage(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function parsePageSize(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, 100);
}

export const QueriesSection = forwardRef<
  { openAddEditor: () => void },
  QueriesSectionProps
>(function QueriesSection({ searchTerm, onClearSearch }, ref) {
  const searchParams = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const pageSize = parsePageSize(searchParams.get('pageSize'));

  const [outputViewMode, setOutputViewMode] = useState<OutputViewMode>('content');
  const { push } = useNamespacedNavigation();

  useImperativeHandle(ref, () => ({
    openAddEditor: () => {
      push(`/query/new`);
    },
  }));

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useListQueries({ page, pageSize, search: searchTerm || undefined });

  useEffect(() => {
    if (isError) {
      toast.error('Failed to Load Queries', {
        description:
          error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }, [isError, error]);

  const queries = data?.items ?? [];
  const total = data?.total ?? 0;

  const truncate = (text: string, maxLen = 120) =>
    text.length > maxLen ? text.slice(0, maxLen) + '...' : text;

  const truncateText = (text: string | undefined, maxLength: number = 120) => {
    if (!text) return '-';
    const newlineIndex = text.indexOf('\n');
    const cutoffIndex =
      newlineIndex > -1 ? Math.min(newlineIndex, maxLength) : maxLength;
    return text.length > cutoffIndex
      ? text.substring(0, cutoffIndex) + '...'
      : text;
  };

  const getInputDisplayText = (
    input: string | { role: string; content?: string | unknown }[] | undefined,
  ): string => {
    if (!input) return '-';
    if (typeof input === 'string') return input;
    if (Array.isArray(input)) {
      const lastMsg = input[input.length - 1];
      if (!lastMsg?.content) return '-';
      return typeof lastMsg.content === 'string'
        ? lastMsg.content
        : JSON.stringify(lastMsg.content);
    }
    return '-';
  };

  const formatTokenUsage = (query: QueryResponse) => {
    if (!query.status?.tokenUsage) return '-';
    const usage = query.status.tokenUsage as {
      promptTokens?: number;
      completionTokens?: number;
    };
    return `${usage.promptTokens || 0} / ${usage.completionTokens || 0}`;
  };

  const getTargetDisplay = (query: QueryResponse) => {
    const response = query.status?.response as
      | { target?: { name: string; type: string } }
      | undefined;
    if (!response) return '-';
    const target = response.target;
    if (!target?.type || !target?.name) return '-';
    return `${target.type}:${target.name}`;
  };

  const getFirstResponseText = (query: QueryResponse) => {
    const response = query.status?.response as { content?: string } | undefined;
    return response?.content;
  };

  const getFirstResponseJsonPreview = (query: QueryResponse) => {
    const response = query.status?.response;
    const raw = response ?? query.status ?? query;
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      try {
        return String(raw);
      } catch {
        return '{}';
      }
    }
  };

  const getStatus = (query: QueryResponse) =>
    (query.status as { phase?: string })?.phase || '—';

  const getOutput = (query: QueryResponse) => getFirstResponseText(query) || '-';

  const renderOutputCell = (query: QueryResponse) => {
    const text = getFirstResponseText(query) || '';
    if (outputViewMode === 'content') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="text-left">
              {truncateText(text)}
            </TooltipTrigger>
            {text && text.length > 120 && (
              <TooltipContent className="max-w-md">
                <p className="whitespace-pre-wrap">{text}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      );
    }
    const preview = getFirstResponseJsonPreview(query);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="text-left font-mono text-[11px]">
            {truncate(preview.replace(/\s+/g, ' '), 140)}
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">
            <pre className="max-h-64 overflow-auto text-[11px] whitespace-pre-wrap">
              {preview}
            </pre>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const handleCancel = async (queryName: string) => {
    try {
      await queriesService.cancel(queryName);
      toast.success('Query Canceled', { description: 'Successfully canceled query' });
      refetch();
    } catch (err) {
      toast.error('Failed to Cancel Query', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
      });
    }
  };

  const handleDelete = async (queryName: string) => {
    try {
      await queriesService.delete(queryName);
      toast.success('Query Deleted', { description: 'Successfully deleted query' });
      refetch();
    } catch (err) {
      toast.error('Failed to Delete Query', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
      });
    }
  };

  const getStatusBadge = (status: string | undefined, queryName: string) => {
    const normalizedStatus = status as
      | 'done'
      | 'error'
      | 'running'
      | 'canceled'
      | 'default';
    const variant = ['done', 'error', 'running', 'canceled'].includes(status || '')
      ? normalizedStatus
      : 'default';
    return (
      <StatusDot
        variant={variant}
        onCancel={status === 'running' ? () => handleCancel(queryName) : undefined}
      />
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const noMatches = searchTerm && total === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-full flex-col">
        <main className="mt-4 flex-1 space-y-4 overflow-auto">
          <div className="ml-auto">
            <Button onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Name</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Age</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Target</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Input</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                      <div className="flex items-center justify-between">
                        <span>Output</span>
                        <div className="ml-2 inline-flex items-center gap-1 text-xs">
                          <button
                            className={`rounded px-2 py-1 ${outputViewMode === 'content' ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}
                            onClick={() => setOutputViewMode('content')}>
                            Content
                          </button>
                          <button
                            className={`rounded px-2 py-1 ${outputViewMode === 'raw' ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}
                            onClick={() => setOutputViewMode('raw')}>
                            Raw
                          </button>
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Token Usage (Prompt / Completion)</th>
                    <th className="px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">Status</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                        {noMatches ? (
                          <Empty>
                            <EmptyHeader>
                              <EmptyTitle>No matching queries</EmptyTitle>
                              <EmptyDescription>
                                No queries match &ldquo;{searchTerm}&rdquo;. Try a different search.
                              </EmptyDescription>
                            </EmptyHeader>
                            <EmptyContent>
                              <Button variant="outline" onClick={onClearSearch}>
                                Clear search
                              </Button>
                            </EmptyContent>
                          </Empty>
                        ) : (
                          <Empty>
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <DASHBOARD_SECTIONS.queries.icon />
                              </EmptyMedia>
                              <EmptyTitle>No Queries Yet</EmptyTitle>
                              <EmptyDescription>
                                You haven&apos;t created any queries yet. Get started by creating your first query.
                              </EmptyDescription>
                            </EmptyHeader>
                            <EmptyContent>
                              <NamespacedLink href="/query/new">
                                <Button asChild>
                                  <div>
                                    <Plus className="h-4 w-4" />
                                    Create Query
                                  </div>
                                </Button>
                              </NamespacedLink>
                            </EmptyContent>
                            <Button variant="link" asChild className="text-muted-foreground" size="sm">
                              <a href="https://mckinsey.github.io/agents-at-scale-ark/user-guide/queries/" target="_blank">
                                Learn More <ArrowUpRightIcon />
                              </a>
                            </Button>
                          </Empty>
                        )}
                      </td>
                    </tr>
                  ) : (
                    queries.map(query => {
                      const target = getTargetDisplay(query);
                      const output = getOutput(query);
                      const inputDisplayText = getInputDisplayText(query.input);
                      return (
                        <tr
                          key={query.name}
                          className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/30"
                          onClick={() => push(`/query/${query.name}`)}>
                          <td className="px-3 py-3 font-mono text-sm text-gray-900 dark:text-gray-100">{query.name}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">{formatAge(query.creationTimestamp)}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">{target}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger className="text-left">{truncateText(inputDisplayText)}</TooltipTrigger>
                                {inputDisplayText && inputDisplayText.length > 50 && (
                                  <TooltipContent className="max-w-md">
                                    <p className="whitespace-pre-wrap">{inputDisplayText}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">{renderOutputCell(query)}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">{formatTokenUsage(query)}</td>
                          <td className="px-3 py-3 text-center">{getStatusBadge(getStatus(query), query.name)}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-start gap-1">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  const eventsUrl = getResourceEventsUrl('Query', query.name);
                                  window.open(eventsUrl, '_blank');
                                }}
                                className="rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-blue-400"
                                title="View query events">
                                <FileText className="h-4 w-4" />
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  handleDelete(query.name);
                                }}
                                className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-red-400"
                                title="Delete query">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
});

interface StatusDotProps {
  variant: 'done' | 'error' | 'running' | 'canceled' | 'default';
  onCancel?: () => void;
}

function StatusDot({ variant, onCancel }: StatusDotProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case 'done':
        return 'bg-green-300';
      case 'error':
        return 'bg-red-300';
      case 'running':
        return 'bg-blue-300';
      case 'canceled':
        return 'bg-gray-300';
      default:
        return 'bg-gray-300';
    }
  };
  const getStatusName = () => {
    switch (variant) {
      case 'done':
        return 'Done';
      case 'error':
        return 'Error';
      case 'running':
        return 'Running';
      case 'canceled':
        return 'Canceled';
      default:
        return 'Unknown';
    }
  };

  if (variant === 'running' && onCancel) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className="inline-flex items-center rounded-full bg-blue-100 px-4 py-2 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              <span className={`inline-flex h-[16px] w-[16px] items-center rounded-full text-xs font-medium ${getVariantClasses()}`} />
              <span
                className="ml-2 cursor-pointer text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                onClick={onCancel}>
                Cancel
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getStatusName()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className={`inline-flex h-[16px] w-[16px] items-center rounded-full px-2 py-1 text-xs font-medium ${getVariantClasses()}`} />
        </TooltipTrigger>
        <TooltipContent>
          <p>{getStatusName()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

Changes from the original file:
- Removed client-side `queries` state, `sortField`/`sortDirection`, `handleSort`, `sortedQueries`, and the duplicate Output column.
- Reads `page`/`pageSize` from URL; calls `useListQueries` with pagination params and `searchTerm` from props.
- Added `noMatches` branch that renders the search-empty state when `searchTerm && total === 0`.
- `handleDelete` / `handleCancel` now call `refetch()` instead of mutating local state.
- Removed the spurious duplicate `<th>Output</th>` and `<td>` cell that existed in the original.

- [ ] **Step 2: Type-check and lint**

```bash
cd services/ark-dashboard/ark-dashboard
npm run build
```

Expected: compiles cleanly.

- [ ] **Step 3: Commit tasks 7 and 8 together**

```bash
git add services/ark-dashboard/ark-dashboard/app/\(dashboard\)/queries/page.tsx \
        services/ark-dashboard/ark-dashboard/components/sections/queries-section.tsx
git commit -m "feat(dashboard): server-driven queries page with pagination and search (#1081)"
```

---

### Task 9: Manual smoke test

**Files:** none — runtime verification.

- [ ] **Step 1: Start the dashboard dev environment**

```bash
cd services/ark-dashboard/ark-dashboard
npm run dev
```

- [ ] **Step 2: Navigate to the queries page and verify**

Open `http://localhost:3000/queries` (or the appropriate dev URL) and confirm:

1. Page loads within ~1s even with many queries present.
2. Title shows `Queries (<total>)`.
3. `<host>/queries?page=2` loads page 2; going back to page 1 with Prev works.
4. Typing "hello" into the search box updates the URL to `?q=hello` after ~400ms and filters the list.
5. Clearing the search via the × / backspace returns to all queries on page 1.
6. Changing page size to 50 updates `?pageSize=50` and refreshes; counts show accordingly.
7. With a search that matches nothing, the "No matching queries" empty state appears with a Clear search button.
8. Creating a query still works; after creation the list refetches (Refresh button or URL refresh).
9. Deleting and cancelling a query still works.

- [ ] **Step 3: No commit — document any issues instead**

If anything above fails, treat it as a bug and loop back to the relevant task. Do not mark the feature complete until all nine checks pass.

---

### Task 10: Open the PR

**Files:** none — git/gh only.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin dashboard/pagination
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(dashboard): add pagination and search to queries view (#1081)" --body "$(cat <<'EOF'
## Summary
- Adds server-side pagination (`page`, `page_size`) and case-insensitive text search (`search`) to `GET /api/v1/queries`.
- Queries dashboard is now URL-driven (`?page`, `?pageSize`, `?q`) and paginated; clears the 46k-CRD crash reported in #1081.
- Shows a distinct empty state when a search returns zero matches (separate from the onboarding "No Queries Yet" state).

Closes #1081
EOF
)"
```

---

## Self-review checklist (run before handing off)

- [x] Every AC from the issue mapped to a task (AC1 pagination → Task 2+7+8; AC2 page controls → Task 7; AC3 search → Task 2+7+8).
- [x] No "TBD" / "handle edge cases" / placeholder steps.
- [x] Type consistency: `ListQueriesParams` in Task 5 is imported in Task 6; `searchTerm`/`onClearSearch` props in Task 7 match the interface defined in Task 8.
- [x] Sort decision in spec ("newest-first, no UI toggle") is reflected — sort chevrons removed in Task 8, server-side sort in Task 2.
- [x] Page-size clamp in spec ("values above 100 clamped to 100; ≤ 0 rejected") matches Task 2 (`le=500` validator + `min(page_size, 100)` clamp).
- [x] Backwards-compat: existing `count` field preserved in Task 1; default params in Task 5/6 keep the call `queriesService.list()` valid.
