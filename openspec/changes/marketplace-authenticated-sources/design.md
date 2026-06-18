## Context

Builds on `marketplace-sources-configmap` (#2479): sources live in a per-namespace `marketplace-sources` ConfigMap, and the ark-api aggregator (`marketplace_items.py`) fetches each source's manifest server-side. That aggregator already (a) blocks non-routable hosts via an SSRF guard and (b) sets `follow_redirects=False`. This change adds an optional credential per source so private/authenticated manifests can be fetched.

## Goals / Non-Goals

**Goals:**

- Fetch authenticated sources (bearer/token + HTTP Basic) without exposing the credential to the browser.
- Keep anonymous sources unchanged.
- Close the credential-handling risks up front (redirect leak, cross-user borrowing, URL repoint, logging, SSRF).

**Non-Goals:**

- OAuth / interactive auth flows — only a static token/PAT supplied by the user.
- Credential rotation/lifecycle management (the user re-enters to rotate).
- Auth schemes beyond bearer and HTTP Basic.

## Decisions

### Decision: Credential in a per-source Secret; the ConfigMap entry holds only a reference + scheme

The source entry in the ConfigMap gains an optional non-secret block, e.g. `auth: { scheme: "bearer"|"basic", secretRef: "<secret-name>" }`. The **token lives only in the Secret**; the scheme and the reference are not sensitive and stay in the ConfigMap.

- **Why:** ConfigMaps are plaintext; Secrets are the right store. Keeping the scheme/ref in the ConfigMap lets the aggregator know how to build the header without reading the Secret until fetch time.

### Decision: Secret naming and schema

- **Name:** `marketplace-source-<source-name>-auth` — derivable from the source name, so the aggregator and the create/update/delete path resolve it deterministically and the lifecycle (delete-with-source) needs no extra bookkeeping.
- **Contents:** a single key `value` holding the credential. The `scheme` (`bearer`|`basic`) lives in the ConfigMap source entry, **not** the Secret — it is non-sensitive routing metadata, so keeping it in the ConfigMap leaves the Secret a pure value holder and lets the scheme be read or changed without touching the Secret.

### Decision: Read the credential Secret under the caller's impersonation, never the ark-api SA

The aggregator reads the Secret with the requesting user's identity (same impersonation path as `marketplace-sources-configmap`). If the user can't read the Secret, the source fails for them and the credential is never used on their behalf.

- **Why:** the credential is a service identity (a service-account token to the upstream), but *which Ark users may trigger a fetch with it* must still be controlled. Reading as the ark-api SA would let any catalogue viewer use a service credential they were never granted — the #2347 "service acts with more power than the caller" mistake. Impersonation makes the cluster enforce that access.
- **Trade-off:** a shared authenticated source only resolves for the Ark users granted `get` on its service-credential Secret (typically a viewer-group `RoleBinding`). That is correct; granting broader access is an explicit RBAC decision.

### Decision: RBAC for credential Secrets — namespace-scoped

Access to the credential Secrets is plain Kubernetes RBAC scoped to the marketplace namespace

- **Read (fetch):** the aggregator impersonates the user, so the cluster requires that user's `get` on the Secret. That `get` *is* the "may use this private source" authorization — without it the source errors and the credential is never borrowed. No app-level permission table; the Secret's RBAC is the access control.
- **Manage (editors):** a namespaced `Role` (`create`/`get`/`update`/`delete` on `secrets` + the `marketplace-sources` ConfigMap) bound to an explicit group via `RoleBinding`. No implicit "everyone in the namespace" — only named subjects get it.
- **Why namespace-scoped suffices:** RBAC can't scope `create` by name (the name doesn't exist yet) or by label, so per-Secret write isolation isn't expressible. A namespaced `Role` bounds the blast radius to the marketplace namespace — the practical equivalent. A `ClusterRole` would be unacceptable (#2347 over-privilege); this is explicitly a `Role`.
- **Rejected — ark-api SA owns the Secrets (`api_keys.py`/`mcp_auth_persistence.py` pattern):** reading/writing the credential with ark-api's own SA lets any viewer trigger a fetch with a credential they can't read — a confused deputy (#2347). All access goes through impersonation instead.

### Decision: Authentication scheme is a fixed two-value enum (`bearer` | `basic`)

The header is built from the scheme, never from a stored literal prefix:

- `bearer` → `Authorization: Bearer <value>` — covers GitHub raw, GitHub Enterprise, and artifact stores. (GitHub also accepts the legacy `token <value>` form, but `Bearer` is the RFC standard and works for the same targets, so we emit one fixed prefix.)
- `basic` → `Authorization: Basic base64(":<value>")` — empty username + PAT, for Azure DevOps.
- **Why a fixed enum, not a per-source literal prefix:** the two schemes cover every target in scope (GitHub/GHES, ADO, common artifact stores). A configurable prefix is YAGNI; we would add one only if a real server is found that rejects `Bearer` and demands a different token prefix.

### Decision: Never leak the credential to another host

Keep `follow_redirects=False`; a redirect on a credentialed fetch is an error, and the `Authorization` header is only ever sent to the configured source host. The SSRF guard continues to run before any request.

### Decision: Changing the URL requires re-supplying the credential

On update, if the URL changes, the server does not carry the existing Secret to the new URL. The client must re-supply (or explicitly re-confirm) the credential. This prevents repointing a source at an attacker host to harvest a stored credential.

### Decision: Validate-before-save

Create/update performs a test fetch with the credential and rejects the save (clear error) if the manifest is unreachable or the credential is rejected — so a broken/private source isn't persisted in a silently-failing state.

### Decision: Scrub credentials from logs

The credential value is never logged — not in request bodies, headers, or error messages. Existing per-source error logging stays limited to the source name + an error code.

### Decision: Authenticated sources are provisionable declaratively at deploy time

An authenticated source is nothing but two plain Kubernetes objects — a credential Secret (`marketplace-source-<source-name>-auth`, key `value`) and a `marketplace-sources` ConfigMap entry whose JSON value carries the `auth: { scheme, secretRef }` block. The dashboard create/update path is one writer of those objects; a platform team can write the identical objects at install time without the UI. The aggregator's impersonated read path is unchanged regardless of who created them.

We extend the `marketplaceSources` Helm values key (defined in `marketplace-sources-configmap` / #2479, Decision 8) with an optional `auth` block:

```yaml
marketplaceSources:
  - name: internal-mirror
    url: https://internal.example.com/marketplace.json
    displayName: "Internal Mirror"
    namespace: team-a
    auth:
      scheme: bearer                                    # or "basic" for Azure DevOps
      secretRef: marketplace-source-internal-mirror-auth # references a pre-existing Secret
```

- **The credential Secret is pre-existing — created out-of-band (External Secrets Operator, sealed-secrets, SOPS, Vault), never by the seed Job.** The Helm values carry only the non-secret `scheme` + `secretRef`; the token is never templated into `values.yaml`. This keeps plaintext credentials out of the chart and out of Git, consistent with the "credential never in the ConfigMap/plaintext" stance.
- **The #2479 seed Job writes only the ConfigMap entry** (the `auth` block is non-secret routing metadata), exactly as it already writes `url`/`displayName`. No new writer of Secrets is introduced.
- **Deploy-time writes bypass the ark-api write-path guards** (validate-before-save, re-supply-on-URL-change) because they do not go through the create/update endpoint. This is acceptable: those are UX guards on the dashboard path, not security invariants. A wrong/missing credential simply surfaces the per-source auth error at fetch time (the impersonated read still runs) — it does not fail the install.
- **RBAC gates *which Ark users* may trigger the fetch — the credential itself is a service identity.** The token authenticates Ark to the upstream (GitHub/ADO); it is not a per-user credential. The aggregator reads the Secret under the requesting Ark user's impersonated identity, so deploy-time provisioning binds a namespace-scoped `Role`/`RoleBinding` granting the catalogue's viewer group `get` on that service-credential Secret (one binding, not per-user). An Ark user outside that binding gets the per-source auth error; the credential is never borrowed.
- **Why:** the most common enterprise pattern is GitOps. A platform team seeds a curated, authenticated catalogue at install and never touches the dashboard. Because the runtime contract is just "a Secret + a ConfigMap entry the aggregator reads," this path needs no new mechanism — only the additive `auth` field on the existing `marketplaceSources` values.

## Risks / Trade-offs

- **Credential leak via redirect** → mitigated: no redirect following; header only to the configured host.
- **Cross-user credential borrowing** → mitigated: Secret read under impersonation.
- **URL repoint to exfiltrate a stored credential** → mitigated: URL change requires re-supplying the credential.
- **SSRF made more valuable by a credential** → mitigated: existing guard blocks loopback/link-local (incl. cloud metadata)/reserved before any request.
- **Credential in logs** → mitigated: explicit scrubbing requirement.
- **Secret RBAC scoping** → resolved: editors get a namespace-scoped `Role` (never cluster-wide); reads are gated by per-user `get` under impersonation. K8s can't scope the write grant per-Secret, so the namespace bounds the blast radius — see the RBAC decision above.
- **Deploy-time source seeded without read RBAC** → a source seeded via Helm errors silently for users who lack `get` on its credential Secret. Mitigated: docs require binding the namespace-scoped `Role`/`RoleBinding` alongside the seeded source; the per-source UI auth error makes the misconfiguration visible.
- **Token leaking into `values.yaml`/Git** → mitigated: the credential Secret is pre-existing (created out-of-band); Helm values carry only `scheme` + `secretRef`, never the token.
- **Dependency** → blocked on #2479 landing.

## Migration Plan

- Additive: existing anonymous sources are untouched (no `auth` block → fetched as today).
- Ships after #2479. Document how to add an authenticated source; remove the "No authentication for source URLs" bullet from PR #2336.

