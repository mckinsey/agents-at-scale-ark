"""Main FastAPI application for Ark Event Recorder."""

import os
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from ark_event_recorder.api import router
from ark_event_recorder.api.events import set_consumer
from ark_event_recorder.api.memory import set_storage
from ark_event_recorder.api.stream import set_stream_storage
from ark_event_recorder.broker import HTTPEventConsumer
from ark_event_recorder.core import EventProcessor, close_db, init_db
from ark_event_recorder.storage import DatabaseStorage, EventStorage, MemoryStorage, StreamStorage

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
        memory_storage=storage,
        stream_storage=stream_storage,
        event_storage=event_storage,
    )
    processor_task = asyncio.create_task(processor.run())
    logger.info("Ark Event Recorder started")

    yield

    # Shutdown
    logger.info("Shutting down Ark Event Recorder...")
    if processor:
        processor.stop()
    processor_task.cancel()
    try:
        await processor_task
    except asyncio.CancelledError:
        pass

    if USE_DATABASE:
        await close_db()

    logger.info("Ark Event Recorder stopped")


app = FastAPI(
    title="Ark Event Recorder",
    description="Event collection and streaming system for Ark",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(router)


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "healthy"}

