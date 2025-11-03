import logging
from typing import Optional, Dict, Any, List
from kubernetes import client, config
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Import the global K8s client from model_resolver to reuse the pattern
from .model_resolver import _get_k8s_client


@dataclass
class AgentInstructions:
    """Agent instructions containing description and system prompt for scope-aware evaluation"""
    name: str
    description: str
    system_prompt: str

class AgentResolver:
    """Resolves Agent configurations using direct Kubernetes API"""
    
    def __init__(self):
        self.k8s_client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Kubernetes client using the same pattern as ModelResolver"""
        self.k8s_client = _get_k8s_client()
        if not self.k8s_client:
            logger.warning("Kubernetes client not available - agent context resolution will be limited")
    
    async def resolve_agent_instructions(self, agent_name: str, namespace: str = "default") -> Optional[AgentInstructions]:
        """
        Resolve agent configuration from Kubernetes CRD

        Args:
            agent_name: Name of the Agent resource
            namespace: Kubernetes namespace (defaults to "default")

        Returns:
            AgentInstructions with agent details or None if resolution fails
        """
        if not self.k8s_client:
            logger.warning(f"Cannot resolve agent {agent_name}: Kubernetes client not available")
            return None
        
        try:
            logger.info(f"Resolving agent: {agent_name} in namespace: {namespace}")
            
            # Create custom objects API client
            custom_api = client.CustomObjectsApi(self.k8s_client)
            
            # Fetch Agent CRD
            agent_resource = custom_api.get_namespaced_custom_object(
                group="ark.mckinsey.com",
                version="v1alpha1",
                namespace=namespace,
                plural="agents",
                name=agent_name
            )
            
            logger.info(f"Successfully retrieved agent resource: {agent_name}")
            
            # Extract agent details
            metadata = agent_resource.get("metadata", {})
            spec = agent_resource.get("spec", {})
            
            name = metadata.get("name", agent_name)
            description = spec.get("description", "")
            system_prompt = spec.get("prompt", "")
            
            agent_instructions = AgentInstructions(
                name=name,
                description=description,
                system_prompt=system_prompt,
            )

            logger.info(f"Agent instructions resolved for {name}")
            return agent_instructions
            
        except client.exceptions.ApiException as e:
            if e.status == 404:
                logger.error(f"Agent resource not found: {agent_name} in namespace {namespace}")
            else:
                logger.error(f"Kubernetes API error resolving agent {agent_name}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error resolving agent {agent_name}: {str(e)}")
            return None