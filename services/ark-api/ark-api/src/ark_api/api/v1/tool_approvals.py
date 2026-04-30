"""API routes for ToolApprovalRequest resources."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query, Request, HTTPException

from ark_sdk.client import with_ark_client

from ...models.tool_approvals import (
    ToolApprovalResponse,
    ToolApprovalListResponse,
    ToolApprovalDetailResponse,
    ToolCallInfo,
    ToolCallAnnotations,
    ExecutionContext,
    QueryReference,
    ApproverRef,
    ToolApprovalRequestStatus,
    ApprovalDecision,
    ApprovalDecisionRequest,
    ApprovalDecisionResponse,
    ClientContext
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tool-approvals", tags=["tool-approvals"])

VERSION = "v1alpha1"


def tool_approval_to_response(tar: dict) -> ToolApprovalResponse:
    metadata = tar.get("metadata", {})
    spec = tar.get("spec", {})
    status = tar.get("status", {})

    query_ref = QueryReference(**spec.get("queryRef", {}))
    tool_calls = []
    for tc in spec.get("toolCalls", []):
        annotations = None
        if tc.get("annotations"):
            annotations = ToolCallAnnotations(**tc["annotations"])
        tool_calls.append(ToolCallInfo(
            id=tc.get("id", ""),
            name=tc.get("name", ""),
            type=tc.get("type", ""),
            arguments=tc.get("arguments", ""),
            description=tc.get("description"),
            annotations=annotations,
            agentReasoning=tc.get("agentReasoning")
        ))

    return ToolApprovalResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        queryRef=query_ref,
        toolCalls=tool_calls,
        phase=status.get("phase"),
        creationTimestamp=metadata.get("creationTimestamp")
    )


def tool_approval_to_detail_response(tar: dict) -> ToolApprovalDetailResponse:
    metadata = tar.get("metadata", {})
    spec = tar.get("spec", {})
    status = tar.get("status", {})

    query_ref = QueryReference(**spec.get("queryRef", {}))

    tool_calls = []
    for tc in spec.get("toolCalls", []):
        annotations = None
        if tc.get("annotations"):
            annotations = ToolCallAnnotations(**tc["annotations"])
        tool_calls.append(ToolCallInfo(
            id=tc.get("id", ""),
            name=tc.get("name", ""),
            type=tc.get("type", ""),
            arguments=tc.get("arguments", ""),
            description=tc.get("description"),
            annotations=annotations,
            agentReasoning=tc.get("agentReasoning")
        ))

    approvers = None
    if spec.get("approvers"):
        approvers = [ApproverRef(**a) for a in spec["approvers"]]

    exec_ctx_data = spec.get("executionContext", {})
    exec_ctx = ExecutionContext(
        conversationHistory=exec_ctx_data.get("conversationHistory", ""),
        pendingToolCallIndex=exec_ctx_data.get("pendingToolCallIndex", 0),
        completedToolResults=exec_ctx_data.get("completedToolResults"),
        agentName=exec_ctx_data.get("agentName", ""),
        agentNamespace=exec_ctx_data.get("agentNamespace", "")
    )

    tar_status = None
    if status:
        decision = None
        if status.get("decision"):
            d = status["decision"]
            client_ctx = None
            if d.get("clientContext"):
                client_ctx = ClientContext(**d["clientContext"])
            decision = ApprovalDecision(
                action=d.get("action", ""),
                decidedBy=d.get("decidedBy", ""),
                decidedAt=d.get("decidedAt", ""),
                reason=d.get("reason"),
                clientContext=client_ctx
            )

        tar_status = ToolApprovalRequestStatus(
            phase=status.get("phase"),
            observedGeneration=status.get("observedGeneration"),
            requestedAt=status.get("requestedAt"),
            decision=decision,
            approvalDuration=status.get("approvalDuration"),
            conditions=status.get("conditions")
        )

    return ToolApprovalDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        queryRef=query_ref,
        toolCalls=tool_calls,
        timeout=spec.get("timeout"),
        onTimeout=spec.get("onTimeout"),
        approvers=approvers,
        reasonRequired=spec.get("reasonRequired"),
        executionContext=exec_ctx,
        status=tar_status,
        metadata=metadata
    )


@router.get("", response_model=ToolApprovalListResponse)
@handle_k8s_errors(operation="list", resource_type="tool approval request")
async def list_tool_approvals(
    namespace: Optional[str] = Query(None, description="Namespace for this request"),
    phase: Optional[str] = Query(None, description="Filter by phase (pending, approved, rejected, expired)")
) -> ToolApprovalListResponse:
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.toolapprovalrequests.a_list()

        items = []
        for item in result:
            response = tool_approval_to_response(item.to_dict())
            if phase is None or response.phase == phase:
                items.append(response)

        return ToolApprovalListResponse(items=items, count=len(items))


@router.get("/pending", response_model=ToolApprovalListResponse)
@handle_k8s_errors(operation="list", resource_type="tool approval request")
async def list_pending_approvals(
    namespace: Optional[str] = Query(None, description="Namespace for this request")
) -> ToolApprovalListResponse:
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.toolapprovalrequests.a_list()

        items = [
            tool_approval_to_response(item.to_dict())
            for item in result
            if item.to_dict().get("status", {}).get("phase") == "pending"
        ]

        return ToolApprovalListResponse(items=items, count=len(items))


@router.get("/{name}", response_model=ToolApprovalDetailResponse)
@handle_k8s_errors(operation="get", resource_type="tool approval request")
async def get_tool_approval(
    name: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request")
) -> ToolApprovalDetailResponse:
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.toolapprovalrequests.a_get(name)
        return tool_approval_to_detail_response(result.to_dict())


@router.post("/{name}/decision", response_model=ApprovalDecisionResponse)
@handle_k8s_errors(operation="update", resource_type="tool approval request")
async def submit_decision(
    name: str,
    decision: ApprovalDecisionRequest,
    request: Request,
    namespace: Optional[str] = Query(None, description="Namespace for this request")
) -> ApprovalDecisionResponse:
    async with with_ark_client(namespace, VERSION) as ark_client:
        tar = await ark_client.toolapprovalrequests.a_get(name)
        tar_dict = tar.to_dict()

        status = tar_dict.get("status", {})
        if status.get("phase") != "pending":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot submit decision: approval is in '{status.get('phase')}' phase, not 'pending'"
            )

        spec = tar_dict.get("spec", {})
        if spec.get("reasonRequired") and decision.action == "rejected" and not decision.reason:
            raise HTTPException(
                status_code=400,
                detail="Reason is required when rejecting this approval request"
            )

        user_identity = request.headers.get("X-Forwarded-User", "unknown")
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("User-Agent")

        now = datetime.now(timezone.utc).isoformat()

        new_decision = {
            "action": decision.action,
            "decidedBy": user_identity,
            "decidedAt": now,
            "reason": decision.reason,
            "clientContext": {
                "ipAddress": client_ip,
                "userAgent": user_agent
            }
        }

        status["decision"] = new_decision
        tar_dict["status"] = status

        await ark_client.toolapprovalrequests.a_update_status(name, tar_dict)

        return ApprovalDecisionResponse(
            name=name,
            namespace=tar_dict.get("metadata", {}).get("namespace", ""),
            phase=decision.action,
            decision=ApprovalDecision(
                action=decision.action,
                decidedBy=user_identity,
                decidedAt=now,
                reason=decision.reason,
                clientContext=ClientContext(ipAddress=client_ip, userAgent=user_agent)
            )
        )


@router.delete("/{name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="tool approval request")
async def delete_tool_approval(
    name: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request")
) -> None:
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.toolapprovalrequests.a_delete(name)
