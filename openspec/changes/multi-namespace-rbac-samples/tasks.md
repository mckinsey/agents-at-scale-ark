## 1. Remove ClusterRole from ark-api chart

- [ ] 1.1 Remove the `rbac.clusterWide` conditional block (ClusterRole + ClusterRoleBinding) from `services/ark-api/chart/templates/rbac.yaml`
- [ ] 1.2 Remove `rbac.clusterWide` key from `services/ark-api/chart/values.yaml`
- [ ] 1.3 Remove `rbac.clusterWide: true` from `services/ark-api/devspace.yaml`

## 2. Graceful namespace listing fallback

- [ ] 2.1 Update `list_namespaces()` in `services/ark-api/ark-api/src/ark_api/api/v1/namespaces.py` to catch 403 ApiException and return only the current context namespace
- [ ] 2.2 Add unit tests for the 403 fallback behaviour

## 3. Context capabilities API

- [ ] 3.1 Add `capabilities` field (with `can_create_namespace: bool`) to the `ContextResponse` model in `services/ark-api/ark-api/src/ark_api/models/context.py`
- [ ] 3.2 Implement SelfSubjectAccessReview check in the context endpoint to determine `can_create_namespace`, defaulting to `false` on failure
- [ ] 3.3 Add unit tests for the capabilities check (permission granted, denied, and unavailable scenarios)

## 4. Sample RBAC manifests

- [ ] 4.1 Create `samples/tenant-management/01-namespace-reader.yaml` with ClusterRole + ClusterRoleBinding for namespace discovery
- [ ] 4.2 Create `samples/tenant-management/02-specific-namespaces.yaml` with RoleBindings in target namespaces
- [ ] 4.3 Create `samples/tenant-management/03-namespace-label-selector.yaml` with label convention pattern
- [ ] 4.4 Create `samples/tenant-management/04-full-admin.yaml` with full cluster-wide access

## 5. Dashboard namespace dropdown

- [ ] 5.1 Update `NamespaceProvider` to fetch available namespaces from `GET /api/v1/namespaces` instead of hardcoded array
- [ ] 5.2 Add `capabilities` to the context fetch in `NamespaceProvider` (or wherever `useGetContext` is consumed)
- [ ] 5.3 Replace static namespace text in `app-sidebar.tsx` with a dropdown that calls `setNamespace()` on selection
- [ ] 5.4 Show "Create Namespace" option in dropdown when `capabilities.can_create_namespace` is true
- [ ] 5.5 Add unit tests for the namespace dropdown component

## 6. Documentation

- [ ] 6.1 Create `docs/content/operations-guide/tenant-namespace-management.mdx` with tenant isolation diagram, tier table, and usage guidance
- [ ] 6.2 Move "Setting Up Tenant Namespaces" and "Using the Tenant Service Account" from `deploying-ark.mdx` to the new page, leaving cross-links
- [ ] 6.3 Add the new page to `_meta.js` under "Platform operations"
- [ ] 6.4 Update `samples/README.md` to reference the new `tenant-management/` directory
