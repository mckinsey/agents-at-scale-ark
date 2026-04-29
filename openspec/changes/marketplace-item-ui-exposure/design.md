## Context

The Ark dashboard marketplace page (`app/(dashboard)/marketplace/`) lists items from one or more `marketplace.json` manifests. When an item is installed, the fetcher (`lib/services/marketplace-fetcher.ts`) detects the Helm release, queries Kubernetes Services labelled with `app.kubernetes.io/instance`, and reads two annotations to surface UI links:

- `ark.mckinsey.com/marketplace-item-ui-url` — the URL to open
- `ark.mckinsey.com/marketplace-item-ui-label` — button label (default: "Open")

These are collected into `MarketplaceItem.uis?: { url: string; label: string }[]`, a field that already exists in the generated types. The mechanism works end-to-end but is undocumented, not surfaced in the dashboard UI, and has no static (pre-install) declaration path.

A separate `app/(dashboard)/services/` page also attempts URL discovery but hardcodes port-forwarding and nip.io assumptions, making it unreliable. It should be retired once the marketplace page fully replaces it.

Deployment modes in scope: localhost-gateway (local dev), Kubernetes Ingress, and Gateway API HTTPRoutes.

## Goals / Non-Goals

**Goals:**

- Formalize and document the annotation-based UI URL discovery contract
- Extend `marketplace.json` with an optional `ui` block so catalog entries can declare UI hints before installation
- Surface UI links in the dashboard: cards, detail pages, and a "Has UI" filter
- Retire the services page after functionality is covered
- Design the embedded UI mechanism (Phase 2) — specification-complete but implementation deferred

**Non-Goals:**

- OIDC token passthrough / SSO to marketplace item UIs (future work)
- Automatic URL detection without any author declaration (requires too many deployment assumptions)
- Modifying the marketplace repo's Helm chart Kubernetes resources (responsibility of item authors)

## Decisions

### Decision 1: Annotation-first, static declaration as supplement

**Choice:** K8s Service annotations remain the primary URL source at runtime. `marketplace.json` `ui` block serves as a catalog-time hint only (e.g., to show a "has UI" badge before installation, or to provide a path template authors can document).

**Alternatives considered:**
- *HTTPRoute-only discovery*: The `ark-api` already discovers HTTPRoutes per Helm release. However, a single release may run multiple services with distinct UIs, and HTTPRoutes don't carry enough semantic context (which service is the "UI"?). Annotations are more explicit.
- *Pure static declaration in `marketplace.json`*: Would require authors to know their runtime URL at catalog time — impossible for user-specific hostnames.

**Rationale:** Annotations are set by the Helm chart author at deploy time and can encode the actual runtime URL (templated via Helm values). The static `ui.path` in `marketplace.json` lets the dashboard show intent before install.

### Decision 2: `marketplace.json` `ui` block schema

```json
"ui": {
  "path": "/",
  "label": "Open UI",
  "embedded": false
}
```

- `path`: path relative to the service's resolved base URL (used with HTTPRoute discovery as fallback)
- `label`: default button label if annotation doesn't specify one
- `embedded`: Phase 2 flag — if `true`, the dashboard renders the URL in a sandboxed iframe rather than opening a new tab

**Alternatives considered:**
- *Full absolute URL in manifest*: Too fragile; breaks when cluster hostname changes.
- *Port only*: Insufficient for multi-service Helm releases.

### Decision 3: URL resolution hierarchy

When building `MarketplaceItem.uis` at fetch time:

1. **K8s Service annotations** (runtime, highest priority) — `ark.mckinsey.com/marketplace-item-ui-url` + `ark.mckinsey.com/marketplace-item-ui-label`
2. **HTTPRoute + `ui.path`** (runtime, secondary) — if no annotation URL but HTTPRoute is discovered and manifest declares `ui.path`, construct `<httproute-hostname><ui.path>`
3. **Static `ui` block with no runtime URL** — show a "has UI" indicator on catalog items without a resolved link; label as "Not yet reachable" when not installed

Items with no `uis` entries and no `ui` block in the manifest render no UI affordance.

### Decision 4: Embedded UI mechanism (Phase 2 design)

Embedded UIs use a sandboxed `<iframe>` rendered in a new "UI" tab on the detail page. Security requirements:

- HTTPS-only (enforce at validation time when annotation is read)
- `sandbox="allow-scripts allow-same-origin allow-forms"` — no popups, no top navigation
- Dashboard CSP header must allow `frame-src` for declared hostnames (operator configures allowlist)
- No cookies or auth tokens forwarded in Phase 2

**Alternatives considered:**
- *Module Federation / micro-frontends*: Powerful but requires item authors to build against a specific webpack/vite federation contract. Too high a bar for marketplace contributors.
- *Web Components*: Requires items to publish ES modules; same author burden problem.
- *iframe with `allow-same-origin`*: Simplest for authors (any web UI works), containable via CSP.

### Decision 5: Services page retirement

The `app/(dashboard)/services/` page is replaced — not incrementally migrated — once the marketplace page has feature parity. The replacement consists of:

1. An "Installed" status filter already exists; adding "Has UI" filter completes parity
2. Item cards gain "Open UI" button when `uis` is non-empty
3. The sidebar navigation entry for "Services" is removed

No redirect is needed (the page is internal navigation only).

## Risks / Trade-offs

- **Annotation URL staleness** → If a cluster admin changes an ingress hostname, the annotation must be updated in the Helm chart values. Mitigation: document the pattern clearly; the dashboard fetches live on each page load so stale values are visible quickly.
- **CSP allowlist maintenance (Phase 2)** → Operators must enumerate allowed iframe origins. Mitigation: provide a clear configuration path (e.g., `ark-dashboard` ConfigMap key); default to deny-all.
- **`marketplace.json` schema is external** → The manifest schema lives in `mckinsey/agents-at-scale-marketplace`. Adding the `ui` block requires a coordinated PR to that repo. Mitigation: the dashboard treats the field as optional; absence is handled gracefully.
- **Multiple UIs per item** → A Helm release may deploy several services each with a UI (e.g., Argo has UI + API server). The `uis` array already supports multiple entries; cards show a dropdown when more than one URL is present.

## Migration Plan

1. Merge dashboard changes with the "Has UI" filter and "Open UI" affordance. Feature is additive; no data migration.
2. Coordinate `marketplace.json` schema PR with marketplace repo maintainers to add `ui` block to items that have web UIs (Phoenix, Langfuse, a2a-inspector at minimum).
3. Update marketplace item Helm charts (in marketplace repo) to set annotations on their K8s Services — or provide documentation so item authors do it themselves.
4. Once "Open UI" is live and tested, remove the sidebar "Services" entry and delete `app/(dashboard)/services/`.
5. Phase 2 (embedded UI): gated behind an experimental feature flag until CSP configuration story is finalized.

## Open Questions

1. **Who owns the `marketplace.json` `ui` block PR?** — Needs coordination with marketplace repo maintainers. Blocking for static catalog-time display; not blocking for runtime annotation path.
2. **CSP allowlist configuration UX (Phase 2)** — How does an operator declare permitted iframe origins? ConfigMap? Dashboard settings modal? Needs design before Phase 2 implementation.
3. **Multi-URL card affordance** — When an item has 2+ UIs (e.g., Argo UI + Argo Workflows API), should the card show a dropdown button or individual links? UX decision for implementation phase.
