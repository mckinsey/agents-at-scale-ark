## ADDED Requirements

### Requirement: BedrockModelConfig supports an apiKey field
The Model CRD `BedrockModelConfig` type SHALL include an optional `apiKey` field of type `ValueSource` in `spec.config.bedrock`, allowing a Bedrock API key (bearer token) to be supplied directly, from a ConfigMap, or from a Secret. The field SHALL be optional so that existing IAM-credential and default-credential-chain configurations remain valid.

#### Scenario: Bedrock config with apiKey only
- **WHEN** a Model is created with `spec.provider: bedrock` and `spec.config.bedrock` containing `apiKey` (and no IAM credentials)
- **THEN** the webhook SHALL accept the resource

#### Scenario: Bedrock config with apiKey sourced from a Secret
- **WHEN** a Model is created with `spec.config.bedrock.apiKey` referencing a Secret via `valueFrom.secretKeyRef`
- **THEN** the webhook SHALL accept the resource and the executor SHALL resolve the key from the Secret at request time

#### Scenario: Existing IAM-credential config still valid
- **WHEN** a Model is created with `spec.config.bedrock` containing `accessKeyId` and `secretAccessKey` and no `apiKey`
- **THEN** the webhook SHALL accept the resource and behavior SHALL be unchanged from before this change

#### Scenario: Bedrock config with neither apiKey nor IAM credentials
- **WHEN** a Model is created with `spec.config.bedrock` containing neither `apiKey` nor IAM credentials
- **THEN** the webhook SHALL accept the resource and the executor SHALL use the ambient AWS default credential chain, unchanged from before this change

### Requirement: Executor authenticates Bedrock with bearer token when apiKey is set
When a resolved Bedrock Model has a non-empty API key, the completions executor SHALL configure the `bedrockruntime` client to authenticate using the key as a bearer token (`Authorization: Bearer <key>`), bypassing SigV4 request signing. The bearer scheme SHALL be selected even when IAM credentials are discoverable from the ambient AWS environment (environment variables, shared config files, or an attached IAM role). When no API key is set, the executor SHALL preserve existing behavior: static IAM credentials when access key and secret are present, otherwise the AWS default credential chain.

#### Scenario: Bearer auth used when apiKey is present
- **WHEN** a query targets a Bedrock Model whose resolved config has a non-empty `apiKey`
- **THEN** the executor SHALL set a bearer token provider on the Bedrock client and the outgoing request SHALL authenticate via bearer token rather than SigV4

#### Scenario: Bearer auth wins over ambient IAM credentials
- **WHEN** a query targets a Bedrock Model with a non-empty `apiKey` AND the executor's environment provides ambient AWS credentials (e.g. an attached IAM role) not configured on the Model
- **THEN** the executor SHALL still authenticate via bearer token and the outgoing request SHALL NOT be SigV4-signed

#### Scenario: IAM auth used when only credentials are present
- **WHEN** a query targets a Bedrock Model with `accessKeyId` and `secretAccessKey` set and no `apiKey`
- **THEN** the executor SHALL build the client with static IAM credentials exactly as before

#### Scenario: Default credential chain used when nothing is set
- **WHEN** a query targets a Bedrock Model with no `apiKey` and no IAM credentials
- **THEN** the executor SHALL build the client from the AWS default credential chain exactly as before

### Requirement: API key takes precedence over IAM credentials
When a Bedrock Model has both an API key and IAM credentials configured, the executor SHALL use the API key (bearer token) and SHALL NOT use the IAM credentials. This precedence SHALL be documented as the contract.

#### Scenario: Both apiKey and IAM credentials configured
- **WHEN** a query targets a Bedrock Model whose resolved config has a non-empty `apiKey` AND `accessKeyId`/`secretAccessKey`
- **THEN** the executor SHALL authenticate via the bearer token and SHALL ignore the IAM credentials

