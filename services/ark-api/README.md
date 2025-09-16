# ARK API

FastAPI-based REST interface for managing ARK Kubernetes resources.

## Quickstart
```bash
make help               # Show available commands
make ark-api-install    # Setup dependencies
make ark-api-dev        # Run in development mode
```

## Authentication

The ARK API uses OIDC/JWT-based authentication with automatic token validation.

### Environment Variables

```bash
# OIDC Configuration
OIDC_ISSUER_URL=https://your-oidc-provider.com/realms/your-realm
OIDC_APPLICATION_ID=your-app-id

# Authentication Mode
AUTH_MODE=sso           # Enable OIDC authentication (production)
AUTH_MODE=open          # Disable authentication (development)
# Any other value also disables authentication
```

### AUTH_MODE Behavior

The `AUTH_MODE` environment variable controls authentication behavior:

- **`AUTH_MODE=sso`** (case insensitive): Authentication **required** (if OIDC config is available)
  - All protected routes require valid JWT tokens
  - Invalid or missing tokens return 401 Unauthorized
  - Requires `OIDC_ISSUER_URL` and `OIDC_APPLICATION_ID` to be configured
  - Use for production environments

- **`AUTH_MODE=open`** or any other value: Authentication **disabled**
  - All routes are accessible without authentication
  - Use for development and testing
  - Default behavior when AUTH_MODE is not set

- **Missing OIDC configuration**: Authentication **disabled** (even with `AUTH_MODE=sso`)
  - If `OIDC_ISSUER_URL` or `OIDC_APPLICATION_ID` are not configured, authentication is skipped
  - This prevents authentication errors when OIDC is not properly set up

### Public Routes
- `/health`, `/ready`, `/docs`, `/openapi.json`, `/redoc`

### Local Development
Create `.env` file in `services/ark-api/ark-api/`:
```bash
OIDC_ISSUER_URL=https://your-oidc-provider.com/realms/your-realm
OIDC_APPLICATION_ID=your-application-id
AUTH_MODE=open
```

## Notes
- Requires Python 3.11+ and uv package manager
- Run commands from repository root directory
- Provides bridge between client apps and Kubernetes API