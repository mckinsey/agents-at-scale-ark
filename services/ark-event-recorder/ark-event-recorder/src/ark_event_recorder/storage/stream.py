"""Stream storage implementation (for real-time streaming)."""

import asyncio
import json
import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


class StreamStorage:
    """Storage for streaming chunks (ephemeral, in-memory for now)."""

    def __init__(self):
        """Initialize stream storage."""
        # TODO: Use in-memory cache with TTL for ephemeral chunks
        self.streams: dict[str, asyncio.Queue[str]] = {}

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
            from_beginning: If true, send all existing messages first
            wait_for_query: Optional timeout to wait for query execution

        Yields:
            JSON-encoded chunk strings
        """
        if query_id not in self.streams:
            self.streams[query_id] = asyncio.Queue()

        queue = self.streams[query_id]

        # TODO: If from_beginning, send historical chunks from cache

        while True:
            try:
                chunk = await queue.get()
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
        if query_id not in self.streams:
            self.streams[query_id] = asyncio.Queue()

        queue = self.streams[query_id]

        if isinstance(chunks, list):
            for chunk in chunks:
                await queue.put(chunk)
        else:
            await queue.put(chunks)

        logger.debug(f"Wrote chunk(s) to stream {query_id}")

    async def complete_stream(self, query_id: str) -> None:
        """
        Mark stream as complete.

        Args:
            query_id: Query ID
        """
        # TODO: Close stream, notify subscribers
        if query_id in self.streams:
            # Signal completion by putting None or special marker
            await self.streams[query_id].put(None)
        logger.debug(f"Completed stream {query_id}")

