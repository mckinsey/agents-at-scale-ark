# Inline Tool Admission Test

Inline authoring admission: authorization and authoritative authorship.

## What it tests
- **Deny unauthorized create**: an identity that can author Tools
  (`tools/create`) but lacks the dedicated `use inlinetools` permission is
  denied, with the specific inline authoring error — `tools/create` alone
  must not introduce executable source. The denied request creates nothing.
- **Accept authorized create**: an identity whose only inline permission is
  the chart's `inline-tool-author-role`, bound per namespace exactly as the
  operator docs instruct, is accepted — so the shipped grant itself is what
  passes the SubjectAccessReview.
- **Authoritative authorship on create**: a requester-supplied
  `inline-authored-by` annotation is replaced by the real authenticated
  identity, not trusted.
- **Deny unauthorized source update**: the same non-author identity cannot
  rewrite the source of an already-admitted tool either; the stored source
  is unchanged.
- **Authorship survives a non-author's metadata-only update**: a spec-untouched
  update needs no author permission and is allowed, but a requester-supplied
  `inline-authored-by` on that update does not override the stored value.
- **Re-stamp on an authorized edit**: when the author changes the source
  again, both `inline-authored-by` and `inline-authored-at` move to reflect
  the new authoring event.

Admission is the same decision on both storage backends — the webhook on etcd
and the embedded apiserver on postgresql — and the inline e2e job runs this
suite on both, so each path is exercised by its own leg.

## Prerequisites
Labelled `inline-tools: "true"` and excluded from the standard e2e run. Needs a
cluster with inline authoring enabled and `rbac.impersonation.enabled=true` (the
dedicated inline e2e job provides both). Pinned to the watched `default`
namespace.

## Running
```bash
chainsaw test --test-dir inline-tool-admission --selector inline-tools
```
