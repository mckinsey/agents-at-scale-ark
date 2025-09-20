"""Kubernetes utilities and client initialization."""
import functools
import logging
import os
from functools import lru_cache

from kubernetes import config
from kubernetes.config.config_exception import ConfigException
from kubernetes_asyncio import config as async_config

logger = logging.getLogger(__name__)

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
            namespace = ctx.get('namespace', 'default')
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
    # First ensure sync config is loaded in case we need it
    _init_k8s()
    
    # Then load the async config using the same method
    try:
        await async_config.load_kube_config()
    except:
        # If that fails, try in-cluster config
        async_config.load_incluster_config()