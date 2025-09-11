# Authentication Configuration

The ARK API uses OIDC/JWT-based authentication with automatic token validation using JWKS (JSON Web Key Set).

## Environment Variables

Configure the following environment variables for OIDC/JWT authentication:

```bash
# Required OIDC Configuration
ARK_OKTA_ISSUER=https://your-oidc-provider.com/realms/your-realm
ARK_OKTA_AUDIENCE=your-client-id

# Optional Configuration
ARK_JWT_ALGORITHM=RS256  # Default: RS256
ARK_SKIP_AUTH=true       # Development only - skips authentication
```

**Note**: The JWKS URL is automatically derived from `ARK_OKTA_ISSUER/.well-known/jwks.json`

## How It Works

1. **Token Extraction**: The middleware extracts the `Authorization: Bearer <token>` header
2. **JWKS Validation**: Uses the JWKS URL to fetch and validate the JWT signature
3. **Claims Validation**: Validates issuer, audience, and expiration claims
4. **Route Protection**: All routes are protected by default except those in `PUBLIC_ROUTES`

## Public Routes

The following routes are exempt from authentication:
- `/health`
- `/ready`
- `/docs`
- `/openapi.json`
- `/redoc`
- `/openai/v1/models`
- `/openai/v1/chat/completions`

## Example Configuration

For Keycloak:
```bash
ARK_OKTA_ISSUER=https://keycloak.example.com/realms/my-realm
ARK_OKTA_AUDIENCE=ark-api-client
```

For Auth0:
```bash
ARK_OKTA_ISSUER=https://your-domain.auth0.com
ARK_OKTA_AUDIENCE=https://api.ark.example.com
```

For Okta:
```bash
ARK_OKTA_ISSUER=https://your-domain.okta.com/oauth2/default
ARK_OKTA_AUDIENCE=your-client-id
```
