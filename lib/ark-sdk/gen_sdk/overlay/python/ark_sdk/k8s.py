"""Kubernetes utilities and client initialization."""
import functools
import logging
import os
from functools import lru_cache

from kubernetes import config
from kubernetes.config.config_exception import ConfigException
from kubernetes_asyncio import client, config as async_config
from kubernetes_asyncio.client import Configuration
import base64
from typing import Dict, List, Optional, Tuple
from kubernetes import client as sync_client
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.annotations import ARK_ANNOTATION_PREFIX, filter_ark_annotations
from ark_sdk.labels import (
    ARK_RESOURCE_TYPE_LABEL,
    CONFIGURATION_LABEL_SELECTOR,
    CONFIGURATION_RESOURCE_TYPE,
    labels_to_tags,
    strip_tag_labels,
    tags_to_labels,
)
from ark_sdk.impersonation_patch import apply as _apply_impersonation_patch

logger = logging.getLogger(__name__)

USER_AGENT = "ArkSDK"

# Make multi-group impersonation work for every ark_sdk consumer. Every path that
# builds a Kubernetes client imports this module (the async clients here, the
# generated sync clients in versions.py, and client.py), so applying the patch on
# import guarantees a comma-joined Impersonate-Group is split into repeated
# headers before it reaches the API server. Idempotent and a no-op unless a
# comma-joined header is actually present.
_apply_impersonation_patch()


def create_sync_api_client() -> sync_client.ApiClient:
    """Create a sync Kubernetes ApiClient with the Ark user-agent."""
    api = sync_client.ApiClient()
    api.user_agent = USER_AGENT
    return api


def create_api_client() -> ApiClient:
    """Create an async Kubernetes ApiClient with the Ark user-agent."""
    api = ApiClient()
    api.user_agent = USER_AGENT
    return api

NS_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/namespace"

def get_namespace():
    """Get current namespace using standard Kubernetes patterns."""
    context_info = get_context()
    return context_info.get('namespace', 'default')

def get_context():
    """
    Get current Kubernetes context information.

    Returns:
        dict: Context information with 'namespace' and 'cluster' keys

    Follows standard k8s tool patterns:
    1. Try /var/run/secrets/kubernetes.io/serviceaccount/namespace (in-cluster)
    2. Fall back to ~/.kube/config context (dev mode)
    3. Fall back to 'default' namespace

    Note: Does not cache results to ensure multiple clients see correct context.
    """

    # First try: in-cluster service account (preferred when running in pods)
    if os.path.isfile(NS_PATH):
        try:
            with open(NS_PATH) as f:
                namespace = f.read().strip()
            logger.info(f"Using in-cluster namespace: {namespace}")
            return {
                'namespace': namespace,
                'cluster': None  # Cluster name not available in standard in-cluster setup
            }
        except Exception as e:
            logger.warning(f"Failed to read in-cluster namespace: {e}")

    # Second try: kubeconfig context (dev mode)
    try:
        _, active_context = config.list_kube_config_contexts()
        if active_context and 'context' in active_context:
            ctx = active_context['context']
            namespace = ctx.get('namespace') or 'default'
            cluster = ctx.get('cluster', None)
            logger.info(f"Using kubeconfig context namespace: {namespace}, cluster: {cluster}")
            return {
                'namespace': namespace,
                'cluster': cluster
            }
    except Exception as e:
        logger.warning(f"Failed to read kubeconfig context: {e}")

    # Final fallback
    logger.info("Using fallback namespace: default")
    return {
        'namespace': 'default',
        'cluster': None
    }

def is_k8s():
    """Check if running in a Kubernetes cluster."""
    return os.path.isfile(NS_PATH)

