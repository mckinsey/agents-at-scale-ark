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
- Admin creates a personal `mcp` secret and a Query that sends it as a header through an `mcpserver` override that selects one server by `ark.mckinsey.com/name`: the API accepts it and stores the override as sent. Viewer's `PUT` on that Query returns `422` and changes nothing, admin's goes through. The same Query is rejected with `422` when viewer sends it, when the selector is empty, selects by another label, adds another label to the name or uses `matchExpressions`, when the override targets a `model`, when the secret is in `parameters` and when the secret does not exist, always with the same detail and without creating anything.
- A Model that references admin's personal secret is rejected with `422` even for admin; one that references the promoted secret is accepted for viewer.
- Rebinding through the API: admin promotes a secret, viewer creates a Model whose `apiKey` references it and the Model becomes available, admin deletes the promoted secret and creates a personal one with the same name. A Query against that Model then fails because the executor refuses the personal secret, and neither the Query, the Model nor the namespace events contain the new value.
- A Query that sends admin's personal secret through an `mcpserver` override runs against mock-llm, and the MCP tool echoes the value back, so the override path still resolves personal secrets.
- A Query applied with kubectl that sends admin's personal secret with a selector on another label fails in the executor, without exposing the value.
- Admin creates the MCPServer `echo-api` through ark-api, pointing at the mock-llm MCP endpoint: it is stored with `ark.mckinsey.com/name: echo-api` next to the labels sent. A server created with `ark.mckinsey.com/name: mock-llm-mcp` in its labels is stored with its own name instead, so `ark.mckinsey.com/name=mock-llm-mcp` still selects only mock-llm's server. A `PUT` whose labels drop the name label puts it back, and `kubectl label` cannot change it. MCPServers applied with kubectl, with a copied name label or with none, are stored with their own name. A Query whose `mcpserver` override selects `ark.mckinsey.com/name: echo-api` delivers the personal header to that server.

## Running

```bash
ARK_API_IMAGE=ghcr.io/mckinsey/agents-at-scale-ark/ark-api \
ARK_API_IMAGE_TAG=<tag> \
chainsaw test ./secret-scoping-personal
```

Needs `helm`, `kubectl` and `jq` on the host, and a cluster with Ark installed (controller and completions executor) that can pull `ghcr.io/dexidp/dex:v2.45.1`, `curlimages/curl:8.11.1` and the mock-llm chart. The enforcement step creates Queries and Models, so it needs the Ark CRDs and the controller's admission webhooks; the resolution step runs Queries, so it needs the controller and executor from the same build. `mock-llm-values.yaml` sets no name label on the mock MCPServer, so the admission webhook adds `ark.mckinsey.com/name: mock-llm-mcp` to a server created by Helm, makes the model call the agent's first tool when the input is `echo-headers` (so every agent that gets that input must have exactly one tool) and echo tool results; `manifests/a03-agent.yaml` is the agent that calls the echo tool. `manifests/a02-model.yaml` is the Query target and is never called. `helpers.sh` holds the shell functions each step sources (token, API call, owner hash).

A pass means personal secrets are visible and writable only by their owner through `/v1/secrets`, that promotion to shared works one way only, that the API lets a personal secret into a resource only through its owner's Query MCP header overrides that select one server by name, that the controller and executor resolve a personal secret only from those overrides and send it only to the named server, and that every MCPServer keeps a name label equal to its name.
