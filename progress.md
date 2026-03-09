# Evaluations Cleanup Progress

## Completed
- [x] Identify all evaluation-related files, CRDs, docs, demos
  - **CRD types**: `ark/api/v1alpha1/evaluation_types.go`, `evaluator_types.go`, `evaluator_types_test.go`
  - **CRD manifests**: `ark/config/crd/bases/ark.mckinsey.com_evaluations.yaml`, `ark.mckinsey.com_evaluators.yaml` + copies in `ark/dist/chart/templates/crd/`
  - **Controllers**: `ark/internal/controller/evaluation_controller.go` (+tests), `evaluator_controller.go` (+tests), `evaluation_controller_parameter_test.go`
  - **Webhooks**: `ark/internal/webhook/v1/evaluation_webhook.go`, `evaluator_webhook.go`
  - **Validation**: `ark/internal/validation/evaluation.go` (+test), `evaluator.go` (+test), plus case statements in `dispatch.go` and `lookup.go`
  - **GenAI**: `ark/internal/genai/evaluator.go` (+test), references in `context_retrieval_helper.go`
  - **API server**: references in `ark/internal/apiserver/resources.go` (+tests), `printer_columns_test.go`, `converter_test.go`
  - **Main startup**: `ark/cmd/main.go` registers EvaluatorReconciler, EvaluationReconciler, webhooks
  - **RBAC**: 3 roles in `ark/config/rbac/evaluator_*.yaml` + copies in `ark/dist/chart/templates/rbac/`, plus `.github/k8s/rbac-evaluator-access.yaml`
  - **Samples (ark/)**: `ark/config/samples/ark_v1alpha1_evaluator.yaml`, `ark/samples/evaluations/` (6 files), `ark/samples/evaluator-selector/` (2 files)
  - **Samples (root)**: `samples/evaluator/`, `samples/evaluator-selector/`, `samples/agent-modernization/custom-evaluators/` (3 files), `samples/agent-modernization/perf-evaluators/`
  - **ark-evaluator service**: entire `services/ark-evaluator/` directory (Python service with chart, tests, docs)
  - **ark-api**: `services/ark-api/ark-api/src/ark_api/api/v1/evaluations.py`, `evaluators.py`, models in `models/evaluations.py`, `evaluators.py`, `evaluation_metadata.py`
  - **ark-dashboard**: 5 pages, 14+ components, 3 service files, 2 test files, constants/types references
  - **ark-cli**: `tools/ark-cli/src/commands/evaluation/`, `src/lib/executeEvaluation.ts`, references in `export/`, `completion/`, main index
  - **Integration tests**: 8 test suites in `tests/evaluation-*` and `tests/evaluator-*`, plus `tests/helpers/wait-for-evaluator.sh`
  - **Docs**: `docs/content/developer-guide/ark-evaluator.mdx`, `docs/content/reference/evaluations/` (4 files), `services/ark-evaluator/docs/` (8+ files)
  - **Config**: references in `devspace.yaml`, `services/ark-evaluator/devspace.yaml`, `.github/workflows/cicd.yaml`, `.github/dependabot.yaml`
  - **Generated**: `ark/api/v1alpha1/zz_generated.deepcopy.go` contains Evaluation/Evaluator DeepCopy methods

## Remaining
- [x] Remove evaluation CRDs and related code
  - Deleted 35+ files: CRD types, manifests, controllers, webhooks, validation, genai, RBAC roles, samples
  - Edited 15+ files: removed evaluation/evaluator references from dispatch.go, lookup.go, resources.go, main.go, kustomization files, webhook manifests, RBAC controller roles, PROJECT file, deep copy generated code
  - Cleaned up ark/config/, ark/dist/chart/, .github/k8s/ directories
- [x] Remove evaluation integration tests
  - Deleted 8 test directories: `evaluation-baseline`, `evaluation-direct`, `evaluation-direct-ragas`, `evaluation-event-basic`, `evaluation-parameters-priority`, `evaluation-query`, `evaluator-context-enhanced`, `evaluator-selector`
  - Deleted `tests/helpers/wait-for-evaluator.sh`
  - Deleted `tests/.chainsaw-evaluated.yaml` (evaluated test config no longer needed)
  - Stripped evaluation steps from `weather-chicago/chainsaw-test.yaml` (removed evaluator RBAC, evaluator setup, evaluation creation/assertion, evaluator catch blocks)
  - Stripped evaluation steps from `weather-chicago-tools/chainsaw-test.yaml` (removed evaluator RBAC, evaluator setup, event evaluation, evaluator catch blocks)
  - Removed `evaluated: "true"` labels from both weather tests
  - Deleted evaluation manifests from weather tests: `a00-evaluator-llm-rbac.yaml`, `a02-z-evaluator-llm.yaml`, `query-evaluation.yaml`, `weather-tools-event-evaluation.yaml`
  - Removed evaluator admission test steps and manifests from `admission-failures/`
  - Updated `tests/README.md`: removed Evaluator from coverage gaps table, removed evaluator test roadmap items, removed evaluator complexity references
  - Updated READMEs for `weather-chicago/`, `weather-chicago-tools/`, `admission-failures/`
- [ ] Remove evaluation documentation
- [ ] Remove evaluation references across codebase
- [ ] Search for anything else we need to do, add it to this list here
- [ ] Verify all integration tests pass
- [ ] Create evidence (screenshots, recordings, test results)
