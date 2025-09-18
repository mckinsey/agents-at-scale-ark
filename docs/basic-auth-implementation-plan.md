# Basic Authentication Implementation Plan for ARK

## Overview

Implement basic authentication for ARK API to enable service-to-service communication using public/secret key pairs. This will provide a simple authentication method for programmatic access while maintaining existing OIDC/JWT authentication for dashboard users.

## Business Requirements

- **Service-to-Service Auth**: Enable programmatic access to ARK APIs without requiring OIDC flows
- **Security**: Secure storage and validation of API keys with proper encryption
- **Flexibility**: Support both existing JWT and new basic auth methods
- **Management**: Provide API endpoints for creating, listing, and revoking API keys

## Technical Requirements

### Key Format
- Public keys: `pk-ark-{random-string}` 
- Secret keys: `sk-ark-{random-string}`
- Clear distinction between public and secret keys

### Authentication Modes
- `AUTH_MODE=sso`: OIDC/JWT only (current behavior)
- `AUTH_MODE=basic`: API key basic auth only
- `AUTH_MODE=hybrid`: Both OIDC and basic auth (recommended)
- `AUTH_MODE=open`: No authentication (development)

### Storage Requirements
- Use existing Kubernetes infrastructure (secrets)
- Store globally in ark-system namespace (no namespace access restrictions)
- bcrypt hash secret keys (never store plaintext)
- Support optional expiration dates
- Track last used timestamps  
- Support soft delete (mark as inactive instead of hard delete)
- No scoping restrictions (global access to all ARK APIs)

## Implementation Tasks

### Phase 1: Core Infrastructure (Backend)

#### Task 1.1: API Key Models
**File**: `services/ark-api/ark-api/src/ark_api/models/auth.py` (new file)
- [ ] Create new auth models module
- [ ] Add `APIKeyCreateRequest` model
- [ ] Add `APIKeyResponse` model (without secret)
- [ ] Add `APIKeyCreateResponse` model (with secret, only on creation)
- [ ] Add `APIKeyListResponse` model
- [ ] Include datetime fields: `created_at`, `expires_at`, `last_used_at`
- [ ] Add `is_active` field for soft delete support

#### Task 1.2: API Key Service
**File**: `services/ark-api/ark-api/src/ark_api/services/api_keys.py`
- [ ] Create `APIKeyService` class
- [ ] Implement key pair generation (pk-ark-*, sk-ark-*)
- [ ] Implement bcrypt secret key hashing
- [ ] Implement Kubernetes secret storage with proper labels/annotations
- [ ] Implement key verification and validation
- [ ] Implement expiration checking
- [ ] Implement last-used timestamp updates
- [ ] Support key listing and soft deletion (mark as inactive)

**Storage Schema** (Kubernetes Secret):
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: api-key-{key-suffix}
  namespace: ark-system  # Global storage, no namespace restrictions for usage
  labels:
    ark.mckinsey.com/api-key: "true"
  annotations:
    ark.mckinsey.com/api-key-name: "User-friendly name"
    ark.mckinsey.com/created-at: "2024-01-01T00:00:00Z"
    ark.mckinsey.com/expires-at: "2024-12-31T23:59:59Z"  # Optional
    ark.mckinsey.com/last-used-at: "2024-06-01T12:00:00Z"
    ark.mckinsey.com/deleted-at: "2024-06-01T12:00:00Z"  # Optional, for soft delete
type: ark.mckinsey.com/api-key
data:
  public_key: {base64-encoded-public-key}
  secret_key_hash: {base64-encoded-bcrypt-hash}
  is_active: {base64-encoded-boolean}  # false for soft-deleted keys
