import re
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from ark_sdk.constants import ARK_DOMAIN

RESOURCE_TYPE_LABEL = f"{ARK_DOMAIN}resource-type"
SCOPE_LABEL = f"{ARK_DOMAIN}scope"
SECRET_RESOURCE_TYPE = "secret"
SHARED_SCOPE = "shared"
RESERVED_USER_PREFIX = re.compile(r"^u-[0-9a-f]{16}-")


@dataclass(frozen=True)
class SecretScope:
    scopes: Tuple[str, ...] = (SHARED_SCOPE,)

    def label_selector(self) -> str:
        return f"{RESOURCE_TYPE_LABEL}={SECRET_RESOURCE_TYPE},{SCOPE_LABEL} in ({','.join(self.scopes)})"

    def contains(self, labels: Optional[Dict[str, str]]) -> bool:
        labels = labels or {}
        return labels.get(RESOURCE_TYPE_LABEL) == SECRET_RESOURCE_TYPE and labels.get(SCOPE_LABEL) in self.scopes

    def create_labels(self) -> Dict[str, str]:
        return {RESOURCE_TYPE_LABEL: SECRET_RESOURCE_TYPE, SCOPE_LABEL: SHARED_SCOPE}


def validate_secret_name(name: str) -> str:
    if RESERVED_USER_PREFIX.match(name):
        raise ValueError(f"Secret name '{name}' is invalid: the 'u-<16 hex digits>-' prefix is reserved")
    return name
