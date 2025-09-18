# Basic Authentication - Manual Testing Guide

This guide provides step-by-step instructions for manually testing the ARK basic authentication system.

## Prerequisites

- ARK API deployed and running
- `kubectl` access to the Kubernetes cluster
- `curl` or HTTP client tool
- ARK Dashboard access (optional)

## Authentication Modes

ARK supports four authentication modes (set via `AUTH_MODE` environment variable):

| Mode | Description | JWT Auth | API Key Auth |
|------|-------------|----------|--------------|
| `sso` | OIDC/JWT only | ✅ | ❌ |
| `basic` | API key only | ❌ | ✅ |
| `hybrid` | Both methods | ✅ | ✅ |
| `open` | No authentication | ❌ | ❌ |

## 1. Environment Setup

### Check Current Auth Mode
```bash
# Get the current AUTH_MODE setting
kubectl get deployment ark-api -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="AUTH_MODE")].value}'

# Or check the running pod
kubectl get pods -l app.kubernetes.io/name=ark -o jsonpath='{.items[0].spec.containers[0].env[?(@.name=="AUTH_MODE")].value}'
```

### Change Auth Mode (if needed)
```bash
# Set to hybrid mode (supports both JWT and API keys)
kubectl set env deployment/ark-api AUTH_MODE=hybrid

# Wait for deployment to restart
kubectl rollout status deployment/ark-api
```

## 2. API Key Management Testing

### 2.1 Create an API Key

**Request:**
```bash
curl -X POST "http://localhost:8000/v1/api-keys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Test Service Key",
    "expires_at": "2025-12-31T23:59:59Z"
  }'
```

**Expected Response:**
```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "name": "Test Service Key",
  "public_key": "pk-ark-...",
  "secret_key": "sk-ark-...",
  "created_at": "2024-01-15T10:30:00Z",
  "expires_at": "2025-12-31T23:59:59Z"
}
```

> ⚠️ **Important**: The `secret_key` is only shown once during creation. Save it securely!

### 2.2 List API Keys

**Request:**
```bash
curl -X GET "http://localhost:8000/v1/api-keys" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "items": [
    {
      "id": "01234567-89ab-cdef-0123-456789abcdef",
      "name": "Test Service Key",
      "public_key": "pk-ark-...",
      "created_at": "2024-01-15T10:30:00Z",
      "last_used_at": null,
      "expires_at": "2025-12-31T23:59:59Z",
      "is_active": true
    }
  ],
  "count": 1
}
```

### 2.3 Delete an API Key (Soft Delete)

**Request:**
```bash
curl -X DELETE "http://localhost:8000/v1/api-keys/pk-ark-..." \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```
HTTP 204 No Content
```

## 3. Authentication Testing

### 3.1 Test API Key Authentication

Using the API key created above:

**Request:**
```bash
# Using Basic Auth with API key
curl -X GET "http://localhost:8000/v1/models" \
  -H "Authorization: Basic $(echo -n 'pk-ark-...:sk-ark-...' | base64)"

# Or using curl's built-in basic auth
curl -X GET "http://localhost:8000/v1/models" \
  --user "pk-ark-...:sk-ark-..."
```

**Expected Response:**
```json
{
  "models": [...],
  "count": 5
}
```

### 3.2 Test JWT Authentication

**Request:**
```bash
curl -X GET "http://localhost:8000/v1/models" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3.3 Test Authentication Failures

**Missing Authorization Header:**
```bash
curl -X GET "http://localhost:8000/v1/models"
```
Expected: `HTTP 401 - Missing authorization header`

**Invalid API Key:**
```bash
curl -X GET "http://localhost:8000/v1/models" \
  --user "invalid-key:invalid-secret"
```
Expected: `HTTP 401 - Invalid API key credentials`

**Wrong Auth Format:**
```bash
curl -X GET "http://localhost:8000/v1/models" \
  -H "Authorization: Invalid format"
```
Expected: `HTTP 401 - Invalid authorization header`

### 3.4 Test Public Endpoints (No Auth Required)

