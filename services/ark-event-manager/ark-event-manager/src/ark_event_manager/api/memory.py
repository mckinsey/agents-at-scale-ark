"""Memory API endpoints (implements MemoryInterface for Ark controller)."""

from fastapi import HTTPException, Query

from ark_event_manager.storage import MemoryStorage

# Global storage instance (set by main.py)
storage: MemoryStorage | None = None


def set_storage(s: MemoryStorage) -> None:
    """Set the global storage instance."""
    global storage
    storage = s


async def get_messages(
    session_id: str | None = Query(None, alias="session_id"),
    query_id: str | None = Query(None, alias="query_id"),
) -> dict:
    """
    Get messages with optional filtering (implements MemoryInterface.GetMessages).

    Args:
        session_id: Optional session ID to filter by
        query_id: Optional query ID to filter by

    Returns:
        JSON object with messages array (format matches ark-cluster-memory)
    """
    if storage is None:
        raise HTTPException(status_code=503, detail="Storage not initialized")

    try:
        if session_id:
            # If session_id is provided, use the simple get_messages (for backward compatibility)
            messages = await storage.get_messages(session_id)
            # Format as array of message objects (not wrapped in timestamp/session_id)
            return {"messages": messages}
        else:
            # If no session_id, get all messages with filtering
            all_messages = await storage.get_all_messages(session_id=session_id, query_id=query_id)
            return {"messages": all_messages}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve messages: {str(e)}"
        ) from e


async def get_sessions() -> dict:
    """
    Get all session IDs (implements MemoryInterface.GetSessions).

    Returns:
        JSON object with sessions array
    """
    if storage is None:
        raise HTTPException(status_code=503, detail="Storage not initialized")

    try:
        sessions = await storage.get_sessions()
        return {"sessions": sessions}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve sessions: {str(e)}"
        ) from e


async def add_messages(data: dict) -> dict:
    """
    Add messages to a session (implements MemoryInterface.AddMessages).

    Request body:
        {
            "session_id": "...",
            "query_id": "...",
            "messages": [...]
        }

    Returns:
        200 OK on success
    """
    if storage is None:
        raise HTTPException(status_code=503, detail="Storage not initialized")

    session_id = data.get("session_id")
    query_id = data.get("query_id")
    messages = data.get("messages", [])

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    if not messages:
        raise HTTPException(status_code=400, detail="messages array is required")

    try:
        await storage.add_messages(session_id, query_id, messages)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to add messages: {str(e)}"
        ) from e



