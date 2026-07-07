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
from typing import Dict, List, Optional
from kubernetes import client as sync_client
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.rest import ApiException

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
                    "annotations": secret.metadata.annotations or {}
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
                "annotations": created_secret.metadata.annotations
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
                "annotations": secret.metadata.annotations
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
                "annotations": updated_secret.metadata.annotations
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
