"""MCP Tools for Ark operations."""

import os
import logging
import asyncio
from typing import Annotated, List, Dict, Any, Optional
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError, NotFoundError, ValidationError
from pydantic import BaseModel
from ark_sdk.client import with_ark_client
from ark_sdk.models.query_v1alpha1 import QueryV1alpha1
from ark_sdk.models.query_v1alpha1_spec import QueryV1alpha1Spec

logger = logging.getLogger(__name__)

# ARK SDK version
VERSION = "v1alpha1"

# Default namespace from environment variable
DEFAULT_NAMESPACE = os.getenv("ARK_MCP_DEFAULT_NAMESPACE", "default")


class Agent(BaseModel):
    """Agent response model."""
    name: str
    namespace: str
    description: Optional[str] = None
    model_ref: Optional[str] = None
    prompt: Optional[str] = None
    status: Optional[str] = None


class QueryTarget(BaseModel):
    """Query target model."""
    name: str
    type: str  # "agent", "team", "model", "tool"


class QueryCreate(BaseModel):
    """Query creation model."""
    name: str
    input: str
    namespace: str = DEFAULT_NAMESPACE
    targets: Optional[List[QueryTarget]] = None
    selector: Optional[Dict[str, Any]] = None




async def list_agents_sdk(namespace: str = DEFAULT_NAMESPACE) -> List[Agent]:
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
                
                agent_list.append(Agent(
                    name=metadata.get("name", ""),
                    namespace=metadata.get("namespace", ""),
                    description=spec.get("description"),
                    model_ref=model_ref,
                    prompt=spec.get("prompt"),
                    status=status.get("phase")
                ))
            
            return agent_list
    except Exception as e:
        logger.error(f"Failed to list agents in namespace '{namespace}': {e}")
        raise ToolError(f"Could not list agents in namespace '{namespace}': {str(e)}") from e


async def create_query_sdk(query: QueryCreate) -> Dict[str, Any]:
    """Create a query using ark-sdk."""
    if not query.input.strip():
        raise ValidationError("Query input cannot be empty")
    
    try:
        async with with_ark_client(query.namespace, VERSION) as ark_client:
            spec = {"input": query.input}
            
            # Add targets if specified
            if query.targets:
                spec["targets"] = [{"type": target.type, "name": target.name} for target in query.targets]
            
            # Add selector if specified
            if query.selector:
                spec["selector"] = query.selector
            
            # Create the QueryV1alpha1 object
            query_resource = QueryV1alpha1(
                metadata={"name": query.name, "namespace": query.namespace},
                spec=QueryV1alpha1Spec(**spec)
            )
            
            created = await ark_client.queries.a_create(query_resource)
            return created.to_dict()
    except Exception as e:
        logger.error(f"Failed to create query '{query.name}': {e}")
        raise ToolError(f"Could not create query '{query.name}': {str(e)}") from e


async def get_query_sdk(name: str, namespace: str = DEFAULT_NAMESPACE) -> Dict[str, Any]:
    """Get query status and results using ark-sdk."""
    try:
        async with with_ark_client(namespace, VERSION) as ark_client:
            result = await ark_client.queries.a_get(name)
            return result.to_dict()
    except Exception as e:
        if "not found" in str(e).lower():
            raise NotFoundError(f"Query '{name}' not found in namespace '{namespace}'") from e
        logger.error(f"Failed to get query '{name}': {e}")
        raise ToolError(f"Could not retrieve query '{name}': {str(e)}") from e


async def wait_for_query_completion_sdk(
    name: str, 
    namespace: str = DEFAULT_NAMESPACE, 
    timeout_seconds: int = 300,
    poll_interval: float = 2.0
) -> Dict[str, Any]:
    """Wait for query to complete and return final status with results."""
    start_time = asyncio.get_event_loop().time()
    
    while True:
        current_time = asyncio.get_event_loop().time()
        if current_time - start_time > timeout_seconds:
            raise ToolError(f"Query '{name}' timed out after {timeout_seconds} seconds")
        
        query_result = await get_query_sdk(name, namespace)
        status = query_result.get("status", {})
        phase = status.get("phase", "pending")
        
        logger.info(f"Query {name} status: {phase}")
        
        # Terminal phases
        if phase in ["done", "error", "canceled"]:
            return {
                "name": name,
                "namespace": namespace,
                "phase": phase,
                "status": status,
                "responses": status.get("responses", []),
                "evaluations": status.get("evaluations", []),
                "tokenUsage": status.get("tokenUsage", {}),
                "success": phase == "done"
            }
        
        # Wait before next poll
        await asyncio.sleep(poll_interval)


def register_tools(mcp: FastMCP):
    """Register all MCP tools."""
    
    @mcp.tool
    async def list_agents(
        namespace: Annotated[str, "Kubernetes namespace to list agents from"] = DEFAULT_NAMESPACE
    ) -> List[Dict[str, Any]]:
        """List all agents in the specified namespace.
        
        Returns a list of agents with their basic information including name, description, 
        model reference, and status.
        """
        agents = await list_agents_sdk(namespace)
        return [agent.model_dump() for agent in agents]

    @mcp.tool
    async def query_agent(
        agent: Annotated[str, "Name of the agent to query"],
        input: Annotated[str, "The question or instruction to send to the agent"],
        namespace: Annotated[str, "Kubernetes namespace containing the agent"] = DEFAULT_NAMESPACE
    ) -> Dict[str, Any]:
        """Send a question to a specific agent and get the response.
        
        This creates a Query resource targeting the specified agent, waits for completion,
        and returns the agent's response.
        """
        import uuid
        
        if not agent.strip():
            raise ValidationError("Agent name cannot be empty")
        if not input.strip():
            raise ValidationError("Query input cannot be empty")
        
        # Generate a unique query name
        query_name = f"query-{agent}-{str(uuid.uuid4())[:8]}"
        
        # Create single agent target
        target = QueryTarget(type="agent", name=agent)
        
        # Create the query
        query_data = QueryCreate(
            name=query_name,
            input=input,
            namespace=namespace,
            targets=[target]
        )
        
        logger.info(f"Querying agent '{agent}' with input: {input}")
        await create_query_sdk(query_data)
        
        # Wait for completion with default timeout (5 minutes)
        result = await wait_for_query_completion_sdk(
            query_name, namespace, timeout_seconds=300
        )
        
        # Extract the response content for simpler return
        response_content = ""
        if result.get("responses"):
            response_content = result["responses"][0].get("content", "")
        elif result["phase"] == "error":
            raise ToolError(f"Agent '{agent}' query failed: {result.get('status', {}).get('error', 'Unknown error')}")
        
        return {
            "success": result["success"],
            "phase": result["phase"],
            "response": response_content,
            "agent": agent,
            "namespace": namespace,
            "query_name": query_name
        }
