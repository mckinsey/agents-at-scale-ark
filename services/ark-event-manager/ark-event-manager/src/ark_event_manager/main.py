"""Main FastAPI application for Ark Event Manager.

Ark Event Manager is a unified service that provides three core capabilities:

1. **Event Ingestion** (`POST /events`)
   - Receives and processes system telemetry events (JSON format)
   - Events represent what happened in the system (query started, workflow completed, etc.)
   - All events are persisted to the database for observability and analytics

2. **Memory Interface** (`GET/POST /messages`)
   - Direct implementation of MemoryInterface for Ark controllers
   - Stores and retrieves conversation messages (not a proxy)
   - Messages represent conversation/chat history for agent context

3. **Streaming Interface** (`GET/POST /stream/{query_id}`)
   - Direct implementation of streaming for real-time query execution updates
   - Provides Server-Sent Events (SSE) for live data delivery
   - Not a proxy - implements streaming functionality directly

Note: The service name "Ark Event Manager" may be somewhat misleading, as it also handles
messages and streaming. Without the `POST /events` endpoint, the service still provides
memory and streaming functionality directly - it's not just a proxy to another service.
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from ark_event_manager.api import router
from ark_event_manager.api.events import set_consumer
from ark_event_manager.api.memory import set_storage
from ark_event_manager.api.stream import set_stream_storage
from ark_event_manager.transport import HTTPEventConsumer
from ark_event_manager.core import EventProcessor, close_db, init_db
from ark_event_manager.storage import DatabaseStorage, EventStorage, MemoryStorage, StreamStorage

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"

consumer = HTTPEventConsumer()
storage = DatabaseStorage() if USE_DATABASE else MemoryStorage()
stream_storage = StreamStorage()
event_storage = EventStorage() if USE_DATABASE else None
processor: EventProcessor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global processor

    if USE_DATABASE:
        await init_db()
        logger.info("💾 Database initialized (SQLite backend)")
    else:
        logger.info("ℹ️  Using in-memory storage (database disabled)")

    # Initialize API dependencies
    set_consumer(consumer)
    set_storage(storage)
    set_stream_storage(stream_storage)
    logger.info("🔌 API dependencies initialized")

    # Start event processor
    processor = EventProcessor(
        consumer,
        stream_storage=stream_storage,
        event_storage=event_storage,
    )
    processor_task = asyncio.create_task(processor.run())
    logger.info("🚀 Ark Event Manager started and ready to receive events")
    logger.info("📡 API endpoints available:")
        logger.info("   - POST /events (JSON)")
    logger.info("   - GET /messages?session_id=<id>")
    logger.info("   - POST /messages")
    logger.info("   - GET /health")

    yield

    # Shutdown
    logger.info("Shutting down Ark Event Manager...")
    if processor:
        processor.stop()
    processor_task.cancel()
    try:
        await processor_task
    except asyncio.CancelledError:
        pass

    if USE_DATABASE:
        await close_db()

    logger.info("Ark Event Manager stopped")


app = FastAPI(
    title="Ark Event Manager",
    description="Event collection and streaming system for Ark",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(router)


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "healthy"}

