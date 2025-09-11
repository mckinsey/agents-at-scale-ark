"""
Authentication middleware for ARK API.

This module provides middleware to automatically protect all routes
except those explicitly marked as public.

Environment Variables:
    ARK_OKTA_ISSUER: OIDC issuer URL (e.g., https://your-oidc-provider.com/realms/your-realm)
    ARK_OKTA_AUDIENCE: OIDC audience/client ID
    ARK_SKIP_AUTH: Set to "true" to skip authentication (development only)
    
Note: JWKS URL is automatically derived from the issuer URL
"""

import logging
import os
from fastapi import Request, APIRouter
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import is_route_authenticated

try:
    from ark_sdk.auth.validator import TokenValidator
    from ark_sdk.auth.config import AuthConfig
    from ark_sdk.auth.exceptions import TokenValidationError
except ImportError:
    # Fallback when ark_sdk is not available
    class AuthConfig:
        def __init__(self):
            self.issuer = os.getenv("ARK_OKTA_ISSUER")
            self.audience = os.getenv("ARK_OKTA_AUDIENCE")
            # JWKS URL is derived from issuer URL
            issuer_url = os.getenv("ARK_OKTA_ISSUER")
            self.jwks_url = f"{issuer_url}/.well-known/jwks.json" if issuer_url else None
            self.jwt_algorithm = os.getenv("ARK_JWT_ALGORITHM", "RS256")
    
    class TokenValidator:
        def __init__(self, config):
            self.config = config
        
        async def validate_token(self, token):
            # For fallback, we'll need to implement basic JWT validation
            # This is a simplified version - in production, use the full ark_sdk
            import jwt
            try:
                # Decode without verification for basic structure check
                payload = jwt.decode(token, options={"verify_signature": False})
                return payload
            except Exception as e:
                raise Exception(f"Token validation failed: {e}")
    
    class TokenValidationError(Exception):
        pass

logger = logging.getLogger(__name__)


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware that automatically protects all routes except those in PUBLIC_ROUTES.
    This approach is more reliable than trying to modify route dependencies.
    """
    
    async def dispatch(self, request: Request, call_next):
        # Get the path from the request
        path = request.url.path
        
        # Skip authentication if ARK_SKIP_AUTH is set
        skip_auth = os.getenv("ARK_SKIP_AUTH", "false").lower() == "true"
        logger.info(f"ARK_SKIP_AUTH={os.getenv('ARK_SKIP_AUTH')}, skip_auth={skip_auth}, path={path}")
        if skip_auth:
            logger.info(f"Skipping authentication for path: {path}")
            response = await call_next(request)
            return response
        
        # Check if this route should be authenticated
        if is_route_authenticated(path):
            try:
                # Extract the Authorization header
                auth_header = request.headers.get("Authorization")
                logger.info(f"Authorization header: {auth_header}")
                if not auth_header or not auth_header.startswith("Bearer "):
                    logger.warning(f"Missing or invalid authorization header: {auth_header}")
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Missing or invalid authorization header"}
                    )
                
                # Extract the token
                token = auth_header[7:]  # Remove "Bearer " prefix
                logger.info(f"Extracted token: {token[:20]}..." if len(token) > 20 else f"Extracted token: {token}")
                if not token:
                    logger.warning("Empty token after Bearer prefix removal")
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Missing token"}
                    )
                
                # Create auth config from environment variables
                auth_config = AuthConfig()
                logger.info(f"Auth config - issuer: {auth_config.issuer}, audience: {auth_config.audience}")
                
                # Create token validator with OIDC/JWT configuration
                validator = TokenValidator(auth_config)
                
                # Validate the token using OIDC/JWT validation
                logger.info("Starting token validation...")
                await validator.validate_token(token)
                logger.info("Token validation successful")
                
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
