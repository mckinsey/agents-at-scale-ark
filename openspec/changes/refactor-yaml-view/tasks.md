## 1. Shared Utility

- [ ] 1.1 Create `lib/utils/kubernetes-yaml.ts` with `stripEmpty` function that recursively removes null, undefined, empty strings, empty arrays, and empty objects from a nested object
- [ ] 1.2 Add `toKubernetesYaml` function that accepts a `{ apiVersion, kind, metadata, spec }` object, strips runtime fields (`status`, `id`, `managedFields`, `creationTimestamp`, `resourceVersion`, `uid`, `generation`), runs `stripEmpty`, and serializes with `js-yaml` (`yaml.dump` with `lineWidth: -1` for clean multiline strings)
- [ ] 1.3 Add unit tests for `stripEmpty` (null values, nested empties, preserves valid falsy values like `0` and `false`) and `toKubernetesYaml` (full CRD output, status stripping, multiline prompt handling)

## 2. Agent Form YAML Builder

- [ ] 2.1 Create `components/forms/agent-form/yaml.ts` with `buildAgentSpec` function that merges form state (description, modelRef, executionEngine, prompt, tools, parameters) with agent API response (overrides, annotations, skills), returning a plain spec object with fields in conventional CRD order
- [ ] 2.2 Replace the `agentYaml` useMemo in `agent-form.tsx` (lines 118-183) with calls to `buildAgentSpec` and `toKubernetesYaml`
- [ ] 2.3 Verify execution engine reference appears in YAML when configured

## 3. Team Form YAML Builder

- [ ] 3.1 Create `components/forms/team-form/yaml.ts` with `buildTeamSpec` function that merges form state (description, strategy, loops, maxTurns, members, selector, graph) with team API response
- [ ] 3.2 Replace the `teamYaml` useMemo in `team-form.tsx` with calls to `buildTeamSpec` and `toKubernetesYaml`

## 4. Validation

- [ ] 4.1 Run `npm run build` to verify TypeScript compilation
- [ ] 4.2 Run existing tests to confirm no regressions
