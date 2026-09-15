"""Authentication configuration for ARK SDK."""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class AuthConfig(BaseSettings):
    """Configuration for authentication."""

    model_config = SettingsConfigDict(env_prefix="ARK_", case_sensitive=False)

    jwt_algorithm: str = "RS256"
    issuer: Optional[str] = None
    # May hold several comma-separated audiences (e.g. "app-a,app-b"); the
    # validator accepts a token whose aud matches any of them.
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
    