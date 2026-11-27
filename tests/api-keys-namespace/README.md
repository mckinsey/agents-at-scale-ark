# API Keys Namespace

Checks against a real ark-api that the `/v1/api-keys` routes accept a `namespace` query parameter and that isolation is enforced by RBAC. See [#3622](https://github.com/mckinsey/agents-at-scale-ark/issues/3622).

## What it tests

- Deploys the `ark-api` chart with this build's image (`ARK_API_IMAGE`/`ARK_API_IMAGE_TAG`), first with the chart's default `AUTH_MODE=open`.
- `POST /v1/api-keys` with no parameter stores the key in ark-api's own namespace.
- `POST /v1/api-keys?namespace=<second>` answers `403` while ark-api's ServiceAccount has no `secrets` access in that namespace.
- After granting that ServiceAccount `secrets` access in the second namespace, the same `POST` succeeds and the key is stored there, isolated from ark-api's own namespace.
- After upgrading ark-api to `AUTH_MODE=basic`, Basic-auth with the key succeeds only when the request carries `?namespace=<second>`; omitting it (ark-api's own namespace) or sending no credentials answers `401`.

## Running

```bash
ARK_API_IMAGE=ghcr.io/mckinsey/agents-at-scale-ark/ark-api \
ARK_API_IMAGE_TAG=<tag> \
chainsaw test ./api-keys-namespace
```

`ARK_API_IMAGE`/`ARK_API_IMAGE_TAG` are optional; without them the chart's published image is used, which may predate the namespace parameter.

A pass means the `namespace` parameter selects where a key is created, listed and authenticated, and that ark-api cannot cross a namespace boundary its ServiceAccount has not been granted.
