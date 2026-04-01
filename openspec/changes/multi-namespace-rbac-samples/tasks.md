## 1. Remove ClusterRole from ark-api chart

- [x] 1.1 Remove the `rbac.clusterWide` conditional block (ClusterRole + ClusterRoleBinding) from `services/ark-api/chart/templates/rbac.yaml`
- [x] 1.2 Remove `rbac.clusterWide` key from `services/ark-api/chart/values.yaml`
- [x] 1.3 Remove `rbac.clusterWide: true` from `services/ark-api/devspace.yaml`

## 2. Graceful namespace listing fallback

- [x] 2.1 Update `list_namespaces()` in `services/ark-api/ark-api/src/ark_api/api/v1/namespaces.py` to catch 403 ApiException and return only the current context namespace
- [x] 2.2 Add unit tests for the 403 fallback behaviour

## 3. Context capabilities API

- [x] 3.1 Add `capabilities` field (with `can_create_namespace: bool`) to the `ContextResponse` model in `services/ark-api/ark-api/src/ark_api/models/context.py`
- [x] 3.2 Implement SelfSubjectAccessReview check in the context endpoint to determine `can_create_namespace`, defaulting to `false` on failure
- [x] 3.3 Add unit tests for the capabilities check (permission granted, denied, and unavailable scenarios)

## 4. Sample RBAC manifests

- [x] 4.1 Create `samples/tenant-management/01-namespace-reader.yaml` with ClusterRole + ClusterRoleBinding for namespace discovery
- [x] 4.2 Create `samples/tenant-management/02-specific-namespaces.yaml` with RoleBindings in target namespaces
- [x] 4.3 Create `samples/tenant-management/03-namespace-label-selector.yaml` with label convention pattern
- [x] 4.4 Create `samples/tenant-management/04-full-admin.yaml` with full cluster-wide access

## 5. Dashboard namespace dropdown (deferred to follow-up PR)

- [x] 5.1 Update `NamespaceProvider` to fetch available namespaces from `GET /api/v1/namespaces` instead of hardcoded array
- [x] 5.2 Add `capabilities` to the context fetch in `NamespaceProvider`
- [ ] 5.3 Replace static namespace text in `app-sidebar.tsx` with a dropdown — deferred, namespace switching works via `?namespace=X` query param
- [ ] 5.4 Show "Create Namespace" option in dropdown — deferred with 5.3
- [ ] 5.5 Add unit tests for the namespace dropdown component — deferred with 5.3

## 6. Documentation

- [x] 6.1 Create `docs/content/operations-guide/tenant-namespace-management.mdx` with tenant isolation diagram, tier table, and usage guidance
- [x] 6.2 Move "Setting Up Tenant Namespaces" and "Using the Tenant Service Account" from `deploying-ark.mdx` to the new page, leaving cross-links
- [x] 6.3 Add the new page to `_meta.js` under "Platform operations"
- [x] 6.4 Update `samples/README.md` to reference the new `tenant-management/` directory
