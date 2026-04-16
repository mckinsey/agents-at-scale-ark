## Why

The Agent Studio and Team form YAML views manually build YAML strings line-by-line, cherry-picking known fields. This causes missing fields in the YAML output (`executionEngine`, `overrides`, `skills`, `annotations` are all absent), and every CRD schema change requires updating the string concatenation logic. The `executionEngine` omission is actively confusing users who have configured execution engines but don't see them in the YAML view.

## What Changes

- Fetch raw Kubernetes resources via the existing `/v1/resources/` API instead of reconstructing YAML from form state
- Create a shared utility to clean raw K8s objects (strip status, managedFields, etc.) and serialize with `js-yaml`
- Replace manual YAML string concatenation in `agent-form.tsx` and `team-form.tsx` with a single fetch + clean + serialize call
- All CRD fields appear automatically — no per-resource builder functions needed
- Opens the path for future PUT support (edit YAML → save back)

## Capabilities

### New Capabilities
- `kubernetes-yaml-serialization`: Shared utility for cleaning raw Kubernetes resource objects and serializing to YAML, with recursive null/empty stripping and runtime field removal

### Modified Capabilities
- `execution-engine-dropdown`: The execution engine reference will now be visible in the Agent Studio YAML view when configured

## Impact

- `services/ark-dashboard/ark-dashboard/lib/utils/kubernetes-yaml.ts` — new shared utility
- `services/ark-dashboard/ark-dashboard/lib/services/agents.ts` — add `getRawResource` method
- `services/ark-dashboard/ark-dashboard/lib/services/teams.ts` — add `getRawResource` method (if not already present)
- `services/ark-dashboard/ark-dashboard/components/forms/agent-form/agent-form.tsx` — replace `agentYaml` useMemo with fetch-based approach
- `services/ark-dashboard/ark-dashboard/components/forms/team-form/team-form.tsx` — replace `teamYaml` useMemo with fetch-based approach
- No new API endpoints — uses existing `/v1/resources/apis/ark.mckinsey.com/v1alpha1/{Kind}/{name}`
- No new dependencies — `js-yaml` is already installed
