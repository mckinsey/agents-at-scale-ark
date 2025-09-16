"""Authentication configuration for ARK SDK."""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional


class AuthConfig(BaseSettings):
    """Configuration for authentication."""
    
    # JWT settings
    jwt_algorithm: str = "RS256"
    
    # Authentication settings
    issuer: Optional[str] = Field(None, env="OIDC_ISSUER_URL")
    audience: Optional[str] = Field(None, env="OIDC_APPLICATION_ID")
    jwks_url: Optional[str] = None
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Convert empty strings to None
        if self.issuer == "":
            self.issuer = None
        if self.audience == "":
            self.audience = None
        if self.jwks_url == "":
            self.jwks_url = None
    