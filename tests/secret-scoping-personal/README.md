# Secret Scoping: Personal Secrets

Checks personal secrets in `/v1/secrets`, and which resources may reference them, against a real ark-api with real user identities from Dex. See [#2559](https://github.com/mckinsey/agents-at-scale-ark/issues/2559).

## What it tests

- Installs `charts/ark-dex-dev` in the test namespace with `oauth2.passwordConnector=local`, so the test can get tokens for `admin@ark.local` and `viewer@ark.local` with the password grant, and `rbac.create=false`, so no cluster-scoped objects collide with other runs.
- Deploys the `ark-api` chart with this build's image (`ARK_API_IMAGE`/`ARK_API_IMAGE_TAG`), `AUTH_MODE=sso` against that Dex and impersonation off. `manifests/ark-api-values.yaml` restates every `app.env` entry because Helm replaces lists.
- Requests without a token or with a forged one get `401`; a Dex token gets `200` and the shared secret.
- Admin creates a personal secret: it is stored as `u-<sha256(admin@ark.local)[:16]>-github` with label `ark.mckinsey.com/scope=user-<hash>`, and the response carries `display_name: github` and `scope: personal`.
- Viewer creates a personal `github` too: it gets a different name, and each user's `?scope=personal` lists only their own.
- The default list stays shared only; `?scope=personal` and `?scope=all` show the personal secret to admin and not to viewer.
- Viewer's `GET`, `PUT` and `DELETE` on admin's personal secret return `404` with the same detail as a missing secret, and the stored data and labels do not change.
- Admin's `PUT` with `scope: shared` flips the label, keeps the name, the value and the description sent with it, and viewer then sees it. Creating a personal `github` again returns `409`, since the promoted secret holds the name. `scope: personal` on a shared secret returns `422`.
- Viewer deletes their own personal secret.
- Admin creates a personal `mcp` secret and a Query that sends it as a header through an `mcpserver` override with a `labelSelector`: the API accepts it and stores the override as sent. Viewer's `PUT` on that Query returns `422` and changes nothing, admin's goes through. The same Query is rejected with `422` when viewer sends it, when the selector is empty, when the override targets a `model`, when the secret is in `parameters` and when the secret does not exist, always with the same detail and without creating anything.
- A Model that references admin's personal secret is rejected with `422` even for admin; one that references the promoted secret is accepted for viewer.

## Running

```bash
ARK_API_IMAGE=ghcr.io/mckinsey/agents-at-scale-ark/ark-api \
ARK_API_IMAGE_TAG=<tag> \
chainsaw test ./secret-scoping-personal
```

Needs `helm`, `kubectl` and `jq` on the host, and a cluster with Ark installed that can pull `ghcr.io/dexidp/dex:v2.45.1` and `curlimages/curl:8.11.1`. The enforcement step creates Queries and Models, so it needs the Ark CRDs and the controller's admission webhooks. `manifests/a02-model.yaml` is the Query target and is never called. `helpers.sh` holds the shell functions each step sources (token, API call, owner hash).

A pass means personal secrets are visible and writable only by their owner through `/v1/secrets`, that promotion to shared works one way only, and that the API lets a personal secret into a resource only through its owner's Query MCP header overrides.
