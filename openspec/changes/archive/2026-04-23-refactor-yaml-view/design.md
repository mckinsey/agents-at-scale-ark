## Context

The dashboard's Agent Studio and Team form both have a YAML view toggle that displays the resource as Kubernetes CRD YAML. Both currently build YAML by concatenating strings line-by-line, manually adding each known field. This approach silently drops fields that weren't included at implementation time — notably `executionEngine`, `overrides`, `skills`, and `annotations` for agents.

The `/v1/resources/apis/{group}/{version}/{kind}/{name}` API endpoint already exists and returns the raw Kubernetes object. The dashboard already uses it for workflows, workflow templates, and execution engines. `js-yaml` is already a project dependency.

## Goals / Non-Goals

**Goals:**
- All CRD fields appear in the YAML view without manual per-field handling
- Zero per-resource maintenance — new CRD fields appear automatically
- Shared cleanup/serialization logic reusable across any resource form
- Strip runtime-only fields (`status`, `managedFields`, etc.) from YAML output
- Lay groundwork for future PUT support (YAML edit → save back)

**Non-Goals:**
- Two-way YAML editing (editing YAML to update form state) — future work
- New API endpoints — the resources API already does what we need
- Changing the YamlViewer component itself (it receives a string, that contract stays)

## Decisions

### 1. Fetch raw K8s resource from resources API, not rebuild from form state

Call `GET /v1/resources/apis/ark.mckinsey.com/v1alpha1/Agent/{name}` to get the actual Kubernetes object, clean it, and serialize to YAML.

**Why:** Eliminates the entire class of "forgot to add field X" bugs permanently. No per-resource builder functions needed. The resources API already exists and is used by workflows, execution engines, and workflow templates in the dashboard. New CRD fields appear with zero code changes.

**Trade-off:** The YAML view shows the last-saved state, not live form edits. This is acceptable because:
- The YAML view's purpose is "what does this CRD manifest look like?" — the saved state is the correct answer
- Showing unsaved changes in the YAML would be misleading for copy/paste into `kubectl apply`
- This is consistent with how `kubectl get -o yaml` works

**Alternative considered:** Building a spec object from form state + API data and serializing with js-yaml. Rejected because it still requires per-resource builder functions that must be updated when CRDs change — the same maintenance problem, just in a different form.

### 2. Single shared utility for cleanup and serialization

`lib/utils/kubernetes-yaml.ts` handles all resource-agnostic concerns: stripping runtime fields, recursive null removal, and js-yaml serialization. No per-form files needed.

**Why:** Since we're fetching the raw resource, there's nothing resource-specific to handle. The same cleanup logic applies to any Kubernetes resource. One utility, used everywhere.

### 3. Service methods for raw resource fetching

Add a `getRawResource` method to the agent and team services that calls the resources API endpoint. This follows the existing pattern in `engines.ts` and `workflows.ts`.

**Why:** Keeps the API call co-located with other service methods. The dashboard proxy at `/api/v1/resources/...` already forwards these to the ark-api.

### 4. Fetch on mount + re-fetch on save, not on every render

Fetch the raw resource when the YAML view is first shown, and re-fetch after successful saves. Don't re-fetch on every form change.

**Why:** Avoids unnecessary API calls. The YAML shows saved state, so it only needs to update when the saved state changes.

## Risks / Trade-offs

**[Extra API call]** → One additional GET per resource when YAML view is toggled. Mitigated by only fetching when the YAML tab is active, and caching until next save. The resources API is fast (direct K8s proxy).

**[YAML formatting differences]** → `js-yaml` may produce slightly different formatting than the hand-built strings (e.g., quoting rules, key ordering). This is cosmetic and correct — `js-yaml` produces valid YAML.

**[Stale YAML during edits]** → YAML won't reflect unsaved form changes. This is by design — a feature, not a bug — since the YAML represents the actual cluster state.
