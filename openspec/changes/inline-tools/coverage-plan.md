# Phase 1 coverage plan

Codecov on #3531 reported patch coverage 81.84% (81 lines missed) against a
base project coverage of 78.73%. Project coverage rose (+0.06%) and no gate
failed; the gap was in the new security-relevant paths.

## Enforced minimums in this repo

| Where | Gate |
|---|---|
| `.codecov.yml` | project + patch `target: auto`, `threshold: 0.1%` |
| `services/ark-broker/ark-broker/jest.config.js` | global 80% - the only absolute floor |
| `sonar-project.properties` | `sonar.qualitygate.wait=true`, gate defined server side |
| ark, ark-api, ark-dashboard | none; coverage is collected and uploaded, never enforced |

No floor applies to the code this change touches. A repo-wide `fail_under`
would trip on legacy code immediately; an explicit `patch.target` in
`.codecov.yml` is the only ratchet that needs no baseline cleanup.

## Closed

| File | Before | After | Tests |
|---|---|---|---|
| `ark/internal/apiserver/server.go` `inlineReviewer` | 0% | 100% | `internal/apiserver/inline_reviewer_test.go` |
| `ark/internal/webhook/v1/inlinetool_webhook.go` `Handle` | 73.9% | 95.7% | `inlinetool_webhook_test.go` |
| `ark/internal/controller/tool_controller.go` inline path | 63.3% | 100% | `internal/controller/tool_controller_inline_test.go` |
| `ark/internal/inlinetools/admission.go` | 98.3% | 100% | `admission_test.go` |
| `ark/internal/apiserver/admission.go` subject extra | uncovered | covered | `inline_admission_test.go` |
| `ark/internal/validation/dispatch.go` `ValidateTransition` | 42.9% | 85.7% | `inline_tool_test.go` |
| `ark/api/v1alpha1/tool_types.go` inline deepcopy | uncovered | covered | `tool_types_test.go` |
| `services/ark-api/.../api/v1/tools.py` | 61% | 100% | `tests/api/test_tools_inline_routes.py` |
| `services/ark-api/.../api/v1/resources.py` inline gates | uncovered | covered | same |
| `.../components/forms/tool-form/tool-form.tsx` | 44.8% patch | 82.97% lines | `tool-form-inline.test.tsx` |
| `.../components/sections/tools-table.tsx` | 92% | 100% | `tools-table.test.tsx` |

## Left open

- `SetupInlineToolWebhookWithManager` and `installAPIGroups`: wiring that needs a
  running manager. Covered by the e2e install, not by unit tests.
- `Handle`'s `json.Marshal` failure: unreachable for a decoded Tool.
- `tool-form.tsx` agent and team select rendering (lines 294-366) and the input
  schema and annotations expand toggles: pre-existing, not introduced by phase 1.
