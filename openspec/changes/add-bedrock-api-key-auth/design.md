## Context

Bedrock authentication in Ark flows through three layers in the completions executor:

1. **CRD type** — `BedrockModelConfig` (`ark/api/v1alpha1/model_types.go:74-97`): `region`, `baseUrl`, `accessKeyId`, `secretAccessKey`, `sessionToken`, `modelArn`, plus tuning fields. No `apiKey`.
2. **Config resolution** — `loadBedrockConfig` (`ark/executors/completions/model_bedrock.go`): resolves each `ValueSource` (including Secret refs) to a string and calls `NewBedrockModel(...)`.
3. **Client construction** — `BedrockModel.initClient` (`ark/executors/completions/provider_bedrock.go:44-69`): if access key + secret are present → `credentials.NewStaticCredentialsProvider(...)`; otherwise `config.LoadDefaultConfig(...)`. Then `bedrockruntime.NewFromConfig(cfg)`.

AWS Bedrock API keys are bearer tokens that authenticate via `Authorization: Bearer <key>`, overriding SigV4 signing. The vendored `aws-sdk-go-v2 v1.42.0` already supports this — no new dependency. Verified in the module cache: `bedrockruntime.Options.BearerAuthTokenProvider bearer.TokenProvider` (`options.go:42`) and `bearer.StaticTokenProvider` from `github.com/aws/smithy-go/auth/bearer` (present at `smithy-go@v1.27.1`, matching `go.mod`). The implementation PR should confirm the same via a compiling import.

**Auth scheme selection (verified against SDK source `auth.go`/`options.go`):** every Bedrock operation advertises two auth schemes in a fixed order — `[SigV4, HTTPBearer]` — and the resolver picks the *first* scheme whose identity resolver is non-nil (`selectScheme`). SigV4's identity resolver is non-nil whenever `Options.Credentials != nil` (`getSigV4IdentityResolver`). Because `config.LoadDefaultConfig` populates `Credentials` from the ambient AWS chain (env vars, `~/.aws`, or an attached IAM role) even when no credentials are set on the Model, SigV4 wins by default and a bearer token is silently ignored. Setting `BearerAuthTokenProvider` alone does **not** suppress SigV4. AWS's own env-var path confirms this: `resolveEnvBearerToken` sets both the token provider *and* `AuthSchemePreference = ["httpBearerAuth"]`.

## Goals / Non-Goals

**Goals:**
- Add an optional `apiKey` ValueSource to `BedrockModelConfig`, treated as a secret.
- Authenticate Bedrock via bearer token when `apiKey` is set; preserve IAM and default-chain behavior otherwise.
- Define and document a clear precedence: API key wins over IAM when both are set.
- Backward compatible — no existing config changes behavior.

**Non-Goals:**
- Removing or deprecating IAM-credential auth — it remains a first-class option.
- Supporting the `AWS_BEARER_TOKEN_BEDROCK` environment variable as a configuration mechanism (process-global; cannot scope per-Model).
- Bedrock API key rotation / short-lived token refresh logic beyond resolving the value at request time.
- Changing non-Bedrock providers.

## Decisions

### Decision: Bearer path sets both `BearerAuthTokenProvider` and `AuthSchemePreference`, per-client
When `apiKey` is set, configure the client per-Model (not via env var):

```go
client := bedrockruntime.NewFromConfig(cfg, func(o *bedrockruntime.Options) {
    o.BearerAuthTokenProvider = bearer.StaticTokenProvider{Token: bearer.Token{Value: bm.APIKey}}
    o.AuthSchemePreference = []string{"httpBearerAuth"}
})
```

`AuthSchemePreference` is required, not optional — see Context: without it SigV4 wins whenever ambient credentials exist. It reorders the bearer scheme to the front, mirroring the SDK's own `resolveEnvBearerToken`.

**Alternatives rejected:** env var at startup (process-global, not per-Model); custom middleware injecting the header (reinvents the provider, collides with SigV4 middleware); `BearerAuthTokenProvider` alone (insufficient per Context); `Credentials = nil` instead of the preference (fragile — depends on nothing repopulating credentials).

### Decision: API key wins over IAM (precedence)
`initClient` selects auth by branch order:

```
if apiKey != ""        -> bearer token client (provider + AuthSchemePreference)
else if access+secret  -> static IAM credentials   (unchanged)
else                   -> default credential chain  (unchanged)
```

