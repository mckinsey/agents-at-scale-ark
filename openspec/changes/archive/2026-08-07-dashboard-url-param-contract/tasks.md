## 1. Param Scope Contract

- [x] 1.1 Add `APP_SCOPED_PARAMS = ['namespace'] as const` and `buildScopedPath(target, current, currentPathname)` to `lib/utils/param-scope.ts` (see Implementation Notes): keep all current params when the target pathname equals the current pathname, otherwise keep only app-scoped params; params named by the target take precedence over carried ones
- [x] 1.2 Rewrite `useNamespacedNavigation`'s `push` and `replace` to call `buildScopedPath`, adding `usePathname()`; delete `buildFullPath`
- [x] 1.3 Unit-test `buildScopedPath`: same pathname keeps all params; different pathname keeps only `namespace`; a target-named param overrides a carried param of the same name; a target with no params and no app-scoped params in scope returns a bare path

## 2. Navigation Call Sites

- [x] 2.1 `components/namespaced-link.tsx`: import `buildScopedPath` from `lib/utils/param-scope.ts`, add `usePathname()`, delete the inline merge at line 44; leave the external-href and modified-click branches unchanged
- [x] 2.2 `components/app-sidebar.tsx`: delete the `window.location.search` merge in `navigateToSection` and call `navigateTo('/' + sectionKey)` with a bare path, removing the double merge
- [x] 2.3 `app/(dashboard)/sessions/[session_id]/page.tsx`: route the cross-page navigation at line 46 through the scoped helper instead of `buildUrlWithoutNewSessionParams`; leave the same-page strip at line 42 and `lib/utils/session-params.ts` intact

## 3. Namespace Provider

- [x] 3.1 Replace `useState<string>('default')` and its syncing effect with a namespace derived during render from the URL param and the resolved context value; consumers continue to gate on `isNamespaceResolved`
- [x] 3.2 Add the URL write-back using `window.history.replaceState`, passing a query-only relative URL (`?` plus the serialised params) and never a pathname-built one, so the configured base path is preserved (design decision 3); guard it to no-op when the URL already names the active namespace; add a code comment recording both the base-path constraint and that Server Components do not observe this update, so nothing server-side may read `namespace` from `searchParams`
- [x] 3.3 When the requested namespace is unreachable, write the fallback namespace into the URL using the same query-only form; keep the existing toast that explains the substitution
- [x] 3.4 Remove `setNamespace`, `createQueryString`, `createNamespace`, and `availableNamespaces`; the context exposes `namespace`, `isNamespaceResolved`, `isPending`, `readOnlyMode`
- [x] 3.5 Remove imports left unused by 3.4 (`useCreateNamespace`, `useRouter`, `usePathname` if no longer referenced)

## 4. Tests

- [x] 4.1 `__tests__/unit/providers/namespace-provider.test.tsx`: opening a URL with no namespace param writes the resolved namespace into the URL
- [x] 4.2 Same file: a URL that already names the active namespace triggers no further URL update, and the write-back adds no browser history entry
- [x] 4.3 Same file: an unreachable namespace produces the toast and leaves the fallback namespace in the URL
- [x] 4.4 Rewrite the test skipped at `__tests__/unit/providers/NamespaceProvider.test.tsx:149` to assert the corrected-URL behaviour from design decision 5, replacing the redirect assertion #2050 invalidated
- [x] 4.5 Same file: with a non-empty base path configured, both write-backs — the initial synchronisation and the unreachable-namespace correction — produce a URL that still carries the prefix; follow the `NEXT_PUBLIC_BASE_PATH` pattern already used in `__tests__/unit/lib/auth/signout.test.ts:31`
- [x] 4.6 `__tests__/unit/lib/hooks/use-namespaced-navigation.test.tsx`: `buildScopedPath` receives the base-path-stripped pathname, so a same-pathname navigation is still detected as same-screen when a base path is configured
- [x] 4.7 Update the test files that mock the removed context fields so the mocks match the four-field context

## 5. Verification

