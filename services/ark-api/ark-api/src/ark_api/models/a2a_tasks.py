"""A2ATask CRD response models."""
from typing import List, Dict, Optional, Any, Literal
from datetime import datetime

from pydantic import BaseModel


class A2AServerRef(BaseModel):
    """Reference to an A2AServer."""
    name: str
    namespace: Optional[str] = None


class AgentRef(BaseModel):
    """Reference to an Agent."""
    name: Optional[str] = None
    namespace: Optional[str] = None


class QueryRef(BaseModel):
    """Reference to a Query."""
    name: str
    namespace: Optional[str] = None
    responseTarget: Optional[str] = None


class A2ATaskPart(BaseModel):
    """Content part of an artifact or message."""
    kind: Literal["text", "file", "data"]
    text: Optional[str] = None
    data: Optional[str] = None
    uri: Optional[str] = None
    mimeType: Optional[str] = None
    metadata: Optional[Dict[str, str]] = None


class A2ATaskArtifact(BaseModel):
    """Artifact produced during task execution."""
    artifactId: str
    name: Optional[str] = None
    description: Optional[str] = None
    parts: List[A2ATaskPart]
    metadata: Optional[Dict[str, str]] = None


class A2ATaskMessage(BaseModel):
    """Message in the conversation history."""
    messageId: Optional[str] = None
    role: Literal["user", "agent", "system"]
    parts: List[A2ATaskPart]
    metadata: Optional[Dict[str, str]] = None


class A2ATaskStatus(BaseModel):
    """Status of the A2ATask."""
    phase: Optional[str] = None
    protocolState: Optional[str] = None
    protocolMetadata: Optional[Dict[str, str]] = None
    startTime: Optional[datetime] = None
    completionTime: Optional[datetime] = None
    lastStatusTimestamp: Optional[str] = None
    error: Optional[str] = None
    contextId: Optional[str] = None
    artifacts: Optional[List[A2ATaskArtifact]] = None
    history: Optional[List[A2ATaskMessage]] = None
    lastStatusMessage: Optional[A2ATaskMessage] = None
    conditions: Optional[List[Dict[str, Any]]] = None


class A2ATaskResponse(BaseModel):
    """A2ATask resource response model."""
    name: str
    namespace: str
    taskId: str
    phase: Optional[str] = None
    agentRef: Optional[AgentRef] = None
    queryRef: Optional[QueryRef] = None
    creationTimestamp: Optional[datetime] = None


class A2ATaskListResponse(BaseModel):
    """List of A2ATasks response model."""
    items: List[A2ATaskResponse]
    count: int


class A2ATaskDetailResponse(BaseModel):
    """Detailed A2ATask response model."""
    name: str
    namespace: str
    taskId: str
    a2aServerRef: A2AServerRef
    agentRef: AgentRef
    queryRef: QueryRef
    contextId: Optional[str] = None
    input: Optional[str] = None
    parameters: Optional[Dict[str, str]] = None
    pollInterval: Optional[str] = None
    priority: Optional[int] = None
    timeout: Optional[str] = None
    ttl: Optional[str] = None
    status: Optional[A2ATaskStatus] = None
    metadata: Optional[Dict[str, Any]] = None
