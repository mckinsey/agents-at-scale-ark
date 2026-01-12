import asyncio
import logging
import uuid
from datetime import datetime

from ark_sdk.client import V1_ALPHA1, with_ark_client
from ark_sdk.models.query_v1alpha1 import QueryV1alpha1
from ark_sdk.models.query_v1alpha1_spec import QueryV1alpha1Spec
from ark_sdk.models.query_v1alpha1_spec_target import QueryV1alpha1SpecTarget

logger = logging.getLogger(__name__)


async def post_query(
    namespace: str, target_type: str, target: str, query: str, timeout: int = 60
) -> str:
    """
    Post a query to ARK and return the query name.

    Args:
        namespace: Kubernetes namespace
        target_type: Type of target (agent, team, model, tool)
        target: Name of the target
        query: The input query text
        timeout: Timeout in seconds (default 60)

    Returns:
        The name of the created query
    """
    async with with_ark_client(namespace, V1_ALPHA1) as ark_client:
        # Create query spec
        query_spec = QueryV1alpha1Spec(
            input=query,
            target=QueryV1alpha1SpecTarget(name=target, type=target_type),
            timeout=f"{timeout}s",
        )

        # Create query object
        query_name = f"a2agw-query-{uuid.uuid4().hex[:8]}"
        query_obj = QueryV1alpha1(
            api_version="ark.mckinsey.com/v1alpha1",
            kind="Query",
            metadata={"name": query_name, "namespace": namespace},
            spec=query_spec,
        )

        # Create the query
        logger.info(f"Creating query {query_name} for {target_type}/{target}")
        await ark_client.queries.a_create(query_obj)

        return query_name


async def wait_for_query(namespace: str, query_name: str, timeout: int = 60) -> str:
    """
    Wait for a query to complete and return the result.

    Args:
        namespace: Kubernetes namespace
        query_name: Name of the query to wait for
        timeout: Timeout in seconds (default 60)

    Returns:
        The response content from the query
    """
    async with with_ark_client(namespace, V1_ALPHA1) as ark_client:
        try:
            # Poll for completion
            start_time = datetime.now()
            while (datetime.now() - start_time).total_seconds() < timeout:
                # Get latest status
                query_status = await ark_client.queries.a_get(query_name)

                if query_status.status and query_status.status.phase:
                    phase = query_status.status.phase
                    logger.debug(f"Query {query_name} phase: {phase}")

                    if phase == "done":
                        # Extract response content
                        if query_status.status.response:
                            return query_status.status.response.content or "No response content"
                        return "Query completed but no response available"

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
    namespace: str, target_type: str, target: str, query: str, timeout: int = 60
) -> str:
    """
    Post a query to ARK and wait for the result.

    Args:
        namespace: Kubernetes namespace
        target_type: Type of target (agent, team, model, tool)
        target: Name of the target
        query: The input query text
        timeout: Timeout in seconds (default 60)

    Returns:
        The response content from the query
    """
    query_name = await post_query(namespace, target_type, target, query, timeout)
    return await wait_for_query(namespace, query_name, timeout)