### Requirement: Webhook warns when both apiKey and IAM credentials are set
When a Bedrock Model is created or updated with both an API key and IAM credentials configured, the webhook SHALL add a non-blocking warning annotation indicating that both are set and that the API key takes precedence. The resource SHALL still be accepted; the warning SHALL NOT reject the resource.

#### Scenario: Warning surfaced when both are set
- **WHEN** a Model with `spec.provider: bedrock` is submitted with both `apiKey` and `accessKeyId`/`secretAccessKey` in `spec.config.bedrock`
- **THEN** the webhook SHALL accept the resource AND attach a non-blocking warning stating that the API key takes precedence over the IAM credentials

#### Scenario: No warning when only one auth method is set
- **WHEN** a Model with `spec.provider: bedrock` is submitted with only an `apiKey`, or only IAM credentials, or neither
- **THEN** the webhook SHALL NOT attach the precedence warning

### Requirement: API key is treated as a secret
The Bedrock API key SHALL be handled as a secret consistent with other providers' `apiKey`: it SHALL be resolvable from a Secret via ValueSource, and SHALL NOT be written to Model status, logs, or any client-facing config echo.

#### Scenario: API key not echoed in built config
- **WHEN** the executor builds the runtime config representation of a Bedrock Model that has an `apiKey`
- **THEN** the API key value SHALL NOT appear in that config representation

### Requirement: Unresolvable configured apiKey fails loud
When a Bedrock Model does not configure an `apiKey` (no key block), the executor SHALL fall back to IAM or the default credential chain. When a Model *does* configure an `apiKey` but it cannot be resolved — a resolution error, a missing Secret, or an empty value — the executor SHALL return an error rather than silently fall back, so the misconfiguration is not masked.

#### Scenario: No apiKey configured falls back
- **WHEN** a Bedrock Model has no `apiKey` block configured
- **THEN** the executor SHALL fall back to IAM or the default credential chain without error

#### Scenario: Configured apiKey that resolves empty errors
- **WHEN** a Bedrock Model configures an `apiKey` whose ValueSource resolves to an error, a missing Secret, or an empty string
- **THEN** the executor SHALL return an error and SHALL NOT fall back to IAM or the default credential chain

### Requirement: Model-creation surfaces let the user choose the Bedrock auth method
When creating a Bedrock Model, the ark-cli flow and the dashboard form SHALL let the user choose the authentication method — API key or IAM credentials — and SHALL collect only the fields for the chosen method. The dashboard SHALL present this as a selector (shown once the Bedrock provider is chosen) that conditionally reveals either the API-key field or the IAM-credential fields. A single creation flow SHALL NOT require the user to supply both methods.

#### Scenario: Dashboard offers an auth-method selector for Bedrock
- **WHEN** a user selects the Bedrock provider in the dashboard model form
- **THEN** the form SHALL present an auth-method selector offering "API key" and "IAM credentials"

#### Scenario: Dashboard shows only the chosen method's fields
- **WHEN** the user selects "API key" as the Bedrock auth method
- **THEN** the form SHALL reveal the API-key field and SHALL NOT require the IAM-credential fields; and selecting "IAM credentials" SHALL reveal the IAM fields and SHALL NOT require the API-key field

#### Scenario: Dashboard submits only the chosen method
- **WHEN** the user completes the Bedrock form with a chosen auth method
- **THEN** the dashboard SHALL submit a Model containing only that method's config (`spec.config.bedrock.apiKey` for API key, or the IAM credential fields otherwise)

#### Scenario: ark-cli lets the user choose the auth method
- **WHEN** a user creates a Bedrock model via ark-cli
- **THEN** the CLI SHALL let the user choose between API key and IAM credentials and SHALL collect only the chosen method's inputs

#### Scenario: ark-cli produces a manifest for the chosen method
- **WHEN** a user creates a Bedrock model via ark-cli choosing the API key method
- **THEN** the CLI SHALL produce a Model manifest with `spec.config.bedrock.apiKey` and SHALL NOT require `accessKeyId`/`secretAccessKey`
