"""
Authentication middleware for ARK API.

Environment Variables:
    OIDC_ISSUER_URL: OIDC issuer URL (e.g., https://your-oidc-provider.com/realms/your-realm)
    OIDC_APPLICATION_ID: OIDC application ID (used as app_id for JWT validation)
    AUTH_MODE: Authentication mode (sso, basic, hybrid, open)

Note: JWKS URL is automatically derived from the issuer URL
"""

import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import Request, APIRouter
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import is_route_authenticated
from .constants import AuthMode, AuthHeader
from .impersonation_config import ImpersonationSettings
from ..models.auth import UserIdentity

from ark_sdk.auth.exceptions import TokenValidationError
from ark_sdk.auth.validator import TokenValidator
from ark_sdk.auth.basic import BasicAuthValidator

from ..services.api_keys import APIKeyService

__all__ = ['AuthMiddleware', 'TokenValidationError']

logger = logging.getLogger(__name__)


def _extract_claim(payload: Dict[str, Any], claim_path: str) -> Optional[Any]:
    parts = claim_path.split(".")
    current = payload
    for part in parts:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
        if current is None:
            return None
    return current


def _extract_user_identity(
    payload: Dict[str, Any], settings: ImpersonationSettings
) -> Optional[UserIdentity]:
    username = _extract_claim(payload, settings.username_claim)
    if username is None:
        return None

    raw_groups = _extract_claim(payload, settings.groups_claim)
    groups: List[str] = []
    if isinstance(raw_groups, list):
        groups = [str(g) for g in raw_groups]
    elif isinstance(raw_groups, str):
        groups = [raw_groups]

    prefix = settings.prefix
    if prefix:
        username = f"{prefix}{username}"
        groups = [f"{prefix}{g}" for g in groups]

    return UserIdentity(username=username, groups=groups)


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.api_key_service = APIKeyService()
        self.impersonation_settings = ImpersonationSettings.from_env()
        self._validate_auth_config()

        auth_mode = os.getenv("AUTH_MODE", "").lower()
        if auth_mode in [AuthMode.SSO, AuthMode.HYBRID]:
            self._token_validator = TokenValidator()
        else:
            self._token_validator = None

    def _validate_auth_config(self):
        auth_mode = os.getenv("AUTH_MODE", "").lower()
        oidc_issuer = os.getenv("OIDC_ISSUER_URL", "")
        oidc_app_id = os.getenv("OIDC_APPLICATION_ID", "")

        valid_auth_modes = [AuthMode.SSO, AuthMode.BASIC, AuthMode.HYBRID, AuthMode.OPEN]
        if auth_mode and auth_mode not in valid_auth_modes:
            raise ValueError(
                f"Invalid AUTH_MODE '{auth_mode}'. "
                f"Valid values are: {', '.join(valid_auth_modes)}"
            )

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
        if self.impersonation_settings.enabled:
            logger.info(
                f"Impersonation enabled: username_claim={self.impersonation_settings.username_claim}, "
                f"groups_claim={self.impersonation_settings.groups_claim}, "
                f"fallback={self.impersonation_settings.fallback}"
            )

    def _has_impersonation_headers(self, request: Request) -> bool:
        for header_name in request.headers.keys():
            if header_name.lower().startswith("impersonate-"):
                return True
        return False

    async def dispatch(self, request: Request, call_next):
        if self._has_impersonation_headers(request):
            return JSONResponse(
                status_code=403,
                content={"detail": "Client-supplied Impersonate-* headers are not allowed"},
            )

        path = request.url.path
        auth_mode = os.getenv("AUTH_MODE", "").lower() or AuthMode.OPEN

        logger.debug(f"Auth mode: {auth_mode}, Path: {path}")

        jwt_enabled = auth_mode in [AuthMode.SSO, AuthMode.HYBRID]
        basic_enabled = auth_mode in [AuthMode.BASIC, AuthMode.HYBRID]
        auth_disabled = auth_mode == AuthMode.OPEN

        if auth_disabled:
            logger.debug("Authentication disabled")
            response = await call_next(request)
            return response

        if not is_route_authenticated(path):
            logger.debug(f"Route {path} is public, skipping authentication")
            response = await call_next(request)
            return response

        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authorization header"}
            )

        auth_success = False
        auth_error = "Authentication failed"

        if jwt_enabled and auth_header.startswith(AuthHeader.BEARER):
            try:
                token = auth_header[len(AuthHeader.BEARER):]
                if not token:
                    auth_error = "Missing token"
                else:
                    jwt_payload = self._token_validator.validate_token(token)
                    auth_success = True
                    logger.debug("JWT authentication successful")

                    identity = _extract_user_identity(jwt_payload, self.impersonation_settings)
                    if identity is not None:
                        request.state.user_identity = identity
                        logger.debug(f"User identity: {identity.username}, groups: {identity.groups}")
                    elif self.impersonation_settings.enabled:
                        claim = self.impersonation_settings.username_claim
                        return JSONResponse(
                            status_code=401,
                            content={
                                "detail": (
                                    f"JWT is missing the '{claim}' claim required for impersonation. "
                                    f"Configure your identity provider to include '{claim}' in tokens, "
                                    f"or set IMPERSONATION_USERNAME_CLAIM to a different claim."
                                )
                            },
                        )

            except TokenValidationError as e:
                logger.debug(f"JWT validation failed: {e}")
                auth_error = str(e)
            except Exception as e:
                logger.error(f"JWT authentication error: {e}")
                auth_error = "JWT authentication failed"

        elif basic_enabled and auth_header.startswith(AuthHeader.BASIC):
            try:
                credentials = BasicAuthValidator.parse_basic_auth_header(auth_header)
                if not credentials:
                    auth_error = "Invalid basic auth format"
                else:
                    public_key, secret_key = credentials

                    api_key_data = await self.api_key_service.verify_api_key(public_key, secret_key)
                    if api_key_data:
                        auth_success = True
                        logger.debug(f"Basic auth successful for key: {public_key} in namespace {self.api_key_service.namespace}")
                        request.state.api_key = api_key_data
                    else:
                        auth_error = f"Invalid API key credentials or key not found in namespace {self.api_key_service.namespace}"

            except Exception as e:
                logger.error(f"Basic auth error: {e}")
                auth_error = "Basic authentication failed"

        else:
            if jwt_enabled and basic_enabled:
                auth_error = f"Invalid authorization header. Use '{AuthHeader.BEARER}<token>' or '{AuthHeader.BASIC}<credentials>'"
            elif jwt_enabled:
                auth_error = f"Invalid authorization header. Use '{AuthHeader.BEARER}<token>'"
            elif basic_enabled:
                auth_error = f"Invalid authorization header. Use '{AuthHeader.BASIC}<credentials>'"
            else:
                auth_error = "No authentication methods configured"

        if not auth_success:
            logger.warning(f"Authentication failed for {request.method} {path}: {auth_error}")
            return JSONResponse(
                status_code=401,
                content={"detail": auth_error}
            )

        response = await call_next(request)
        return response


def add_auth_to_routes(router: APIRouter) -> None:
    logger.info("AuthMiddleware is now handling authentication globally - no need to modify individual routes")
