## Context

Builds on `marketplace-sources-configmap` (#2479): sources live in a per-namespace `marketplace-sources` ConfigMap, and the ark-api aggregator (`marketplace_items.py`) fetches each source's manifest server-side. That aggregator already (a) blocks non-routable hosts via an SSRF guard and (b) sets `follow_redirects=False`. This change adds an optional credential per source so private/authenticated manifests can be fetched.

Threat class differs from the install feature (#2347): there is **no cluster mutation and no broad pod privilege** — the only new capability is an outbound HTTP fetch carrying a user-supplied token. The risk surface is **credential handling** (leakage, cross-user reuse), not privilege escalation.

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

### Decision: Read the credential Secret under the caller's impersonation, never the ark-api SA
The aggregator reads the Secret with the requesting user's identity (same impersonation path as `marketplace-sources-configmap`). If the user can't read the Secret, the source fails for them and the credential is never used on their behalf.

- **Why:** reading as the ark-api SA would let any catalogue viewer borrow another user's credential — the #2347 "service acts with more power than the caller" mistake. Impersonation makes the cluster enforce per-user access.
- **Trade-off:** a shared authenticated source only resolves for users who can read its Secret. That is correct; granting broader access is an explicit RBAC decision.

### Decision: Build the header by scheme
- `bearer` → `Authorization: Bearer <value>` (GitHub raw also accepts `token <value>`; see open questions).
- `basic` → `Authorization: Basic base64(":<value>")` (empty username + PAT, for Azure DevOps).

### Decision: Never leak the credential to another host
Keep `follow_redirects=False`; a redirect on a credentialed fetch is an error, and the `Authorization` header is only ever sent to the configured source host. The SSRF guard continues to run before any request.

### Decision: Changing the URL requires re-supplying the credential
On update, if the URL changes, the server does not carry the existing Secret to the new URL. The client must re-supply (or explicitly re-confirm) the credential. This prevents repointing a source at an attacker host to harvest a stored credential.

### Decision: Validate-before-save
Create/update performs a test fetch with the credential and rejects the save (clear error) if the manifest is unreachable or the credential is rejected — so a broken/private source isn't persisted in a silently-failing state.

### Decision: Scrub credentials from logs
The credential value is never logged — not in request bodies, headers, or error messages. Existing per-source error logging stays limited to the source name + an error code.

## Risks / Trade-offs

- **Credential leak via redirect** → mitigated: no redirect following; header only to the configured host.
- **Cross-user credential borrowing** → mitigated: Secret read under impersonation.
- **URL repoint to exfiltrate a stored credential** → mitigated: URL change requires re-supplying the credential.
- **SSRF made more valuable by a credential** → mitigated: existing guard blocks loopback/link-local (incl. cloud metadata)/reserved before any request.
- **Credential in logs** → mitigated: explicit scrubbing requirement.
- **Secret RBAC scoping is awkward** → editors need to manage the per-source Secrets, but RBAC `resourceNames` can't prefix-match a naming convention; see open questions.
- **Dependency** → blocked on #2479 landing.

## Migration Plan

- Additive: existing anonymous sources are untouched (no `auth` block → fetched as today).
- Ships after #2479. Document how to add an authenticated source; remove the "No authentication for source URLs" bullet from PR #2336.

## Open Questions

- **Bearer prefix:** `Bearer <token>` (standard) vs `token <token>` (GitHub's documented form). GitHub raw accepts both; do we hardcode `Bearer`, or store the literal prefix per source for artifact stores that are strict?
- **Secret RBAC scoping:** how do editors get create/get/update/delete on exactly the per-source credential Secrets? Options: a fixed naming convention + a Role over those names, or a label-selected Role (RBAC can't select by label for get, so likely a naming + Role-per-secret or a broader namespaced Secret role accepted by the platform team).
- **Secret schema:** key names inside the Secret (e.g. `scheme`, `value`) and naming convention (`marketplace-source-<name>-auth`?).
