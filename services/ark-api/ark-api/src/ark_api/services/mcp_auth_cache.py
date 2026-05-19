"""TTL'd in-memory cache for in-flight MCP authorization flows.

Each entry holds the PKCE verifier, registered client credentials, MCPServer
ref, caller identity, and a terminal state (`pending` / `authorized` /
`failed` / `expired`). Entries are addressable by `auth_id` (returned to
the caller) and by `state` (presented by the IdP at the callback). The
`state` index SHALL be deleted on callback lookup so replays fail; the
`auth_id` index stays live until TTL so callers polling `auth/status`
keep observing the terminal state.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Literal, Optional

CacheState = Literal["pending", "authorized", "failed", "expired"]


@dataclass
class CacheEntry:
    auth_id: str
    state: str
    mcp_server_name: str
    namespace: str
    verifier: str
    client_id: str
    client_secret: str
    caller_identity: str
    created_at: float
    ttl_seconds: int
    flow_state: CacheState = "pending"
    message: Optional[str] = None
    token_expires_at: Optional[str] = None

    @property
    def flow_expires_at_epoch(self) -> float:
        return self.created_at + self.ttl_seconds

    def is_expired(self, now: float | None = None) -> bool:
        return (now or time.time()) >= self.flow_expires_at_epoch


@dataclass
class _Indexes:
    by_auth_id: dict[str, CacheEntry] = field(default_factory=dict)
    by_state: dict[str, str] = field(default_factory=dict)


class McpAuthCache:
    """In-memory TTL'd cache. Single-replica-correct; HA deployments need a shared store."""

    def __init__(self, ttl_seconds: int):
        self._ttl_seconds = ttl_seconds
        self._indexes = _Indexes()
        self._lock = asyncio.Lock()

    @property
    def ttl_seconds(self) -> int:
        return self._ttl_seconds

    async def put(self, entry: CacheEntry) -> None:
        async with self._lock:
            self._reap_locked()
            self._indexes.by_auth_id[entry.auth_id] = entry
            self._indexes.by_state[entry.state] = entry.auth_id

    async def get_by_auth_id(self, auth_id: str) -> Optional[CacheEntry]:
        async with self._lock:
            self._reap_locked()
            return self._indexes.by_auth_id.get(auth_id)

    async def take_by_state(self, state: str) -> Optional[CacheEntry]:
        async with self._lock:
            self._reap_locked()
            auth_id = self._indexes.by_state.pop(state, None)
            if auth_id is None:
                return None
            return self._indexes.by_auth_id.get(auth_id)

    async def mark_authorized(
        self,
        auth_id: str,
        token_expires_at: Optional[str],
    ) -> None:
        async with self._lock:
            entry = self._indexes.by_auth_id.get(auth_id)
            if entry is None:
                return
            entry.flow_state = "authorized"
            entry.message = None
            entry.token_expires_at = token_expires_at

    async def mark_failed(self, auth_id: str, message: str) -> None:
        async with self._lock:
            entry = self._indexes.by_auth_id.get(auth_id)
            if entry is None:
                return
            entry.flow_state = "failed"
            entry.message = message

    def _reap_locked(self) -> None:
        now = time.time()
        expired = [aid for aid, e in self._indexes.by_auth_id.items() if e.is_expired(now)]
        for aid in expired:
            entry = self._indexes.by_auth_id.pop(aid, None)
            if entry is not None:
                self._indexes.by_state.pop(entry.state, None)

    async def reset(self) -> None:
        async with self._lock:
            self._indexes = _Indexes()


_singleton: McpAuthCache | None = None


def get_mcp_auth_cache(ttl_seconds: int) -> McpAuthCache:
    global _singleton
    if _singleton is None:
        _singleton = McpAuthCache(ttl_seconds)
    return _singleton


def reset_mcp_auth_cache() -> None:
    global _singleton
    _singleton = None