**Health Check:**
```bash
curl -X GET "http://localhost:8000/health"
```
Expected: `HTTP 200 - {"status": "healthy"}`

**API Documentation:**
```bash
curl -X GET "http://localhost:8000/docs"
```
Expected: `HTTP 200 - Swagger UI HTML`

## 4. Inspecting Stored API Keys

### 4.1 Kubernetes Secrets (ARK's Storage Backend)

ARK stores API keys as Kubernetes Secrets, not in a traditional database like PostgreSQL.

**List API Key Secrets:**
```bash
# List all API key secrets
kubectl get secrets -l app.kubernetes.io/component=api-key -n ark-system

# Or list all secrets and filter
kubectl get secrets -n ark-system | grep api-key
```

**Inspect a Specific API Key Secret:**
```bash
# Get the secret details (base64 encoded)
kubectl get secret api-key-01234567 -n ark-system -o yaml

# Decode the secret data
kubectl get secret api-key-01234567 -n ark-system -o jsonpath='{.data}' | jq -r 'to_entries[] | "\(.key): \(.value | @base64d)"'
```

**Example Secret Structure:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: api-key-01234567-89ab-cdef-0123-456789abcdef
  namespace: ark-system
  labels:
    app.kubernetes.io/component: api-key
    app.kubernetes.io/managed-by: ark-api
data:
  id: MDEyMzQ1NjctODlhYi1jZGVmLTAxMjMtNDU2Nzg5YWJjZGVm  # base64 encoded
  name: VGVzdCBTZXJ2aWNlIEtleQ==  # base64: "Test Service Key"
  public_key: cGstYXJrLS4uLg==  # base64: "pk-ark-..."
  secret_key_hash: JDJiJDEyJC4uLg==  # base64: bcrypt hash
  created_at: MjAyNC0wMS0xNVQxMDozMDowMFo=  # base64: ISO timestamp
  expires_at: MjAyNS0xMi0zMVQyMzo1OTo1OVo=  # base64: ISO timestamp
  is_active: dHJ1ZQ==  # base64: "true"
  user_id: ""  # base64: empty (global keys)
```

### 4.2 Kubernetes Dashboard/Lens

If you're using a Kubernetes dashboard or Lens:

1. Navigate to **Secrets** in the `ark-system` namespace
2. Filter by label: `app.kubernetes.io/component=api-key`
3. Click on any API key secret to view its details
4. Use the "Decode" option to view base64-decoded values

### 4.3 Debug API Key Service

**Check API Key Service Logs:**
```bash
# Get API key service logs
kubectl logs -l app.kubernetes.io/name=ark -c ark-api -n ark-system --tail=100

# Follow logs in real-time
kubectl logs -l app.kubernetes.io/name=ark -c ark-api -n ark-system -f
```

**Test API Key Validation:**
```bash
# Check if the API key service can read secrets
kubectl exec -it deployment/ark-api -n ark-system -- python3 -c "
from ark_api.services.api_keys import APIKeyService
import asyncio

async def test():
    service = APIKeyService()
    keys = await service.list_api_keys()
    print(f'Found {len(keys.items)} API keys')
    for key in keys.items:
        print(f'- {key.name}: {key.public_key}')

asyncio.run(test())
"
```

## 5. Database-Style Querying (Alternative Approach)

If you prefer a database-like interface for inspecting Kubernetes resources:

### 5.1 Using kubectl with jq (JSON Queries)

**Query all API keys like a database:**
```bash
# Get all API keys in table format
kubectl get secrets -n ark-system -l app.kubernetes.io/component=api-key -o json | \
  jq -r '.items[] | {
    name: .metadata.name,
    key_name: (.data.name | @base64d),
    public_key: (.data.public_key | @base64d),
    created_at: (.data.created_at | @base64d),
    expires_at: (.data.expires_at | @base64d),
    is_active: (.data.is_active | @base64d)
  }'
```

**Count active API keys:**
```bash
kubectl get secrets -n ark-system -l app.kubernetes.io/component=api-key -o json | \
  jq '[.items[] | select((.data.is_active | @base64d) == "true")] | length'
