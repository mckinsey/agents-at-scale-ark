# Team Schema Validation

Validates that Team `strategy` and member `type` are enforced by the CRD OpenAPI schema (apiserver-enforced), not only by the validating webhook.

## What it tests
- A valid Team (`strategy: sequential`, member `type: agent`) is accepted
- An invalid `strategy` is rejected at apply time by the apiserver schema
- An invalid member `type` is rejected at apply time by the apiserver schema
- Rejections carry the apiserver signature (`Unsupported value ... supported
  values`), proving the enum is enforced by the schema rather than the webhook

## Running
```bash
chainsaw test tests/team-schema-validation
```
