# ARK API

FastAPI-based REST interface for managing ARK Kubernetes resources.

## Quickstart
```bash
make help               # Show available commands
make ark-api-install    # Setup dependencies
make ark-api-dev        # Run in development mode
```

## Authentication

The ARK API supports multiple authentication modes for different use cases:

### Authentication Modes

```bash
# Authentication Mode Configuration
AUTH_MODE=sso           # OIDC/JWT authentication only (users via dashboard)
AUTH_MODE=basic         # API key basic auth only (service-to-service)
AUTH_MODE=hybrid        # Both OIDC and API key auth (recommended for production)
AUTH_MODE=open          # No authentication (development only)
```

### OIDC/JWT Authentication (Users)

For interactive dashboard access and user-based API calls:

```bash
# OIDC Configuration
OIDC_ISSUER_URL=https://your-oidc-provider.com/realms/your-realm
OIDC_APPLICATION_ID=your-app-id
```

**Usage:**
```bash
# Via dashboard proxy (automatic)
curl -H "Authorization: Bearer <jwt-token>" https://dashboard.example.com/api/v1/agents

# Direct API call
curl -H "Authorization: Bearer <jwt-token>" https://ark-api.example.com/v1/agents
```

### API Key Authentication (Service-to-Service)

For programmatic access and service-to-service communication. **API keys are stored per-namespace for tenant isolation.**

**Creating API Keys:**
```bash
# Create an API key in the current namespace
curl -X POST https://ark-api.example.com/v1/api-keys \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Service Key", "expires_at": "2024-12-31T23:59:59Z"}'
```

**Response:**
```json
{
  "id": "abc123",
  "name": "My Service Key",
  "public_key": "pk-ark-abcd1234...",
  "secret_key": "sk-ark-efgh5678...",
  "created_at": "2024-01-01T00:00:00Z",
  "expires_at": "2024-12-31T23:59:59Z"
}
```

**Using API Keys:**
```bash
# Basic authentication with public/secret key pair
curl -u pk-ark-abcd1234...:sk-ark-efgh5678... \
  https://ark-api.example.com/v1/agents

# Or with explicit basic auth header
curl -H "Authorization: Basic <base64(public_key:secret_key)>" \
  https://ark-api.example.com/v1/agents
```

**Note:** API keys are namespace-scoped and stored in the current namespace only. You must authenticate against the ARK API instance in the same namespace where the API key was created.

### API Key Management

```bash
# List API keys in current namespace (secrets not shown)
GET /v1/api-keys

# Create API key in current namespace
POST /v1/api-keys
{
  "name": "Service Key",
  "expires_at": "2024-12-31T23:59:59Z"  // Optional
}

# Delete API key (soft delete) from current namespace
DELETE /v1/api-keys/{public_key}
```

### Environment Variables

```bash
# OIDC Configuration (for JWT auth)
OIDC_ISSUER_URL=https://your-oidc-provider.com/realms/your-realm
OIDC_APPLICATION_ID=your-app-id

# Authentication Mode
AUTH_MODE=hybrid        # Recommended: support both JWT and API keys
AUTH_MODE=sso           # JWT only
AUTH_MODE=basic         # API keys only  
AUTH_MODE=open          # No auth (development)
```

**Note**: API keys are stored per-namespace for tenant isolation. Each namespace has its own set of API keys stored as Kubernetes secrets. The RBAC configuration grants the service account permissions to access secrets only in its deployment namespace, ensuring true multi-tenant isolation.

### AUTH_MODE Behavior

- **`AUTH_MODE=sso`**: OIDC/JWT authentication **only**
  - Dashboard users can access API via JWT tokens
  - Service-to-service calls must use JWT tokens
  - API key endpoints are available but require JWT

- **`AUTH_MODE=basic`**: API key authentication **only**
  - Only API key basic auth is accepted
  - Dashboard integration requires API keys
  - OIDC configuration is ignored

- **`AUTH_MODE=hybrid`** (recommended): **Both** OIDC and API key auth
  - Dashboard users authenticate via OIDC/JWT
  - Services can use API keys for programmatic access
  - Provides maximum flexibility

- **`AUTH_MODE=open`**: **No authentication** (development only)
  - All routes are accessible without authentication
  - Use only for development and testing

**⚠️ Invalid Values**: If `AUTH_MODE` is set to an invalid value (not `sso`, `basic`, `hybrid`, or `open`), it will automatically default to `open` for development safety. A warning will be logged when this occurs.

### Security Considerations

- **API Key Storage**: API keys are stored as Kubernetes secrets with bcrypt-hashed secret keys
- **Namespace Isolation**: API keys are namespace-scoped for multi-tenant security
- **Tenant Isolation**: Each tenant's API keys are isolated (cannot access other tenants' keys)
- **Kubernetes RBAC**: Service accounts only have permissions within their deployment namespace
- **Expiration**: API keys can have optional expiration dates
- **Last Used Tracking**: API key usage is tracked with last-used timestamps
- **Soft Delete**: API keys are soft-deleted (marked inactive) for audit trails

### Public Routes

These routes are always accessible without authentication:
- `/health`, `/ready`, `/docs`, `/openapi.json`, `/redoc`

### Local Development

Create `.env` file in `services/ark-api/ark-api/`:
```bash
# For OIDC development
OIDC_ISSUER_URL=https://your-oidc-provider.com/realms/your-realm
OIDC_APPLICATION_ID=your-application-id
AUTH_MODE=hybrid

# For development without auth
AUTH_MODE=open
```

## Usage

For detailed usage examples including API key authentication, JWT authentication, and code examples in multiple languages, see the [Authentication Guide](../../docs/content/developer-guide/authentication.mdx).

## Notes
- Requires Python 3.11+ and uv package manager
- Run commands from repository root directory
- Provides bridge between client apps and Kubernetes API