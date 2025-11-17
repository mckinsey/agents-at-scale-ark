"""
Authentication middleware for ARK API.

This module provides middleware to automatically protect all routes
except those explicitly marked as public.

Environment Variables:
    OIDC_ISSUER_URL: OIDC issuer URL (e.g., https://your-oidc-provider.com/realms/your-realm)
    OIDC_APPLICATION_ID: OIDC application ID (used as app_id for JWT validation)
    AUTH_MODE: Authentication mode (sso, basic, hybrid, open)
    
Note: JWKS URL is automatically derived from the issuer URL
"""

import logging
import os
from fastapi import Request, APIRouter
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import is_route_authenticated
from .constants import AuthMode, AuthHeader

# Import from ark_sdk
from ark_sdk.auth.exceptions import TokenValidationError
from ark_sdk.auth.validator import TokenValidator
from ark_sdk.auth.basic import BasicAuthValidator

# Import API key service
from ..services.api_keys import APIKeyService

# Re-export for convenience
__all__ = ['AuthMiddleware', 'TokenValidationError']

logger = logging.getLogger(__name__)


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware that automatically protects all routes except those in PUBLIC_ROUTES.
    Supports multiple authentication modes:
    - sso: OIDC/JWT only
    - basic: API key basic auth only  
    - hybrid: Both OIDC/JWT and basic auth
    - open: No authentication (development)
    """
    
    def __init__(self, app):
        super().__init__(app)
        # API keys are always stored in current context namespace for security
        self.api_key_service = APIKeyService()
        
        # Validate configuration at startup
        self._validate_auth_config()
    
    def _validate_auth_config(self):
        """
        Validate authentication configuration at startup.
        Fail fast with clear error messages if configuration is invalid.
        """
        auth_mode = os.getenv("AUTH_MODE", "").lower()
        oidc_issuer = os.getenv("OIDC_ISSUER_URL", "")
        oidc_app_id = os.getenv("OIDC_APPLICATION_ID", "")
        
        # Validate auth mode
        valid_auth_modes = [AuthMode.SSO, AuthMode.BASIC, AuthMode.HYBRID, AuthMode.OPEN]
        if auth_mode and auth_mode not in valid_auth_modes:
            raise ValueError(
                f"Invalid AUTH_MODE '{auth_mode}'. "
                f"Valid values are: {', '.join(valid_auth_modes)}"
            )
        
        # If SSO or HYBRID mode, require OIDC configuration
        if auth_mode in [AuthMode.SSO, AuthMode.HYBRID]:
            missing_params = []
            if not oidc_issuer:
                missing_params.append("OIDC_ISSUER_URL")
            if not oidc_app_id:
                missing_params.append("OIDC_APPLICATION_ID")
            
            if missing_params:
                raise ValueError(
                    f"AUTH_MODE is set to '{auth_mode}' but the following required "
                    f"environment variables are missing: {', '.join(missing_params)}. "
                    f"Please set these variables or change AUTH_MODE."
                )
        
        logger.info(f"Authentication middleware initialized with mode: {auth_mode or 'open (default)'}")
    
    async def dispatch(self, request: Request, call_next):
        # Get the path from the request
        path = request.url.path
        
        # Get authentication mode (validated at startup)
        auth_mode = os.getenv("AUTH_MODE", "").lower() or AuthMode.OPEN
        
        # Log authentication configuration
        logger.debug(f"Auth mode: {auth_mode}, Path: {path}")
        
        # Determine which auth methods are enabled
        jwt_enabled = auth_mode in [AuthMode.SSO, AuthMode.HYBRID]
        basic_enabled = auth_mode in [AuthMode.BASIC, AuthMode.HYBRID]
        auth_disabled = auth_mode == AuthMode.OPEN
        
        if auth_disabled:
            logger.debug("Authentication disabled")
            response = await call_next(request)
            return response
        
        # Check if this route should be authenticated
        if not is_route_authenticated(path):
            logger.debug(f"Route {path} is public, skipping authentication")
            response = await call_next(request)
            return response
        
        # Route requires authentication
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authorization header"}
            )
        
        # Try different authentication methods based on auth mode
        auth_success = False
        auth_error = "Authentication failed"
        
        # Try JWT authentication if enabled
        if jwt_enabled and auth_header.startswith(AuthHeader.BEARER):
            try:
                token = auth_header[len(AuthHeader.BEARER):]  # Remove "Bearer " prefix
                if not token:
                    auth_error = "Missing token"
                else:
                    # Validate JWT token using ark_sdk validator
                    validator = TokenValidator()
                    await validator.validate_token(token)
                    auth_success = True
                    logger.debug("JWT authentication successful")
                    
            except TokenValidationError as e:
                logger.debug(f"JWT validation failed: {e}")
                auth_error = str(e)
            except Exception as e:
                logger.error(f"JWT authentication error: {e}")
                auth_error = "JWT authentication failed"
        
        # Try basic authentication if enabled (JWT block not executed)
        elif basic_enabled and auth_header.startswith(AuthHeader.BASIC):
            try:
                # Parse basic auth credentials
                credentials = BasicAuthValidator.parse_basic_auth_header(auth_header)
                if not credentials:
                    auth_error = "Invalid basic auth format"
                else:
                    public_key, secret_key = credentials
                    
                    # Verify API key (uses namespace configured at middleware initialization)
                    # API keys are namespace-scoped for tenant isolation
                    api_key_data = await self.api_key_service.verify_api_key(public_key, secret_key)
                    if api_key_data:
                        auth_success = True
                        logger.debug(f"Basic auth successful for key: {public_key} in namespace {self.api_key_service.namespace}")
                        
                        # Add API key context to request (optional)
                        request.state.api_key = api_key_data
                    else:
                        auth_error = f"Invalid API key credentials or key not found in namespace {self.api_key_service.namespace}"
                        
            except Exception as e:
                logger.error(f"Basic auth error: {e}")
                auth_error = "Basic authentication failed"
        
        else:
            # Unsupported auth type or no auth methods enabled
            if jwt_enabled and basic_enabled:
                auth_error = f"Invalid authorization header. Use '{AuthHeader.BEARER}<token>' or '{AuthHeader.BASIC}<credentials>'"
            elif jwt_enabled:
                auth_error = f"Invalid authorization header. Use '{AuthHeader.BEARER}<token>'"
            elif basic_enabled:
                auth_error = f"Invalid authorization header. Use '{AuthHeader.BASIC}<credentials>'"
            else:
                auth_error = "No authentication methods configured"
        
        # Check authentication result
        if not auth_success:
            logger.warning(f"Authentication failed for {request.method} {path}: {auth_error}")
            return JSONResponse(
                status_code=401,
                content={"detail": auth_error}
            )
        
        # Authentication successful, continue to the next middleware/route handler
        response = await call_next(request)
        return response


def add_auth_to_routes(router: APIRouter) -> None:
    """
    This function is kept for compatibility but is no longer used.
    The AuthMiddleware class handles authentication globally.
    """
    logger.info("AuthMiddleware is now handling authentication globally - no need to modify individual routes")
