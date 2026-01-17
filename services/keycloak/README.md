# Keycloak

Identity and access management service for authentication and authorization.

## Quickstart

```bash
make help

make dev

make purge
```

## Access

Once running, Keycloak is accessible at:
- URL: http://keycloak.127.0.0.1.nip.io:8080
- Admin user: `admin`
- Admin password: `admin`

## SSO Setup for Ark Dashboard

Automated setup script to configure OIDC authentication:

```bash
cd scripts
pip install -r requirements.txt
python setup-ark-sso.py
```

This script will:
- Create an OIDC client for ark-dashboard
- Configure redirect URIs
- Create a test user (username: `testuser`, password: `testpass`)
- Output the configuration values needed for ark-dashboard

Apply the output configuration to your ark-dashboard deployment to enable SSO.

### Manual Setup

If you prefer manual configuration:

1. Log into Keycloak admin console
2. Create a new client with ID `ark-dashboard`
3. Set client type to OpenID Connect (confidential)
4. Configure redirect URIs:
   - `http://dashboard.127.0.0.1.nip.io:8080/*`
   - `http://127.0.0.1.nip.io:8080/*`
5. Copy the client secret from the Credentials tab
6. Create test users in the Users section
7. Update ark-dashboard Helm values with OIDC configuration
