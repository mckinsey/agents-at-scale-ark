## 1. Param Scope Contract

- [ ] 1.1 Add `APP_SCOPED_PARAMS = ['namespace'] as const` and `buildScopedPath(target, current, currentPathname)` to `lib/hooks/use-namespaced-navigation.ts`: keep all current params when the target pathname equals the current pathname, otherwise keep only app-scoped params; params named by the target take precedence over carried ones
- [ ] 1.2 Rewrite `useNamespacedNavigation`'s `push` and `replace` to call `buildScopedPath`, adding `usePathname()`; delete `buildFullPath`
- [ ] 1.3 Unit-test `buildScopedPath`: same pathname keeps all params; different pathname keeps only `namespace`; a target-named param overrides a carried param of the same name; a target with no params and no app-scoped params in scope returns a bare path

## 2. Navigation Call Sites

- [ ] 2.1 `components/namespaced-link.tsx`: import `buildScopedPath`, add `usePathname()`, delete the inline merge at line 44; leave the external-href and modified-click branches unchanged
- [ ] 2.2 `components/app-sidebar.tsx`: delete the `window.location.search` merge in `navigateToSection` and call `navigateTo('/' + sectionKey)` with a bare path, removing the double merge
- [ ] 2.3 `app/(dashboard)/sessions/[session_id]/page.tsx`: route the cross-page navigation at line 46 through the scoped helper instead of `buildUrlWithoutNewSessionParams`; leave the same-page strip at line 42 and `lib/utils/session-params.ts` intact

## 3. Namespace Provider

- [ ] 3.1 Replace `useState<string>('default')` and its syncing effect with a namespace derived during render from the URL param and the resolved context value; consumers continue to gate on `isNamespaceResolved`
- [ ] 3.2 Add the URL write-back using `window.history.replaceState(null, '', ...)`, guarded to no-op when the URL already names the active namespace; add a code comment recording that Server Components do not observe this update, and that nothing server-side may read `namespace` from `searchParams`
- [ ] 3.3 When the requested namespace is unreachable, write the fallback namespace into the URL; keep the existing toast that explains the substitution
- [ ] 3.4 Remove `setNamespace`, `createQueryString`, `createNamespace`, and `availableNamespaces`; the context exposes `namespace`, `isNamespaceResolved`, `isPending`, `readOnlyMode`
- [ ] 3.5 Remove imports left unused by 3.4 (`useCreateNamespace`, `useRouter`, `usePathname` if no longer referenced)

## 4. Tests

- [ ] 4.1 `__tests__/unit/providers/namespace-provider.test.tsx`: opening a URL with no namespace param writes the resolved namespace into the URL
- [ ] 4.2 Same file: a URL that already names the active namespace triggers no further URL update, and the write-back adds no browser history entry
- [ ] 4.3 Same file: an unreachable namespace produces the toast and leaves the fallback namespace in the URL
- [ ] 4.4 Rewrite the test skipped at `__tests__/unit/providers/NamespaceProvider.test.tsx:149` to assert the corrected-URL behaviour from design decision 5, replacing the redirect assertion #2050 invalidated
- [ ] 4.5 Update the test files that mock the removed context fields so the mocks match the four-field context

## 5. Verification

- [ ] 5.1 Reproduce and confirm fixed: Home → "Configure Default Model" → `/models/new?name=default` → sidebar entry, breadcrumb, and Cancel each land without `name`
- [ ] 5.2 Reproduce and confirm fixed: with a non-default namespace active, create a new session from a session conversation and confirm the namespace survives; refresh any screen and confirm the namespace survives
- [ ] 5.3 Confirm the explicit-param escape hatch still works: `/models/new?name=default` prefills the form, and `/query/new?target_tool=...` from a tool card, row, and table arrives with its param
- [ ] 5.4 Confirm screen-owned params are unaffected: change a filter on the events screen and refresh, and confirm the other filter params persist
- [ ] 5.5 Run the dashboard lint, unit tests, and build in `services/ark-dashboard/ark-dashboard/` per the pre-push gates in CLAUDE.md
