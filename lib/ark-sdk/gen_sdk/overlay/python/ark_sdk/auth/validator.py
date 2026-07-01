"""Token validation for ARK SDK."""

import logging
import os
import json
import time
from typing import Optional, Dict, Any
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError, InvalidAudienceError, InvalidIssuerError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ec
from cryptography.hazmat.backends import default_backend
import requests

from .exceptions import TokenValidationError, InvalidTokenError as AuthInvalidTokenError, ExpiredTokenError
from .config import AuthConfig

logger = logging.getLogger(__name__)

# OIDC providers rotate signing keys (Dex rotates ~every 6h), so a JWKS set
# cached for the process lifetime goes stale and rejects tokens signed by a
# newly-rotated key. Bound the cache and refetch on an unknown kid.
JWKS_CACHE_TTL_SECONDS = int(os.getenv("OIDC_JWKS_CACHE_TTL_SECONDS", "300"))


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
        """Create AuthConfig from environment variables.

        JWKS URL resolution order:
          1. ``OIDC_JWKS_URL`` explicit override (escape hatch for air-gapped
             IdPs or unconventional well-known layouts).
          2. ``<issuer>/.well-known/openid-configuration`` discovery per
             RFC 8414 / OIDC Core §4 — works for Dex (``/keys``), Auth0
             (``/.well-known/jwks.json``), Okta (``/v1/keys``), Keycloak
             (``/protocol/openid-connect/certs``), Google, et al.

        The previous implementation hardcoded the Keycloak path, which
        404'd against every other IdP. Discovery is the OIDC-standard
        way to learn ``jwks_uri`` and removes the per-IdP assumption.
        """
        issuer = os.getenv("OIDC_ISSUER_URL")
        audience = os.getenv("OIDC_APPLICATION_ID")
        jwks_url = os.getenv("OIDC_JWKS_URL") or None
        if not jwks_url and issuer:
            jwks_url = self._discover_jwks_url(issuer)

        logger.info(
            "Creating AuthConfig from environment - issuer: %s, audience: %s, jwks_url: %s",
            issuer, audience, jwks_url,
        )

        return AuthConfig(
            issuer=issuer,
            audience=audience,
            jwks_url=jwks_url,
        )

    @staticmethod
    def _discover_jwks_url(issuer: str) -> str:
        """Resolve ``jwks_uri`` from the issuer's OIDC discovery document.

        Raises ``TokenValidationError`` when discovery is unreachable or
        the document does not contain ``jwks_uri``. Use ``OIDC_JWKS_URL``
        to bypass discovery for air-gapped IdPs.
        """
        discovery_url = f"{issuer.rstrip('/')}/.well-known/openid-configuration"
        try:
            response = requests.get(discovery_url, timeout=10)
            response.raise_for_status()
            jwks_uri = response.json().get("jwks_uri")
            if not jwks_uri:
                raise TokenValidationError(
                    f"OIDC discovery document at {discovery_url} did not include jwks_uri. "
                    f"Set OIDC_JWKS_URL to override."
                )
            return jwks_uri
        except TokenValidationError:
            raise
        except (requests.RequestException, ValueError) as exc:
            raise TokenValidationError(
                f"OIDC discovery failed for {discovery_url}: {exc}. "
                f"Set OIDC_JWKS_URL to override."
            ) from exc
    
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
    
    def _get_jwks(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Get JWKS, cached with a TTL. ``force_refresh`` bypasses the cache."""
        now = time.monotonic()
        expired = self._cache_expiry is not None and now >= self._cache_expiry
        if force_refresh or self._jwks_cache is None or expired:
            self._jwks_cache = self._fetch_jwks()
            self._cache_expiry = now + JWKS_CACHE_TTL_SECONDS
        return self._jwks_cache
    
    def _jwk_to_pem(self, jwk_dict: Dict[str, Any]) -> str:
        """Convert JWK to PEM format."""
        kty = jwk_dict.get('kty')

        if kty == 'RSA':
            # RSA key
            from jwt.algorithms import RSAAlgorithm
            public_key = RSAAlgorithm.from_jwk(json.dumps(jwk_dict))
            pem = public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            )
            return pem.decode('utf-8')
        elif kty == 'EC':
            # EC key
            from jwt.algorithms import ECAlgorithm
            public_key = ECAlgorithm.from_jwk(json.dumps(jwk_dict))
            pem = public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            )
            return pem.decode('utf-8')
        else:
            raise TokenValidationError(f"Unsupported key type: {kty}")

    def _get_signing_key(self, token: str) -> str:
        """Get the signing key for a JWT token from JWKS."""
        try:
            # Decode header to get kid (key ID)
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get('kid')

            if not kid:
                raise TokenValidationError("Token header does not contain 'kid'")

            # Try the cached JWKS first; on an unknown kid, refetch once in case
            # the IdP rotated its signing keys since the cache was populated.
            for force_refresh in (False, True):
                jwks = self._get_jwks(force_refresh=force_refresh)
                for key in jwks.get('keys', []):
                    if key.get('kid') == kid:
                        return self._jwk_to_pem(key)

            raise TokenValidationError(f"Unable to find key with kid: {kid}")

        except Exception as e:
            logger.error(f"Failed to get signing key: {e}")
            raise TokenValidationError(f"Failed to get signing key: {e}")
    
    def validate_token(self, token: str) -> Dict[str, Any]:
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
        except (InvalidAudienceError, InvalidIssuerError) as e:
            logger.warning(f"Invalid token claims: {e}")
            raise AuthInvalidTokenError("Invalid token claims")
        except InvalidTokenError as e:
            logger.warning(f"JWT error: {e}")
            raise AuthInvalidTokenError("Invalid token")
        except Exception as e:
            logger.error(f"Token validation error: {e}")
            raise TokenValidationError(f"Token validation failed: {e}")


