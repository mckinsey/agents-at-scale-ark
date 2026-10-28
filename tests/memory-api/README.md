# Memory API

Checks against a real ark-api that `/v1/memories` creates and updates Memories with the fields of the Memory CRD. See [#3859](https://github.com/mckinsey/agents-at-scale-ark/issues/3859).

## What it tests

- Deploys the `ark-api` chart with this build's image (`ARK_API_IMAGE`/`ARK_API_IMAGE_TAG`) and the chart's default `AUTH_MODE=open`.
- `POST` with `spec.address`, a header and a label creates a Memory that `kubectl` reads back with the same spec and label.
- `POST` without `spec`, with an empty `address`, or with the old `description`/`config` body answers 422 and creates nothing.
- `GET` returns `spec` and `labels`, and no `description` or `config`.
- `PUT` with a new `spec` replaces the stored spec and keeps the labels.
- `DELETE` removes the Memory.

## Running

```bash
ARK_API_IMAGE=ghcr.io/mckinsey/agents-at-scale-ark/ark-api \
ARK_API_IMAGE_TAG=<tag> \
chainsaw test ./memory-api
```

The test needs the Ark CRDs in the cluster but not the controller; the Memory is never reconciled. A pass means the Memory REST API writes what the CRD expects and rejects bodies it would not accept.
