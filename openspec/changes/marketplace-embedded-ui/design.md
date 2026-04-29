## Context

The Ark marketplace page lists and manages installable items (Langfuse, Phoenix, Argo Workflows, Claude Code executor, etc.). Several of these items expose their own web UIs. Currently users must discover these UIs through port-forwarding or nip.io URLs; there is no standard mechanism for surfacing them inside the dashboard.

Significant groundwork already exists in the codebase:

- `MarketplaceItem.uis?: { url: string; label: string }[]` — field already in the TypeScript type.
- `marketplace-fetcher.ts` — already reads `ark.mckinsey.com/marketplace-item-ui-url` and `ark.mckinsey.com/marketplace-item-ui-label` annotations from Kubernetes Services and passes them into `MarketplaceItem.uis`.
- Marketplace card and detail page — already render `uis` as external-link buttons when the item is installed.
- `/services` page — already removed from the dashboard.

The remaining work is: (a) the embedded-iframe UI mode, (b) `marketplace.json` manifest field, and (c) author documentation.

## Goals / Non-Goals

**Goals:**
- Define the annotation convention for external and embedded UI URLs and document it for Helm chart authors.
- Add an optional `uis` field to the `marketplace.json` manifest schema for static pre-install documentation.
- Implement an embedded UI tab on the marketplace detail page that renders a service's UI in a sandboxed iframe.
- Add the `ark.mckinsey.com/marketplace-item-ui-embedded: "true"` annotation to control embedded vs. external rendering.

**Non-Goals:**
- OIDC token passthrough / SSO into embedded UIs (future).
- Changing the existing HTTPRoute-based URL discovery used by `ArkService`; that path remains for the services API.
- Restyling or restructuring the marketplace card layout beyond what the current `uis` rendering requires.
- Supporting web components or module federation for deep dashboard integration (iframe is sufficient for now).

## Decisions

### Decision 1: Annotation-based URL declaration (not manifest-embedded URLs)

**Chosen:** Kubernetes Service annotations on Helm chart Services (`ark.mckinsey.com/marketplace-item-ui-url`, `ark.mckinsey.com/marketplace-item-ui-label`).

**Why:** The dashboard already reads these annotations via the `getAllServiceUIs` batch fetch in `marketplace-fetcher.ts`. The URL is deployment-specific (ingress hostname, gateway port, local port) and therefore cannot be statically baked into `marketplace.json`. Annotations on the running Service reflect the actual, reachable URL for the current deployment.

**Alternatives considered:**
- _HTTPRoute discovery (like ArkService)_: Already used for the services API but requires Gateway API CRDs; Service annotations work without them.
- _ConfigMap or CRD_: Higher operational burden; annotations on existing Services are zero-overhead for chart authors.

### Decision 2: iframe for embedded UI

**Chosen:** Sandboxed `<iframe>` with `sandbox="allow-scripts allow-forms allow-same-origin"` rendered inside a dedicated "UI" tab on the detail page.

**Why:** Iframes provide hard security isolation without requiring the marketplace item to be built as a React component or web component. The embedded UI author does not need to know anything about the Ark dashboard framework. This matches how tools like Argo Workflows and Grafana are typically embedded.

**Alternatives considered:**
- _Micro-frontend / module federation_: Requires marketplace items to expose a specific JS bundle entry point, a significant authoring burden and coupling to the dashboard's Webpack version.
- _Server-side proxy tab_: Avoids CORS issues but adds server infrastructure and latency.

**Trade-off:** iframes can have CORS/X-Frame-Options issues if the embedded service sets `X-Frame-Options: DENY`. Chart authors must ensure the service allows framing, or the UI tab shows a fallback "open in new tab" link.

### Decision 3: `ark.mckinsey.com/marketplace-item-ui-embedded: "true"` annotation controls rendering mode

**Chosen:** A boolean annotation on the Kubernetes Service controls whether the URL is rendered as an external button or an iframe tab.

**Why:** Keeps the declaration co-located with the URL annotation (same Service), and allows different Services on the same chart to use different modes.

### Decision 4: `uis` field in `marketplace.json` is documentation-only

**Chosen:** The `marketplace.json` manifest may include a `uis` array with `{ label, description }` entries (no URL) that appear on the detail page before install, purely for documentation.

**Why:** Pre-install, the cluster URL is unknown. Post-install, the live annotation-based discovery takes over. The manifest field is never used as a URL source; its purpose is to tell users "this item exposes a UI" before they install.

## Risks / Trade-offs

- **X-Frame-Options blocking embedded UI** → Mitigation: Detect load failure in the iframe `onError`/`onLoad` event and show a "Cannot embed — open in new tab" fallback.
- **Local port-forward URL is ephemeral** → Mitigation: The annotation is re-read on each marketplace page load; the URL reflects the current running state.
- **Batch Service fetch adds latency to marketplace load** → The `getAllServiceUIs` call is already in production; no regression.

## Open Questions

- Should chart authors be able to declare multiple embedded UIs (e.g., a separate admin tab and a user-facing tab)? The current annotation model supports only one URL per Service, but multiple Services can exist per Helm release.
- Should the embedded iframe have a "full screen" expand button? Deferred to implementation.
