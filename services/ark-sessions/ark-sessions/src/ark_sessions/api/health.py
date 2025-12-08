"""Health check handlers."""


async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "ark-sessions"}

