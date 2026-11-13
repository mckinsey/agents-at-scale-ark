# Secret Scoping

Checks against a real ark-api and real Secrets that `/v1/secrets` serves only secrets with the Ark labels `ark.mckinsey.com/resource-type=secret` and `ark.mckinsey.com/scope=shared`. See [#2559](https://github.com/mckinsey/agents-at-scale-ark/issues/2559).

## What it tests

- Deploys the `ark-api` chart with this build's image (`ARK_API_IMAGE`/`ARK_API_IMAGE_TAG`) and the chart's default `AUTH_MODE=open`.
- Creates four Secrets: one with both Ark labels, one with no labels, one with only `resource-type`, and an API key secret.
- `GET /v1/secrets` lists only the labelled secret.
- `GET`, `PUT` and `DELETE` on the other three answer 404 with the same detail as a missing secret, and the stored data is unchanged.
- `POST` with the reserved `u-<16 hex>-` prefix answers 422; a normal `POST` creates a secret with both labels.
- `PUT` on a labelled secret changes its value and keeps the labels, and `DELETE` removes a labelled secret.
- Running `kubectl label` on the unlabelled secret, as the migration guide says, makes it readable and listed.

## Running

```bash
ARK_API_IMAGE=ghcr.io/mckinsey/agents-at-scale-ark/ark-api \
ARK_API_IMAGE_TAG=<tag> \
chainsaw test ./secret-scoping
```

`ARK_API_IMAGE`/`ARK_API_IMAGE_TAG` are optional; without them the chart's published image is used, which may predate the scoping.

A pass means secrets without the Ark labels cannot be listed, read, changed or deleted through `/v1/secrets`, and labelling them is enough to bring them back. Other ark-api routes that touch Secrets are outside what it checks.
