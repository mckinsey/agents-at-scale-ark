## Guidelines

### General
- Never look outside this current directory or its children
- After a change, always run `npm run build` to make sure the code is valid TS
- Before making a suggestion, always ask "will this really work" 
- Explain why making a change is going to work before suggesting it

### File names
- Always use kebab-case for file names

### Types
- Where possible, define types formally.  Do not do type definitions in function headers
- Where possible avoid using "any"
- Where possible refrain from using "as" to convert an unknown or any into a type
- Generated types are in lib/api/generated/types.ts

### Services
- Services should always be objects that export async functions.
- Services are defined in lib/services
- Services should always use the generated types in lib/api/generated
- **Namespaced endpoints take `namespace` as the FIRST parameter** and send it as a
  request param. See "Namespace-scoped data" below — this is not optional, and
  nothing will fail loudly if you skip it.

### Tests
- Use `globalThis` instead of `global` when assigning to global objects. `global` is Node-only and triggers Sonar; `globalThis` is the ES standard
- For mock class methods, use `vi.fn()` class-field assignments rather than empty method bodies — reads as "this is a mock" and avoids Sonar's no-empty-function warning

```typescript
// ❌ WRONG - global is Node-specific; empty methods trigger Sonar
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;

// ✅ CORRECT
globalThis.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
} as typeof ResizeObserver;
```

- Anything rendering a hook that calls `useNamespace()` needs the provider mocked,
  or the hook throws "must be used within a NamespaceProvider":

```typescript
vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));
```

- Assert the **namespace reaches the call**, not just the returned value. Argument
  order is untyped (see "Namespace-scoped data"), so this is the only thing that
  catches a swap:

```typescript
expect(modelsService.getByName).toHaveBeenCalledWith('test-namespace', 'gpt-4');
expect(apiClient.get).toHaveBeenCalledWith('/api/v1/models', {
  params: { namespace: 'test-namespace' },
});
```

### Navigation
- **IMPORTANT**: Do NOT use `useRouter` from `next/navigation` for programmatic navigation
- Instead, use `useNamespacedNavigation` from `@/lib/hooks/use-namespaced-navigation`
- The dashboard uses namespace-scoped URLs (e.g., `/agents?namespace=kyc-demo`) and navigation must preserve these params

```typescript
// ❌ WRONG - loses query params like namespace
import { useRouter } from 'next/navigation';
const router = useRouter();
router.push('/sessions/123');

// ✅ CORRECT - carries the namespace across
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
const { push } = useNamespacedNavigation();
push('/sessions/123');
```

#### Which params survive a navigation

`useNamespacedNavigation` and `NamespacedLink` both apply `buildScopedPath` from
`@/lib/utils/param-scope`. It does **not** carry every param:

- **Same pathname** — every current param is kept, so a screen can hold its own
  filters, sorting, and pagination in the URL.
- **Different pathname** — only params in `APP_SCOPED_PARAMS` (currently just
  `namespace`) are kept. Everything else is page-local and is dropped.
- **Named by the target** — a param written into the href (`/models/new?name=x`)
  is always applied and beats a carried param of the same name.

Adding a param to `APP_SCOPED_PARAMS` makes it follow the user across the whole
app; that is the allowlist's entire purpose, so only genuinely app-wide scoping
params belong there. Anything page-local needs no registration — pass it in the
target href.

### Namespace-scoped data

The namespace is **explicit data, never ambient**. The API client does not inject
it: there is no `setDefaultParam`, no `defaultParams`, and nothing may reintroduce
one. If you do not pass the namespace, the request resolves in the **pod's**
namespace and quietly returns another tenant's data. Nothing throws.

Three rules, applied together:

```typescript
// 1. SERVICE — namespace is the first parameter, sent as a request param
async getAll(namespace: string): Promise<Model[]> {
  return apiClient.get<ModelListResponse>('/api/v1/models', {
    params: { namespace },
  });
}

// 2. HOOK — namespace is the LAST element of the query key
// 3. GATE — no request until the namespace is known
export const useGetAllModels = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_MODELS_QUERY_KEY, namespace],
    queryFn: () => modelsService.getAll(namespace),
    enabled: Boolean(namespace),
  });
};
```

`useNamespace()` returns `''` until `/v1/context` resolves, which is what makes
`enabled: Boolean(namespace)` a real gate rather than decoration.

**Why namespace goes LAST in the key.** React Query matches `invalidateQueries`
by prefix, so `[KEY]` and `[KEY, id]` still reach `[KEY, namespace]` and
`[KEY, id, namespace]`. Keep invalidations on the bare prefix — do not add the
namespace to them.

```typescript
queryClient.invalidateQueries({ queryKey: [GET_ALL_MODELS_QUERY_KEY] });        // ✅ prefix
queryClient.invalidateQueries({ queryKey: [GET_MODEL_BY_ID_QUERY_KEY, id] });   // ✅ prefix
```

**Exact-match cache APIs are the exception.** `getQueryData` and `setQueryData`
match the whole key, so they must include the namespace or they read and write an
entry nothing else touches — an optimistic update that silently does nothing. Pass
the full key, as `secrets-hooks.ts` does:

```typescript
queryClient.getQueryData([GET_ALL_SECRETS_QUERY_KEY, namespace]);               // ✅ full key
queryClient.setQueryData([GET_ALL_SECRETS_QUERY_KEY, namespace], next);         // ✅ full key
```

**Paginated lists.** `fetchAllPages` follows `continue_token` across pages, so the
namespace must go in its `params` argument — otherwise page 1 is correct and every
later page resolves in the pod namespace.

```typescript
const items = await fetchAllPages<ModelResponse>('/api/v1/models', { namespace });
```

**Argument order is invisible to the type checker.** `(namespace, name)` and
`(name, namespace)` are both `(string, string)`, so a swap compiles and passes
review. Namespace first, always — and unit-test the call, not just the result.

#### What is NOT namespaced

Do not add a namespace to these; it would key identical data under many entries:

- the namespaces list, and `arkconfig` — cluster-scoped
- `api-keys` and `system-info` — the server resolves the namespace itself
- everything under `/api/v1/broker/*` — the broker router declares no namespace
  param at all (this covers sessions, messages, conversations, and logs)

One deliberate exception in the other direction: `files.ts` keeps sending
`namespace` even though it proxies out of the repo, because the file-gateway may
read it and dropping it cannot be verified here.

Classify a new endpoint by reading **ark-api's route signature** — whether it
declares a `namespace` query param — not by guessing from the dashboard.
