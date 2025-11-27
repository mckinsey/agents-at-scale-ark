"""Stream storage implementation (for real-time streaming)."""

import asyncio
import json
import logging
import time
from typing import Any, AsyncGenerator

from ark_event_manager.storage.interfaces import StreamInterface

logger = logging.getLogger(__name__)

_STREAM_TTL_SECONDS = 3600
_COMPLETION_MARKER = "__STREAM_COMPLETE__"


class StreamStorage(StreamInterface):
    """
    Storage for streaming chunks (ephemeral, in-memory).

    This is a backend-agnostic in-memory implementation with TTL.
    Can be swapped with Redis or other backends in the future.
    """

    def __init__(self, stream_ttl_seconds: int = _STREAM_TTL_SECONDS):
        """
        Initialize stream storage.

        Args:
            stream_ttl_seconds: Time-to-live for streams in seconds (default: 1 hour)
        """
        self.streams: dict[str, asyncio.Queue[Any]] = {}
        self.stream_cache: dict[str, list[Any]] = {}
        self.stream_metadata: dict[str, dict[str, Any]] = {}
        self.stream_ttl = stream_ttl_seconds
        logger.info(f"StreamStorage initialized (TTL: {stream_ttl_seconds}s)")

    def _get_or_create_stream(self, query_id: str) -> asyncio.Queue[Any]:
        """Get or create a stream queue for a query."""
        if query_id not in self.streams:
            self.streams[query_id] = asyncio.Queue()
            self.stream_cache[query_id] = []
            self.stream_metadata[query_id] = {
                "created_at": time.time(),
                "completed": False,
            }
        return self.streams[query_id]

    def _cleanup_old_streams(self) -> None:
        """Remove streams that have exceeded TTL."""
        current_time = time.time()
        to_remove = []
        for query_id, metadata in self.stream_metadata.items():
            age = current_time - metadata.get("created_at", 0)
            if age > self.stream_ttl and metadata.get("completed", False):
                to_remove.append(query_id)

        for query_id in to_remove:
            del self.streams[query_id]
            del self.stream_cache[query_id]
            del self.stream_metadata[query_id]
            logger.debug(f"Cleaned up expired stream: {query_id}")

    async def read_stream(
        self,
        query_id: str,
        from_beginning: bool = False,
        wait_for_query: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Read stream for a query.

        Args:
            query_id: Query ID
            from_beginning: If true, send all existing cached messages first
            wait_for_query: Optional timeout to wait for query execution

        Yields:
            JSON-encoded chunk strings
        """
        self._cleanup_old_streams()
        queue = self._get_or_create_stream(query_id)

        if from_beginning and query_id in self.stream_cache:
            for cached_chunk in self.stream_cache[query_id]:
                yield json.dumps(cached_chunk) if isinstance(cached_chunk, dict) else cached_chunk

        metadata = self.stream_metadata.get(query_id, {})
        if metadata.get("completed", False):
            return

        while True:
            try:
                chunk = await queue.get()
                if chunk == _COMPLETION_MARKER:
                    break

                yield json.dumps(chunk) if isinstance(chunk, dict) else chunk
            except asyncio.CancelledError:
                break

    async def write_stream(self, query_id: str, chunks: dict | list) -> None:
        """
        Write chunks to a stream.

        Args:
            query_id: Query ID
            chunks: NDJSON chunks or single chunk dict
        """
        self._cleanup_old_streams()
        queue = self._get_or_create_stream(query_id)

        if isinstance(chunks, list):
            for chunk in chunks:
                await queue.put(chunk)
                self.stream_cache[query_id].append(chunk)
        else:
            await queue.put(chunks)
            self.stream_cache[query_id].append(chunks)

        logger.debug(f"Wrote chunk(s) to stream {query_id}")

    async def complete_stream(self, query_id: str) -> None:
        """
        Mark stream as complete.

        Args:
            query_id: Query ID
        """
        if query_id in self.streams:
            await self.streams[query_id].put(_COMPLETION_MARKER)
            if query_id in self.stream_metadata:
                self.stream_metadata[query_id]["completed"] = True
        logger.debug(f"Completed stream {query_id}")



