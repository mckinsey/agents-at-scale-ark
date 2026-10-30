import hashlib
import re
from dataclasses import dataclass
from typing import Dict, Literal, Optional, Tuple

from ark_sdk.constants import ARK_DOMAIN

RESOURCE_TYPE_LABEL = f"{ARK_DOMAIN}resource-type"
SCOPE_LABEL = f"{ARK_DOMAIN}scope"
SECRET_RESOURCE_TYPE = "secret"
SHARED_SCOPE = "shared"
USER_SCOPE = re.compile(r"user-[0-9a-f]{16}")
RESERVED_USER_PREFIX = re.compile(r"^u-[0-9a-f]{16}-")
PERSONAL_NAME_PREFIX_LENGTH = len("u-0123456789abcdef-")
MAX_SECRET_NAME_LENGTH = 253

SecretScopeKind = Literal["shared", "personal"]


class SecretScopeError(ValueError):
    pass


class SecretScopeChangeError(SecretScopeError):
    pass


class PersonalSecretError(ValueError):
    pass


def _is_user_scope(value: object) -> bool:
    return isinstance(value, str) and USER_SCOPE.fullmatch(value) is not None


def user_scope(username: str) -> str:
    if not username:
        raise SecretScopeError("A personal scope needs a username")
    return f"user-{hashlib.sha256(username.encode('utf-8')).hexdigest()[:16]}"


def is_reserved_name(name: str) -> bool:
    return bool(RESERVED_USER_PREFIX.match(name))


def display_name(name: str) -> str:
    return RESERVED_USER_PREFIX.sub("", name, count=1)


def scope_kind(labels: Optional[Dict[str, str]]) -> Optional[SecretScopeKind]:
    labels = labels or {}
    if labels.get(RESOURCE_TYPE_LABEL) != SECRET_RESOURCE_TYPE:
        return None
    scope = labels.get(SCOPE_LABEL)
    if scope == SHARED_SCOPE:
        return "shared"
    if _is_user_scope(scope):
        return "personal"
    return None


@dataclass(frozen=True)
class SecretScope:
    scopes: Tuple[str, ...] = (SHARED_SCOPE,)

    def __post_init__(self):
        if isinstance(self.scopes, str):
            raise SecretScopeError("scopes must be a sequence of scope values, not a string")
        scopes = tuple(self.scopes)
        if not scopes:
            raise SecretScopeError("A secret scope needs at least one scope value")
        invalid = [scope for scope in scopes if scope != SHARED_SCOPE and not _is_user_scope(scope)]
        if invalid:
            raise SecretScopeError(f"Invalid scope values: {', '.join(map(repr, invalid))}")
        if len(set(scopes)) != len(scopes):
            raise SecretScopeError("Scope values must be unique")
        if sum(1 for scope in scopes if scope != SHARED_SCOPE) > 1:
            raise SecretScopeError("A secret scope holds at most one personal scope")
        object.__setattr__(self, "scopes", tuple(sorted(scopes, key=lambda scope: scope != SHARED_SCOPE)))

    @classmethod
    def for_user(cls, username: str) -> "SecretScope":
        return cls((SHARED_SCOPE, user_scope(username)))

    @property
    def includes_shared(self) -> bool:
        return SHARED_SCOPE in self.scopes

    def personal_scope(self) -> Optional[str]:
        return next((scope for scope in self.scopes if scope != SHARED_SCOPE), None)

    def personal_only(self) -> Optional["SecretScope"]:
        personal = self.personal_scope()
        return SecretScope((personal,)) if personal else None

    def label_selector(self) -> str:
        return f"{RESOURCE_TYPE_LABEL}={SECRET_RESOURCE_TYPE},{SCOPE_LABEL} in ({','.join(self.scopes)})"

    def contains(self, labels: Optional[Dict[str, str]]) -> bool:
        labels = labels or {}
        return labels.get(RESOURCE_TYPE_LABEL) == SECRET_RESOURCE_TYPE and labels.get(SCOPE_LABEL) in self.scopes

    def owns(self, labels: Optional[Dict[str, str]]) -> bool:
        personal = self.personal_scope()
        return personal is not None and SecretScope((personal,)).contains(labels)

    def create_labels(self, personal: bool = False) -> Dict[str, str]:
        scope = self.personal_scope() if personal else SHARED_SCOPE
        if scope is None:
            raise SecretScopeError("Personal secrets need an authenticated user")
        if scope not in self.scopes:
            raise SecretScopeError("This scope cannot create shared secrets")
        return {RESOURCE_TYPE_LABEL: SECRET_RESOURCE_TYPE, SCOPE_LABEL: scope}

    def personal_name(self, name: str) -> str:
        scope = self.personal_scope()
        if scope is None:
            raise SecretScopeError("Personal secrets need an authenticated user")
        if len(name) > MAX_SECRET_NAME_LENGTH - PERSONAL_NAME_PREFIX_LENGTH:
            raise ValueError(
                f"Secret name '{name}' is too long for a personal secret: "
                f"at most {MAX_SECRET_NAME_LENGTH - PERSONAL_NAME_PREFIX_LENGTH} characters"
            )
        return f"u-{scope[len('user-'):]}-{name}"


def validate_secret_name(name: str) -> str:
    if is_reserved_name(name):
        raise ValueError(f"Secret name '{name}' is invalid: the 'u-<16 hex digits>-' prefix is reserved")
    return name