- [x] 5.1 Reproduce and confirm fixed: Home → "Configure Default Model" → `/models/new?name=default` → sidebar entry, breadcrumb, and Cancel each land without `name` — verified on minikube: `/models/new?namespace=default&name=default` → Cancel → `/models?namespace=default`. Also observed `target_tool` dropped on `/query/new` → `/query/test`, and the new-session params stripped on first message while `namespace` survived
- [ ] 5.2 Reproduce and confirm fixed: with a non-default namespace active, create a new session from a session conversation and confirm the namespace survives; refresh any screen and confirm the namespace survives — **partially verified.** Confirmed on minikube: the write-back fires on a bare URL (opening `127.0.0.1.nip.io:8080` with no query param shows one loading pass, then lands on `/?namespace=default`), a new session from a conversation keeps the namespace, and an explicit `?namespace=ark-system` survives cross-screen navigation with the sidebar agreeing. The single loading pass also confirms `placeholderData: keepPreviousData` is doing its job — without it the write-back's query-key change would re-gate the dashboard on every load. **Not proven:** that a non-`default` pod namespace is resolved and written back. Every value exercised was `default`, which is also the fallback, so preserved and dropped-then-re-defaulted are indistinguishable. Needs a tenant install where the pods themselves live in the non-default namespace (#2868's actual scenario); the attempt here was blocked by an unrelated gateway 404, not by this change
- [x] 5.3 Confirm the explicit-param escape hatch still works: `/models/new?name=default` prefills the form, and `/query/new?target_tool=...` from a tool card, row, and table arrives with its param — verified: the Name field prefilled from `name=default`, and the tools table reached `/query/new?namespace=default&target_tool=noop`
- [x] 5.4 Confirm screen-owned params are unaffected: change a filter on the events screen and refresh, and confirm the other filter params persist — verified on minikube. Events held `kind`/`page`/`type`/`name`/`limit` at once; changing page-size added `limit` without disturbing the rest, and clearing the name filter removed only `name`. Query logs held `q` and `page` across Refresh. Leaving events for `/queries` dropped all five page-local params and kept only `namespace`
- [ ] 5.5 Install the dashboard chart with `app.config.basePath=/tenant-a` (see `services/ark-dashboard/chart/values-multi-tenant.example.yaml`), open `/tenant-a` with no namespace param, and confirm the URL becomes `/tenant-a?namespace=...` rather than `/?namespace=...`, and that refreshing that corrected URL still loads the dashboard
- [x] 5.6 Run the dashboard lint, unit tests, and build in `services/ark-dashboard/ark-dashboard/` per the pre-push gates in CLAUDE.md

## Archive Note

Synced to `openspec/specs/url-param-scoping/spec.md` on archive. Two of its scenarios — resolving a non-`default` pod namespace, and preserving a configured base path through the URL write-back — are asserted by unit tests but were not verified against a running deployment (see 5.2 and 5.5).

## Implementation Notes

Two deviations from the artifacts, both discovered during implementation:

1. **Design decision 6 reversed — the contract lives in its own module.** `APP_SCOPED_PARAMS` and `buildScopedPath` are in `lib/utils/param-scope.ts`, not in `lib/hooks/use-namespaced-navigation.ts`. Fourteen test files mock `@/lib/hooks/use-namespaced-navigation` to stub the hook; with the pure helper exported from that module, every one of them also had to stub `buildScopedPath` or `namespaced-link.tsx` would throw at render. Mocking a hook should not require stubbing a pure function that a different component imports. The design's actual goal — four copies collapsing to one definition — is unchanged; only the file it lives in differs. `lib/utils/` matches the sibling `lib/utils/session-params.ts`.

2. **Task 4.5 asserts the resolved URL, not `NEXT_PUBLIC_BASE_PATH`.** The write-back deliberately never reads that variable — a query-only relative URL is resolved by the browser against the current location. Setting the env var in the test would therefore assert nothing. The base-path tests instead seed the jsdom location with a prefixed path and assert `window.location.pathname` still carries the prefix after the write-back, which is the constraint the scenario describes.

3. **`APP_SCOPED_PARAMS` is typed `readonly string[]`, not `as const`.** Task 1.1 specified `as const`. That yields `readonly ['namespace']`, which makes `.includes(key)` reject an arbitrary `string` key without a widening cast at the call site. Behaviour is identical; switch to `as const` if a consumer ever needs the literal union as a type.

Two additions beyond the task list, both load-bearing:

- **The "namespace not accessible" toast is guarded on requested ≠ resolved.** Without it, the write-back rewrites the query param, which re-fires the effect and re-toasts a substitution the user has already been told about.
- **`useGetContext` sets `placeholderData: keepPreviousData` (`lib/services/namespaces-hooks.ts:23`).** This is required by decision 4, not an optimisation. The write-back changes `?namespace=`, which changes the `/v1/context` query key; without a placeholder the refetch blanks `data`, `isNamespaceResolved` flips back to `false`, and `app/(dashboard)/layout.tsx:19` unmounts the whole dashboard behind its loading gate — on every page load, since the naked-load path is exactly the one that writes the namespace in. The old `useState` latch masked this; deriving during render does not. Removing the placeholder silently reintroduces the unmount. Cost is one extra `/v1/context` GET per page load.
