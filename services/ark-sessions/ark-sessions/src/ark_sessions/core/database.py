"""Database connection and session management."""

from collections.abc import AsyncGenerator

from sqlmodel import SQLModel
from sqlmodel.ext.asyncio import AsyncSession, create_async_engine

from ark_sessions.core.config import settings
from ark_sessions.models import Message, Session, Span, SpanEvent, Trace  # noqa: F401 - Import to register models

# Create async engine
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)


async def init_db() -> None:
    """Initialize database - create all tables."""
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session (dependency)."""
    async with AsyncSession(engine) as session:
        yield session