@lru_cache(maxsize=1)
def _init_k8s():
    """Initialize Kubernetes client configuration."""
    try:
        # Load kubeconfig from default location (~/.kube/config)
        config.load_kube_config()
        logger.info("Loaded kubeconfig from default location (probably dev mode)")
        
        # Log the current context for debugging
        _, active_context = config.list_kube_config_contexts()
        if active_context:
            logger.info(f"Active context: {active_context['name']}")
            
    except ConfigException:
        try:
            # Try to load in-cluster config if running inside a pod
            config.load_incluster_config()
            logger.info("Loaded in-cluster config")
        except ConfigException as e:
            logger.error(f"Failed to load any Kubernetes config: {e}")
            raise


async def init_k8s():
    """Initialize Kubernetes async client configuration by wrapping sync init."""
    if Configuration.get_default_copy().host:
        return
    _init_k8s()
    try:
        await async_config.load_kube_config()
    except:
        async_config.load_incluster_config()


class SecretClient:
    """Kubernetes Secret management client."""

    def __init__(self, namespace: Optional[str] = None, impersonation: Optional['ImpersonationConfig'] = None, default_headers: Optional[Dict[str, str]] = None):
        if namespace is None:
            namespace = get_context()["namespace"]
        self.namespace = namespace
        self.impersonation = impersonation
        self.default_headers = default_headers

    def _get_api_client(self, api: ApiClient) -> ApiClient:
        """Configure API client with impersonation headers if needed."""
        if self.default_headers:
            for header_name, header_value in self.default_headers.items():
                api.set_default_header(header_name, header_value)
        if self.impersonation:
            api.set_default_header("Impersonate-User", self.impersonation.username)
            if self.impersonation.groups:
                # set_default_header stores headers in a plain dict, so groups must
                # be comma-joined here. impersonation_patch splits this back into
                # one Impersonate-Group header per group at the transport layer.
                api.set_default_header("Impersonate-Group", ",".join(self.impersonation.groups))
        return api

    def validate_and_encode_token(self, string_data: dict) -> dict:
        """Validate token field. Kubernetes will handle base64 encoding via string_data."""
        if not string_data:
            raise ValueError("Secret data cannot be empty")
        
        allowed_fields = {"token"}
        provided_fields = set(string_data.keys())
        
        if provided_fields != allowed_fields:
            invalid_fields = provided_fields - allowed_fields
            raise ValueError(f"Only 'token' field is allowed. Invalid fields: {', '.join(invalid_fields)}")
        
        return string_data
    
    def calculate_secret_length(self, secret_data: dict) -> int:
        """Calculate total length of secret data."""
        total_length = 0
        for key, value in secret_data.items():
            if isinstance(value, str):
                total_length += len(value.encode('utf-8'))
            else:
                total_length += len(str(value).encode('utf-8'))
        return total_length
    
    async def list_secrets(self, label_selector: Optional[str] = None):
        """List all secrets in namespace."""
        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)
            secrets = await v1.list_namespaced_secret(
                namespace=self.namespace,
                label_selector=label_selector
            )
            
            secret_list = []
            for secret in secrets.items:
                secret_list.append({
                    "name": secret.metadata.name,
                    "id": str(secret.metadata.uid),
                    "annotations": filter_ark_annotations(secret.metadata.annotations)
                })
            
            return {
                "items": secret_list,
                "count": len(secret_list)
            }
    
    async def create_secret(self, name: str, string_data: Dict[str, str], secret_type: str = "Opaque"):
        """Create a new secret."""
        validated_data = self.validate_and_encode_token(string_data)
        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)

            secret = client.V1Secret(
                api_version="v1",
                kind="Secret",
                metadata=client.V1ObjectMeta(name=name),
                string_data=validated_data,
                type=secret_type
            )
            
            created_secret = await v1.create_namespaced_secret(
                namespace=self.namespace, 
                body=secret
            )
            
            return {
                "name": created_secret.metadata.name,
                "id": str(created_secret.metadata.uid),
                "type": created_secret.type,
                "secret_length": self.calculate_secret_length(validated_data),
                "annotations": filter_ark_annotations(created_secret.metadata.annotations)
            }
    
    async def get_secret(self, name: str):
        """Get a specific secret."""
        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)
            secret = await v1.read_namespaced_secret(
                name=name,
                namespace=self.namespace
            )

            return {
                "name": secret.metadata.name,
                "id": str(secret.metadata.uid),
                "type": secret.type,
                "secret_length": self.calculate_secret_length(secret.data or {}),
                "keys": sorted((secret.data or {}).keys()),
                "annotations": filter_ark_annotations(secret.metadata.annotations)
            }

    async def get_secret_value(self, name: str, key: str):
        """Get a specific secret."""
        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)
            secret = await v1.read_namespaced_secret(
                name=name, 
                namespace=self.namespace
            )
            if key not in secret.data:
                raise ValueError(f"Invalid key {key} for secret {name}")
                
            return {
                "name": secret.metadata.name,
                "id": str(secret.metadata.uid),
                "type": secret.type,
                "value": secret.data[key],
            }

    
    async def update_secret(self, name: str, string_data: Dict[str, str]):
        """Update an existing secret."""
        validated_data = self.validate_and_encode_token(string_data)
        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)

            existing_secret = await v1.read_namespaced_secret(
                name=name, 
                namespace=self.namespace
            )
            
            existing_secret.string_data = validated_data
            
            updated_secret = await v1.replace_namespaced_secret(
                name=name,
                namespace=self.namespace,
                body=existing_secret
            )
            
            return {
                "name": updated_secret.metadata.name,
                "id": str(updated_secret.metadata.uid),
                "type": updated_secret.type,
                "secret_length": self.calculate_secret_length(validated_data),
                "annotations": filter_ark_annotations(updated_secret.metadata.annotations)
            }
    
    async def delete_secret(self, name: str) -> bool:
        """Delete a secret."""
        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)
            await v1.delete_namespaced_secret(
                name=name,
                namespace=self.namespace
            )
            return True


