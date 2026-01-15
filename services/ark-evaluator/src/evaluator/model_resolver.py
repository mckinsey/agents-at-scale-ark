# services/ark-evaluator/src/evaluator/model_resolver.py

import logging
from typing import Optional, Dict, Any
from kubernetes import client, config
from .types import ModelRef

logger = logging.getLogger(__name__)

# Global cache for Kubernetes client to avoid repeated config loading
_k8s_client_cache = None
_k8s_client_initialized = False


class ModelConfig:
    """Simple model configuration container"""
    def __init__(self, model: str, base_url: str, api_key: str, api_version: str = "2024-02-15"):
        self.model = model
        self.base_url = base_url
        self.api_key = api_key
        self.api_version = api_version


def _get_k8s_client():
    """Get cached Kubernetes client, initializing only once"""
    global _k8s_client_cache, _k8s_client_initialized
    
    if not _k8s_client_initialized:
        try:
            config.load_incluster_config()
            _k8s_client_cache = client.ApiClient()
            logger.info("Loaded in-cluster Kubernetes configuration (cached)")
        except config.ConfigException:
            try:
                config.load_kube_config()
                _k8s_client_cache = client.ApiClient()
                logger.info("Loaded kubeconfig configuration (cached)")
            except config.ConfigException as e:
                logger.error(f"Could not load Kubernetes configuration: {e}")
                logger.warning("No Kubernetes configuration available, using fallback configuration")
                _k8s_client_cache = None
        
        _k8s_client_initialized = True
        
    return _k8s_client_cache


