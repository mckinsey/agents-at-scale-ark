"""Memory API endpoints (implements MemoryInterface for Ark controller)."""

from fastapi import APIRouter, HTTPException, Query

from ark_event_manager.storage import MemoryStorage

router = APIRouter()

# Global storage instance (set by main.py)
storage: MemoryStorage | None = None


def set_storage(s: MemoryStorage) -> None:
    """Set the global storage instance."""
    global storage
    storage = s


@router.get("")
async def get_messages(session_id: str = Query(..., alias="session_id")) -> dict:
    """
    Get messages for a session (implements MemoryInterface.GetMessages).

    Args:
        session_id: Session ID to retrieve messages for

    Returns:
        JSON array of message records
    """
    if storage is None:
        raise HTTPException(status_code=503, detail="Storage not initialized")

    try:
        messages = await storage.get_messages(session_id)
        return {"messages": messages}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve messages: {str(e)}"
        ) from e


@router.post("")
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



