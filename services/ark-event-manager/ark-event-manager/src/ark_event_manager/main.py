"""Main FastAPI application for Ark Event Manager."""

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
        logger.info("Database initialized (SQLite backend)")

    # Initialize API dependencies
    set_consumer(consumer)
    set_storage(storage)
    set_stream_storage(stream_storage)

    # Start event processor
    processor = EventProcessor(
        consumer,
        stream_storage=stream_storage,
        event_storage=event_storage,
    )
    processor_task = asyncio.create_task(processor.run())
    logger.info("Ark Event Manager started")

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

