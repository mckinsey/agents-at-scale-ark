"""Authentication configuration for ARK SDK."""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class AuthConfig(BaseSettings):
    """Configuration for authentication."""

    model_config = SettingsConfigDict(env_prefix="ARK_", case_sensitive=False)

    jwt_algorithm: str = "RS256"
    issuer: Optional[str] = None
    audience: Optional[str] = None
    jwks_url: Optional[str] = None

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.issuer == "":
            self.issuer = None
        if self.audience == "":
            self.audience = None
        if self.jwks_url == "":
            self.jwks_url = None
    