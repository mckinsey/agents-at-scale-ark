## Context

The dashboard's Agent Studio and Team form both have a YAML view toggle that displays the resource as Kubernetes CRD YAML. Both currently build YAML by concatenating strings line-by-line, manually adding each known field. This approach silently drops fields that weren't included at implementation time — notably `executionEngine`, `overrides`, `skills`, and `annotations` for agents.

`js-yaml` is already a project dependency (used in `workflow-dag-viewer.tsx`). The `AgentDetailResponse` and team response types from the API contain all fields needed. The YAML view is read-only (one-way: form state → YAML display).

## Goals / Non-Goals

**Goals:**
- All CRD fields appear in the YAML view without manual per-field handling
- Form-managed fields reflect live edits; non-form fields show saved values
- Shared serialization logic reusable across agent and team forms (and future resource forms)
- Strip runtime-only fields (`status`, `id`, `managedFields`) from YAML output

**Non-Goals:**
- Two-way YAML editing (editing YAML to update form state)
- Fetching raw Kubernetes resources from the `/v1/resources/` endpoint
- Changing the YamlViewer component itself (it receives a string, that contract stays)

## Decisions

### 1. Structured object + js-yaml over manual string concatenation

Build a plain JavaScript object matching the CRD shape, then serialize with `yaml.dump()`.

**Why:** Eliminates the entire class of "forgot to add field X" bugs. `js-yaml` handles nesting, arrays, and multiline strings (block scalar style for prompts) automatically. Adding a new CRD field means adding it to the object spread, not writing string formatting logic.

**Alternative considered:** Template literals with tagged templates. Rejected because it still requires manual field handling and doesn't handle nested structures or YAML escaping.

### 2. Two-layer architecture: shared utility + per-form spec builders

`lib/utils/kubernetes-yaml.ts` handles the resource-agnostic concerns (CRD envelope, null stripping, serialization). Per-form `yaml.ts` files handle resource-specific field merging.

**Why:** Follows existing dashboard patterns — `kubernetes-validation.ts` in `lib/utils/` handles shared K8s concerns, while `utils.ts` in each form directory handles form-specific transforms. The spec builder is co-located with the form that uses it, just like parameter transforms already are.

**Alternative considered:** Single utility file with per-resource functions. Rejected because it would create coupling between unrelated resources and doesn't match the existing co-location pattern.

### 3. Merge agent object with form state, not rebuild from scratch

Start from the API response object (which has all fields), then override with current form watch values for form-managed fields.

**Why:** Non-form-editable fields like `overrides` and `annotations` automatically appear without any explicit handling. New fields added to the API response will appear in YAML without code changes, unless they're also added to the form (in which case the form builder needs updating anyway).

### 4. Recursive null/empty stripping utility

A shared `stripEmpty()` function recursively removes `null`, `undefined`, empty strings, empty arrays, and empty objects before serialization.

**Why:** The API response contains many nullable fields. Without stripping, the YAML would be cluttered with `field: null` entries that aren't meaningful in a CRD manifest. This matches the behavior of the backend's `clean_resource_for_yaml()` in the export endpoint.

## Risks / Trade-offs

**[YAML formatting differences]** → `js-yaml` may produce slightly different formatting than the hand-built strings (e.g., quoting rules, key ordering). This is cosmetic and correct — `js-yaml` produces valid YAML. Users who copy/paste YAML may notice minor differences from what they're used to.

**[Field ordering]** → `js-yaml` serializes in object key insertion order. The spec builder should construct the object with fields in the conventional CRD order (description, modelRef, executionEngine, prompt, parameters, tools) to produce readable output. → Mitigated by explicit field ordering in the builder function.

**[Multiline prompt formatting]** → `js-yaml` uses block scalar style (`|`) for multiline strings by default with `lineWidth: -1`. Need to verify this produces clean output for prompts with special characters. → Test with representative prompts during implementation.
