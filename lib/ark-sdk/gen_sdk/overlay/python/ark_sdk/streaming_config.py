"""Streaming configuration from ConfigMap."""

from typing import Optional
from dataclasses import dataclass
import yaml

# ConfigMap name for streaming configuration
STREAMING_CONFIG_NAME = "ark-config-streaming"


@dataclass
class ServiceRef:
    """Service reference for streaming."""
    name: str
    port: str
    namespace: Optional[str] = None


@dataclass
class ArkStreamingConfig:
    """ARK streaming configuration."""
    enabled: bool
    serviceRef: ServiceRef

    @classmethod
    def from_dict(cls, data: dict) -> 'ArkStreamingConfig':
        """Create from dictionary."""
        enabled = str(data.get("enabled", "false")).lower() == "true"
        service_ref_data = yaml.safe_load(data.get("serviceRef", "{}"))
        service_ref = ServiceRef(**service_ref_data)
        return cls(enabled=enabled, serviceRef=service_ref)


async def get_streaming_config(k8s_client, namespace: str) -> Optional[ArkStreamingConfig]:
    """Get streaming configuration from ConfigMap.

    Args:
        k8s_client: Kubernetes async CoreV1Api client
        namespace: Namespace to look for the ConfigMap

    Returns:
        ArkStreamingConfig if ConfigMap exists, None if not found
        Raises exception for other errors
    """
    try:
        cm = await k8s_client.read_namespaced_config_map(
            name=STREAMING_CONFIG_NAME,
            namespace=namespace
        )
    except Exception as e:
        if hasattr(e, 'status') and e.status == 404:
            return None
        raise

    return ArkStreamingConfig.from_dict(cm.data)


def get_streaming_url(query_name: str, config: ArkStreamingConfig, namespace: str) -> str:
    """Get streaming URL for a query.

    Args:
        query_name: Name of the query
        config: Streaming configuration
        namespace: Query namespace

    Returns:
        Streaming URL

    Raises:
        ValueError: If URL cannot be constructed
    """
    if not config:
        raise ValueError("No streaming configuration provided")

    if not config.serviceRef.name or not config.serviceRef.port:
        raise ValueError("Invalid streaming configuration: missing service name or port")

    # Build service URL
    service_ns = config.serviceRef.namespace or namespace
    base_url = f"http://{config.serviceRef.name}.{service_ns}.svc.cluster.local:{config.serviceRef.port}"

    # Construct streaming URL with query parameters:
    # - from-beginning=true: Start streaming from the first event
    # - wait-for-query=30s: Wait up to 30s for query to begin
    return f"{base_url}/stream/{query_name}?from-beginning=true&wait-for-query=30s"