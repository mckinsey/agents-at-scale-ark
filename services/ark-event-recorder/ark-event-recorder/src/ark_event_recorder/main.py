"""Main FastAPI application for Ark Event Recorder."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import router
from .broker import HTTPEventConsumer
from .processor import EventProcessor


consumer = HTTPEventConsumer()
processor: EventProcessor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global processor
    processor = EventProcessor(consumer)
    processor_task = asyncio.create_task(processor.run())
    yield
    processor_task.cancel()
    try:
        await processor_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Ark Event Recorder",
    description="Event collection and streaming system for Ark",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(router)

