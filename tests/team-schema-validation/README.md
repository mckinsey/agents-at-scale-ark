# Team Schema Validation

Validates that Team `strategy` and member `type` are enforced by the CRD OpenAPI schema (apiserver-enforced), not only by the validating webhook.

## What it tests
- A valid Team (`strategy: sequential`, member `type: agent`) is accepted
- An invalid `strategy` is rejected at apply time by the apiserver schema
- An invalid member `type` is rejected at apply time by the apiserver schema
- Rejections carry the apiserver signature (`Unsupported value ... supported
  values`), proving the enum is enforced by the schema rather than the webhook

## Backend requirement

Labelled `etcd-only` because OpenAPI schema enum enforcement is a kube-apiserver
feature. On the postgresql backend the embedded apiserver serves the APIs via an
APIService and does not enforce structural schema, so invalid values are caught
by the validating webhook instead — with a different error message that lacks the
`Unsupported value` signature this test asserts.

## Running
```bash
chainsaw test tests/team-schema-validation
```
