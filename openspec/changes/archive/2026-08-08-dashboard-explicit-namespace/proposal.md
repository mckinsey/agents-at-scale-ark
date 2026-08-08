## Why

The dashboard's active namespace is ambient state, not data. It reaches requests through a mutable module-level singleton — `apiClient.defaultParams` — written by a `useEffect` in `NamespaceProvider` and merged into every outbound URL inside the API client. No hook, service function, or call site names it.

Two defects follow:

- **Cache bleed.** 60 of 66 react-query keys omit the namespace, so switching namespace serves the previous namespace's cached data under the same key. Users read stale resources belonging to a namespace they are no longer viewing.
- **Wrong-namespace requests.** The singleton is written in a provider effect. React runs child effects before parent effects, so a consumer's query can fire before the provider has updated the singleton — the request carries the previous namespace. On tenant installs this surfaces as transient 403s.

Because the cache key and the request parameter come from two different sources, they can also disagree: a response fetched for one namespace can be cached under another namespace's key.

`marketplace-hooks.ts` already threads the namespace explicitly through all four of its queries. This change applies that existing pattern to the rest of the dashboard.

## What Changes

- Every react-query key that identifies a namespaced resource includes the namespace
- Every service function that reaches a namespaced endpoint takes the namespace as an explicit argument and passes it as a request parameter
- Queries do not run until the active namespace is resolved
- **BREAKING (internal)**: remove `setDefaultParam`, `getDefaultParams`, and `defaultParams` from `apiClient` and `filesApiClient`, and the provider effect that writes them. Namespace is no longer injected implicitly into any request.
- Cache invalidation continues to work unchanged — react-query matches query keys by prefix, so existing `invalidateQueries` calls keyed on the query-key constant still match their namespaced entries

## Capabilities

### New Capabilities

- `namespace-scoped-data`: Defines how the active namespace identifies cached data and reaches requests, so that data from one namespace is never served for another

### Modified Capabilities

None. No existing spec in `openspec/specs/` covers dashboard data fetching or caching.

## Impact

- **Scope**: `services/ark-dashboard/` only. No API, CRD, SDK, or controller changes. The requests sent are identical; only how the namespace gets into them changes.
- **Files**: 22 hook files (66 query keys, 60 needing the namespace), 32 service files (142 `apiClient` call sites), `lib/api/client.ts`, `lib/api/files-client.ts`, `providers/NamespaceProvider.tsx`
- **Closes**: the cache bleed, and #2594
- **Depends on**: `dashboard-url-param-contract` (PR #3124). That change derives the namespace during render instead of holding it in `useState('default')`. Landing this one first would mean writing all 142 call sites against a value that change then alters. It does *not* touch the default-params effect this change deletes — the two edit different parts of `NamespaceProvider.tsx` — so the ordering is about the namespace value, not about avoiding a conflict. This change additionally requires that the derived namespace be falsy until it resolves; see design decision 4.
- **Pattern to follow**: `lib/services/marketplace-hooks.ts` — namespace in the key, passed to the service, `enabled` gated on it. Six of the 66 keys already conform.
