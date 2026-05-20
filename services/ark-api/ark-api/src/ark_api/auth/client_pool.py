import asyncio
import logging
import time
from collections import OrderedDict
from typing import Optional, Tuple

from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.client import get_client

logger = logging.getLogger(__name__)

CacheKey = Optional[Tuple[str, frozenset]]


class ImpersonatingClientPool:
    def __init__(self, max_size: int = 100, ttl_seconds: float = 300):
        self._max_size = max_size
        self._ttl_seconds = ttl_seconds
        self._cache: OrderedDict[CacheKey, Tuple[float, object]] = OrderedDict()
        self._lock = asyncio.Lock()

    def _make_key(self, impersonation: Optional[ImpersonationConfig]) -> CacheKey:
        if impersonation is None:
            return None
        return impersonation.cache_key

    async def _evict_oldest(self):
        if len(self._cache) >= self._max_size:
            key, (_, old_client) = self._cache.popitem(last=False)
            logger.debug(f"Evicting client for {key}")
            if hasattr(old_client, "close"):
                try:
                    await old_client.close()
                except Exception:
                    pass

    def _is_expired(self, created_at: float) -> bool:
        return (time.monotonic() - created_at) > self._ttl_seconds

    async def get_or_create(
        self,
        namespace: Optional[str],
        version: str,
        impersonation: Optional[ImpersonationConfig] = None,
    ):
        key = self._make_key(impersonation)

        async with self._lock:
            if key in self._cache:
                created_at, client = self._cache[key]
                if not self._is_expired(created_at):
                    self._cache.move_to_end(key)
                    return client
                del self._cache[key]
                if hasattr(client, "close"):
                    try:
                        await client.close()
                    except Exception:
                        pass

            await self._evict_oldest()

        client = get_client(namespace, version, impersonation)

        async with self._lock:
            self._cache[key] = (time.monotonic(), client)

        if impersonation:
            logger.debug(f"Created impersonated client for {impersonation.username}")

        return client

    async def close_all(self):
        async with self._lock:
            for key, (_, client) in self._cache.items():
                if hasattr(client, "close"):
                    try:
                        await client.close()
                    except Exception:
                        pass
            self._cache.clear()
