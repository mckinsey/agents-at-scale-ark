"""FastAPI application for ark-sessions service."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from ark_sessions.api import router
from ark_sessions.core.config import logger, settings
from ark_sessions.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting ark-sessions service...")
    
    # Initialize database
    await init_db()
    logger.info("Database initialized")
    
    yield
    
    # Shutdown
    logger.info("Shutting down ark-sessions service...")


app = FastAPI(
    title="ARK Sessions",
    description="Session management service for OTEL trace ingestion",
    version="0.1.0",
    lifespan=lifespan,
)

# Include API routes
app.include_router(router)

