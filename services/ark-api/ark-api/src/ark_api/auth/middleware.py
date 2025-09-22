"""
Authentication middleware for ARK API.

This module provides middleware to automatically protect all routes
except those explicitly marked as public.

Environment Variables:
    OIDC_ISSUER_URL: OIDC issuer URL (e.g., https://your-oidc-provider.com/realms/your-realm)
    OIDC_APPLICATION_ID: OIDC application ID (used as app_id for JWT validation)
    AUTH_MODE: Set to "sso" to enable authentication, any other value to skip authentication
    
Note: JWKS URL is automatically derived from the issuer URL
"""

import logging
import os
from fastapi import Request, APIRouter
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import is_route_authenticated

# Import from ark_sdk
from ark_sdk.auth.exceptions import TokenValidationError
from ark_sdk.auth.validator import TokenValidator

# Re-export for convenience
__all__ = ['AuthMiddleware', 'TokenValidationError']

logger = logging.getLogger(__name__)


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware that automatically protects all routes except those in PUBLIC_ROUTES.
    This approach is more reliable than trying to modify route dependencies.
    """
    
    async def dispatch(self, request: Request, call_next):
        # Get the path from the request
        path = request.url.path
        
        # Only apply authentication if AUTH_MODE is set to "sso" (case insensitive)
        # and OIDC configuration is available
        auth_mode = os.getenv("AUTH_MODE", "").lower()
        oidc_issuer = os.getenv("OIDC_ISSUER_URL", "")
        oidc_app_id = os.getenv("OIDC_APPLICATION_ID", "")
        
        # Check OIDC configuration and log appropriate messages
        if auth_mode == "sso":
            if not oidc_issuer:
                logger.warning("AUTH_MODE=sso but  is not configured. Authentication disabled.")
            elif not oidc_app_id:
                logger.warning("AUTH_MODE=sso but OIDC_APPLICATION_ID is not configured. Authentication disabled.")
            else:
                logger.debug("Authentication enabled: AUTH_MODE=sso with valid OIDC configuration")
        else:
            logger.debug(f"Authentication disabled: AUTH_MODE={auth_mode or 'not set'}")
        
        # Skip authentication if AUTH_MODE is not "sso" or OIDC config is missing
        skip_auth = (auth_mode != "sso") or (not oidc_issuer) or (not oidc_app_id)

        if skip_auth:
            response = await call_next(request)
            return response
        
        # Check if this route should be authenticated
        if is_route_authenticated(path):
            try:
                # Extract the Authorization header
                auth_header = request.headers.get("Authorization")
                if not auth_header or not auth_header.startswith("Bearer "):
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Missing or invalid authorization header"}
                    )
                
                # Extract the token
                token = auth_header[7:]  # Remove "Bearer " prefix
                if not token:
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Missing token"}
                    )
                
                
                # Validate the token using ark_sdk validator
                
                # Create TokenValidator instance (will read config from environment)
                validator = TokenValidator()
                await validator.validate_token(token)
                
            except TokenValidationError as e:
                logger.error(f"Token validation error: {e}")
                return JSONResponse(
                    status_code=401,
                    content={"detail": str(e)}
                )
            except Exception as e:
                logger.error(f"Authentication error: {e}")
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Authentication failed"}
                )
        else:
            pass  # Route is public, skip authentication
        
        # Continue to the next middleware/route handler
        response = await call_next(request)
        return response


def add_auth_to_routes(router: APIRouter) -> None:
    """
    This function is kept for compatibility but is no longer used.
    The AuthMiddleware class handles authentication globally.
    """
    logger.info("AuthMiddleware is now handling authentication globally - no need to modify individual routes")