```

**Find API keys by name pattern:**
```bash
kubectl get secrets -n ark-system -l app.kubernetes.io/component=api-key -o json | \
  jq -r '.items[] | select((.data.name | @base64d) | contains("Test")) | (.data.name | @base64d)'
```

### 5.2 Using k9s (Terminal UI)

1. Install k9s: `brew install k9s` (macOS) or download from releases
2. Run: `k9s -n ark-system`
3. Type `:secrets` to view secrets
4. Filter with `/api-key` to show only API key secrets
5. Press `Enter` to view secret details
6. Press `d` to decode base64 values

## 6. Testing Different Scenarios

### 6.1 Expiration Testing

**Create expired key:**
```bash
curl -X POST "http://localhost:8000/v1/api-keys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Expired Test Key",
    "expires_at": "2020-01-01T00:00:00Z"
  }'
```

**Test with expired key:**
```bash
curl -X GET "http://localhost:8000/v1/models" \
  --user "pk-ark-expired:sk-ark-expired"
```
Expected: `HTTP 401 - API key has expired`

### 6.2 Soft Delete Testing

**Delete a key:**
```bash
curl -X DELETE "http://localhost:8000/v1/api-keys/pk-ark-..." \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Try to use deleted key:**
```bash
curl -X GET "http://localhost:8000/v1/models" \
  --user "pk-ark-deleted:sk-ark-deleted"
```
Expected: `HTTP 401 - Invalid API key credentials`

**Verify key is marked inactive in Kubernetes:**
```bash
kubectl get secret api-key-... -n ark-system -o jsonpath='{.data.is_active}' | base64 -d
```
Expected: `false`

## 7. Load Testing

### 7.1 Simple Load Test

**Create multiple concurrent requests:**
```bash
# Create a script for load testing
cat << 'EOF' > test_load.sh
#!/bin/bash
for i in {1..10}; do
  curl -X GET "http://localhost:8000/v1/models" \
    --user "pk-ark-...:sk-ark-..." \
    --silent --output /dev/null \
    --write-out "Request $i: %{http_code} - %{time_total}s\n" &
done
wait
EOF

chmod +x test_load.sh
./test_load.sh
```

### 7.2 Monitor Performance

**Watch API key usage updates:**
```bash
# Monitor last_used_at updates
watch -n 2 'kubectl get secret api-key-... -n ark-system -o jsonpath="{.data.last_used_at}" | base64 -d'
```

## 8. Troubleshooting

### Common Issues and Solutions

**Issue: `AUTH_MODE` not recognized**
```bash
# Check if environment variable is set correctly
kubectl get deployment ark-api -o jsonpath='{.spec.template.spec.containers[0].env}'
```

**Issue: API keys not persisting**
```bash
# Check if ark-system namespace exists
kubectl get namespace ark-system

# Check RBAC permissions
kubectl auth can-i create secrets --as=system:serviceaccount:ark-system:ark-api -n ark-system
```

**Issue: Authentication always fails**
```bash
# Check middleware logs
kubectl logs -l app.kubernetes.io/name=ark -c ark-api --tail=50 | grep -i auth
```

## 9. Cleanup

**Remove test API keys:**
```bash
# Delete all test API keys
kubectl delete secrets -l app.kubernetes.io/component=api-key -n ark-system

# Or delete specific test keys
kubectl delete secret api-key-01234567-89ab-cdef-0123-456789abcdef -n ark-system
```

---

## Summary

This manual testing guide covers:
- ✅ API key CRUD operations
- ✅ Authentication testing (JWT + API keys)
- ✅ Kubernetes Secrets inspection (ARK's "database")
- ✅ Error scenario testing
- ✅ Performance monitoring
- ✅ Troubleshooting guide

**Key Difference from Traditional Databases:**
ARK uses **Kubernetes Secrets** instead of PostgreSQL/MySQL. Use `kubectl` commands and Kubernetes tools (k9s, Lens, dashboard) instead of database clients like DBeaver.
