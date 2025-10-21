"""Authentication models for API keys."""
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class APIKeyCreateRequest(BaseModel):
    """Request model for creating an API key."""
    name: str = Field(..., description="Human-readable name for the API key", example="Production Service Key")
    expires_at: Optional[datetime] = Field(None, description="Optional expiration date for the API key", example="2024-12-31T23:59:59Z")


class APIKeyResponse(BaseModel):
    """API key response model (without secret key)."""
    id: str = Field(..., description="Unique identifier for the API key", example="abc123-def456")
    name: str = Field(..., description="Human-readable name for the API key", example="Production Service Key")
    public_key: str = Field(..., description="Public key for authentication", example="pk-ark-abcd1234...")
    created_at: datetime = Field(..., description="When the API key was created", example="2024-01-01T00:00:00Z")
    last_used_at: Optional[datetime] = Field(None, description="When the API key was last used", example="2024-06-01T12:00:00Z")
    expires_at: Optional[datetime] = Field(None, description="When the API key expires", example="2024-12-31T23:59:59Z")
    is_active: bool = Field(..., description="Whether the API key is active (not soft-deleted)", example=True)


class APIKeyCreateResponse(BaseModel):
    """Response model for API key creation (includes secret key)."""
    id: str = Field(..., description="Unique identifier for the API key", example="abc123-def456")
    name: str = Field(..., description="Human-readable name for the API key", example="Production Service Key")
    public_key: str = Field(..., description="Public key for authentication", example="pk-ark-abcd1234...")
    secret_key: str = Field(..., description="Secret key for authentication (only returned on creation)", example="sk-ark-efgh5678...")
    created_at: datetime = Field(..., description="When the API key was created", example="2024-01-01T00:00:00Z")
    expires_at: Optional[datetime] = Field(None, description="When the API key expires", example="2024-12-31T23:59:59Z")


class APIKeyListResponse(BaseModel):
    """List of API keys response model."""
    items: List[APIKeyResponse] = Field(..., description="List of API keys")
    count: int = Field(..., description="Total number of API keys", example=5)