```

#### Task 1.3: Basic Auth SDK Support
**File**: `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/auth/basic.py`
- [ ] Create `BasicAuthValidator` class
- [ ] Implement `parse_basic_auth_header()` method
- [ ] Implement `create_basic_auth_header()` method
- [ ] Add base64 encoding/decoding for credentials

**File**: `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/auth/__init__.py`
- [ ] Export `BasicAuthValidator` class

#### Task 1.4: Enhanced Auth Middleware
**File**: `services/ark-api/ark-api/src/ark_api/auth/middleware.py`
- [ ] Extend `AuthMiddleware` to support multiple auth modes
- [ ] Add basic auth header parsing and validation
- [ ] Integrate with `APIKeyService` for credential verification
- [ ] Support `AUTH_MODE` configuration (sso/basic/hybrid/open)
- [ ] Maintain backward compatibility with JWT validation
- [ ] Add request context for API key info

#### Task 1.5: Route Configuration
**File**: `services/ark-api/ark-api/src/ark_api/auth/config.py`
- [ ] Update route authentication logic for hybrid auth support
- [ ] Ensure API key management endpoints require authentication (either JWT or API key)
- [ ] No special JWT-only restrictions needed

### Phase 2: API Endpoints

#### Task 2.1: API Key Management Endpoints
**File**: `services/ark-api/ark-api/src/ark_api/api/v1/api_keys.py`
- [ ] `POST /v1/api-keys` - Create new API key
- [ ] `GET /v1/api-keys` - List active API keys (without secrets, exclude soft-deleted)
- [ ] `DELETE /v1/api-keys/{public_key}` - Soft delete API key (mark as inactive)
- [ ] Require authentication for all endpoints (JWT or API key both acceptable)
- [ ] Add proper error handling and logging
- [ ] Filter out soft-deleted keys from listing

**File**: `services/ark-api/ark-api/src/ark_api/api/v1/__init__.py`
- [ ] Include API key router in main router

### Phase 3: Configuration & Environment

#### Task 3.1: Environment Variables
- [ ] Document `AUTH_MODE` options in README
- [ ] Add `API_KEY_NAMESPACE` configuration for storage location (default: ark-system)
- [ ] Update Helm chart values to support new auth modes

#### Task 3.2: Dependencies
**File**: `services/ark-api/ark-api/pyproject.toml`
- [ ] Add `bcrypt` dependency for password hashing
- [ ] Ensure `base64` is available (built-in)

### Phase 4: Testing & Documentation

#### Task 4.1: Unit Tests
**File**: `services/ark-api/ark-api/tests/services/test_api_keys.py`
- [ ] Test key pair generation
- [ ] Test secret key hashing and verification
- [ ] Test Kubernetes secret storage/retrieval
- [ ] Test key expiration logic
- [ ] Test key verification flow

#### Task 4.2: API Endpoint Tests
**File**: `services/ark-api/ark-api/tests/api/test_api_keys.py`
- [ ] Test API key creation endpoint with mocked service
- [ ] Test API key listing endpoint
- [ ] Test API key deletion endpoint 
- [ ] Test error handling and validation

#### Task 4.3: Documentation Updates
**File**: `services/ark-api/README.md`
- [ ] Document new authentication modes
- [ ] Add usage examples for API keys
- [ ] Document environment variables
- [ ] Add curl and Python SDK examples


## Usage Examples

### Creating API Keys
```bash
# Via API (requires JWT token)
curl -X POST https://ark-api.example.com/v1/api-keys \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Service Key", "expires_at": "2024-12-31T23:59:59Z"}'
```

### Using API Keys
```bash
# Basic authentication
curl -u pk-ark-xxxxx:sk-ark-xxxxx \
  https://ark-api.example.com/v1/agents

# Python with requests
import requests
from requests.auth import HTTPBasicAuth

response = requests.get(
    "https://ark-api.example.com/v1/agents",
    auth=HTTPBasicAuth("pk-ark-xxxxx", "sk-ark-xxxxx")
)
```

## Security Considerations

- **Secret Storage**: Secret keys are bcrypt-hashed, never stored in plaintext
- **Key Rotation**: Keys can be deleted and recreated as needed
- **Expiration**: Optional expiration dates for automatic key invalidation
- **Audit Trail**: Last-used timestamps for monitoring key usage
- **Global Access**: API keys provide global access to ARK APIs (no namespace restrictions)
- **Rate Limiting**: Existing rate limiting applies to API key requests

## Deployment Strategy

1. **Backward Compatibility**: Existing JWT authentication continues to work unchanged
2. **Gradual Rollout**: Deploy with `AUTH_MODE=hybrid` to support both methods
3. **Migration Path**: Services can migrate from JWT to API keys at their own pace
4. **Configuration**: Use environment variables for easy configuration changes

## Acceptance Criteria

- [ ] API keys can be created via REST API
- [ ] API keys can be used for basic authentication on all ARK API endpoints
- [ ] Secret keys are securely hashed and stored in Kubernetes secrets
- [ ] Both JWT and API key authentication work simultaneously in hybrid mode
- [ ] API keys can be listed and deleted via REST API
- [ ] Expired API keys are automatically rejected
- [ ] Last-used timestamps are updated on successful authentication
- [ ] Comprehensive documentation and usage examples provided
- [ ] Unit tests cover all functionality following ARK testing patterns

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing auth | High | Maintain backward compatibility, test thoroughly |
| Security vulnerabilities | High | Use bcrypt hashing, follow security best practices |
| Performance impact | Medium | Efficient key lookup, caching if needed |
| Storage scalability | Low | Kubernetes secrets scale well, monitor usage |

## Dependencies

- **External**: bcrypt library for password hashing
- **Internal**: Existing Kubernetes secret management
- **Infrastructure**: Kubernetes cluster with RBAC for secret access
