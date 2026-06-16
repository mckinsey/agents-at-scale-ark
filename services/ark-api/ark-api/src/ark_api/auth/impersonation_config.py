import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ImpersonationSettings:
    enabled: bool
    fallback: bool
    username_claim: str
    groups_claim: str
    prefix: str

    @classmethod
    def from_env(cls) -> "ImpersonationSettings":
        return cls(
            enabled=os.getenv("IMPERSONATION_ENABLED", "false").lower() == "true",
            fallback=os.getenv("IMPERSONATION_FALLBACK", "false").lower() == "true",
            username_claim=os.getenv("IMPERSONATION_USERNAME_CLAIM", "email"),
            groups_claim=os.getenv("IMPERSONATION_GROUPS_CLAIM", "groups"),
            prefix=os.getenv("IMPERSONATION_PREFIX", ""),
        )
