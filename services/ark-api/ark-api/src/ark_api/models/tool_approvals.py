"""Models for ToolApprovalRequest API endpoints."""
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field


class ToolCallAnnotations(BaseModel):
    destructiveHint: Optional[bool] = None
    readOnlyHint: Optional[bool] = None
    idempotentHint: Optional[bool] = None
    openWorldHint: Optional[bool] = None


class ToolCallInfo(BaseModel):
    id: str
    name: str
    type: str
    arguments: str
    description: Optional[str] = None
    annotations: Optional[ToolCallAnnotations] = None
    agentReasoning: Optional[str] = None


class ExecutionContext(BaseModel):
    conversationHistory: str
    pendingToolCallIndex: int
    completedToolResults: Optional[List[str]] = None
    agentName: str
    agentNamespace: str


class QueryReference(BaseModel):
    name: str
    namespace: str


class ApproverRef(BaseModel):
    role: Optional[str] = None
    user: Optional[str] = None
    group: Optional[str] = None


class ClientContext(BaseModel):
    ipAddress: Optional[str] = None
    userAgent: Optional[str] = None


class ApprovalDecision(BaseModel):
    action: str
    decidedBy: str
    decidedAt: str
    reason: Optional[str] = None
    clientContext: Optional[ClientContext] = None


class ToolApprovalRequestStatus(BaseModel):
    phase: Optional[str] = None
    observedGeneration: Optional[int] = None
    requestedAt: Optional[str] = None
    decision: Optional[ApprovalDecision] = None
    approvalDuration: Optional[str] = None
    conditions: Optional[List[Any]] = None


class ToolApprovalResponse(BaseModel):
    name: str
    namespace: str
    queryRef: QueryReference
    toolCalls: List[ToolCallInfo]
    phase: Optional[str] = None
    creationTimestamp: Optional[str] = None


class ToolApprovalListResponse(BaseModel):
    items: List[ToolApprovalResponse]
    count: int


class ToolApprovalDetailResponse(BaseModel):
    name: str
    namespace: str
    queryRef: QueryReference
    toolCalls: List[ToolCallInfo]
    timeout: Optional[str] = None
    onTimeout: Optional[str] = None
    approvers: Optional[List[ApproverRef]] = None
    reasonRequired: Optional[bool] = None
    executionContext: ExecutionContext
    status: Optional[ToolApprovalRequestStatus] = None
    metadata: Optional[dict] = None


class ApprovalDecisionRequest(BaseModel):
    action: str = Field(..., pattern="^(approved|rejected)$")
    reason: Optional[str] = None


class ApprovalDecisionResponse(BaseModel):
    name: str
    namespace: str
    phase: str
    decision: ApprovalDecision
