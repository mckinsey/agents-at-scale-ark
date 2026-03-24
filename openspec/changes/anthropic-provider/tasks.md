## 1. CRD Types & Operator Core

- [ ] 1.1 Add `AnthropicModelConfig` struct to `ark/api/v1alpha1/model_types.go` (baseUrl, apiKey, version, headers, properties) and add `Anthropic *AnthropicModelConfig` field to `ModelConfig`
- [ ] 1.2 Add `anthropic` to the `spec.provider` kubebuilder enum validation and the `spec.type` backward-compat enum
- [ ] 1.3 Add `ProviderAnthropic = "anthropic"` constant to `ark/internal/validation/constants.go`
- [ ] 1.4 Add `validateAnthropicConfig` function to `ark/internal/validation/model.go` and wire it into `validateProviderConfig` switch
- [ ] 1.5 Run `make manifests` in `ark/` to regenerate CRDs and sync Helm chart

## 2. Shared Anthropic Format Module

- [ ] 2.1 Create `ark/executors/completions/anthropic_format.go` — extract and rename types from `provider_bedrock.go`: `anthropicMessage`, `anthropicRequest`, `anthropicResponse`, `anthropicContent`, `anthropicTool`
- [ ] 2.2 Extract conversion functions into `anthropic_format.go`: `convertMessagesToAnthropic`, `convertAnthropicResponse`, `convertToolsToAnthropic`, `buildAnthropicRequest`
- [ ] 2.3 Refactor `provider_bedrock.go` to use the shared types and functions from `anthropic_format.go`, removing duplicate type definitions
- [ ] 2.4 Run existing Bedrock tests to verify refactor: `go test ./executors/completions/... -run Bedrock`

## 3. Anthropic Provider Implementation

- [ ] 3.1 Add `ProviderAnthropic = "anthropic"` constant to `ark/executors/completions/constants.go`
- [ ] 3.2 Create `ark/executors/completions/provider_anthropic.go` — `AnthropicProvider` struct with fields (Model, BaseURL, APIKey, Version, Headers, Properties), implement `ChatCompletionProvider` interface using shared format module and direct HTTP transport
- [ ] 3.3 Create `ark/executors/completions/model_anthropic.go` — `loadAnthropicConfig` function following the `loadOpenAIConfig` pattern
- [ ] 3.4 Wire anthropic provider into `LoadModel` switch in `ark/executors/completions/model.go`
- [ ] 3.5 Wire anthropic provider into `HealthCheck` switch in `ark/executors/completions/model_generic.go`

## 4. Go Unit Tests

- [ ] 4.1 Add anthropic validation test cases to `ark/internal/validation/model_test.go` (valid config, missing config, missing baseUrl, missing apiKey, URL security)
- [ ] 4.2 Add anthropic webhook test cases to `ark/internal/webhook/v1/model_webhook_test.go`
- [ ] 4.3 Create `ark/executors/completions/anthropic_format_test.go` — test shared conversion functions (messages, response, tools, system extraction)
- [ ] 4.4 Add anthropic health check tests to `ark/executors/completions/provider_healthcheck_test.go`
- [ ] 4.5 Run all Go tests: `make test` in `ark/`

## 5. API Service (Python)

- [ ] 5.1 Add `PROVIDER_ANTHROPIC` constant and `AnthropicConfig` Pydantic model to `services/ark-api/ark-api/src/ark_api/models/models.py`
- [ ] 5.2 Add anthropic branch to `create_model()` and `_build_config_dict_from_body()` in `services/ark-api/ark-api/src/ark_api/api/v1/models.py`

## 6. Dashboard

- [ ] 6.1 Add Anthropic Zod schema to `services/ark-dashboard/ark-dashboard/components/forms/model-forms/schema.ts`
- [ ] 6.2 Add "Anthropic" to provider dropdown in `services/ark-dashboard/ark-dashboard/components/forms/model-forms/model-configuration-form.tsx`
- [ ] 6.3 Add anthropic cases to `createConfig()`, `getResetValues()`, `getDefaultValuesForUpdate()` in `services/ark-dashboard/ark-dashboard/components/forms/model-forms/utils.ts`

## 7. CLI

- [ ] 7.1 Create `tools/ark-cli/src/commands/models/providers/anthropic.ts` — `AnthropicConfigCollector` following existing provider patterns
- [ ] 7.2 Add anthropic to provider factory in `tools/ark-cli/src/commands/models/providers/factory.ts`
- [ ] 7.3 Add anthropic to provider exports in `tools/ark-cli/src/commands/models/providers/index.ts`
- [ ] 7.4 Add anthropic choice to provider selection in `tools/ark-cli/src/commands/models/create.ts`
- [ ] 7.5 Add anthropic branch to `tools/ark-cli/src/commands/models/kubernetes/manifest-builder.ts`

## 8. Samples & Documentation

- [ ] 8.1 Update `samples/models/claude.yaml` to use `provider: anthropic` with native `config.anthropic` block
- [ ] 8.2 Add Anthropic provider section to `docs/content/reference/resources/models.mdx`
- [ ] 8.3 Update `docs/content/user-guide/samples/models/claude.mdx` to reflect native anthropic provider
- [ ] 8.4 Update `samples/README.md` provider listing

## 9. Chainsaw E2E Tests

- [ ] 9.1 Create `tests/models/manifests/a01-model-anthropic.yaml` test fixture
- [ ] 9.2 Add anthropic admission failure test cases to `tests/admission-failures/manifests/`
