"""Ark broker client for streaming OpenAI-format chunks to the ark-broker service."""

import json
import logging
import time
from typing import Optional
from urllib.parse import quote

import httpx

from .streaming_config import get_streaming_config, get_streaming_base_url

try:
    from kubernetes_asyncio.client.api_client import ApiClient
    from .k8s import init_k8s
except ImportError:
    ApiClient = None  # type: ignore[assignment,misc]
    init_k8s = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

_STREAM_TIMEOUT = httpx.Timeout(connect=5.0, read=None, write=None, pool=5.0)
_COMPLETE_TIMEOUT = httpx.Timeout(10.0)

_cached_broker_url: Optional[str] = None
_broker_url_cached = False


async def discover_broker_url(namespace: str) -> Optional[str]:
    """Discover the ark-broker streaming base URL from the ark-config-streaming ConfigMap.

    Returns the base URL or None if the ConfigMap is absent or streaming is disabled.
    Result is cached for the lifetime of the process.
    """
    global _cached_broker_url, _broker_url_cached
    if _broker_url_cached:
        return _cached_broker_url

    try:
        from kubernetes_asyncio import client
        await init_k8s()
        async with ApiClient() as api:
            v1 = client.CoreV1Api(api)
            config = await get_streaming_config(v1, namespace)
            if config and config.enabled:
                _cached_broker_url = await get_streaming_base_url(config, namespace, v1)
            else:
                _cached_broker_url = None
    except Exception as e:
        logger.warning(f"Broker discovery failed: {e}")
        _cached_broker_url = None

    _broker_url_cached = True
    return _cached_broker_url


class BrokerClient:
    """Sends OpenAI-format completion chunks to the ark-broker streaming endpoint."""

    def __init__(self, base_url: str, query_name: str, session_id: str = "", agent_name: str = ""):
        self.base_url = base_url
        self.query_name = query_name
        self.session_id = session_id
        self.agent_name = agent_name

    def _build_chunk(self, content: str, finish_reason: Optional[str] = None) -> bytes:
        chunk = {
            "id": self.query_name,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": f"agent/{self.agent_name}" if self.agent_name else "unknown",
            "choices": [{
                "index": 0,
                "delta": {
                    "role": "assistant",
                    "content": content,
                },
                "finish_reason": finish_reason,
            }],
            "ark": {
                "query": self.query_name,
                "session": self.session_id,
                "agent": self.agent_name,
            },
        }
        return (json.dumps(chunk) + "\n").encode()

    async def send_chunk(self, content: str, finish_reason: Optional[str] = None) -> None:
        url = f"{self.base_url}/stream/{quote(self.query_name)}"
        try:
            async with httpx.AsyncClient(timeout=_STREAM_TIMEOUT) as http:
                resp = await http.post(
                    url,
                    content=self._build_chunk(content, finish_reason),
                    headers={"Content-Type": "application/x-ndjson"},
                )
                if resp.status_code not in (200, 202):
                    logger.warning(f"Broker stream returned {resp.status_code} for query {self.query_name}")
        except Exception as e:
            logger.warning(f"Failed to send chunk to broker for query {self.query_name}: {e}")

    async def complete(self) -> None:
        url = f"{self.base_url}/stream/{quote(self.query_name)}/complete"
        try:
            async with httpx.AsyncClient(timeout=_COMPLETE_TIMEOUT) as http:
                resp = await http.post(url, json={})
                if resp.status_code not in (200, 202):
                    logger.warning(f"Broker complete returned {resp.status_code} for query {self.query_name}")
        except Exception as e:
            logger.warning(f"Failed to notify broker completion for query {self.query_name}: {e}")
