from typing import Dict, Optional
from pydantic import BaseModel, Field, field_validator
from enum import Enum
from ..types import QueryRef, Model

# Compatibility aliases for backward compatibility
class DirectRequest(BaseModel):
    """Compatibility wrapper for direct evaluation requests"""
    input: str
    output: str
    model: Optional[Model] = None
    parameters: Optional[Dict[str, str]] = Field(default_factory=dict)
    mode: str = "direct"  # For backward compatibility

class QueryRefRequest(BaseModel):
    """Compatibility wrapper for query reference evaluation requests"""
    queryRef: QueryRef
    model: Optional[Model] = None
    parameters: Optional[Dict[str, str]] = Field(default_factory=dict)