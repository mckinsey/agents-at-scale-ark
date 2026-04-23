## 1. Shared Utility

- [x] 1.1 Create `lib/utils/kubernetes-yaml.ts` with `cleanKubernetesResource` function that strips runtime fields (`status`, `managedFields`, `creationTimestamp`, `resourceVersion`, `uid`, `generation`, `selfLink`, `deletionTimestamp`) and recursively removes null/undefined/empty values
- [x] 1.2 Add `toKubernetesYaml` function that calls `cleanKubernetesResource` and serializes the result with `js-yaml` (`yaml.dump` with `lineWidth: -1` for clean multiline strings)
- [x] 1.3 Add unit tests for `cleanKubernetesResource` (runtime field stripping, nested null removal, preserves `0` and `false`) and `toKubernetesYaml` (full YAML output, multiline prompt handling)

## 2. Service Methods

- [x] 2.1 Add `getRawResource(name: string)` to `lib/services/agents.ts` that calls `GET /api/v1/resources/apis/ark.mckinsey.com/v1alpha1/Agent/{name}`
- [x] 2.2 Add `getRawResource(name: string)` to the team service that calls `GET /api/v1/resources/apis/ark.mckinsey.com/v1alpha1/Team/{name}`

## 3. Agent Form Integration

- [x] 3.1 Replace the `agentYaml` useMemo in `agent-form.tsx` with state that fetches via `getRawResource`, cleans with `toKubernetesYaml`, and re-fetches on save
- [x] 3.2 Handle the new-agent case (no saved resource yet) with an appropriate empty state

## 4. Team Form Integration

- [x] 4.1 Replace the `teamYaml` useMemo in `team-form.tsx` with the same fetch-based pattern

## 5. Validation

- [x] 5.1 Run `npm run build` to verify TypeScript compilation
- [x] 5.2 Run existing tests to confirm no regressions
