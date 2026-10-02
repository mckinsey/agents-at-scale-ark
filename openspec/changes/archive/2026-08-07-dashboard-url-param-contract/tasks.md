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
- [x] 5.2 Reproduce and confirm fixed: with a non-default namespace active, create a new session from a session conversation and confirm the namespace survives; refresh any screen and confirm the namespace survives — verified in two passes. First pass on minikube: the write-back fires on a bare URL (opening `127.0.0.1.nip.io:8080` with no query param shows one loading pass, then lands on `/?namespace=default`), a new session from a conversation keeps the namespace, and an explicit `?namespace=ark-system` survives cross-screen navigation with the sidebar agreeing. The single loading pass also confirms the write-back's query-key change is being absorbed — otherwise it would re-gate the dashboard on every load. That pass was run against the original `placeholderData: keepPreviousData`; see Implementation Notes for the seeded-key and held-resolution mechanisms that replaced it. Every value in that pass was `default`, which is also the fallback, so preserved and dropped-then-re-defaulted were indistinguishable. Second pass closed that gap: ark-api run against a kubeconfig pinned to `ark-system` returns `{"namespace": "ark-system"}` from `/v1/context`, and a bare load wrote `?namespace=ark-system` into the URL, survived a refresh, and carried across sidebar navigation. Since `ark-system` is not the fallback, resolved-and-preserved is now distinguishable from dropped-and-re-defaulted. Pressing Back once left the dashboard rather than stepping to the param-less URL, confirming `replaceState` adds no history entry. `?namespace=does-not-exist` produced the substitution toast once and corrected the URL to `?namespace=ark-system`. **Caveat:** the non-default namespace came from the kubeconfig context, not the in-pod service-account file — `get_context()` (`lib/ark-sdk/.../k8s.py:53`) picks one or the other, and the dashboard sees an identical `/v1/context` response either way, so the branch this change owns is fully exercised. A tenant install with the pods themselves in the namespace (#2868's literal scenario) would additionally cover ark-api's in-cluster detection, which this change does not touch
- [x] 5.3 Confirm the explicit-param escape hatch still works: `/models/new?name=default` prefills the form, and `/query/new?target_tool=...` from a tool card, row, and table arrives with its param — verified: the Name field prefilled from `name=default`, and the tools table reached `/query/new?namespace=default&target_tool=noop`
- [x] 5.4 Confirm screen-owned params are unaffected: change a filter on the events screen and refresh, and confirm the other filter params persist — verified on minikube. Events held `kind`/`page`/`type`/`name`/`limit` at once; changing page-size added `limit` without disturbing the rest, and clearing the name filter removed only `name`. Query logs held `q` and `page` across Refresh. Leaving events for `/queries` dropped all five page-local params and kept only `namespace`
- [x] 5.5 Install the dashboard chart with `app.config.basePath=/tenant-a` (see `services/ark-dashboard/chart/values-multi-tenant.example.yaml`), open `/tenant-a` with no namespace param, and confirm the URL becomes `/tenant-a?namespace=...` rather than `/?namespace=...`, and that refreshing that corrected URL still loads the dashboard — verified with `ARK_DASHBOARD_BASE_PATH=/tenant-a` and `NEXT_PUBLIC_BASE_PATH=/tenant-a` set on the dashboard: opening `/tenant-a` with no query param landed on `/tenant-a?namespace=ark-system`, keeping the prefix; refreshing that corrected URL reloaded the dashboard with the prefix intact; sidebar navigation held `/tenant-a/<screen>?namespace=ark-system`; and the unreachable-namespace correction also preserved the prefix. This is the constraint design decision 3 exists for — a pathname-built replacement would have produced `/?namespace=...`. **Caveat:** run against `next dev`, which reads the two env vars directly, so the production image's sentinel substitution in `entrypoint.sh` was not exercised. That mechanism only substitutes the same two values the dev run supplied, and is not part of this change
- [x] 5.6 Run the dashboard lint, unit tests, and build in `services/ark-dashboard/ark-dashboard/` per the pre-push gates in CLAUDE.md

## Archive Note

Synced to `openspec/specs/url-param-scoping/spec.md` on archive. Every scenario has now been verified against a running deployment. The last two — resolving a non-`default` namespace, and preserving a configured base path through the URL write-back — were closed after the initial archive; see 5.2 and 5.5 for what was covered and the two remaining caveats, both in code this change does not touch (ark-api's in-pod namespace detection, and the container entrypoint's base-path substitution).

