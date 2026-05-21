# RBAC API Impersonation Testing Guide

This guide provides detailed instructions for testing the RBAC implementation at the API layer with user impersonation (PR #2066).

## Quick Start

### Option 1: Automated Testing with Python Script

```bash
# Prerequisites: Keycloak running, test users created, Ark deployed with impersonation enabled

# Set up environment
export VIEWER_USERNAME="viewer@example.com"
export VIEWER_PASSWORD="viewer"
export ADMIN_USERNAME="admin@example.com"
export ADMIN_PASSWORD="admin"
export NO_ACCESS_USERNAME="noaccess@example.com"
export NO_ACCESS_PASSWORD="noaccess"

# Apply RBAC bindings
kubectl apply -f manifests/a00-rbac.yaml
kubectl apply -f manifests/a01-test-resources.yaml

# Run the test script
python test_rbac_api.py --api-url http://localhost:8000 --keycloak-url http://localhost:8080
```

### Option 2: Manual API Testing

Follow the step-by-step instructions below for manual verification.

---

## Detailed Setup Instructions

### 1. Deploy Keycloak (Local Development)

```bash
# Run Keycloak in Docker
docker run -d --name keycloak -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=change_me \
  quay.io/keycloak/keycloak:latest start-dev
```

Access Keycloak admin console at: http://localhost:8080/admin

### 2. Configure Keycloak

#### Create Client
1. Navigate to **Clients** → **Create Client**
2. Set **Client ID**: `ark-client-id`
3. Enable **Client authentication**: OFF (public client)
4. Set **Valid redirect URIs**: `http://localhost:3000/api/auth/callback/keycloak`
5. Enable **Direct access grants** (for password grant flow testing)

#### Add Groups Mapper
1. Go to **Clients** → `ark-client-id` → **Client scopes**
2. Click on `ark-client-id-dedicated`
3. Click **Add mapper** → **By configuration** → **Group Membership**
4. Configure:
   - **Name**: groups
   - **Token Claim Name**: groups
   - **Full group path**: OFF
   - **Add to ID token**: ON
   - **Add to access token**: ON
   - **Add to userinfo**: ON

#### Create Groups
1. Navigate to **Groups** → **Create group**
2. Create the following groups:
   - `ark-admin`
   - `ark-viewers`
   - `no-permissions`

#### Create Test Users

**Admin User:**
- Username: `admin`
- Email: `admin@example.com`
- Password: `admin`
- Groups: `ark-admin`

**Viewer User:**
- Username: `viewer`
- Email: `viewer@example.com`
- Password: `viewer`
- Groups: `ark-viewers`

**No Access User:**
- Username: `noaccess`
- Email: `noaccess@example.com`
- Password: `noaccess`
- Groups: `no-permissions`

### 3. Configure Ark API for Impersonation

Update `services/ark-api/ark-api/.env`:

```bash
AUTH_MODE=sso
OIDC_ISSUER_URL=http://localhost:8080/realms/master
OIDC_APPLICATION_ID=ark-client-id
IMPERSONATION_ENABLED=true
IMPERSONATION_USERNAME_CLAIM=email
IMPERSONATION_GROUPS_CLAIM=groups
IMPERSONATION_PREFIX=""
IMPERSONATION_FALLBACK=false
```

Restart ark-api:
```bash
kubectl rollout restart deployment ark-api -n ark-system
```

### 4. Apply RBAC Bindings

```bash
kubectl apply -f tests/rbac-api-impersonation/manifests/a00-rbac.yaml
kubectl apply -f tests/rbac-api-impersonation/manifests/a01-test-resources.yaml
```

---

## Manual Testing Steps

### Step 1: Verify JWT Claims

```bash
# Get admin token
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=ark-client-id" \
  -d "username=admin" \
  -d "password=admin" \
  | jq -r '.access_token')

# Decode and verify claims
echo $ADMIN_TOKEN | cut -d. -f2 | python3 -c "import sys,base64,json; print(json.dumps(json.loads(base64.urlsafe_b64decode(sys.stdin.read().strip()+'==')),indent=2))" | jq '{email, groups, preferred_username}'
```

Expected output:
```json
{
  "email": "admin@example.com",
  "groups": ["ark-admin"],
  "preferred_username": "admin"
}
```

### Step 2: Test Viewer Read Access (Should Succeed)

```bash
# Get viewer token
VIEWER_TOKEN=$(curl -s -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=ark-client-id" \
  -d "username=viewer" \
  -d "password=viewer" \
  | jq -r '.access_token')

# List agents (should succeed - 200 OK)
curl -i -H "Authorization: Bearer $VIEWER_TOKEN" \
  http://localhost:8000/v1/agents?namespace=default
```

**Expected**: HTTP 200 OK

### Step 3: Test Viewer Write Denial (Should Fail with 403)

```bash
# Try to create an agent (should fail - 403 Forbidden)
curl -i -X POST \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "name": "viewer-test-agent",
      "namespace": "default"
    },
    "spec": {
      "model": {"name": "test-model"},
      "systemPrompt": "Test"
    }
  }' \
  http://localhost:8000/v1/agents?namespace=default
```

**Expected**: HTTP 403 Forbidden with error message like:
```json
{
  "detail": {
    "error": "Forbidden",
    "resource": "agents",
    "namespace": "default",
    "action": "create",
    "user": "viewer@example.com",
    "groups": ["ark-viewers"],
    "message": "User 'viewer@example.com' does not have permission to create agents in namespace 'default'"
  }
}
```

### Step 4: Test Admin Full Access (Should Succeed)

```bash
# Create agent (should succeed - 201 Created)
curl -i -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "name": "admin-test-agent",
      "namespace": "default"
    },
    "spec": {
      "model": {"name": "test-model"},
      "systemPrompt": "Test agent"
    }
  }' \
  http://localhost:8000/v1/agents?namespace=default

# Read agent (should succeed - 200 OK)
curl -i -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:8000/v1/agents/admin-test-agent?namespace=default

# Update agent (should succeed - 200 OK)
curl -i -X PUT \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "name": "admin-test-agent",
      "namespace": "default"
    },
    "spec": {
      "model": {"name": "test-model"},
      "systemPrompt": "Updated test agent"
    }
  }' \
  http://localhost:8000/v1/agents/admin-test-agent?namespace=default

# Delete agent (should succeed - 204 No Content)
curl -i -X DELETE \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:8000/v1/agents/admin-test-agent?namespace=default
```

**Expected**: All operations succeed with 200/201/204 status codes

### Step 5: Test No-Access User (Should Fail with 403)

```bash
# Get no-access token
NO_ACCESS_TOKEN=$(curl -s -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=ark-client-id" \
  -d "username=noaccess" \
  -d "password=noaccess" \
  | jq -r '.access_token')

# Try to list agents (should fail - 403 Forbidden)
curl -i -H "Authorization: Bearer $NO_ACCESS_TOKEN" \
  http://localhost:8000/v1/agents?namespace=default
```

**Expected**: HTTP 403 Forbidden

### Step 6: Test Header Injection Prevention (Should Fail with 403)

```bash
# Try to inject impersonation headers (should be rejected - 403 Forbidden)
curl -i \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  -H "Impersonate-User: admin@example.com" \
  -H "Impersonate-Group: ark-admin" \
  http://localhost:8000/v1/agents?namespace=default
```

**Expected**: HTTP 403 Forbidden (client-provided impersonation headers are rejected)

### Step 7: Test All Resource Types

Repeat the viewer read/write tests for all 10 Ark resource types:

```bash
# Resource types to test
RESOURCES=(
  "agents"
  "models"
  "queries"
  "teams"
  "tools"
  "memories"
  "mcpservers"
  "a2aservers"
  "a2atasks"
  "executionengines"
)

# Test viewer read access for all resources
for resource in "${RESOURCES[@]}"; do
  echo "Testing $resource..."
  curl -s -H "Authorization: Bearer $VIEWER_TOKEN" \
    "http://localhost:8000/v1/${resource}?namespace=default" | jq -r '.items | length'
done
```

---

## Verification Checklist

- [ ] Keycloak is running and accessible
- [ ] Test users created with correct group memberships
- [ ] JWT tokens contain `email` and `groups` claims
- [ ] Ark API configured with impersonation enabled
- [ ] RBAC bindings applied to the test namespace
- [ ] Viewer can list all resource types (GET operations)
- [ ] Viewer cannot create resources (POST operations → 403)
- [ ] Viewer cannot update resources (PUT operations → 403)
- [ ] Viewer cannot delete resources (DELETE operations → 403)
- [ ] Admin can create resources (POST operations)
- [ ] Admin can read resources (GET operations)
- [ ] Admin can update resources (PUT operations)
- [ ] Admin can delete resources (DELETE operations)
- [ ] No-access user is denied all operations (403)
- [ ] Client-provided impersonation headers are rejected (403)
- [ ] Error responses include clear messages with user identity

---

## Troubleshooting

### Issue: "User does not have permission"

**Cause**: RBAC bindings not applied or user not in correct group

**Solution**:
```bash
# Verify RoleBindings exist
kubectl get rolebindings -n default | grep ark-

# Verify user groups in JWT
echo $VIEWER_TOKEN | cut -d. -f2 | base64 -d | jq '.groups'

# Reapply RBAC bindings
kubectl apply -f manifests/a00-rbac.yaml
```

### Issue: "Invalid token"

**Cause**: OIDC configuration mismatch

**Solution**:
```bash
# Verify OIDC issuer URL matches
kubectl get deployment ark-api -n ark-system -o yaml | grep OIDC_ISSUER_URL

# Verify Keycloak issuer
curl http://localhost:8080/realms/master/.well-known/openid-configuration | jq '.issuer'
```

### Issue: Impersonation not working

**Cause**: Impersonation not enabled or ark-api lacks impersonation permissions

**Solution**:
```bash
# Verify impersonation env vars
kubectl get deployment ark-api -n ark-system -o yaml | grep IMPERSONATION

# Verify ark-api service account has impersonation permissions
kubectl describe clusterrole ark-api-role | grep -A 5 "users.*groups"
```

---

## Expected Test Results

✅ **Pass Criteria:**
- All viewer read operations return 200 OK
- All viewer write operations return 403 Forbidden
- All admin operations return 200/201/204
- No-access user operations return 403 Forbidden
- Header injection attempts return 403 Forbidden
- Error messages clearly indicate permission issues

❌ **Fail Criteria:**
- Viewer can perform write operations
- Admin operations are denied
- Client can inject impersonation headers
- Error messages are unclear or missing user context

---

## Next Steps

After validating RBAC at the API layer:

1. **Dashboard Testing**: Test RBAC enforcement in the UI with SSO login
2. **Multi-Namespace Testing**: Verify namespace isolation works correctly
3. **Performance Testing**: Measure impact of impersonation on API latency
4. **Migration Testing**: Test fallback mode for gradual RBAC rollout
5. **Audit Logging**: Verify impersonated user actions are logged correctly

---

## References

- [Authentication Documentation](../../../docs/content/developer-guide/authentication.mdx)
- [RBAC Specification](../../../openspec/specs/ark-api-rbac/spec.md)
- [Sample RBAC Bindings](../../../samples/rbac-test-bindings.yaml)
- [PR #2066: K8s User Impersonation](https://github.com/mckinsey/agents-at-scale-ark/pull/2066)
