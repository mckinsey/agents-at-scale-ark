## Context

See proposal.md — Why. The relevant shape of the current code:

```
NamespaceProvider
  useEffect(() => {
    apiClient.setDefaultParam('namespace', currentNamespace)       // :57
    filesApiClient.setDefaultParam('namespace', currentNamespace)  // :58
  }, [currentNamespace])

ApiClient
  private defaultParams: Record<string, string> = {}               // client.ts:23
  buildUrl(endpoint, params) {
    const merged = { ...this.defaultParams, ...params }            // client.ts:46, :225
  }

models-hooks.ts
  useQuery({ queryKey: [GET_ALL_MODELS_QUERY_KEY],                 // no namespace
             queryFn: modelsService.getAll })                      // takes no namespace

models.ts
  apiClient.get<ModelListResponse>('/api/v1/models')               // names no namespace
```

The namespace is invisible at all three layers — hook, service, call site — and materialises inside the client from module state.

Scale: 22 hook files with 66 query keys (60 lacking the namespace), 32 service files with 142 `apiClient` call sites, 31 `invalidateQueries` calls. `@tanstack/react-query` is `^5.87.1`.

`lib/services/marketplace-hooks.ts` already implements the target pattern for its four queries.

## Goals / Non-Goals

**Goals:**

- The namespace is an argument, visible at every layer it passes through
- A cache entry's key and the request that produced it carry the same namespace by construction, not by timing
- No query runs against an assumed namespace
- Existing invalidation keeps working without editing 31 call sites

**Non-Goals:**

- Changing which requests are sent, their endpoints, or their responses. Only how the namespace reaches them changes.
- Changing URL handling or namespace resolution — that is `dashboard-url-param-contract`
- Introducing a data-fetching abstraction or migrating off react-query
- Adding namespace to keys for genuinely cluster-scoped data

## Decisions

### 1. Follow the existing marketplace pattern

```
const { namespace } = useNamespace();
useQuery({
  queryKey: [GET_ALL_MODELS_QUERY_KEY, namespace],
  queryFn: () => modelsService.getAll(namespace),
  enabled: Boolean(namespace),
});
```

Namespace in the key, passed explicitly to the service, query gated on its presence. Six of the 66 keys already conform, so this is applying an in-repo convention rather than introducing one.

**Alternative considered**: a custom `useNamespacedQuery` wrapper that injects all three. Rejected — it would hide the namespace again, in a different place, and the point of this change is that the namespace stops being implicit. It also diverges from the pattern already in the codebase.

### 2. Namespace as a suffix on the existing key, not a new prefix

`[GET_ALL_MODELS_QUERY_KEY, namespace]` rather than `['ns', namespace, GET_ALL_MODELS_QUERY_KEY]`.

React Query v5 matches by key prefix, so the 31 existing `invalidateQueries({ queryKey: [CONSTANT] })` calls continue to match their namespaced entries with no edit. A namespace-first key would break every one of them.

**Verify during implementation** rather than assuming: one invalidation test asserting that a prefix-keyed invalidation reaches a namespaced entry, before the migration is applied broadly.

### 3. Retire the singleton rather than keep it in sync

`setDefaultParam`, `getDefaultParams`, and `defaultParams` are removed from both clients, along with the provider effect that writes them.

Keeping the singleton and only adding namespaces to keys is cheaper but not correct. The singleton is written in a provider effect, and React runs child effects before parent effects — so a consumer's query can fire before the provider's effect has run. The key would then carry the current namespace while the request carried the previous one, caching a response under the wrong namespace. That failure is quieter than the one being fixed, so the source of the request parameter and the source of the key must be the same value.

**Alternative considered**: write the singleton during render instead of in an effect. Rejected — mutating module state during render is unsafe under concurrent rendering and with multiple roots, and it leaves the namespace ambient.

### 4. `enabled` gates on the namespace, not on a resolution flag

`enabled: Boolean(namespace)` matches the marketplace pattern and follows directly from `dashboard-url-param-contract` deriving the namespace during render: unresolved is represented by the absence of a value, so the gate needs no separate flag.

**Alternative considered**: `enabled: isNamespaceResolved`. Equivalent in effect, but it reintroduces a second source of truth for the same fact.

### 5. Migrate by hook file, verifying each

The unit of work is one hook file plus the service functions it calls. Each is independently verifiable: the queries in it carry a namespace, the service functions take one, and nothing in the file references the client's default params.

The mechanical risk is a missed call site — a service function that gains a namespace parameter but has a caller that does not pass one. Removing `defaultParams` makes this fail loudly: an unnamespaced request returns the wrong data or errors, rather than silently working via the singleton. Deleting the singleton **last** would mask exactly these errors during migration, so it is deleted early and the type checker enumerates the remaining work.

## Risks / Trade-offs

**Prefix matching does not behave as assumed.** All 31 invalidations would silently stop refreshing. → Assert it in a test before migrating broadly (decision 2). If it fails, invalidation calls must be updated alongside each hook file and the change roughly doubles.

**A namespaced key is added to genuinely cluster-scoped data.** Would cause unnecessary refetching and cache duplication. → Classify each of the 66 keys before editing; `namespaces-hooks.ts`'s `GET_ALL_NAMESPACES_QUERY_KEY` is the known cluster-scoped case and stays unkeyed.

**Merge conflicts with `dashboard-url-param-contract`.** Both change `providers/NamespaceProvider.tsx`. → Land PR #3124 first; this change deletes the effect that one has already rewritten.

**Migration is wide enough to hide a mistake in review.** 142 call sites is more than a reviewer can meaningfully check by eye. → Group commits by hook file so each is reviewable on its own, and rely on the type checker rather than inspection for completeness.

**`filesApiClient` is forgotten.** It has the same `setDefaultParam` call at `NamespaceProvider.tsx:58` and its own consumers. → Treated as a peer of `apiClient` throughout, not an afterthought.

## Migration Plan

No data migration and no API contract change — the requests sent are byte-identical, only their construction differs. Deploy is a normal dashboard release; rollback is a revert.

Order matters:

1. Land `dashboard-url-param-contract` (PR #3124)
2. Assert prefix-matching invalidation (decision 2)
3. Remove `defaultParams` from both clients and the provider effect, so the type checker enumerates every call site needing a namespace
4. Migrate hook file by hook file until the type checker is clean
