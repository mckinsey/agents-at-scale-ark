"""Main FastAPI application for Ark Event Recorder."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import router
from .api.events import set_consumer
from .api.memory import set_storage
from .api.stream import set_stream_storage
from .broker import HTTPEventConsumer
from .processor import EventProcessor
from .storage import MemoryStorage, StreamStorage

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

consumer = HTTPEventConsumer()
storage = MemoryStorage()
stream_storage = StreamStorage()
processor: EventProcessor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global processor

    # Initialize API dependencies
    set_consumer(consumer)
    set_storage(storage)
    set_stream_storage(stream_storage)

    # Start event processor
    processor = EventProcessor(consumer)
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

