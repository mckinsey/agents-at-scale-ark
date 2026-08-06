## Context

See proposal.md — Why. Three facts about the current code shape the approach:

1. **Four copies of merge-all.** `components/namespaced-link.tsx:44`, `lib/hooks/use-namespaced-navigation.ts:9` (`buildFullPath`), `components/app-sidebar.tsx:250` (reads `window.location.search` directly), and `providers/NamespaceProvider.tsx:62` (`createQueryString`) each independently merge every current param onto the destination. The sidebar merges twice — it bakes params into the target path and then hands that path to a helper that merges again.

2. **The URL is an input to namespace resolution but never an output.** `NamespaceProvider` reads `?namespace=`, passes it to `/v1/context` for validation, and stores the result in `useState` plus a mutable `apiClient.defaultParams` singleton. It writes back to the URL only when `setNamespace` is called — and `setNamespace` has no callers.

3. **There is no namespace switcher.** `setNamespace`, `createNamespace`, and `availableNamespaces` are on the context but consumed by nothing outside `vi.mock` blocks. The URL is the only namespace control that exists.

One existing partial solution: `lib/utils/session-params.ts` is a hand-rolled denylist for three params, with tests. Its cross-page use is superseded here; its same-page use (stripping consumed params at `sessions/[session_id]/page.tsx:42`) stays.

## Goals / Non-Goals

**Goals:**

- One mechanism decides param propagation for all in-app navigation
- The active namespace is durable without any storage outside the URL
- Forgetting to classify a new param yields correct behaviour, not a leak
- No new module boundary — the contract lives next to the helper that applies it

**Non-Goals:**

- Adding a namespace switcher. The dead surface is removed, not replaced.
- Persisting the namespace in a cookie, `localStorage`, or `sessionStorage`
- Changing how screens hold their own filter/pagination state
- Threading the namespace into react-query keys (see `dashboard-namespace-query-keys`)
- Touching the same-page filter navigations in `events-section`, `sessions-section`, `memory-section`, or `queries/page.tsx` — these build their own params and bypass the helpers

## Decisions

### 1. Allowlist, not denylist

`APP_SCOPED_PARAMS = ['namespace']`; every other param is page-local by default.

The app reads 25 distinct query params from the URL, exactly one of which is app-scoped. A denylist means maintaining a list of 24 and growing, where forgetting an entry causes a leak — which is precisely how the current bug arose. An allowlist means maintaining a list of one, where forgetting an entry causes a param to be correctly treated as page-local.

**Alternative considered**: generalise `session-params.ts`'s denylist globally. Rejected — it preserves the failure mode that produced the bug.

### 2. Scope by pathname, not by per-screen declaration

Navigation within the same pathname keeps all params; navigation to a different pathname keeps only app-scoped params plus whatever the target names.

```
function buildScopedPath(target, current, currentPathname) {
  const [pathname, query] = target.split('?');
  const keepAll = pathname === currentPathname;

  const next = new URLSearchParams();
  for (const [k, v] of current ?? []) {
    if (keepAll || APP_SCOPED_PARAMS.includes(k)) next.set(k, v);
  }
  for (const [k, v] of new URLSearchParams(query)) next.set(k, v);

  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
```

This satisfies every flow in the app with no per-screen configuration. "Survives refresh" needs no mechanism at all — a param in the URL survives a reload by definition, which is why the write-back (decision 3) is the whole of the refresh fix.

**Alternative considered**: a route-to-params registry, so each screen declares what it holds. More self-documenting and it would handle nested routes (`/sessions` to `/sessions/[id]`) directly, but it reintroduces the maintenance surface the allowlist exists to avoid — the same 24-entry list, sliced by route. The escape hatch for cases the pathname rule misses already exists: name the param in the target href.

### 3. `window.history.replaceState`, not `router.replace`

`router.replace` goes through the Next router and forces a server round-trip even when nothing server-side needs one; on mount that risks a double fetch and a re-render loop. Next.js supports the native History API, and `replaceState` integrates with the router so `useSearchParams` updates without a request. Pass `null` as the first argument.

The documented caveat is that Server Components do not observe the change. **Verified**: the only Server Component reading `searchParams` is `app/(dashboard)/models/new/page.tsx`, and it reads `name`, not `namespace`. Nothing server-side reads the namespace.

This constraint must hold for the write-back to keep working. A future Server Component that reads `namespace` from `searchParams` would silently receive a stale value.

**The write-back URL is query-only, so it keeps the base path.** `replaceState` is the native History API — unlike `next/link` and the router, it does not apply the configured `basePath`. The router pathname is no help either: `usePathname()` returns the base-path-stripped value, so under `ARK_DASHBOARD_BASE_PATH=/tenant-a` the browser sits at `/tenant-a` while `usePathname()` reports `/`, and a URL built as `` `${pathname}?${params}` `` becomes `/?namespace=…` with the tenant prefix gone. `replaceState` does not navigate, so nothing breaks on screen — but the address bar now holds a URL that a refresh, a bookmark, or a paste resolves outside the tenant's subtree, which is exactly what `dashboard-runtime-basepath` (*"Prefixed in-app navigation"*) forbids.

Write the query alone and let the browser resolve it against the current URL:

```js
const params = new URLSearchParams(searchParams.toString());
params.set('namespace', resolved);
window.history.replaceState(null, '', `?${params}`);
```

