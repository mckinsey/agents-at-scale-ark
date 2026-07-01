## 1. Source schema + credential storage (ark-api)

- [x] 1.1 Extend the source value schema with an optional `auth` block (`scheme: bearer|basic`, `secretRef`) in `models/marketplace_sources.py`
- [x] 1.2 On create/update, store the credential in a per-source Kubernetes Secret (naming convention); keep only the scheme + ref in the ConfigMap
- [x] 1.3 On delete (or when the credential is cleared), delete the credential Secret — no orphans
- [x] 1.4 Never return the credential value in any response (list/get expose only a "has credential" flag/ref)

## 2. Authenticated fetch (ark-api aggregator)

- [x] 2.1 In `marketplace_items.py`, read the credential Secret **under the caller's impersonation**; if unreadable, fail the source with an authorization error (never use the SA)
- [x] 2.2 Build the `Authorization` header by scheme: `Bearer <value>` (bearer) / `Basic base64(":<value>")` (basic)
- [x] 2.3 Keep `follow_redirects=False` and never send the header to a non-configured host
- [x] 2.4 Keep the SSRF guard running before any request (loopback/link-local/metadata/reserved blocked)
- [x] 2.5 Scrub the credential from all logs (body, header, errors)

## 3. Validate-before-save (ark-api)

- [x] 3.1 On create/update with a credential, test-fetch the manifest with the credential and reject the save with a clear error if missing/rejected
- [x] 3.2 On URL change, require the credential to be re-supplied; do not reuse the existing Secret against a new URL

## 4. RBAC

- [x] 4.1 Define a namespace-scoped `Role` (`create`/`get`/`update`/`delete` on `secrets` + the `marketplace-sources` ConfigMap) for marketplace editors, bound to an explicit group via `RoleBinding` — never a `ClusterRole`
- [x] 4.2 Ensure all Secret access (fetch read + create/update/delete) goes through the caller's impersonation, so a user's `get` on the Secret authorizes use of that private source

## 5. Deploy-time provisioning (Helm)

- [x] 5.1 Extend the `marketplaceSources` Helm values (from #2479) with an optional `auth` block (`scheme: bearer|basic`, `secretRef`); the seed Job writes the `auth` block into the ConfigMap entry and never templates or creates the credential Secret
- [x] 5.2 Document the pre-existing-Secret requirement and ship a values example (bearer + Azure DevOps Basic) plus the companion namespace-scoped `Role`/`RoleBinding` granting viewers `get` on the credential Secret

## 6. Dashboard UI

- [x] 6.1 Add credential entry (scheme picker + token field) to add/edit source in `manage-marketplace-settings.tsx`; send once on save, never display the stored value
- [x] 6.2 Require re-entering the credential when the source URL is changed (UI has no in-place URL edit — change = delete + re-add; server enforces re-auth on PATCH URL change)
- [x] 6.3 Show a clear per-source error on auth failure (401/403) instead of silently dropping items

## 7. Tests

- [x] 7.1 Aggregator: bearer header, basic header, anonymous unchanged
- [x] 7.2 Security: credential not echoed in responses; credential not logged
- [x] 7.3 Security: Secret read under impersonation — a user without Secret access cannot borrow the credential (source fails for them)
- [x] 7.4 Security: credentialed fetch does not follow redirects / does not forward the header to another host
- [x] 7.5 Security: SSRF guard blocks credentialed fetch to non-routable/metadata hosts
- [x] 7.6 Validate: bad/missing credential rejects the save; URL change requires re-auth
- [x] 7.7 Lifecycle: deleting a source (or clearing its credential) removes the Secret
- [x] 7.8 UI: auth-failure error is visible; stored credential never rendered
- [x] 7.9 Deploy-time: a source seeded via `marketplaceSources` (auth block + pre-existing Secret) resolves the same as a UI-created one; values render no credential value

## 8. Documentation

- [x] 8.1 Document adding an authenticated source (bearer + Azure DevOps Basic), and the per-user Secret-access requirement
- [x] 8.2 Remove the "No authentication for source URLs" limitation bullet from PR #2336
- [x] 8.3 Platform-team operating doc: the namespace-scoped `Role`/`RoleBinding` for credential-Secret access (and why never a `ClusterRole`), and how a user's `get` on a Secret governs use of a private source
- [x] 8.4 Deploy-time provisioning doc: seed an authenticated source via the `marketplaceSources` Helm values with a pre-existing Secret (token never in `values.yaml`), including the companion read-RBAC binding
