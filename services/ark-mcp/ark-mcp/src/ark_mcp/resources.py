"""MCP Resources for Ark discovery and inspection."""

import json
import logging
from typing import List, Dict, Any
from fastmcp import FastMCP
from fastmcp.exceptions import ResourceError, NotFoundError
from ark_sdk.client import with_ark_client
from ark_sdk.k8s import init_k8s
from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient

logger = logging.getLogger(__name__)

# ARK SDK version
VERSION = "v1alpha1"


async def list_namespaces_sdk() -> List[str]:
    """List all available namespaces."""
    try:
        # Ensure Kubernetes client is initialized (same as ark-api)
        await init_k8s()
        
        async with ApiClient() as api:
            v1 = client.CoreV1Api(api)
            namespace_list_response = await v1.list_namespace()
            return [ns.metadata.name for ns in namespace_list_response.items]
    except Exception as e:
        logger.error(f"Failed to list namespaces: {e}")
        raise ResourceError(f"Could not list namespaces: {str(e)}") from e


async def list_agents_sdk(namespace: str) -> List[Dict[str, Any]]:
    """List all agents in a namespace using ark-sdk."""
    try:
        async with with_ark_client(namespace, VERSION) as ark_client:
            agents = await ark_client.agents.a_list()
            
            agent_list = []
            for agent in agents:
                agent_dict = agent.to_dict()
                metadata = agent_dict.get("metadata", {})
                spec = agent_dict.get("spec", {})
                status = agent_dict.get("status", {})
                
                # Extract model ref name if exists, otherwise use "default"
                model_ref = "default"
                if spec.get("modelRef"):
                    model_ref = spec["modelRef"].get("name")
                
                agent_list.append({
                    "name": metadata.get("name", ""),
                    "namespace": metadata.get("namespace", ""),
                    "description": spec.get("description"),
                    "model_ref": model_ref,
                    "prompt": spec.get("prompt"),
                    "status": status.get("phase")
                })
            
            return agent_list
    except Exception as e:
        logger.error(f"Failed to list agents in namespace {namespace}: {e}")
        raise ResourceError(f"Could not list agents in namespace '{namespace}': {str(e)}") from e


async def get_agent_sdk(namespace: str, name: str) -> Dict[str, Any]:
    """Get a specific agent using ark-sdk."""
    try:
        async with with_ark_client(namespace, VERSION) as ark_client:
            agent = await ark_client.agents.a_get(name)
            return agent.to_dict()
    except Exception as e:
        if "not found" in str(e).lower():
            raise NotFoundError(f"Agent '{name}' not found in namespace '{namespace}'") from e
        logger.error(f"Failed to get agent {name} in namespace {namespace}: {e}")
        raise ResourceError(f"Could not get agent '{name}' in namespace '{namespace}': {str(e)}") from e


def register_resources(mcp: FastMCP):
    """Register all MCP resources."""
    
    @mcp.resource("ark://namespaces")
    async def list_namespaces_resource() -> str:
        """List all available Kubernetes namespaces.
        
        Returns a JSON list of namespace names that contain Ark resources.
        """
        namespaces = await list_namespaces_sdk()
        return json.dumps({
            "namespaces": namespaces,
            "description": "Available Kubernetes namespaces"
        }, indent=2)

    @mcp.resource("ark://namespaces/{namespace}/agents")
    async def list_agents_resource(namespace: str) -> str:
        """List all agents in a specific namespace.
        
        Returns a JSON list of agents with their basic information.
        """
        agents = await list_agents_sdk(namespace)
        return json.dumps({
            "namespace": namespace,
            "agents": agents,
            "count": len(agents)
        }, indent=2)

    @mcp.resource("ark://namespaces/{namespace}/agents/{agent_name}")
    async def get_agent_resource(namespace: str, agent_name: str) -> str:
        """Get detailed information about a specific agent.
        
        Returns complete agent configuration including prompt, model, tools, etc.
        """
        agent_data = await get_agent_sdk(namespace, agent_name)
        return json.dumps(agent_data, indent=2)
