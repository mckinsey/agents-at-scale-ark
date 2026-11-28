from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class ImpersonationConfig:
    username: str
    groups: List[str] = field(default_factory=list)

    @property
    def cache_key(self) -> tuple:
        return (self.username, frozenset(self.groups))


def encode_impersonation_header_value(value: str) -> str:
    """Encode an impersonation header value so non-Latin-1 identities survive.

    HTTP header values are serialized as Latin-1 by the Kubernetes client stack,
    which raises UnicodeEncodeError for characters outside Latin-1 (Greek,
    Cyrillic, CJK, zero-width space, ...). Re-encoding the UTF-8 bytes as Latin-1
    puts the raw UTF-8 on the wire, which the Kubernetes API server reads back as
    the original identity. ASCII values are unchanged.
    """
    return value.encode("utf-8").decode("latin-1")
