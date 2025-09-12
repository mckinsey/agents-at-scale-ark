s# Authentication Configuration for CI/CD Pipeline

This document explains how to configure authentication environment variables for the ARK API service in the CI/CD pipeline.

## GitHub Secrets Setup

To enable authentication in the CI/CD pipeline, you need to set up the following GitHub secrets in your repository:

### Required Secrets

1. **`ARK_OIDC_ISSUER`** (Optional)
   - **Description**: The OIDC issuer URL for token validation
   - **Default**: `https://your-oidc-provider.com/auth/realms/your-realm`
   - **Example**: `https://your-auth-provider.com/auth/realms/your-realm`

2. **`ARK_OIDC_APPLICATION_ID`** (Optional)
   - **Description**: The application ID (audience) for token validation
   - **Default**: `your-application-id`
   - **Example**: `your-application-id`

### How to Set GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with the appropriate name and value

### Fallback Values

If the secrets are not set, the pipeline will use the following default values:
- `ARK_OIDC_ISSUER`: `https://your-oidc-provider.com/auth/realms/your-realm`
- `ARK_OIDC_APPLICATION_ID`: `your-application-id`

## Pipeline Configuration

The CI/CD pipeline automatically:

1. **Creates Kubernetes Secret**: The `ark-auth-secret` is created with the authentication values
2. **Deploys with Environment Variables**: The ark-api service is deployed with the environment variables configured
3. **Uses Helm Chart Values**: The environment variables are injected via the Helm chart configuration

## Environment Variables in Production

The following environment variables are automatically set in the deployed ark-api service:

- `ARK_OIDC_ISSUER`: OIDC issuer URL for token validation
- `ARK_OIDC_APPLICATION_ID`: Application ID for token validation  
- `ARK_SKIP_AUTH`: Set to `false` to enable authentication

## Local Development

For local development, create a `.env` file in the `services/ark-api/ark-api/` directory:

```bash
# Authentication configuration
ARK_OIDC_ISSUER=https://your-oidc-provider.com/auth/realms/your-realm
ARK_OIDC_APPLICATION_ID=your-application-id
ARK_SKIP_AUTH=false
```

## Troubleshooting

### Secret Not Found
If you see errors about missing secrets, ensure:
1. The GitHub secrets are properly set in the repository settings
2. The secret names match exactly: `ARK_OIDC_ISSUER` and `ARK_OIDC_APPLICATION_ID`

### Authentication Failures
If authentication is not working:
1. Verify the OIDC issuer URL is correct and accessible
2. Check that the application ID matches your OIDC provider configuration
3. Ensure the JWKS endpoint is accessible at `{issuer}/protocol/openid-connect/certs`

### Testing Authentication
You can test the authentication by:
1. Setting `ARK_SKIP_AUTH=true` to disable authentication temporarily
2. Using a valid JWT token with the correct issuer and audience
3. Checking the ark-api logs for authentication errors
