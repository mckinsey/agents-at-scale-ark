"""Utility to check if a query target supports streaming via the broker."""

import logging

from ark_sdk.client import with_ark_client

from ..constants.annotations import STREAMING_SUPPORTED_ANNOTATION

logger = logging.getLogger(__name__)

EXECUTION_ENGINE_A2A = "a2a"
V1_ALPHA1 = "v1alpha1"
V1_PREALPHA1 = "v1prealpha1"


async def check_streaming_support(target_type: str, target_name: str, namespace: str) -> bool:
    """Check if the target can produce streaming chunks to the broker.

    Returns True if the target goes through the completions engine (which handles
    streaming), or if a named execution engine has opted in via annotation.
    Returns False if the target uses a named execution engine without streaming support.
    """
    if target_type != "agent":
        return True

    try:
        async with with_ark_client(namespace, V1_ALPHA1) as ark_client:
            agent = await ark_client.agents.a_get(target_name)
            agent_spec = agent.to_dict().get("spec", {})
            engine_ref = agent_spec.get("executionEngine")

            if not engine_ref or engine_ref.get("name") in (None, "", EXECUTION_ENGINE_A2A):
                return True

            engine_name = engine_ref["name"]
            engine_namespace = engine_ref.get("namespace") or namespace

        async with with_ark_client(engine_namespace, V1_PREALPHA1) as ark_client:
            engine = await ark_client.executionengines.a_get(engine_name)
            engine_meta = engine.to_dict().get("metadata", {})
            engine_annotations = engine_meta.get("annotations") or {}
            return engine_annotations.get(STREAMING_SUPPORTED_ANNOTATION) == "true"

    except Exception as e:
        logger.warning(f"Failed to check streaming support for {target_type}/{target_name}: {e}")
        return True
