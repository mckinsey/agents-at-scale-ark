# Model Bedrock Auth Precedence

Tests the Bedrock `apiKey` (bearer token) authentication field on the Model CRD and the precedence warning between `apiKey` and IAM credentials.

## What it tests
- The CRD accepts `spec.config.bedrock.apiKey` alongside IAM credentials
- The mutating webhook stamps `ark.mckinsey.com/migration-warning-bedrock-auth` when both `apiKey` and IAM credentials are set (apiKey wins)
- No warning is stamped when only `apiKey` is set
- No warning is stamped when only IAM credentials are set

## Running
```bash
chainsaw test ./tests/model-bedrock-auth-precedence
```

Successful completion validates that Bedrock API key authentication is schema-valid and that the precedence warning fires exactly when both auth methods are configured.
