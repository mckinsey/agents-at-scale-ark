# ark-dex-dev

Development-only Dex chart. Provides a minimal OIDC provider with two hardcoded
users so the Ark SSO path — dashboard login, JWT validation in ark-api, Kubernetes
impersonation, RBAC — can be exercised locally.

Not a production chart — HTTP only, in-memory storage, passwords in values.yaml.

## Quickstart

Deployed by the devspace SSO profile, not directly:

```bash
# One-time: make the issuer hostname resolve on your machine.
echo "127.0.0.1  dex.default.svc.cluster.local" | sudo tee -a /etc/hosts

ENABLE_SSO=true devspace dev
```

## Users

Both use password `arkdev123`.

| Login | Permissions in `default` |
|-------|--------------------------|
| `admin@ark.local` | Full access to Ark resources, plus secrets, configmaps, pods and events via the `ark-tenant` Role |
| `viewer@ark.local` | `get`/`list`/`watch` on Ark resources only |

The dashboard reads the effective permissions from `/v1/context`, which runs a
`SelfSubjectRulesReview` as the impersonated user, so the viewer sees the resource
lists with the create/edit/delete controls hidden.

## Why the issuer is a Service FQDN

Dex must answer at the same URL for the browser and for the pods: the dashboard
performs discovery and the code-for-token exchange server-side, and ark-api fetches
the JWKS. `dex.default.svc.cluster.local:5556` resolves in-cluster via CoreDNS and,
on the developer machine, via `/etc/hosts` plus the port-forward the devspace
profile starts.

A `*.127.0.0.1.nip.io` hostname cannot serve both: nip.io resolves to `127.0.0.1`,
which inside a pod is the pod itself.

## Configuration

| Value | Default | Description |
|-------|---------|-------------|
| `issuer` | `http://dex.default.svc.cluster.local:5556/dex` | Issuer URL. Used verbatim as the `iss` claim and as the discovery base; Dex serves its endpoints under the URL's path. |
| `service.name` | `dex` | Service name. Fixed rather than release-derived because `issuer` embeds it. |
| `client.id` | `ark-dashboard` | OAuth client id. Dex sets the token `aud` to this, so it must match ark-api's `OIDC_APPLICATION_ID`. |
| `client.secret` | `ark-dashboard-dev-secret` | OAuth client secret, must match the dashboard's `OIDC_CLIENT_SECRET`. |
| `client.redirectURIs` | dashboard `/api/auth/callback/dex` | Must match the dashboard's `OIDC_PROVIDER_ID`, which fixes the callback path. |
| `users.password` | `arkdev123` | Documentation only — the effective credentials are the bcrypt hashes below. |
| `users.admin.hash` / `users.viewer.hash` | bcrypt of the above | Minimum bcrypt cost is 10. Regenerate with `htpasswd -bnBC 10 "" <password> \| tr -d ':\n'`. |
| `refreshTokens.reuseInterval` | `3m` | Grace window in which a rotated refresh token is still accepted. Dex's default is `0`, meaning a rotated token dies immediately. |
| `rbac.create` | `true` | Create the ClusterRoles and bindings for the two users. |
| `rbac.bindArkTenantRole` | `true` | Also bind the admin to the `ark-tenant` Role, for secrets/configmaps/pods access. |

## Notes

- `DEX_EXPAND_ENV=false` is set on the container. The image entrypoint expands
  `$VAR` references in the config file, and bcrypt hashes start with `$2y$10$`.
- No `session` block is configured, so Dex keeps no SSO cookie and every
  authorization request shows the login form. That is how you switch users: Dex
  exposes no `end_session_endpoint`, so the dashboard clears its own session cookies
  and logs a warning instead of driving RP-initiated logout.
- Storage is in-memory: restarting the pod invalidates refresh tokens.
- With `refreshTokens.reuseInterval` set, Dex does not rotate the refresh token on
  every use. Inside the window repeated refreshes return the same token, and only
  the first refresh after the window closes rotates; the token it supersedes then
  stays claimable for one further window. That is what stops two concurrent
  refreshes from leaving one caller with a dead token. The dashboard copes with
  either behaviour — `lib/auth/token-manager.ts` overwrites the stored token only
  when the response carries a new one.
- Three minutes is a development convenience. It means the token rotates at most
  once every three minutes and a leaked one stays replayable that long, so it is
  not a value to carry into a real deployment.
