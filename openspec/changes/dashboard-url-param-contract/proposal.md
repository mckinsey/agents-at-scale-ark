## Why

The dashboard has no contract for how URL query parameters survive navigation. Four separate copies of "merge every current param onto the destination" decide it ad hoc, so two opposite bugs come from the same root:

- **Page-local params leak.** `Configure Default Model` links to `/models/new?name=default`. Once that param is in the URL it follows the user through sidebar nav, breadcrumbs, and Cancel links long after the form consumed it.
- **`namespace` is dropped.** Navigations that bypass the merge helpers lose `?namespace=`, and the resolved namespace is never written back to the URL at all — so a refresh or a pasted link falls back to the pod default.

The second is worse than it appears: the dashboard has no namespace switcher. `setNamespace`, `createNamespace`, and `availableNamespaces` are exposed on `NamespaceProvider` but consumed by nothing outside test mocks. The URL is the only namespace control users have, and it is not durable. Users silently read and act on the wrong namespace's data.

## What Changes

- Add an app-scoped param allowlist (`APP_SCOPED_PARAMS = ['namespace']`) and a single `buildScopedPath` helper, replacing four duplicated copies of merge-all in `namespaced-link.tsx`, `use-namespaced-navigation.ts`, `app-sidebar.tsx`, and `NamespaceProvider.tsx`
- Scope param propagation by pathname: navigation within the same pathname keeps all params (the screen owns its own URL state); navigation to a different pathname keeps only app-scoped params, plus whatever the target href names explicitly
- `NamespaceProvider` writes the resolved namespace into the URL once `/v1/context` returns, using an idempotent `window.history.replaceState`
- `NamespaceProvider` derives the namespace during render instead of mirroring it into `useState('default')` and syncing via effect
- Remove unused provider surface: `setNamespace`, `createNamespace`, `availableNamespaces`, and the `createQueryString` helper that only `setNamespace` called
- Route the cross-page call at `sessions/[session_id]/page.tsx:46` through the scoped helper, superseding `buildUrlWithoutNewSessionParams` for that use
- **Behaviour change**: an unreachable `?namespace=` is currently left in the URL after the toast-and-fallback. With write-back, the URL is corrected to the namespace actually in use.

## Capabilities

### New Capabilities

- `url-param-scoping`: Defines which URL query parameters survive navigation and guarantees the app-scoped `namespace` param is always present in the URL after first paint

### Modified Capabilities

None. No existing spec in `openspec/specs/` covers URL parameter handling.

## Impact

- **Scope**: `services/ark-dashboard/` only. No API, CRD, SDK, or controller changes.
- **Files**: `lib/hooks/use-namespaced-navigation.ts`, `components/namespaced-link.tsx`, `components/app-sidebar.tsx`, `providers/NamespaceProvider.tsx`, `app/(dashboard)/sessions/[session_id]/page.tsx`, plus provider tests
- **Closes**: #2955, #2868. Reduces #2594 — removing the `useState('default')` seed eliminates the synchronous wrong-namespace request, but fully closing it needs the query-gating that belongs with the follow-up change.
- **Does not address**: 60 of 66 react-query keys omit the namespace, which is carried instead by the mutable `apiClient.defaultParams` singleton. That causes cache bleed across namespace switches and is deferred to a follow-up change (`dashboard-namespace-query-keys`).
- **Migration risk**: low. Exactly one `NamespacedLink` in the app passes its own query string (`/models/new?name=default`), and three `push('/query/new?target_tool=...')` call sites do the same. All name their params explicitly in the href, so the allowlist preserves them. Nothing in the app relies on inherited params.
