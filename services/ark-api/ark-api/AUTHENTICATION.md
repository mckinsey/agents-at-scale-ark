# Authentication Configuration

The ARK API uses OIDC/JWT-based authentication with automatic token validation using JWKS (JSON Web Key Set).

## Environment Variables

Configure the following environment variables for OIDC/JWT authentication:

```bash
# Required OIDC Configuration
ARK_OKTA_ISSUER=https://your-oidc-provider.com/realms/your-realm
OIDC_APPLICATION_ID=your-app-id     # Primary OIDC application ID
OIDC_CLIENT_ID=your-client-id       # Alternative/fallback client ID
ARK_OKTA_AUDIENCE=your-client-id    # For ark_sdk compatibility

# Optional Configuration
ARK_JWT_ALGORITHM=RS256  # Default: RS256
ARK_SKIP_AUTH=true       # Development only - skips authentication
```

**Note**: `OIDC_APPLICATION_ID` is used as the primary app_id for JWT validation. If not set, it falls back to `OIDC_CLIENT_ID`. The JWT token's `aud` (audience) claim is validated against this app_id value, matching your existing authentication system.

**Note**: The JWKS URL is automatically derived from `ARK_OKTA_ISSUER/.well-known/jwks.json`

## How It Works

1. **Token Extraction**: The middleware extracts the `Authorization: Bearer <token>` header
2. **JWKS Validation**: Uses the JWKS URL to fetch and validate the JWT signature
3. **App ID Validation**: Validates the token's audience claim against the configured app_id
4. **Route Protection**: All routes are protected by default except those in `PUBLIC_ROUTES`

### App ID Based Authentication

This implementation matches your existing authentication system:

- **App ID as Audience**: Uses `OIDC_APPLICATION_ID` as the audience for JWT validation
- **Direct JWKS Integration**: Uses `pyjwt_key_fetcher` directly for better control
- **Consistent with Existing Code**: Follows the same pattern as your `SSOAuthBackend`

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
OIDC_APPLICATION_ID=ark-api-client  # Application ID from Keycloak
OIDC_CLIENT_ID=ark-api-client       # Same value for fallback
```

For Auth0:
```bash
ARK_OKTA_ISSUER=https://your-domain.auth0.com
OIDC_APPLICATION_ID=your-auth0-client-id  # Application ID from Auth0
OIDC_CLIENT_ID=your-auth0-client-id       # Same value for fallback
```

For Okta:
```bash
ARK_OKTA_ISSUER=https://your-domain.okta.com/oauth2/default
OIDC_APPLICATION_ID=your-okta-client-id  # Application ID from Okta
OIDC_CLIENT_ID=your-okta-client-id       # Same value for fallback
```
