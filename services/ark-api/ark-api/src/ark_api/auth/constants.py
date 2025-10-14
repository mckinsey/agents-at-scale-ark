"""Authentication constants for ARK API."""

from enum import StrEnum


class AuthMode(StrEnum):
    """
    Authentication modes supported by ARK API.
    
    Values:
        SSO: OIDC/JWT authentication only
        BASIC: API key basic authentication only
        HYBRID: Both OIDC/JWT and basic authentication
        OPEN: No authentication required (development mode)
    """
    SSO = "sso"
    BASIC = "basic"
    HYBRID = "hybrid"
    OPEN = "open"


class AuthHeader(StrEnum):
    """Authorization header prefixes."""
    BEARER = "Bearer "
    BASIC = "Basic "
