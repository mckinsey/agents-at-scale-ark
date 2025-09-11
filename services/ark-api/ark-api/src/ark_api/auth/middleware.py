"""
Authentication middleware for ARK API.

This module provides middleware to automatically protect all routes
except those explicitly marked as public.
"""

import logging
import os
from fastapi import Request, HTTPException, APIRouter
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import is_route_authenticated
from ark_sdk.auth.dependencies import validate_token

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
        if skip_auth:
            response = await call_next(request)
            return response
        
        # Check if this route should be authenticated
        if is_route_authenticated(path):
            try:
                # Validate the token by calling the dependency function
                # We need to extract the Authorization header manually
                auth_header = request.headers.get("Authorization")
                if not auth_header or not auth_header.startswith("Bearer "):
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Missing or invalid authorization header"}
                    )
                
                # Validate the token by calling the validate_token function
                # Pass the full authorization header
                await validate_token(auth_header)
                
            except HTTPException as e:
                return JSONResponse(
                    status_code=e.status_code,
                    content={"detail": e.detail}
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
