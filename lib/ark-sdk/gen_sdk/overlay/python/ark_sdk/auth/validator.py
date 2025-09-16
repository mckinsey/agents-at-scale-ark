"""Token validation for ARK SDK."""

import logging
import os
from typing import Optional, Dict, Any
from jwt import decode, PyJWKClient
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError, DecodeError

from .exceptions import TokenValidationError, InvalidTokenError as AuthInvalidTokenError, ExpiredTokenError
from .config import AuthConfig

logger = logging.getLogger(__name__)


class TokenValidator:
    """Validates JWT tokens using JWKS."""
    
    def __init__(self, config: Optional[AuthConfig] = None):
        if config is None:
            self.config = self._create_config_from_env()
        else:
            self.config = config
        self._jwks_client: Optional[PyJWKClient] = None
        self._jwks_cache: Dict[str, Any] = {}
        self._cache_expiry: Optional[float] = None

    
    def _create_config_from_env(self) -> AuthConfig:
        """Create AuthConfig from environment variables."""
        # Read environment variables directly
        issuer = os.getenv("OIDC_ISSUER_URL")
        audience = os.getenv("OIDC_APPLICATION_ID")
        jwks_url = None
        if issuer:
            # Use the correct JWKS endpoint for Keycloak/Okta
            jwks_url = f"{issuer}/protocol/openid-connect/certs"
        
        logger.info(f"Creating AuthConfig from environment - issuer: {issuer}, audience: {audience}")
        
        return AuthConfig(
            issuer=issuer,
            audience=audience,
            jwks_url=jwks_url
        )
    
    def _get_jwks_client(self) -> PyJWKClient:
        """Get or create JWKS client."""
        if self._jwks_client is None and self.config.jwks_url:
            self._jwks_client = PyJWKClient(self.config.jwks_url)
        return self._jwks_client
    
    async def validate_token(self, token: str) -> Dict[str, Any]:
        """
        Validate a JWT token.
        
        Args:
            token: The JWT token to validate
            
        Returns:
            The decoded token payload
            
        Raises:
            TokenValidationError: If token validation fails
        """
        try:
            # Get the JWKS client
            jwks_client = self._get_jwks_client()
            if jwks_client is None:
                raise TokenValidationError("JWKS URL not configured")
            
            # Get the signing key
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            
            # Use issuer and audience from configuration
            audience = self.config.audience
            issuer = self.config.issuer
                
            # Decode and validate the token
            payload = decode(
                token,
                signing_key.key,
                algorithms=[self.config.jwt_algorithm],
                audience=audience,
                issuer=issuer,
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_aud": audience is not None,
                    "verify_iss": issuer is not None,
                }
            )
            
            return payload
            
        except ExpiredSignatureError as e:
            logger.warning(f"Token expired: {e}")
            raise ExpiredTokenError("Token has expired")
        except InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            raise AuthInvalidTokenError("Invalid token")
        except DecodeError as e:
            logger.warning(f"Token decode error: {e}")
            raise AuthInvalidTokenError("Token could not be decoded")
        except Exception as e:
            logger.error(f"Token validation error: {e}")
            raise TokenValidationError(f"Token validation failed: {e}")


