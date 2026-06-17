"""Kubernetes A2A tasks API endpoints."""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ark_sdk.impersonation import ImpersonationConfig

from ark_sdk.client import with_ark_client

from ...auth.dependencies import get_impersonation_config

from ...models.a2a_tasks import (
    A2ATaskResponse,
    A2ATaskListResponse,
    A2ATaskDetailResponse,
    A2AServerRef,
    AgentRef,
    QueryRef,
    A2ATaskStatus,
    A2ATaskArtifact,
    A2ATaskPart,
    A2ATaskMessage,
    ApprovalSubmissionRequest,
    ApprovalSubmissionResponse,
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/a2a-tasks", tags=["a2a-tasks"])

# CRD configuration
VERSION = "v1alpha1"


def a2a_task_to_response(task: dict) -> A2ATaskResponse:
    """Convert a Kubernetes A2ATask CR to a response model."""
    metadata = task.get("metadata", {})
    spec = task.get("spec", {})
    status = task.get("status", {})

    return A2ATaskResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        taskId=spec.get("taskId", ""),
        phase=status.get("phase"),
        agentRef=AgentRef(**spec.get("agentRef", {})),
        queryRef=QueryRef(**spec.get("queryRef", {})),
        creationTimestamp=metadata.get("creationTimestamp")
    )


def a2a_task_to_detail_response(task: dict) -> A2ATaskDetailResponse:
    """Convert a Kubernetes A2ATask CR to a detailed response model."""
    metadata = task.get("metadata", {})
    spec = task.get("spec", {})
    status = task.get("status", {})

    # Parse status fields
    task_status = None
    if status:
        artifacts = []
        if "artifacts" in status:
            for art in status["artifacts"]:
                parts = [A2ATaskPart(**p) for p in art.get("parts", [])]
                artifacts.append(A2ATaskArtifact(
                    artifactId=art.get("artifactId"),
                    name=art.get("name"),
                    description=art.get("description"),
                    parts=parts,
                    metadata=art.get("metadata")
                ))

        history = []
        if "history" in status:
            for msg in status["history"]:
                parts = [A2ATaskPart(**p) for p in msg.get("parts", [])]
                history.append(A2ATaskMessage(
                    messageId=msg.get("messageId"),
                    role=msg.get("role"),
                    parts=parts,
                    metadata=msg.get("metadata")
                ))

        last_status_msg = None
        if "lastStatusMessage" in status:
            msg = status["lastStatusMessage"]
            parts = [A2ATaskPart(**p) for p in msg.get("parts", [])]
            last_status_msg = A2ATaskMessage(
                messageId=msg.get("messageId"),
                role=msg.get("role"),
                parts=parts,
                metadata=msg.get("metadata")
            )

        task_status = A2ATaskStatus(
            phase=status.get("phase"),
            protocolState=status.get("protocolState"),
            protocolMetadata=status.get("protocolMetadata"),
            startTime=status.get("startTime"),
            completionTime=status.get("completionTime"),
            lastStatusTimestamp=status.get("lastStatusTimestamp"),
            error=status.get("error"),
            contextId=status.get("contextId"),
            artifacts=artifacts,
            history=history,
            lastStatusMessage=last_status_msg,
            conditions=status.get("conditions")
        )

    # a2aServerRef is optional (not present for HITL approval tasks)
    a2a_server_ref_data = spec.get("a2aServerRef")
    a2a_server_ref = None
    if a2a_server_ref_data and "name" in a2a_server_ref_data:
        a2a_server_ref = A2AServerRef(**a2a_server_ref_data)

    agent_ref_data = spec.get("agentRef")
    if not agent_ref_data or "name" not in agent_ref_data:
        raise ValueError("Missing required field 'agentRef.name' in spec")

    query_ref_data = spec.get("queryRef")
    if not query_ref_data or "name" not in query_ref_data:
        raise ValueError("Missing required field 'queryRef.name' in spec")

    return A2ATaskDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        taskId=spec.get("taskId", ""),
        a2aServerRef=a2a_server_ref,
        agentRef=AgentRef(**agent_ref_data),
        queryRef=QueryRef(**query_ref_data),
        contextId=spec.get("contextId"),
        input=spec.get("input"),
        parameters=spec.get("parameters"),
        pollInterval=spec.get("pollInterval"),
        priority=spec.get("priority"),
        timeout=spec.get("timeout"),
        ttl=spec.get("ttl"),
        status=task_status,
        metadata=metadata
    )


@router.get("", response_model=A2ATaskListResponse)
@handle_k8s_errors(operation="list", resource_type="a2a task")
async def list_a2a_tasks(request: Request, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> A2ATaskListResponse:
    """
    List all A2ATask CRs in a namespace.

    Args:
        namespace: The namespace to list A2A tasks from

    Returns:
        A2ATaskListResponse: List of all A2A tasks in the namespace
    """
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
        tasks = await ark_client.a2atasks.a_list()

        task_list = []
        for task in tasks:
            task_list.append(a2a_task_to_response(task.to_dict()))

        return A2ATaskListResponse(
            items=task_list,
            count=len(task_list)
        )


@router.get("/{task_name}", response_model=A2ATaskDetailResponse)
@handle_k8s_errors(operation="get", resource_type="a2a task")
async def get_a2a_task(request: Request, task_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> A2ATaskDetailResponse:
    """
    Get a specific A2ATask CR by name.

    Args:
        namespace: The namespace to get the A2A task from
        task_name: The name of the A2A task

    Returns:
        A2ATaskDetailResponse: The A2A task details
    """
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
        task = await ark_client.a2atasks.a_get(task_name)

        return a2a_task_to_detail_response(task.to_dict())


@router.delete("/{task_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="a2a task")
async def delete_a2a_task(request: Request, task_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"), impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config)) -> None:
    """
    Delete an A2ATask CR by name.

    Args:
        namespace: The namespace containing the A2A task
        task_name: The name of the A2A task
    """
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
        await ark_client.a2atasks.a_delete(task_name)


@router.post("/{task_name}/approval", response_model=ApprovalSubmissionResponse)
@handle_k8s_errors(operation="update", resource_type="a2a task approval")
async def submit_a2a_task_approval(
    task_name: str,
    body: ApprovalSubmissionRequest,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> ApprovalSubmissionResponse:
    """
    Submit an approval decision for a HITL A2ATask.

    The task must be in the 'input-required' phase. The decision is written to
    spec.input as JSON ({"decision": "approved"|"rejected"}); the A2ATask
    controller picks it up and transitions the task to completed or failed.
    """
    async with with_ark_client(namespace, VERSION, impersonation=impersonation) as ark_client:
        task = await ark_client.a2atasks.a_get(task_name)
        task_dict = task.to_dict()

        phase = task_dict.get("status", {}).get("phase")
        if phase != "input-required":
            raise HTTPException(
                status_code=409,
                detail=f"A2ATask {task_name} is not awaiting approval (phase: {phase})",
            )

        decision_json = json.dumps({"decision": body.decision.value})
        actual_namespace = task_dict["metadata"]["namespace"]
        await ark_client.a2atasks.a_patch(
            task_name,
            {"spec": {"input": decision_json}},
            actual_namespace,
        )

        return ApprovalSubmissionResponse(
            name=task_name,
            namespace=actual_namespace,
            taskId=task_dict.get("spec", {}).get("taskId", ""),
            decision=body.decision,
        )
