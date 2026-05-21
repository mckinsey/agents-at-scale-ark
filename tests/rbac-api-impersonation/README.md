# RBAC API Impersonation Test

## Overview

This test validates the user impersonation feature implemented in PR #2066, which forwards SSO user identity to Kubernetes via `Impersonate-User` and `Impersonate-Group` headers, ensuring K8s RBAC applies to actual users accessing Ark through the API layer.

## What This Test Validates

### User Impersonation Functionality
- JWT claims are correctly extracted (`email`, `groups`)
- `Impersonate-User` and `Impersonate-Group` headers are set on K8s API calls
- User identity is preserved through the API layer to Kubernetes

### RBAC Enforcement
- **Viewer Role**: Users in `ark-viewers` group can:
  - ✅ List and read all Ark resources
  - ❌ Create, update, or delete resources (403 Forbidden)

- **Editor Role**: Users in `ark-admin` group can:
  - ✅ Create, read, update, and delete all Ark resources
  - ✅ Full access to agents, models, queries, teams, tools, memories, mcpservers, a2aservers, a2atasks, executionengines

### Error Handling
- 403 Forbidden responses return structured error messages with:
  - Resource type and namespace
  - Attempted action
  - User identity (username/groups)
  - Clear guidance on missing permissions

### Security
- Client-provided `Impersonate-*` headers are rejected (403 Forbidden)
- Impersonation only applies to SSO-authenticated requests
- API key authentication bypasses impersonation (service identity)

## Test Scenarios

### Scenario 1: Viewer Permissions (Read-Only)
**Given**: User `viewer@example.com` in group `ark-viewers`
**When**: User attempts to list agents
**Then**: Request succeeds (200 OK)

**Given**: User `viewer@example.com` in group `ark-viewers`
**When**: User attempts to create an agent
**Then**: Request fails (403 Forbidden) with clear error message

### Scenario 2: Admin Permissions (Full Access)
**Given**: User `admin@example.com` in group `ark-admin`
**When**: User creates an agent
**Then**: Request succeeds (201 Created)

**Given**: User `admin@example.com` in group `ark-admin`
**When**: User updates the agent
**Then**: Request succeeds (200 OK)

**Given**: User `admin@example.com` in group `ark-admin`
**When**: User deletes the agent
**Then**: Request succeeds (204 No Content)

### Scenario 3: No Permissions (Access Denied)
**Given**: User `noaccess@example.com` in group `no-permissions`
**When**: User attempts to list agents
**Then**: Request fails (403 Forbidden)

### Scenario 4: Security - Header Injection Prevention
**Given**: User attempts to provide `Impersonate-User` header
**When**: Request is sent with custom impersonation headers
**Then**: Request fails (403 Forbidden) - client headers are rejected

### Scenario 5: All Resource Types
**For Each**: agent, model, query, team, tool, memory, mcpserver, a2aserver, a2atask, executionengine
**Verify**: Viewer can read, Admin can CRUD

## Prerequisites

### Environment Configuration
The test requires the following environment variables configured on ark-api:

```bash
AUTH_MODE=sso  # Or hybrid
OIDC_ISSUER_URL=http://keycloak:8080/realms/master
OIDC_APPLICATION_ID=ark-test-client
IMPERSONATION_ENABLED=true
IMPERSONATION_USERNAME_CLAIM=email
IMPERSONATION_GROUPS_CLAIM=groups
IMPERSONATION_PREFIX=""
IMPERSONATION_FALLBACK=false
```

### OIDC Provider Setup
The test uses a mock OIDC provider (Keycloak) with:
- Test realm with JWT tokens
- Client configured with group claims
- Test users:
  - `viewer@example.com` (group: `ark-viewers`)
  - `admin@example.com` (group: `ark-admin`)
  - `noaccess@example.com` (group: `no-permissions`)

### RBAC Configuration
The test applies sample RBAC bindings:
- ClusterRoles for viewer/editor/admin per resource type
- RoleBindings for `ark-viewers` and `ark-admin` groups
- Based on `samples/rbac-test-bindings.yaml`

## Test Implementation

This test can be run in two ways:

### 1. Chainsaw E2E Test (Automated)
```bash
chainsaw test tests/rbac-api-impersonation/
```

### 2. Manual API Testing
Follow the documentation guide in `docs/content/developer-guide/authentication.mdx` section "Local development setup with Keycloak"

## Resources Created

- **Keycloak**: Mock OIDC provider deployment
- **RoleBindings**: RBAC bindings for test groups
- **Test Resources**: Sample agents/models for validation
- **ConfigMaps**: JWT tokens for test users

## Success Criteria

✅ All viewer read operations succeed
✅ All viewer write operations fail with 403
✅ All admin operations (CRUD) succeed
✅ No-access user operations fail with 403
✅ Header injection attempts are rejected
✅ All 10 resource types respect RBAC
✅ Error messages are clear and actionable

## Related Documentation

- [Authentication Guide](../../docs/content/developer-guide/authentication.mdx)
- [RBAC Specification](../../openspec/specs/ark-api-rbac/spec.md)
- [API Impersonation Spec](../../openspec/specs/api-impersonation/spec.md)
- [Sample RBAC Bindings](../../samples/rbac-test-bindings.yaml)
- [PR #2066](https://github.com/mckinsey/agents-at-scale-ark/pull/2066)
