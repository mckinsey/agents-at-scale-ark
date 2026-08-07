## 1. Prerequisites

- [ ] 1.1 Confirm `dashboard-url-param-contract` (PR #3124) is merged, so the namespace is derived during render rather than seeded from `useState('default')`
- [ ] 1.2 Confirm the derived namespace is falsy until it resolves, which is what `enabled: Boolean(namespace)` relies on (design decision 4). If it resolves to a placeholder instead, stop and switch the gate to `isNamespaceResolved` before migrating — otherwise every gate added by this change is a no-op
- [ ] 1.3 Add a test asserting that `invalidateQueries({ queryKey: [CONSTANT] })` refreshes an entry keyed `[CONSTANT, namespace]` under `@tanstack/react-query` v5; if it fails, stop and revise the design before migrating
- [ ] 1.4 Classify all 66 query keys as namespaced or cluster-scoped; record the cluster-scoped exceptions, starting with `GET_ALL_NAMESPACES_QUERY_KEY` in `namespaces-hooks.ts`

## 2. Remove the Ambient Namespace

- [ ] 2.1 Delete `setDefaultParam`, `getDefaultParams`, and `defaultParams` from `lib/api/client.ts`, including the merges at lines 46 and 225
- [ ] 2.2 Apply the same removal to `lib/api/files-client.ts`
- [ ] 2.3 Delete the effect in `providers/NamespaceProvider.tsx` that calls `apiClient.setDefaultParam('namespace', ...)` and `filesApiClient.setDefaultParam('namespace', ...)` — locate it by those calls, since #3124 shifts the line numbers
- [ ] 2.4 Run the type checker and capture the resulting list of call sites — this is the migration's work list and its completeness check

## 3. Migrate Hooks and Services

Each hook file is one unit of work: update its query keys, its service functions, and their call sites together, then verify the file references no client default params. Follow `lib/services/marketplace-hooks.ts`.

- [ ] 3.1 `models-hooks.ts` + `models.ts` — migrate first as the reference implementation, and confirm its list, detail, create, update, and delete flows before continuing
- [ ] 3.2 `agents-hooks.ts`, `teams-hooks.ts`, `tools-hooks` callers, `secrets-hooks.ts`
- [ ] 3.3 `mcp-servers-hooks.ts`, `a2a-tasks-hooks.ts`, `a2a-task-approvals-hooks.ts`, `engines-hooks.ts`
- [ ] 3.4 `memory-hooks.ts` (12 keys — the largest), `conversations-hooks.ts`, `broker-sessions-hooks.ts`, `participants-hooks.ts`
- [ ] 3.5 `queries-hooks.ts`, `events-hooks.ts`, `logs-hooks.ts`, `workflow-templates-hooks.ts`
- [ ] 3.6 `files-hooks.ts`, `files-count-hooks.ts` — the `filesApiClient` consumers
- [ ] 3.7 `api-keys-hooks.ts`, `arkconfig-hooks.ts`, and any remaining files from the 2.4 work list
- [ ] 3.8 Leave `marketplace-hooks.ts` unchanged; confirm it already conforms
- [ ] 3.9 Confirm the type checker is clean and no reference to the removed client methods remains anywhere in the dashboard

## 4. Tests

- [ ] 4.1 Switching namespace on a resource list shows the second namespace's resources and never the first's
- [ ] 4.2 Switching to a namespace containing no resources of the displayed type shows an empty state, not the previous namespace's data
- [ ] 4.3 No namespaced resource request is issued before the active namespace resolves
- [ ] 4.4 A response arriving after the active namespace has changed is not displayed or retained for the new namespace
- [ ] 4.5 Creating and deleting a resource still refreshes that namespace's list

## 5. Verification

- [ ] 5.1 Manually switch between two namespaces with visibly different resources on the models, agents, and memory screens, confirming no stale data appears during or after the switch
- [ ] 5.2 Load the dashboard on a tenant install where resources live outside `default` and confirm no transient 403 or wrong-namespace request occurs (#2594)
- [ ] 5.3 Exercise the file browser to confirm `filesApiClient` consumers still resolve their namespace
- [ ] 5.4 Run the dashboard lint, unit tests, and build in `services/ark-dashboard/ark-dashboard/` per the pre-push gates in CLAUDE.md