Branch order handles IAM configured on the Model; `AuthSchemePreference` handles IAM inherited from the environment (invisible in the YAML). Both are needed — see the auth-scheme decision above.

**Rationale:** setting `apiKey` is deliberate; silently preferring IAM would surprise. Chosen over "mutually exclusive / reject both" (breaks the additive guarantee) and "IAM wins" (counterintuitive).

### Decision: Treat apiKey as a secret end-to-end
`apiKey` is an optional `*ValueSource` resolvable from a Secret, excluded from `BedrockModel.BuildConfig()` and never written to status or logs. "Unset" means `config.APIKey == nil` (no key block) — that path falls back to IAM/default chain. A *configured* key that resolves empty is a misconfiguration, not "unset" — handled by the fail-loud decision below. Region and `baseUrl` still apply on the bearer path (Bedrock is regional).

### Decision: Auth method is a UI/CLI choice; precedence is the backend safety net
The ark-cli and dashboard surfaces let the user pick one auth method (API key or IAM) and collect only that method's fields, so a UI-created Model never carries both. This is an ergonomics layer, not an enforcement one: the CRD still accepts both fields, and Models applied directly (raw YAML, GitOps) can carry both — which is exactly why the backend precedence rule and the webhook warning remain necessary. The two layers are complementary, not redundant.

### Decision: Non-blocking webhook warning when both apiKey and IAM are set
`DefaultModel` (`ark/internal/validation/defaults.go`) adds a warning annotation via the existing `annotations.MigrationWarningPrefix` channel noting the API key takes precedence. Advisory only — the resource is still accepted. Reuses the established Model warning pattern (same as `spec.type → spec.provider`); chosen over silent behavior (confusing) and hard rejection (breaks the additive guarantee).

Concretely:
- Annotation key: `annotations.MigrationWarningPrefix + "bedrock-auth"`
- Message: `"both apiKey and IAM credentials are set for the bedrock provider - apiKey takes precedence and the IAM credentials are ignored"`

### Decision: Fail loud when a configured apiKey cannot be resolved
The existing `resolveOptionalValue` helper swallows resolution errors and returns `""`, which for optional fields like `region` is harmless. For `apiKey` this is unsafe: a configured-but-unresolvable key (e.g. a missing Secret) would silently become empty and fall back to IAM or the default chain, masking a misconfiguration behind a confusing downstream auth failure. When `config.APIKey != nil` (the user configured a key) but it resolves to an error or empty value, `loadBedrockConfig` SHALL return an error rather than fall back. When `config.APIKey == nil` (not configured), behavior is unchanged. This diverges deliberately from the swallow-errors pattern used by the other optional Bedrock fields.

## Testing

The spec scenarios are the acceptance contract; each maps to at least one test:

- **Unit — config resolution** (`model_bedrock.go`): `apiKey` populates `BedrockModel.APIKey`, including from a Secret ValueSource; no `apiKey` block falls back without error; a configured `apiKey` that resolves to an error/missing-Secret/empty returns an error (fail-loud); `BuildConfig()` omits the key.
- **Unit — auth selection** (`provider_bedrock.go`): `apiKey` set → bearer path with both provider and `AuthSchemePreference`; IAM only → static credentials; neither → default chain; both → bearer (precedence).
- **Unit — webhook** (`defaults.go` / `model_webhook_test.go`): warning annotation present when both auth methods set, absent otherwise; each config shape (apiKey only / from Secret / IAM only / neither) is accepted.
- **e2e (chainsaw, mock Bedrock)**: an `apiKey` Model completes a query; the outgoing request carries `Authorization: Bearer …` and is not SigV4-signed, including when ambient AWS credentials exist in the executor environment; an IAM-configured Model path is unchanged.
- **ark-cli**: choosing the API-key method emits `spec.config.bedrock.apiKey` and does not require IAM inputs; choosing IAM emits the credential fields; only the chosen method's inputs are collected.
- **Dashboard (form/unit)**: the auth-method selector appears once Bedrock is chosen; selecting a method reveals only that method's fields and submits only that method's config.

## Migration Plan

Purely additive; no migration required. Rollout order (backend-first, incremental):

1. CRD type + regenerated manifests/Helm copy.
2. Executor: config resolution (`model_bedrock.go`) + bearer path (`provider_bedrock.go`) + unit tests.
3. Verify with a mock Bedrock endpoint (chainsaw e2e).
4. ark-cli + dashboard surfaces.
5. Docs + samples.

**Rollback:** revert the change; existing Models (which never use `apiKey`) are unaffected at any point.
