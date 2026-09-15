# apiserver-third-party-webhooks

Validates that third-party admission webhooks — Kyverno, OPA/Gatekeeper, anything registering a
`ValidatingWebhookConfiguration` — fire on Ark resources in apiserver mode when
`policy.thirdPartyWebhooks` is enabled (#2684).

This is the **primary** branch of #2684's first task. The CEL `ValidatingAdmissionPolicy` support
covered by [`apiserver-policy`](../apiserver-policy/) satisfies the same task's
"documented alternative enforcement point" fallback; both now work, and they are independent.

## What it tests

- **Baseline** — with no third-party webhook registered, an Agent create is unimpeded.
- **`failurePolicy: Fail`** — a configuration matching Ark agents but pointing at an unreachable
  service **blocks** the create. Before this change it did not, because the webhook plugins were
  disabled outright and the main kube-apiserver does not run its webhook chain on aggregated
  resources.
- **`failurePolicy: Ignore`** — the same unreachable webhook lets the write through, proving real
  webhook semantics rather than indiscriminate blocking.
- **Ark's own validation** — still enforced from the in-process storage path, guarding the
  double-pass fix (the controller chart stops rendering Ark's webhook configurations on the
  postgresql backend).

## Why an unreachable webhook instead of Gatekeeper

The mechanism under test is *"does the aggregated apiserver consult third-party webhook
configurations"*. An unreachable endpoint answers that deterministically and hermetically — no
policy-engine install, no image pulls, no dependency on a specific engine's defaults or CRD
readiness.

A real Gatekeeper constraint **was** verified end-to-end against this build on a kind cluster
(k8s v1.36.1, Gatekeeper v3.23.0), on both request paths:

| | before | after |
|---|---|---|
| non-conforming Agent, proxied path | created | `denied the request: [ark-agents-must-be-reviewed]` |
| conforming Agent, proxied path | created | created |
| non-conforming Agent, **direct service path** | created | HTTP 403, denied by `validation.gatekeeper.sh` |
| conforming Agent, **direct service path** | created | HTTP 201 |

The direct-path rows matter most: that path never transits the main kube-apiserver, so it is the
one #2684 calls out as completely unprotected.

## Requirements

- The `postgresql` backend matrix — in etcd mode Ark resources are CRDs on the main
  kube-apiserver, which already runs the webhook chain, so none of this applies.
- `policy.thirdPartyWebhooks.enabled=true` on the `chart-apiserver` chart. Off by default: it puts a
  synchronous call to every matching webhook on the write path, and a webhook with
  `failurePolicy: Fail` couples Ark writes to that engine's availability.

## Running

In CI this runs in its own job, `E2E Third-Party Webhooks (postgresql)`, rather than in the
standard matrix. The standard legs leave `policy.thirdPartyWebhooks` off so their ~60 tests
exercise the shipped default; enabling it there would put every Ark write in that leg on the
webhook admission path. The test carries the `third-party-webhooks` label, which the standard
legs exclude and the dedicated job selects.

Locally, set the flag up front and then select this test:

```bash
./.github/actions/setup-e2e/setup-local.sh \
  --storage-backend postgresql \
  --enable-third-party-webhooks

cd tests && chainsaw test --config .chainsaw.yaml --selector 'third-party-webhooks'
```
