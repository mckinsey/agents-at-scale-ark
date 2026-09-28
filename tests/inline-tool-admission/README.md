# Inline Tool Admission Test

Inline authoring admission: authorization and authoritative authorship.

## What it tests
- **Deny unauthorized**: an identity that can author Tools (`tools/create`) but
  lacks the dedicated `use inlinetools` permission is denied, with the specific
  inline authoring error — `tools/create` alone must not introduce executable
  source. The denied request creates nothing.
- **Accept authorized**: the default (authorized) identity is accepted.
- **Authoritative authorship**: a requester-supplied `inline-authored-by`
  annotation is overwritten by the real authenticated identity, not trusted.

Admission is the same decision on both storage backends — the webhook on etcd
and the embedded apiserver on postgresql — so the dedicated inline e2e job runs
this on both.

## Prerequisites
Labelled `inline-tools: "true"` and excluded from the standard e2e run. Needs a
cluster with inline authoring enabled and `rbac.impersonation.enabled=true` (the
dedicated inline e2e job provides both). Pinned to the watched `default`
namespace.

## Running
```bash
chainsaw test --test-dir inline-tool-admission --selector inline-tools
```
