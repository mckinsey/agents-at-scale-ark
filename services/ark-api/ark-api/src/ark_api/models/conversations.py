"""Pydantic models for conversation endpoints."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class ConversationResponse(BaseModel):
    """Response model for a conversation."""
    conversationId: str
    memoryName: str
    queries: Optional[List[str]] = None
    messageCount: Optional[int] = None
    lastActivity: Optional[datetime] = None


class ConversationListResponse(BaseModel):
    """Response model for listing conversations."""
    items: List[ConversationResponse]
    total: Optional[int] = None


class MemoryMessageResponse(BaseModel):
    """Response model for a memory message with context."""
    timestamp: Optional[datetime] = None
    memoryName: str
    conversationId: str
    queryId: Optional[str] = None
    message: dict  # Raw JSON message object
    sequence: Optional[int] = None


class MemoryMessageListResponse(BaseModel):
    """Response model for listing memory messages."""
    items: List[MemoryMessageResponse]
    total: Optional[int] = None
