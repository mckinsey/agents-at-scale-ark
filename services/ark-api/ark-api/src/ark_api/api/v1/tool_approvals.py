"""API routes for ToolInteraction resources (human-in-the-loop)."""
import logging
from datetime import datetime, timezone
from typing import Optional, List

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


def is_user_authorized(
    approvers: Optional[List[dict]],
    user_identity: str,
    user_groups: Optional[str],
    user_roles: Optional[str]
) -> bool:
    if not approvers:
        return True

    groups = set(g.strip() for g in (user_groups or "").split(",") if g.strip())
    roles = set(r.strip() for r in (user_roles or "").split(",") if r.strip())

    for approver in approvers:
        if approver.get("user") and approver["user"] == user_identity:
            return True
        if approver.get("group") and approver["group"] in groups:
            return True
        if approver.get("role") and approver["role"] in roles:
            return True

    return False


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
        response = status.get("response")
        if response:
            client_ctx = None
            if response.get("clientContext"):
                client_ctx = ClientContext(**response["clientContext"])
            approval = response.get("approval", {})
            decision = ApprovalDecision(
                action=approval.get("action", ""),
                respondedBy=response.get("respondedBy", ""),
                respondedAt=response.get("respondedAt", ""),
                reason=approval.get("reason"),
                clientContext=client_ctx
            )

        tar_status = ToolApprovalRequestStatus(
            phase=status.get("phase"),
            observedGeneration=status.get("observedGeneration"),
            requestedAt=status.get("requestedAt"),
            decision=decision,
            approvalDuration=status.get("responseDuration"),
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
@handle_k8s_errors(operation="list", resource_type="tool interaction")
async def list_tool_approvals(
    namespace: Optional[str] = Query(None, description="Namespace for this request"),
    phase: Optional[str] = Query(None, description="Filter by phase (pending, approved, rejected, expired)")
) -> ToolApprovalListResponse:
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.toolinteractions.a_list()

        items = []
        for item in result:
            response = tool_approval_to_response(item.to_dict())
            if phase is None or response.phase == phase:
                items.append(response)

        return ToolApprovalListResponse(items=items, count=len(items))


@router.get("/pending", response_model=ToolApprovalListResponse)
@handle_k8s_errors(operation="list", resource_type="tool interaction")
async def list_pending_approvals(
    namespace: Optional[str] = Query(None, description="Namespace for this request")
) -> ToolApprovalListResponse:
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.toolinteractions.a_list()

        items = [
            tool_approval_to_response(item.to_dict())
            for item in result
            if item.to_dict().get("status", {}).get("phase") == "pending"
        ]

        return ToolApprovalListResponse(items=items, count=len(items))


@router.get("/{name}", response_model=ToolApprovalDetailResponse)
@handle_k8s_errors(operation="get", resource_type="tool interaction")
async def get_tool_approval(
    name: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request")
) -> ToolApprovalDetailResponse:
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.toolinteractions.a_get(name)
        return tool_approval_to_detail_response(result.to_dict())


@router.post("/{name}/decision", response_model=ApprovalDecisionResponse)
@handle_k8s_errors(operation="update", resource_type="tool interaction")
async def submit_decision(
    name: str,
    decision: ApprovalDecisionRequest,
    request: Request,
    namespace: Optional[str] = Query(None, description="Namespace for this request")
) -> ApprovalDecisionResponse:
    async with with_ark_client(namespace, VERSION) as ark_client:
        ti = await ark_client.toolinteractions.a_get(name)
        ti_dict = ti.to_dict()

        status = ti_dict.get("status", {})
        if status.get("phase") != "pending":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot submit decision: interaction is in '{status.get('phase')}' phase, not 'pending'"
            )

        if status.get("response") is not None:
            raise HTTPException(
                status_code=409,
                detail="A response has already been submitted for this interaction"
            )

        spec = ti_dict.get("spec", {})

        user_identity = request.headers.get("X-Forwarded-User", "unknown")
        user_groups = request.headers.get("X-Forwarded-Groups")
        user_roles = request.headers.get("X-Forwarded-Roles")

        approvers = spec.get("approvers")
        if not is_user_authorized(approvers, user_identity, user_groups, user_roles):
            raise HTTPException(
                status_code=403,
                detail="User is not authorized to approve or reject this interaction"
            )

        if spec.get("reasonRequired") and decision.action == "rejected" and not decision.reason:
            raise HTTPException(
                status_code=400,
                detail="Reason is required when rejecting this interaction"
            )

        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("User-Agent")

        now = datetime.now(timezone.utc).isoformat()

        new_response = {
            "respondedAt": now,
            "respondedBy": user_identity,
            "clientContext": {
                "ipAddress": client_ip,
                "userAgent": user_agent
            },
            "approval": {
                "action": decision.action,
                "reason": decision.reason
            }
        }

        status["response"] = new_response
        ti_dict["status"] = status

        await ark_client.toolinteractions.a_update_status(name, ti_dict)

        return ApprovalDecisionResponse(
            name=name,
            namespace=ti_dict.get("metadata", {}).get("namespace", ""),
            phase=decision.action,
            decision=ApprovalDecision(
                action=decision.action,
                respondedBy=user_identity,
                respondedAt=now,
                reason=decision.reason,
                clientContext=ClientContext(ipAddress=client_ip, userAgent=user_agent)
            )
        )


@router.delete("/{name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="tool interaction")
async def delete_tool_approval(
    name: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request")
) -> None:
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.toolinteractions.a_delete(name)