class ModelResolver:
    """Resolves Model configurations using direct Kubernetes API"""
    
    def __init__(self):
        """Initialize Kubernetes client (cached)"""
        self.k8s_client = _get_k8s_client()
    
    async def resolve_model(self, model_ref: Optional[ModelRef] = None, 
                          query_context: Optional[Dict[str, Any]] = None) -> ModelConfig:
        """
        Resolve model configuration from either:
        1. Explicit model reference
        2. Query context (modelRef in query spec)
        3. Default model in namespace
        4. System fallback if no Kubernetes access
        """
        logger.info(f"Starting model resolution - model_ref: {model_ref}, query_context: {bool(query_context)}, k8s_available: {self.k8s_client is not None}")
        
        # If no Kubernetes client available, fall back to default
        if self.k8s_client is None:
            logger.warning("No Kubernetes client available, using system default model")
            return self._get_system_default_model()
        
        try:
            # Option 1: Explicit model reference
            if model_ref:
                logger.info(f"Resolving from explicit model reference: {model_ref.name}")
                return self._resolve_from_model_ref(model_ref)
            
            # Option 2: From query context
            if query_context and 'spec' in query_context:
                query_spec = query_context['spec']
                if 'modelRef' in query_spec:
                    model_ref_data = query_spec['modelRef']
                    logger.info(f"Resolving from query context modelRef: {model_ref_data}")
                    return self._resolve_from_query_model_ref(model_ref_data, query_context)
            
            # Option 3: Default model
            logger.info("No explicit model reference found, resolving default model")
            return self._resolve_default_model(query_context)
            
        except Exception as e:
            logger.error(f"Failed to resolve model: {e}")
            logger.info("Falling back to system default model")
            return self._get_system_default_model()
    
    def _resolve_from_model_ref(self, model_ref: ModelRef) -> ModelConfig:
        """Resolve model from explicit ModelRef"""
        namespace = model_ref.namespace or "default"
        logger.info(f"Resolving model from ModelRef: {model_ref.name} in namespace {namespace}")
        
        # Load model CRD using direct Kubernetes API
        model_crd = self._load_model_crd(model_ref.name, namespace)
        
        # Extract model configuration from CRD
        return self._extract_model_config_from_crd(model_crd)
    
    def _resolve_from_query_model_ref(self, model_ref_data: Dict[str, Any], 
                                    query_context: Dict[str, Any]) -> ModelConfig:
        """Resolve model from query's modelRef"""
        model_name = model_ref_data.get('name', 'default')
        namespace = model_ref_data.get('namespace', query_context.get('metadata', {}).get('namespace', 'default'))
        
        logger.info(f"Resolving model from query modelRef: {model_name} in namespace {namespace}")
        
        model_crd = self._load_model_crd(model_name, namespace)
        return self._extract_model_config_from_crd(model_crd)
    
    def _resolve_default_model(self, query_context: Optional[Dict[str, Any]] = None) -> ModelConfig:
        """Resolve default model in namespace"""
        namespace = "default"
        if query_context and 'metadata' in query_context:
            namespace = query_context['metadata'].get('namespace', 'default')
        
        logger.info(f"Attempting to resolve default model in namespace: {namespace}")
        
        # Try to load 'default' model
        try:
            model_crd = self._load_model_crd('default', namespace)
            logger.info(f"Found default model CRD in namespace {namespace}")
            return self._extract_model_config_from_crd(model_crd)
        except Exception as e:
            logger.warning(f"Could not load default model in namespace {namespace}: {e}")
            logger.info("Falling back to system default model")
            # Fall back to system default
            return self._get_system_default_model()
    
    def _load_model_crd(self, name: str, namespace: str) -> Dict[str, Any]:
        """Load Model CRD from Kubernetes"""
        custom_api = client.CustomObjectsApi(self.k8s_client)
        
        try:
            model_crd = custom_api.get_namespaced_custom_object(
                group="ark.mckinsey.com",
                version="v1alpha1",
                namespace=namespace,
                plural="models",
                name=name
            )
            return model_crd
        except client.rest.ApiException as e:
            if e.status == 404:
                raise ValueError(f"Model '{name}' not found in namespace '{namespace}'")
            elif e.status == 403:
                raise ValueError(f"Access denied to model '{name}' in namespace '{namespace}'. Check RBAC permissions.")
            else:
                raise ValueError(f"Error loading model '{name}': {e}")
    
    def _extract_model_config_from_crd(self, model_crd: Dict[str, Any]) -> ModelConfig:
        """Extract model configuration from Model CRD"""
        spec = model_crd.get('spec', {})
        model_name = spec.get('model', {}).get('value', 'gpt-4')
        model_type = spec.get('type', 'openai')
        provider = spec.get('provider', model_type)
        config = spec.get('config', {})

        logger.info(f"Extracting config from CRD - model: {model_name}, type: {model_type}, provider: {provider}")

        # Extract configuration based on provider (or type as fallback)
        if provider == 'azure' or model_type == 'azure':
            azure_config = config.get('azure', {})
            base_url = azure_config.get('baseUrl', {}).get('value', '')
            api_key = self._resolve_value_source(azure_config.get('apiKey', {}), model_crd.get('metadata', {}).get('namespace', 'default'))
            api_version = azure_config.get('apiVersion', {}).get('value', '2024-02-15')
        elif provider == 'openai' or model_type == 'openai':
            openai_config = config.get('openai', {})
            base_url = openai_config.get('baseUrl', {}).get('value', 'https://api.openai.com/v1')
            api_key = self._resolve_value_source(openai_config.get('apiKey', {}), model_crd.get('metadata', {}).get('namespace', 'default'))
            api_version = openai_config.get('apiVersion', {}).get('value', '2024-02-15')
        else:
            logger.warning(f"Unknown provider: {provider} and type: {model_type}, using default OpenAI config")
            base_url = "https://api.openai.com/v1"
            api_key = "demo-key"
            api_version = "2024-02-15"
        
        return ModelConfig(
            model=model_name,
            base_url=base_url,
            api_key=api_key,
            api_version=api_version
        )
    
    def _resolve_value_source(self, value_source: Dict[str, Any], namespace: str) -> str:
        """Resolve value from valueSource (direct value, secret, or configmap)"""
        if 'value' in value_source:
            return value_source['value']
        elif 'valueFrom' in value_source:
            value_from = value_source['valueFrom']
            if 'secretKeyRef' in value_from:
                return self._resolve_secret_key_ref(value_from['secretKeyRef'], namespace)
            elif 'configMapKeyRef' in value_from:
                return self._resolve_configmap_key_ref(value_from['configMapKeyRef'], namespace)
        
        logger.warning("Could not resolve value source, using default")
        return "demo-key"
    
    def _resolve_secret_key_ref(self, secret_key_ref: Dict[str, Any], namespace: str) -> str:
        """Resolve value from Kubernetes Secret"""
        secret_name = secret_key_ref.get('name')
        secret_key = secret_key_ref.get('key')
        
        if not secret_name or not secret_key:
            logger.warning(f"Invalid secret reference: name={secret_name}, key={secret_key}")
            return "invalid-secret-ref"
        
        if self.k8s_client is None:
            logger.warning(f"No Kubernetes client available, cannot resolve secret '{secret_name}.{secret_key}'")
            return "no-k8s-client"
        
        try:
            v1 = client.CoreV1Api(self.k8s_client)
            secret = v1.read_namespaced_secret(name=secret_name, namespace=namespace)
            
            if secret.data and secret_key in secret.data:
                # Secret data is base64 encoded, decode it
                import base64
                encoded_value = secret.data[secret_key]
                decoded_value = base64.b64decode(encoded_value).decode('utf-8')
                logger.info(f"Successfully resolved secret '{secret_name}.{secret_key}' from namespace '{namespace}'")
                return decoded_value
            else:
                logger.warning(f"Key '{secret_key}' not found in secret '{secret_name}'")
                return "missing-secret-key"
                
        except client.rest.ApiException as e:
            if e.status == 404:
                logger.warning(f"Secret '{secret_name}' not found in namespace '{namespace}'")
                return "secret-not-found"
            elif e.status == 403:
                logger.warning(f"Access denied to secret '{secret_name}' in namespace '{namespace}'. Check RBAC permissions.")
                return "secret-access-denied"
            else:
                logger.error(f"Error reading secret '{secret_name}': {e}")
                return "secret-error"
        except Exception as e:
            logger.error(f"Unexpected error resolving secret '{secret_name}.{secret_key}': {e}")
            return "secret-decode-error"
    
    def _resolve_configmap_key_ref(self, configmap_key_ref: Dict[str, Any], namespace: str) -> str:
        """Resolve value from Kubernetes ConfigMap"""
        configmap_name = configmap_key_ref.get('name')
        configmap_key = configmap_key_ref.get('key')
        
        if not configmap_name or not configmap_key:
            logger.warning(f"Invalid configmap reference: name={configmap_name}, key={configmap_key}")
            return "invalid-configmap-ref"
        
        if self.k8s_client is None:
            logger.warning(f"No Kubernetes client available, cannot resolve configmap '{configmap_name}.{configmap_key}'")
            return "no-k8s-client"
        
        try:
            v1 = client.CoreV1Api(self.k8s_client)
            configmap = v1.read_namespaced_config_map(name=configmap_name, namespace=namespace)
            
            if configmap.data and configmap_key in configmap.data:
                configmap_value = configmap.data[configmap_key]
                logger.info(f"Successfully resolved configmap '{configmap_name}.{configmap_key}' from namespace '{namespace}'")
                return configmap_value
            else:
                logger.warning(f"Key '{configmap_key}' not found in configmap '{configmap_name}'")
                return "missing-configmap-key"
                
        except client.rest.ApiException as e:
            if e.status == 404:
                logger.warning(f"ConfigMap '{configmap_name}' not found in namespace '{namespace}'")
                return "configmap-not-found"
            elif e.status == 403:
                logger.warning(f"Access denied to configmap '{configmap_name}' in namespace '{namespace}'. Check RBAC permissions.")
                return "configmap-access-denied"
            else:
                logger.error(f"Error reading configmap '{configmap_name}': {e}")
                return "configmap-error"
        except Exception as e:
            logger.error(f"Unexpected error resolving configmap '{configmap_name}.{configmap_key}': {e}")
            return "configmap-decode-error"

    def _get_system_default_model(self) -> ModelConfig:
        """Get system default model configuration"""
        logger.info("Using system default model configuration")
        # Return a default configuration for evaluation
        return ModelConfig(
            model="gpt-4o-mini",
            base_url="https://api.openai.com/v1",
            api_key="demo-key",  # This should be configured properly in production
            api_version="2024-02-15"
        )