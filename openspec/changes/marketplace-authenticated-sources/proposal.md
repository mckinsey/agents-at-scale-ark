## Why

The marketplace can only fetch sources that are reachable **anonymously**. The ark-api aggregator (change `marketplace-sources-configmap`, re-landing in #2479) fetches each source's manifest server-side with no `Authorization` header, so any source that requires auth returns 401/404 and its items silently disappear from the grid.

This blocks the common enterprise hosting patterns: private GitHub repos, GitHub Enterprise Server, Azure DevOps Repos, and authenticated artifact stores (Artifactory, Nexus, Harbor). Enterprise customers usually can't host the marketplace manifest on a public URL, so today they must stand up an anonymous proxy just to serve a JSON file.

> **Depends on #2479** (the re-land of `marketplace-sources-configmap`). This change extends that architecture (per-namespace `marketplace-sources` ConfigMap + the ark-api aggregator) and cannot land until #2479 is merged.

## What Changes

- **A source can optionally carry a credential** for authenticated fetch. The credential is stored in a **per-source Kubernetes Secret**
- **ark-api attaches the auth header server-side.** When the aggregator fetches a source that references a credential Secret, it reads the Secret (under the requesting user's impersonation, consistent with `marketplace-sources-configmap`) and sets the `Authorization` header.
- **Both auth schemes are supported:**
  - **Bearer / token** — GitHub raw (`Authorization: token <PAT>`), GitHub Enterprise, most artifact stores.
  - **HTTP Basic** — Azure DevOps (`Authorization: Basic base64(":<PAT>")`, empty username + PAT). A bearer-only design leaves ADO blocked, so the scheme is explicit per source.
- **Credentials are never readable from the browser** — stored in a Secret, read only server-side, never echoed in API responses, and never logged.
- **Credentials apply on validate/create too**, so adding a private source is verified with its credential before it is saved.
- **Authenticated sources are provisionable at deploy time** — because a source is just a credential Secret plus a `marketplace-sources` ConfigMap entry, a platform team can seed one declaratively via the `marketplaceSources` Helm values (extended with an optional `auth` block) referencing a pre-existing Secret, with no dashboard interaction and no token in `values.yaml`.
- **Anonymous sources are unchanged** — a source with no credential fetches exactly as today.
- **Clear UI error** when a credential is missing or rejected (401/403), instead of items silently dropping out of the grid.
- **Docs:** remove the "No authentication for source URLs" limitation bullet captured in PR #2336.

## Capabilities

### New Capabilities
- `marketplace-source-auth`: authenticated fetch of marketplace source manifests — per-source credential stored in a Kubernetes Secret, server-side header injection by ark-api (bearer or HTTP Basic), with anonymous sources preserved.

### Modified Capabilities
<!-- None as a delta spec: the marketplace-sources capability (change marketplace-sources-configmap / #2479) is not yet an archived spec under openspec/specs/. This change depends on it but adds its own capability rather than editing an archived one. -->

## Impact

- **ark-api** — `models/marketplace_sources.py` (source value schema gains an optional credential reference + auth scheme); `api/v1/marketplace_sources.py` (create/update/delete also manages the per-source Secret); `api/v1/marketplace_items.py` (aggregator reads the Secret and sets the `Authorization` header — `Bearer <value>` for bearer, `Basic base64(":<PAT>")` for ADO).
- **ark-api RBAC** — a namespace-scoped `Role` lets editors create/get/update/delete the per-source Secrets + the `marketplace-sources` ConfigMap, bound to an explicit group; all Secret access runs under user impersonation, so the requesting user's `get` governs use of a private source (consistent with `marketplace-sources-configmap`).
- **ark-dashboard** — `components/settings/manage-marketplace-settings.tsx` and the marketplace service: UI to enter a credential and pick the scheme when adding/editing a source; the credential is sent once on save and never returned.
- **Secrets** — one Kubernetes Secret per authenticated source; lifecycle tied to the source entry (created/updated/deleted with it).
- **Helm (deploy-time)** — extend #2479's `marketplaceSources` values with an optional `auth: { scheme, secretRef }` block; the seed Job writes the `auth` block into the ConfigMap entry but never creates or templates the credential Secret (provisioned out-of-band).
- **Docs** — remove the limitation bullet from PR #2336; document how to add an authenticated source.
- **Dependency** — builds on #2479 (`marketplace-sources-configmap`); blocked until it merges.
