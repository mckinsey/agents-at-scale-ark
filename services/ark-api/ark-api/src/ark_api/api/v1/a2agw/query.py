import asyncio
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any, TypeGuard

from ark_sdk.client import V1_ALPHA1, with_ark_client
from ark_sdk.models.query_v1alpha1 import QueryV1alpha1
from ark_sdk.models.query_v1alpha1_spec import QueryV1alpha1Spec
from ark_sdk.models.query_v1alpha1_spec_target import QueryV1alpha1SpecTarget
from ark_api.constants.annotations import (
    A2A_CONTEXT_ID_ANNOTATION,
)

logger = logging.getLogger(__name__)


@dataclass
class QueryExecutionResult:
    content: str
    context_id: str | None = None


def _is_dict(value: object) -> TypeGuard[dict[str, Any]]:
    return isinstance(value, dict)


def _extract_context_id(response: Any) -> str | None:
    if response is None:
        return None

    a2a = response.get("a2a") if _is_dict(response) else getattr(response, "a2a", None)
    if a2a is None:
        return None
    if _is_dict(a2a):
        context_id = (
            a2a.get("contextId")
            or a2a.get("context_id")
            or a2a.get("sessionId")
            or a2a.get("session_id")
        )
        return context_id if isinstance(context_id, str) and context_id else None

    context_id = (
        getattr(a2a, "context_id", None)
        or getattr(a2a, "contextId", None)
        or getattr(a2a, "session_id", None)
        or getattr(a2a, "sessionId", None)
    )
    return context_id if isinstance(context_id, str) and context_id else None


async def post_query(
    namespace: str,
    target_type: str,
    target: str,
    query_input: str | list[dict[str, Any]],
    query_type: str = "user",
    timeout: int = 60,
    context_id: str | None = None,
) -> str:
    """
    Post a query to ARK and return the query name.

    Args:
        namespace: Kubernetes namespace
        target_type: Type of target (agent, team, model, tool)
        target: Name of the target
        query_input: The input query payload
        query_type: The query input type (user|messages)
        timeout: Timeout in seconds (default 60)
        context_id: A2A conversation context ID

    Returns:
        The name of the created query
    """
    async with with_ark_client(namespace, V1_ALPHA1) as ark_client:
        # Create query spec
        query_spec = QueryV1alpha1Spec(
            input=query_input,
            type=query_type,
            target=QueryV1alpha1SpecTarget(name=target, type=target_type),
            timeout=f"{timeout}s",
        )

        # Create query object
        query_name = f"a2agw-query-{uuid.uuid4().hex[:12]}"
        metadata: dict[str, Any] = {"name": query_name, "namespace": namespace}
        annotations: dict[str, str] = {}
        if context_id:
            annotations[A2A_CONTEXT_ID_ANNOTATION] = context_id
        if annotations:
            metadata["annotations"] = annotations
        query_obj = QueryV1alpha1(
            api_version="ark.mckinsey.com/v1alpha1",
            kind="Query",
            metadata=metadata,
            spec=query_spec,
        )

        # Create the query
        logger.info(f"Creating query {query_name} for {target_type}/{target}")
        await ark_client.queries.a_create(query_obj)

        return query_name


async def wait_for_query(namespace: str, query_name: str, timeout: int = 60) -> QueryExecutionResult:
    """
    Wait for a query to complete and return the result.

    Args:
        namespace: Kubernetes namespace
        query_name: Name of the query to wait for
        timeout: Timeout in seconds (default 60)

    Returns:
        The response content and A2A context metadata
    """
    async with with_ark_client(namespace, V1_ALPHA1) as ark_client:
        try:
            # Poll for completion
            start_time = time.monotonic()
            while time.monotonic() - start_time < timeout:
                # Get latest status
                query_status = await ark_client.queries.a_get(query_name)

                if query_status.status and query_status.status.phase:
                    phase = query_status.status.phase
                    logger.debug(f"Query {query_name} phase: {phase}")

                    if phase == "done":
                        # Extract response content
                        if query_status.status.response:
                            content = query_status.status.response.content or "No response content"
                            context_id = _extract_context_id(query_status.status.response)
                            return QueryExecutionResult(content=content, context_id=context_id)
                        return QueryExecutionResult(content="Query completed but no response available")

                    elif phase == "error":
                        error_msg = "Query failed"
                        if query_status.status.response:
                            error_msg = query_status.status.response.content or error_msg
                        raise Exception(f"Query error: {error_msg}")

                # Wait before next poll
                await asyncio.sleep(1)

            # Timeout reached
            raise Exception(f"Query timeout after {timeout} seconds")

        except Exception as e:
            logger.error(f"Error waiting for query: {str(e)}")
            raise


async def post_query_and_wait(
    namespace: str,
    target_type: str,
    target: str,
    query_input: str | list[dict[str, Any]],
    query_type: str = "user",
    timeout: int = 60,
    context_id: str | None = None,
) -> QueryExecutionResult:
    """
    Post a query to ARK and wait for the result.

    Args:
        namespace: Kubernetes namespace
        target_type: Type of target (agent, team, model, tool)
        target: Name of the target
        query_input: The input query payload
        query_type: The query input type (user|messages)
        timeout: Timeout in seconds (default 60)
        context_id: A2A conversation context ID

    Returns:
        The response content and A2A context metadata
    """
    query_name = await post_query(
        namespace,
        target_type,
        target,
        query_input,
        query_type=query_type,
        timeout=timeout,
        context_id=context_id,
    )
    return await wait_for_query(namespace, query_name, timeout)