CONFIGURATION_DATA_KEY = "value"
DESCRIPTION_ANNOTATION = f"{ARK_ANNOTATION_PREFIX}description"
ALIAS_ANNOTATION = f"{ARK_ANNOTATION_PREFIX}alias"


class ConfigurationClient:
    """Ark Configuration management client, backed by Kubernetes ConfigMaps."""

    def __init__(self, namespace: Optional[str] = None, impersonation: Optional['ImpersonationConfig'] = None):
        if namespace is None:
            namespace = get_context()["namespace"]
        self.namespace = namespace
        self.impersonation = impersonation

    def _get_api_client(self, api: ApiClient) -> ApiClient:
        """Configure API client with impersonation headers if needed."""
        if self.impersonation:
            api.set_default_header("Impersonate-User", self.impersonation.username)
            if self.impersonation.groups:
                api.set_default_header("Impersonate-Group", ",".join(self.impersonation.groups))
        return api

    @staticmethod
    def _to_configuration(config_map) -> Dict:
        annotations = config_map.metadata.annotations or {}
        return {
            "name": config_map.metadata.name,
            "id": str(config_map.metadata.uid),
            "value": (config_map.data or {}).get(CONFIGURATION_DATA_KEY),
            "description": annotations.get(DESCRIPTION_ANNOTATION),
            "alias": annotations.get(ALIAS_ANNOTATION),
            "labels": labels_to_tags(config_map.metadata.labels),
        }

    @staticmethod
    def _build_labels_and_annotations(
        description: Optional[str],
        alias: Optional[str],
        labels: Optional[List[str]],
        existing_labels: Optional[Dict[str, str]] = None,
        existing_annotations: Optional[Dict[str, str]] = None,
    ) -> Tuple[Dict[str, str], Dict[str, str]]:
        """Build the labels and annotations this feature owns, preserving all others."""
        k8s_labels = strip_tag_labels(existing_labels)
        k8s_labels[ARK_RESOURCE_TYPE_LABEL] = CONFIGURATION_RESOURCE_TYPE
        k8s_labels.update(tags_to_labels(labels))

        annotations = {
            key: value
            for key, value in (existing_annotations or {}).items()
            if key not in (DESCRIPTION_ANNOTATION, ALIAS_ANNOTATION)
        }
        if description:
            annotations[DESCRIPTION_ANNOTATION] = description
        if alias:
            annotations[ALIAS_ANNOTATION] = alias

        return k8s_labels, annotations

    async def _read_configuration(self, v1, name: str):
        """Read a ConfigMap, refusing any that Ark does not own as a configuration."""
        config_map = await v1.read_namespaced_config_map(name=name, namespace=self.namespace)
        labels = config_map.metadata.labels or {}
        if labels.get(ARK_RESOURCE_TYPE_LABEL) != CONFIGURATION_RESOURCE_TYPE:
            raise ApiException(status=404, reason=f"Configuration '{name}' not found")
        return config_map

    async def list_configurations(self, label_selector: Optional[str] = None):
        """List all configurations in namespace."""
        selector = CONFIGURATION_LABEL_SELECTOR
        if label_selector:
            selector = f"{selector},{label_selector}"

        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)
            config_maps = await v1.list_namespaced_config_map(
                namespace=self.namespace,
                label_selector=selector
            )

            items = [self._to_configuration(config_map) for config_map in config_maps.items]
            return {"items": items, "count": len(items)}

    async def get_configuration(self, name: str):
        """Get a specific configuration."""
        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)
            return self._to_configuration(await self._read_configuration(v1, name))

    async def create_configuration(
        self,
        name: str,
        value: str,
        description: Optional[str] = None,
        alias: Optional[str] = None,
        labels: Optional[List[str]] = None,
    ):
        """Create a new configuration."""
        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)

            k8s_labels, annotations = self._build_labels_and_annotations(
                description, alias, labels
            )
            config_map = client.V1ConfigMap(
                api_version="v1",
                kind="ConfigMap",
                metadata=client.V1ObjectMeta(
                    name=name, labels=k8s_labels, annotations=annotations
                ),
                data={CONFIGURATION_DATA_KEY: value}
            )

            created = await v1.create_namespaced_config_map(
                namespace=self.namespace,
                body=config_map
            )
            return self._to_configuration(created)

    async def update_configuration(
        self,
        name: str,
        value: str,
        description: Optional[str] = None,
        alias: Optional[str] = None,
        labels: Optional[List[str]] = None,
    ):
        """Replace an existing configuration.

        This is a full replace, not a partial update. Omitting description,
        alias or labels clears them on the stored configuration; callers must
        send the complete desired state on every call.
        """
        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)

            existing = await self._read_configuration(v1, name)
            k8s_labels, annotations = self._build_labels_and_annotations(
                description,
                alias,
                labels,
                existing_labels=existing.metadata.labels,
                existing_annotations=existing.metadata.annotations,
            )
            existing.metadata.labels = k8s_labels
            existing.metadata.annotations = annotations
            existing.data = {**(existing.data or {}), CONFIGURATION_DATA_KEY: value}

            updated = await v1.replace_namespaced_config_map(
                name=name,
                namespace=self.namespace,
                body=existing
            )
            return self._to_configuration(updated)

    async def delete_configuration(self, name: str) -> bool:
        """Delete a configuration."""
        await init_k8s()
        async with create_api_client() as api:
            self._get_api_client(api)
            v1 = client.CoreV1Api(api)
            existing = await self._read_configuration(v1, name)
            await v1.delete_namespaced_config_map(
                name=name,
                namespace=self.namespace,
                body=client.V1DeleteOptions(
                    preconditions=client.V1Preconditions(
                        uid=existing.metadata.uid
                    )
                ),
            )
            return True
