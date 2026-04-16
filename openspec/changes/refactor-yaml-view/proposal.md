## Why

The Agent Studio and Team form YAML views manually build YAML strings line-by-line, cherry-picking known fields. This causes missing fields in the YAML output (`executionEngine`, `overrides`, `skills`, `annotations` are all absent), and every CRD schema change requires updating the string concatenation logic. The `executionEngine` omission is actively confusing users who have configured execution engines but don't see them in the YAML view.

## What Changes

- Replace manual YAML string concatenation in `agent-form.tsx` and `team-form.tsx` with structured object building and `js-yaml` serialization
- Create a shared utility for Kubernetes CRD YAML serialization (envelope wrapping, null stripping, status removal)
- Create per-form spec builder functions that merge API data with live form state
- All agent/team fields now appear in YAML output automatically, including previously missing ones

## Capabilities

### New Capabilities
- `kubernetes-yaml-serialization`: Shared utility for converting Kubernetes resource objects to clean YAML strings, with recursive null/empty stripping and status field removal

### Modified Capabilities
- `execution-engine-dropdown`: The execution engine reference will now be visible in the Agent Studio YAML view when configured

## Impact

- `services/ark-dashboard/ark-dashboard/lib/utils/kubernetes-yaml.ts` — new shared utility
- `services/ark-dashboard/ark-dashboard/components/forms/agent-form/yaml.ts` — new agent spec builder
- `services/ark-dashboard/ark-dashboard/components/forms/agent-form/agent-form.tsx` — replace `agentYaml` useMemo
- `services/ark-dashboard/ark-dashboard/components/forms/team-form/yaml.ts` — new team spec builder
- `services/ark-dashboard/ark-dashboard/components/forms/team-form/team-form.tsx` — replace `teamYaml` useMemo
- No new dependencies — `js-yaml` is already installed
