"""Token validation for ARK SDK."""

import logging
import os
import json
from typing import Optional, Dict, Any
from jose import jwt, jwk
from jose.exceptions import JWTError, ExpiredSignatureError, JWTClaimsError
import requests

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
        self._jwks_cache: Optional[Dict[str, Any]] = None
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
    
    def _fetch_jwks(self) -> Dict[str, Any]:
        """Fetch JWKS from the configured URL."""
        if not self.config.jwks_url:
            raise TokenValidationError("JWKS URL not configured")
        
        try:
            response = requests.get(self.config.jwks_url, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to fetch JWKS: {e}")
            raise TokenValidationError(f"Failed to fetch JWKS: {e}")
    
    def _get_jwks(self) -> Dict[str, Any]:
        """Get JWKS with caching."""
        if self._jwks_cache is None:
            self._jwks_cache = self._fetch_jwks()
        return self._jwks_cache
    
    def _get_signing_key(self, token: str) -> str:
        """Get the signing key for a JWT token from JWKS."""
        try:
            # Decode header to get kid (key ID)
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get('kid')
            
            if not kid:
                raise TokenValidationError("Token header does not contain 'kid'")
            
            # Get JWKS
            jwks = self._get_jwks()
            
            # Find the key with matching kid
            for key in jwks.get('keys', []):
                if key.get('kid') == kid:
                    # Construct the key
                    return jwk.construct(key).to_pem().decode('utf-8')
            
            raise TokenValidationError(f"Unable to find key with kid: {kid}")
            
        except Exception as e:
            logger.error(f"Failed to get signing key: {e}")
            raise TokenValidationError(f"Failed to get signing key: {e}")
    
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
            # Get the signing key
            signing_key = self._get_signing_key(token)

            # Use issuer and audience from configuration
            audience = self.config.audience
            issuer = self.config.issuer

            # Build options for validation
            options = {
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": audience is not None,
                "verify_iss": issuer is not None,
            }

            # Decode and validate the token
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[self.config.jwt_algorithm],
                audience=audience,
                issuer=issuer,
                options=options
            )

            return payload

        except ExpiredSignatureError as e:
            logger.warning(f"Token expired: {e}")
            raise ExpiredTokenError("Token has expired")
        except JWTClaimsError as e:
            logger.warning(f"Invalid token claims: {e}")
            raise AuthInvalidTokenError("Invalid token claims")
        except JWTError as e:
            logger.warning(f"JWT error: {e}")
            raise AuthInvalidTokenError("Invalid token")
        except Exception as e:
            logger.error(f"Token validation error: {e}")
            raise TokenValidationError(f"Token validation failed: {e}")


