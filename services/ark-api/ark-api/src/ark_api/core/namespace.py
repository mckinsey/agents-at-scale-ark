"""Namespace and context detection utilities."""
import logging
from ark_sdk.k8s import get_context as get_k8s_context

logger = logging.getLogger(__name__)


def get_current_context() -> dict:
    """
    Get the current Kubernetes context.

    Directly calls ark-sdk's get_context() for fresh detection.
    No caching to ensure each request gets accurate context.

    Returns:
        dict: Context with 'namespace' and 'cluster' keys
    """
    context = get_k8s_context()
    logger.debug(f"Current context: namespace={context['namespace']}, cluster={context['cluster']}")
    return context
