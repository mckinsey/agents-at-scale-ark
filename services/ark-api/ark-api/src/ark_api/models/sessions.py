"""Pydantic models for session endpoints."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class SessionResponse(BaseModel):
    """Response model for a session."""
    sessionId: str
    memoryName: str
    queries: Optional[List[str]] = None
    messageCount: Optional[int] = None
    lastActivity: Optional[datetime] = None


class SessionListResponse(BaseModel):
    """Response model for listing sessions."""
    items: List[SessionResponse]
    total: Optional[int] = None


class MemoryMessageResponse(BaseModel):
    """Response model for a memory message with context."""
    timestamp: Optional[datetime] = None
    memoryName: str
    sessionId: str
    queryId: Optional[str] = None
    message: dict  # Raw JSON message object
    sequence: Optional[int] = None


class MemoryMessageListResponse(BaseModel):
    """Response model for listing memory messages."""
    items: List[MemoryMessageResponse]
    total: Optional[int] = None