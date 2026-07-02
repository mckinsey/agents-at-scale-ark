## Why

Ark's Bedrock provider only authenticates with IAM-style credentials (access key / secret / session token) or the ambient AWS credential chain. AWS now offers Bedrock API keys — bearer tokens scoped to Bedrock — which remove the need to provision IAM users/roles to get started. Every other Ark provider (OpenAI, Azure, Anthropic) already supports `apiKey`; Bedrock is the outlier. (Issue #2631)

## What Changes

- Add an optional `apiKey` (ValueSource) field to `BedrockModelConfig`, consistent with how other providers model `apiKey` as a secret.
- The completions executor authenticates Bedrock requests with the API key as a bearer token when one is configured, by setting `BearerAuthTokenProvider` and `AuthSchemePreference` on the `bedrockruntime` client so bearer auth is selected even when IAM credentials are present in the environment. Existing IAM-credential and default-credential-chain behavior is preserved when no API key is set.
- **Precedence:** the model-creation surfaces have the user pick one auth method, so "both configured" is not a normal UI/CLI path. It can still occur for Models applied directly (raw YAML/GitOps); in that case the API key wins (bearer auth is used, IAM credentials are ignored). This is the documented contract, surfaced in docs and via a non-blocking webhook warning when both are set.
- Extend the model-creation surfaces — ark-cli (`bedrock.ts`, `manifest-builder.ts`) and the dashboard model forms — with an auth-method selector for Bedrock (API key vs IAM credentials) that collects only the chosen method's fields. This is a UI/CLI convenience; the backend precedence rule remains the safety net for Models applied directly (e.g. raw YAML/GitOps) that carry both.
- Update docs and samples (`docs/content/user-guide/models.mdx`, `docs/content/reference/resources/models.mdx`) to cover API-key auth and the precedence rule.
- Add tests across the touched layers: unit tests for config resolution and bearer-vs-IAM auth selection, webhook tests for the precedence warning, ark-cli and dashboard tests for the auth-method selector, and an e2e (mock Bedrock) test asserting bearer auth. Detailed in design.md § Testing.

This is additive and backward compatible: no existing Bedrock configuration changes behavior.

## Capabilities

### New Capabilities
- `bedrock-api-key-auth`: Configuring a Bedrock Model with a bearer-token API key as an alternative to IAM credentials, the executor's bearer-vs-SigV4 auth selection, the API-key-wins precedence rule, and the model-creation surfaces (CRD, ark-cli, dashboard) that expose it.

### Modified Capabilities
<!-- None: there is no existing documented bedrock-provider spec in openspec/specs/. -->

## Impact

- **CRD / Go types:** `ark/api/v1alpha1/model_types.go` (`BedrockModelConfig`), regenerated CRD manifests and Helm chart copy.
- **Executor:** `ark/executors/completions/model_bedrock.go` (config resolution), `ark/executors/completions/provider_bedrock.go` (`BedrockModel`, `initClient` bearer-token path).
- **Webhook:** `ark/internal/validation/defaults.go` (`DefaultModel`) — non-blocking warning when both `apiKey` and IAM credentials are set.
- **Dependencies:** none new — `github.com/aws/smithy-go/auth/bearer` and `bedrockruntime.Options.BearerAuthTokenProvider` are already available via the vendored `aws-sdk-go-v2`.
- **CLI:** `tools/ark-cli/src/commands/models/providers/bedrock.ts`, `tools/ark-cli/src/lib/kubernetes/manifest-builder.ts`.
- **Dashboard:** Bedrock model configuration form.
- **Docs / samples:** `docs/content/user-guide/models.mdx`, `docs/content/reference/resources/models.mdx`, Bedrock sample YAML.
- **Security:** API key is a long-lived bearer token; treated as a secret via ValueSource → Secret, never logged or echoed in status.
