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
    """ARK streaming configuration from 'ark-config-streaming' ConfigMap."""
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


async def get_streaming_base_url(config: ArkStreamingConfig, namespace: str, k8s_client) -> str:
    """Get base URL for streaming service.

    Args:
        config: Streaming configuration
        namespace: Query namespace
        k8s_client: Kubernetes client for resolving port names

    Returns:
        Base URL for streaming service

    Raises:
        ValueError: If URL cannot be constructed
    """
    service_ns = config.serviceRef.namespace or namespace

    # Look up the service to resolve port
    service = await k8s_client.read_namespaced_service(
        name=config.serviceRef.name,
        namespace=service_ns
    )

    # Find the port - it should be a name
    port_number = None
    for svc_port in service.spec.ports:
        if svc_port.name == config.serviceRef.port:
            port_number = svc_port.port
            break

    if port_number is None:
        raise ValueError(f"Port '{config.serviceRef.port}' not found in service {config.serviceRef.name}")

    # Return base URL
    return f"http://{config.serviceRef.name}.{service_ns}.svc.cluster.local:{port_number}"