# Authentication Configuration

The ARK API uses OIDC/JWT-based authentication with automatic token validation using JWKS (JSON Web Key Set).

## Overview

The ARK API uses a flexible JWT authentication system that validates tokens based on:
- **App ID**: Used as the audience (`aud`) claim for JWT validation
- **Issuer URL**: Used to fetch JWKS keys and validate the token issuer
- **JWKS**: Automatically derived from the issuer URL for signature verification

This approach matches your existing authentication system and provides compatibility with various OIDC providers.

## Environment Variables

Configure the following environment variables for OIDC/JWT authentication:

```bash
# Required OIDC Configuration
ARK_OIDC_ISSUER=https://your-oidc-provider.com/realms/your-realm
ARK_OIDC_APPLICATION_ID=your-app-id     # OIDC application ID (used as audience)

# Optional Configuration
ARK_JWT_ALGORITHM=RS256  # Default: RS256
ARK_SKIP_AUTH=true       # Development only - skips authentication
```

**Note**: `ARK_OIDC_APPLICATION_ID` is used as the app_id for JWT validation. The JWT token's `aud` (audience) claim is validated against this app_id value, matching your existing authentication system.

**Note**: The JWKS URL is automatically derived from `ARK_OIDC_ISSUER/.well-known/jwks.json`

## How It Works

1. **Token Extraction**: The middleware extracts the `Authorization: Bearer <token>` header
2. **JWKS Validation**: Uses the JWKS URL to fetch and validate the JWT signature
3. **App ID Validation**: Validates the token's audience claim against the configured app_id
4. **Route Protection**: All routes are protected by default except those in `PUBLIC_ROUTES`

### App ID Based Authentication

This implementation matches your existing authentication system:

- **App ID as Audience**: Uses `ARK_OIDC_APPLICATION_ID` as the audience for JWT validation
- **Direct JWKS Integration**: Uses `pyjwt_key_fetcher` directly for better control
- **Consistent with Existing Code**: Follows the same pattern as your `SSOAuthBackend`

### Token Validation

The authentication uses the `validate_token` function from the ark-sdk that:

```python
# Validates JWT tokens using app_id and issuer_url
token_data = jwt.decode(
    token, 
    verify=True, 
    audience=self.app_id,  # Uses ARK_OIDC_APPLICATION_ID
    **key_entry
)
```

**Key Features**:
- Validates JWT signature using JWKS from the issuer
- Validates audience claim against the configured app_id
- Handles token expiration and issuer validation
- Provides detailed logging for debugging

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
ARK_OIDC_ISSUER=https://keycloak.example.com/realms/my-realm
ARK_OIDC_APPLICATION_ID=ark-api-client  # Application ID from Keycloak
```

For Auth0:
```bash
ARK_OIDC_ISSUER=https://your-domain.auth0.com
ARK_OIDC_APPLICATION_ID=your-auth0-client-id  # Application ID from Auth0
```

For Okta:
```bash
ARK_OIDC_ISSUER=https://your-domain.okta.com/oauth2/default
ARK_OIDC_APPLICATION_ID=your-okta-client-id  # Application ID from Okta
```
