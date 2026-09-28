# Inline Tool Admission Test

Inline authoring admission: authorization and authoritative authorship.

## What it tests
- **Deny unauthorized**: an identity that can author Tools (`tools/create`) but
  lacks the dedicated `use inlinetools` permission is denied, with the specific
  inline authoring error — `tools/create` alone must not introduce executable
  source. The denied request creates nothing.
- **Accept authorized**: an identity whose only inline permission is the
  chart's `inline-tool-author-role`, bound per namespace exactly as the operator
  docs instruct, is accepted — so the shipped grant itself is what passes the
  SubjectAccessReview.
- **Authoritative authorship**: a requester-supplied `inline-authored-by`
  annotation is replaced by the real authenticated identity, not trusted.

Admission is the same decision on both storage backends — the webhook on etcd
and the embedded apiserver on postgresql — but the inline e2e job passes no
`storage-backend` input, so today this suite runs on etcd only and exercises the
webhook path. Both-backend e2e coverage is still outstanding (task 7.2).

## Prerequisites
Labelled `inline-tools: "true"` and excluded from the standard e2e run. Needs a
cluster with inline authoring enabled and `rbac.impersonation.enabled=true` (the
dedicated inline e2e job provides both). Pinned to the watched `default`
namespace.

## Running
```bash
chainsaw test --test-dir inline-tool-admission --selector inline-tools
```
