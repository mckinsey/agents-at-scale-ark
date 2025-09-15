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
ARK_OIDC_ISSUER=https://your-oidc-provider.com/realms/your-realm
ARK_OIDC_APPLICATION_ID=your-app-id

# Authentication Mode
AUTH_MODE=sso           # Enable OIDC authentication (production)
AUTH_MODE=open          # Disable authentication (development)
# Any other value also disables authentication
```

### AUTH_MODE Behavior

The `AUTH_MODE` environment variable controls authentication behavior:

- **`AUTH_MODE=sso`** (case insensitive): Authentication **required**
  - All protected routes require valid JWT tokens
  - Invalid or missing tokens return 401 Unauthorized
  - Use for production environments

- **`AUTH_MODE=open`** or any other value: Authentication **disabled**
  - All routes are accessible without authentication
  - Use for development and testing
  - Default behavior when AUTH_MODE is not set

### Public Routes
- `/health`, `/ready`, `/docs`, `/openapi.json`, `/redoc`
- `/openai/v1/models`, `/openai/v1/chat/completions`

### Local Development
Create `.env` file in `services/ark-api/ark-api/`:
```bash
ARK_OIDC_ISSUER=https://your-oidc-provider.com/realms/your-realm
ARK_OIDC_APPLICATION_ID=your-application-id
AUTH_MODE=open
```

## Notes
- Requires Python 3.11+ and uv package manager
- Run commands from repository root directory
- Provides bridge between client apps and Kubernetes API