`new URL('?namespace=x', 'https://host/tenant-a/agents')` is `https://host/tenant-a/agents?namespace=x`. This holds for both the address bar and the router's own canonical URL, which Next computes with the same relative resolution. It is also the form Next's own `pushState` example uses, and it needs no `NEXT_PUBLIC_BASE_PATH` read — which matters, because that variable and `ARK_DASHBOARD_BASE_PATH` have to be set to the same value by hand (`services/ark-dashboard/README.md`). Prefixing `window.location.pathname` explicitly is equivalent and also correct; it is simply more code for the same result.

**The prefixed pathname must not reach decision 2.** `buildScopedPath` compares the target pathname against the current one, and both sides are unprefixed today — `usePathname()` is stripped, and hrefs are authored as `/agents`. Feeding it `window.location.pathname` instead would compare `/agents` against `/tenant-a/agents`, so same-screen filter changes would be misread as cross-screen and drop the screen's params. The base path belongs in the write-back URL only; every other navigation in this change goes through `router.push`/`replace` or `next/link`, which apply it automatically.

### 4. Derive the namespace during render

Replace `useState<string>('default')` plus a syncing effect with a value derived during render from the URL and the resolved context.

The `'default'` literal is the mechanism behind #2594: it makes every naked load request `default` for one render before resolution completes. Deriving during render removes it — the value is simply unresolved until it resolves, and consumers gate on `isNamespaceResolved`. This also removes a `set-state-in-effect` pattern that current React lint rules flag.

**Alternative considered**: keep the state and add an `enabled` gate on the queries. That closes #2594 more completely but belongs with the query-key work in the follow-up change, and it leaves the mirrored state in place.

### 5. Correct the URL when the namespace is unreachable

When `/v1/context` rejects the requested namespace, the fallback is written into the URL rather than leaving the rejected value there.

Today's behaviour — toast, fall back, leave the bad value in the URL — is an accident of never writing back, not a decision. Once the write-back exists, the URL either agrees with what is displayed or it does not; agreement is the more defensible default, and it matches the intent of the test skipped at `__tests__/unit/providers/NamespaceProvider.test.tsx:149`.

**Trade-off**: a bookmark naming a namespace the user has lost access to silently rewrites itself. The toast is what tells them, so the notification must not be dropped.

### 6. No new module

`APP_SCOPED_PARAMS` and `buildScopedPath` are exported from `lib/hooks/use-namespaced-navigation.ts`, which already contains one of the four copies. `namespaced-link.tsx` imports them; the sidebar deletes its own merging and calls the helper with a bare path; `createQueryString` disappears with `setNamespace`.

**Alternative considered**: a dedicated `lib/navigation/param-scope.ts`. Rejected — a new module boundary for one const and one function, when the goal is four copies collapsing to one.

### 7. Remove the dead provider surface

`setNamespace`, `createNamespace`, `availableNamespaces`, and `createQueryString` go. The context drops from seven fields to four: `namespace`, `isNamespaceResolved`, `isPending`, `readOnlyMode`.

This is in scope rather than deferred because `createQueryString` is the fourth merge-all copy, and leaving `setNamespace` in place would mean leaving a namespace-setting path that does not follow the contract this change establishes.

## Risks / Trade-offs

**Write-back loops.** `replaceState` updates `useSearchParams`, which re-runs the effect that called it. → Guard on equality: do nothing when the URL already names the active namespace. Covered by the "Synchronisation settles" scenario.

**The write-back drops the base path.** A root-absolute URL passed to `replaceState` silently discards the tenant prefix, and it fails quietly — the page keeps working, only refresh and copy-paste break. This codebase has hit the same class of bug three times already: `lib/auth/signout.ts:5-7`, `middleware.ts:36-43`, and `middleware.ts:66-73`. → Query-only write-back per decision 3, asserted by the base-path scenarios in the spec.

**A future Server Component reads `namespace`.** It would not observe `replaceState` updates. → Recorded in decision 3; the constraint belongs in a code comment at the write-back site.

**The same-pathname branch is defensive, not exercised.** Every current same-screen filter update bypasses the helpers with a raw `router.push`. Nothing in the app tests that branch today. → Kept because it costs two lines and prevents a future screen from silently losing its filters, but it should not be presented as load-bearing.

**Test mocks carry the removed fields.** Roughly ten test files hand-roll all seven context fields. → They are untyped plain objects returned from `vi.mock`, so removal does not break compilation; tidying them is optional cleanup.

**Losing the toast on an unreachable namespace.** Correcting the URL is only defensible if the user is told why. → The existing toast must survive the provider rewrite; assert it in tests.

## Migration Plan

No data migration, no persisted state, no API contract change. Deploy is a normal dashboard release; rollback is a revert.

Existing bookmarks and shared links stay valid. A URL carrying `?name=default` still prefills the new-model form; it simply stops propagating. A URL carrying `?namespace=` behaves as before, and one without it gains the param after first paint.

## Provider Test Files

Two test files cover `NamespaceProvider`, and both are live:

- `__tests__/unit/providers/NamespaceProvider.test.tsx` — added by #1110 (namespace switching). Holds the test skipped at line 149, which asserts the redirect-on-invalid-namespace behaviour that #2050 replaced.
- `__tests__/unit/providers/namespace-provider.test.tsx` — added by #2050 (*"Redirect to default namespace when incorrect namespace provided"*) as a new file rather than an edit to the existing one, carrying a block labelled "Legacy test".

Both have been maintained since; #2353 and #2095 touched each. Write the provider tests for this change into `namespace-provider.test.tsx`, which reflects current behaviour. The skipped test in `NamespaceProvider.test.tsx` is rewritten rather than deleted — decision 5 defines exactly the behaviour it was reaching for. Consolidating the two files is optional cleanup, not required here.