## Implementation Notes

Two deviations from the artifacts, both discovered during implementation:

1. **Design decision 6 reversed — the contract lives in its own module.** `APP_SCOPED_PARAMS` and `buildScopedPath` are in `lib/utils/param-scope.ts`, not in `lib/hooks/use-namespaced-navigation.ts`. Fourteen test files mock `@/lib/hooks/use-namespaced-navigation` to stub the hook; with the pure helper exported from that module, every one of them also had to stub `buildScopedPath` or `namespaced-link.tsx` would throw at render. Mocking a hook should not require stubbing a pure function that a different component imports. The design's actual goal — four copies collapsing to one definition — is unchanged; only the file it lives in differs. `lib/utils/` matches the sibling `lib/utils/session-params.ts`.

2. **Task 4.5 asserts the resolved URL, not `NEXT_PUBLIC_BASE_PATH`.** The write-back deliberately never reads that variable — a query-only relative URL is resolved by the browser against the current location. Setting the env var in the test would therefore assert nothing. The base-path tests instead seed the jsdom location with a prefixed path and assert `window.location.pathname` still carries the prefix after the write-back, which is the constraint the scenario describes.

3. **`APP_SCOPED_PARAMS` is typed `readonly string[]`, not `as const`.** Task 1.1 specified `as const`. That yields `readonly ['namespace']`, which makes `.includes(key)` reject an arbitrary `string` key without a widening cast at the call site. Behaviour is identical; switch to `as const` if a consumer ever needs the literal union as a type.

Two additions beyond the task list, both load-bearing:

- **The "namespace not accessible" toast is guarded on requested ≠ resolved.** Without it, the write-back rewrites the query param, which re-fires the effect and re-toasts a substitution the user has already been told about.
- **The write-back's query-key change has to be absorbed, or the dashboard unmounts behind its loading gate.** This follows from decision 4, and it is not optional. The write-back changes `?namespace=`, which changes the `/v1/context` query key; a cold refetch blanks `data`, `isNamespaceResolved` flips back to `false`, and `app/(dashboard)/layout.tsx:19` unmounts the whole dashboard — on every page load, since the naked-load path is exactly the one that writes the namespace in. The old `useState` latch masked this; deriving during render does not.

  The first implementation absorbed it with `placeholderData: keepPreviousData`, which review (#3147) showed does more than absorb it. Three consequences, all now fixed:

  1. A placeholder keeps reporting the **previous** namespace as resolved, so the write-back rewrites a newly requested namespace back to the old one. Latent while nothing navigates to a different `?namespace=`, but it contradicts the *"A destination may request parameters explicitly"* requirement and would break the switcher #3125 unlocks.
  2. It hides rather than removes the second `/v1/context` GET.
  3. It does not absorb the fallback path at all — an errored query has no previous data to keep, so correcting an unreachable namespace still re-armed the gate.

  Replaced by two mechanisms that each address one path:

  - **Success path** — `useGetContext` seeds the key the write-back is about to select (`queryClient.setQueryData([GET_CONTEXT_QUERY_KEY, resolved], data)`), so the switch is a cache hit and `data` never blanks. A one-second `staleTime` additionally keeps the seeded entry from being refetched on that switch, dropping the cost from one extra GET per page load to none. The window is deliberately tiny: a key change on a mounted observer refetches on staleness alone, and `ContextProvider` and `NamespaceProvider` both sit above the routed tree in `GlobalProviders.tsx:31-32`, so they never remount and `refetchOnMount: 'always'` never fires for a navigation. A longer window would leave a real namespace switch rendering the previous namespace's permissions and read-only mode.
  - **Fallback path** — `NamespaceProvider` holds the resolution it already reached while the URL still names it. The substitute namespace arrives in the 404 body and was never fetched, so there is nothing to seed; the latch is what keeps the gate down. It is keyed on the URL param, so a genuine namespace change is not suppressed.

  `NamespaceProvider` additionally ignores a context response whose `namespace` disagrees with a non-null `?namespace=`. `/v1/context` answers for the namespace it was asked about or 404s (`services/ark-api/.../namespaces.py:136`), so a disagreeing response can only be a cached answer for a namespace no longer requested — and acting on one is what produced consequence 1. The guard makes the write-back correct independently of how the shared query is cached.
