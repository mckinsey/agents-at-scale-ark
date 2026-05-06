## 1. Query CRD

- [x] 1.1 Add `provisioning` to the phase enum validation in `ark/api/v1alpha1/query_types.go`
- [x] 1.2 Run `make manifests` to regenerate CRDs with the new enum value
- [x] 1.3 Update Helm chart CRD templates with regenerated manifests

## 2. ark-sdk QueryStatusUpdater

- [x] 2.1 Implement `QueryStatusUpdater` class in `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/` with `update_query_phase(phase, reason, message)` that patches Query status subresource via K8s API
- [x] 2.2 Inject `QueryStatusUpdater` into executor context in `A2AExecutorAdapter`, using the query ref extracted from A2A message metadata
- [x] 2.3 Handle missing query ref gracefully (log warning, no-op)
- [x] 2.4 Handle K8s API failures gracefully (log error, no-op)
- [x] 2.5 Unit tests for QueryStatusUpdater: successful patch, missing query ref, API failure

## 3. Dashboard

- [x] 3.1 Add `provisioning` case to StatusDot component with amber/yellow color
- [x] 3.2 Display condition message as supplementary text when phase is `provisioning`

## 4. Fark CLI

- [x] 4.1 Handle `provisioning` phase in QueryWatcher with provisioning-specific spinner text
- [x] 4.2 Display condition message when phase is `provisioning`
