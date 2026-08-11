from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class ImpersonationConfig:
    username: str
    groups: List[str] = field(default_factory=list)

    @property
    def cache_key(self) -> tuple:
        return (self.username, frozenset(self.groups))
