## Why

The Model CRD currently supports three providers: `openai`, `azure`, and `bedrock`. Anthropic Claude models are accessed either through the OpenAI-compatible proxy (setting `provider: openai` with Anthropic's base URL) or through AWS Bedrock. There is no native Anthropic provider, which means the Model resource cannot express Anthropic-specific connection settings (API key, base URL, API version) in a first-class way. This matters for custom executors that need to read Anthropic connection config from the Model CRD and call the Anthropic Messages API directly.

Additionally, agents using the default completions executor with a Model configured via the OpenAI proxy for Anthropic miss out on native Anthropic features and proper error handling. Adding a native provider in the completions executor ensures these agents work correctly without requiring a custom execution engine.

## What Changes

- Add `anthropic` as a new `spec.provider` enum value on the Model CRD
- Add `AnthropicModelConfig` struct to the Model CRD with fields: `baseUrl`, `apiKey`, `version` (anthropic-version header), `headers`, `properties`
- Extract shared Anthropic message format types and conversion functions from the Bedrock provider into a reusable `anthropic_format.go` module
- Implement `AnthropicProvider` in the completions executor using the shared format module and direct HTTP transport
- Add Anthropic provider support across the API, Dashboard, CLI, validation, health checks, and documentation

## Capabilities

### New Capabilities
- `anthropic-provider`: Native Anthropic Messages API provider for the Model CRD, including CRD types, completions executor implementation, validation, config loading, health checks, API/Dashboard/CLI support, and documentation

### Modified Capabilities

## Impact

- **CRD**: `Model` CRD schema changes — new enum value and config block. Requires `make manifests` and Helm chart sync.
- **Go operator**: New types in `api/v1alpha1/`, new validation in `internal/validation/`, new provider + config loader + shared format module in `executors/completions/`
- **API (Python)**: New `AnthropicConfig` model and provider handling in `services/ark-api/`
- **Dashboard (TypeScript)**: New form schema, provider dropdown option, and config utilities in `services/ark-dashboard/`
- **CLI (TypeScript)**: New Anthropic config collector in `tools/ark-cli/`
- **Samples/Docs**: Update `samples/models/claude.yaml`, add Anthropic section to model reference docs, update security docs
- **Tests**: New Go unit tests, chainsaw e2e test fixtures, admission failure tests
- **Dependencies**: No new Go dependencies — uses `net/http` directly for the Anthropic API (same request/response format already handled by Bedrock provider)
