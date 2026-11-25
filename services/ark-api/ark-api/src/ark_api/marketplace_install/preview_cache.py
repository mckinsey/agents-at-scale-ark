import os
import time
from dataclasses import dataclass

from .checks import ObjectRef

CACHE_SECONDS_ENV = "MARKETPLACE_INSTALL_PREVIEW_CACHE_SECONDS"
CACHE_MAX_ENTRIES_ENV = "MARKETPLACE_INSTALL_PREVIEW_CACHE_MAX_ENTRIES"
DEFAULT_CACHE_SECONDS = 600
DEFAULT_CACHE_MAX_ENTRIES = 256

CacheKey = tuple[str, str, str, str]


@dataclass(frozen=True)
class PreviewEntry:
    release: str
    chart_ref: str
    chart_version: str
    digest: str
    blocked: bool
    objects: tuple[ObjectRef, ...]
    created_at: float


_entries: dict[CacheKey, PreviewEntry] = {}


def _positive_int(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, ""))
    except ValueError:
        return default
    return value if value > 0 else default


def ttl_seconds() -> int:
    return _positive_int(CACHE_SECONDS_ENV, DEFAULT_CACHE_SECONDS)


def max_entries() -> int:
    return _positive_int(CACHE_MAX_ENTRIES_ENV, DEFAULT_CACHE_MAX_ENTRIES)


def now() -> float:
    return time.monotonic()


def put(namespace: str, source: str, item: str, entry: PreviewEntry) -> None:
    key = (namespace, source, item, entry.digest)
    _entries.pop(key, None)
    while len(_entries) >= max_entries():
        _entries.pop(next(iter(_entries)))
    _entries[key] = entry


def get(namespace: str, source: str, item: str, digest: str) -> PreviewEntry | None:
    key = (namespace, source, item, digest)
    entry = _entries.get(key)
    if entry is None:
        return None
    if now() - entry.created_at > ttl_seconds():
        _entries.pop(key, None)
        return None
    return entry


def clear() -> None:
    _entries.clear()
