## 1. CRD Types & Operator Core

- [x] 1.1 Add `AnthropicModelConfig` struct to `ark/api/v1alpha1/model_types.go` (baseUrl, apiKey, version, headers, properties) and add `Anthropic *AnthropicModelConfig` field to `ModelConfig`
- [x] 1.2 Add `anthropic` to the `spec.provider` kubebuilder enum validation and the `spec.type` backward-compat enum
- [x] 1.3 Add `ProviderAnthropic = "anthropic"` constant to `ark/internal/validation/constants.go`
- [x] 1.4 Add `validateAnthropicConfig` function to `ark/internal/validation/model.go` and wire it into `validateProviderConfig` switch
- [x] 1.5 Run `make manifests` in `ark/` to regenerate CRDs and sync Helm chart

## 2. Shared Anthropic Format Module

- [x] 2.1 Create `ark/executors/completions/anthropic_format.go` — extract and rename types from `provider_bedrock.go`: `anthropicMessage`, `anthropicRequest`, `anthropicResponse`, `anthropicContent`, `anthropicTool`
- [x] 2.2 Extract conversion functions into `anthropic_format.go`: `convertMessagesToAnthropic`, `convertAnthropicResponse`, `convertToolsToAnthropic`, `buildAnthropicRequest`
- [x] 2.3 Refactor `provider_bedrock.go` to use the shared types and functions from `anthropic_format.go`, removing duplicate type definitions
- [x] 2.4 Run existing Bedrock tests to verify refactor: `go test ./executors/completions/... -run Bedrock`

## 3. Anthropic Provider Implementation

- [x] 3.1 Add `ProviderAnthropic = "anthropic"` constant to `ark/executors/completions/constants.go`
- [x] 3.2 Create `ark/executors/completions/provider_anthropic.go` — `AnthropicProvider` struct with fields (Model, BaseURL, APIKey, Version, Headers, Properties), implement `ChatCompletionProvider` interface using shared format module and direct HTTP transport
- [x] 3.3 Create `ark/executors/completions/model_anthropic.go` — `loadAnthropicConfig` function following the `loadOpenAIConfig` pattern
- [x] 3.4 Wire anthropic provider into `LoadModel` switch in `ark/executors/completions/model.go`
- [x] 3.5 Wire anthropic provider into `HealthCheck` switch in `ark/executors/completions/model_generic.go`

## 4. Go Unit Tests

- [x] 4.1 Add anthropic validation test cases to `ark/internal/validation/model_test.go` (valid config, missing config, missing baseUrl, missing apiKey, URL security)
- [x] 4.2 Add anthropic webhook test cases to `ark/internal/webhook/v1/model_webhook_test.go`
- [x] 4.3 Create `ark/executors/completions/anthropic_format_test.go` — test shared conversion functions (messages, response, tools, system extraction)
- [x] 4.4 Add anthropic health check tests to `ark/executors/completions/provider_healthcheck_test.go`
- [x] 4.5 Run all Go tests: `make test` in `ark/`

## 5. API Service (Python)

- [x] 5.1 Add `PROVIDER_ANTHROPIC` constant and `AnthropicConfig` Pydantic model to `services/ark-api/ark-api/src/ark_api/models/models.py`
- [x] 5.2 Add anthropic branch to `create_model()` and `_build_config_dict_from_body()` in `services/ark-api/ark-api/src/ark_api/api/v1/models.py`

## 6. Dashboard

- [x] 6.1 Add Anthropic Zod schema to `services/ark-dashboard/ark-dashboard/components/forms/model-forms/schema.ts`
- [x] 6.2 Add "Anthropic" to provider dropdown in `services/ark-dashboard/ark-dashboard/components/forms/model-forms/model-configuration-form.tsx`
- [x] 6.3 Add anthropic cases to `createConfig()`, `getResetValues()`, `getDefaultValuesForUpdate()` in `services/ark-dashboard/ark-dashboard/components/forms/model-forms/utils.ts`

## 7. CLI

- [x] 7.1 Create `tools/ark-cli/src/commands/models/providers/anthropic.ts` — `AnthropicConfigCollector` following existing provider patterns
- [x] 7.2 Add anthropic to provider factory in `tools/ark-cli/src/commands/models/providers/factory.ts`
- [x] 7.3 Add anthropic to provider exports in `tools/ark-cli/src/commands/models/providers/index.ts`
- [x] 7.4 Add anthropic choice to provider selection in `tools/ark-cli/src/commands/models/create.ts`
- [x] 7.5 Add anthropic branch to `tools/ark-cli/src/commands/models/kubernetes/manifest-builder.ts`

## 8. Samples & Documentation

- [x] 8.1 Update `samples/models/claude.yaml` to use `provider: anthropic` with native `config.anthropic` block
- [ ] 8.2 Add Anthropic provider section to `docs/content/reference/resources/models.mdx` (skipped: file does not exist in repo)
- [ ] 8.3 Update `docs/content/user-guide/samples/models/claude.mdx` to reflect native anthropic provider (skipped: file does not exist in repo)
- [x] 8.4 Update `samples/README.md` provider listing

## 9. Chainsaw E2E Tests

- [x] 9.1 Create `tests/models/manifests/a01-model-anthropic.yaml` test fixture
- [x] 9.2 Add anthropic admission failure test cases to `tests/admission-failures/manifests/`
