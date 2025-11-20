"""Kubernetes agents API endpoints."""
import logging
import json
import re

from fastapi import APIRouter, Query
from typing import Optional
from ark_sdk.models.agent_v1alpha1 import AgentV1alpha1

from ark_sdk.client import with_ark_client

from ...models.agents import (
    AgentResponse,
    AgentListResponse,
    AgentCreateRequest,
    AgentUpdateRequest,
    AgentDetailResponse,
    ModelRef
)
from ...models.common import extract_availability_from_conditions
from ...constants.annotations import A2A_SERVER_ADDRESS_ANNOTATION
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])

# CRD configuration
VERSION = "v1alpha1"

def agent_to_response(agent: dict) -> AgentResponse:
    """Convert a Kubernetes Agent CR to a response model."""
    metadata = agent.get("metadata", {})
    spec = agent.get("spec", {})
    status = agent.get("status", {})

    # Extract model ref name if exists
    model_ref = "default"
    if spec.get("modelRef"):
        model_ref = spec["modelRef"].get("name")

    # Extract availability from conditions
    conditions = status.get("conditions", [])
    availability = extract_availability_from_conditions(conditions, "Available")

    return AgentResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        model_ref=model_ref,
        prompt=spec.get("prompt"),
        available=availability,
        annotations=metadata.get("annotations", {})
    )

SKILLS_ANNOTATION_REGEX = re.compile(r'a2a\..*\/skills$')

def agent_to_detail_response(agent: dict) -> AgentDetailResponse:
    """Convert a Kubernetes Agent CR to a detailed response model."""
    metadata = agent.get("metadata", {})
    spec = agent.get("spec", {})
    status = agent.get("status", {})
    annotations = metadata.get("annotations", {})
    
    is_a2a = A2A_SERVER_ADDRESS_ANNOTATION in annotations
    
    skills = []
    skills_annotation_key = None
    for annotation_key in annotations:
        if SKILLS_ANNOTATION_REGEX.search(annotation_key):
            skills_annotation_key = annotation_key
            break
    
    if skills_annotation_key:
        try:
            skills_data = json.loads(annotations[skills_annotation_key])
            skills = skills_data if isinstance(skills_data, list) else []
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Failed to parse skills annotation for agent {metadata.get('name', '')}")
            skills = []
    
    # Extract availability from conditions
    conditions = status.get("conditions", [])
    availability = extract_availability_from_conditions(conditions, "Available")

    return AgentDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        executionEngine=spec.get("executionEngine"),
        modelRef=spec.get("modelRef", ModelRef(name="default")),
        parameters=spec.get("parameters"),
        prompt=spec.get("prompt"),
        tools=spec.get("tools"),
        overrides=spec.get("overrides"),
        skills=skills,
        isA2A=is_a2a,
        available=availability,
        status=status,
        annotations=annotations
    )


@router.get("", response_model=AgentListResponse)
@handle_k8s_errors(operation="list", resource_type="agent")
async def list_agents(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> AgentListResponse:
    """
    List all Agent CRs in a namespace.

    Args:
        namespace: The namespace to list agents from (defaults to current context)
        
    Returns:
        AgentListResponse: List of all agents in the namespace
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        agents = await ark_client.agents.a_list()
        
        agent_list = []
        for agent in agents:
            agent_list.append(agent_to_response(agent.to_dict()))
        
        return AgentListResponse(
            items=agent_list,
            count=len(agent_list)
        )


@router.post("", response_model=AgentDetailResponse)
@handle_k8s_errors(operation="create", resource_type="agent")
async def create_agent(body: AgentCreateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> AgentDetailResponse:
    """
    Create a new Agent CR.
    
    Args:
        namespace: The namespace to create the agent in
        body: The agent creation request
        
    Returns:
        AgentDetailResponse: The created agent details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Build the agent spec
        agent_spec = {}
        
        # Add optional fields if provided
        if body.description is not None:
            agent_spec["description"] = body.description
        
        if body.executionEngine is not None:
            agent_spec["executionEngine"] = body.executionEngine.model_dump(exclude_none=True)
        
        if body.modelRef is not None:
            agent_spec["modelRef"] = body.modelRef.model_dump(exclude_none=True)
        
        if body.parameters is not None:
            agent_spec["parameters"] = [param.model_dump(exclude_none=True) for param in body.parameters]
        
        if body.prompt is not None:
            agent_spec["prompt"] = body.prompt
        
        if body.tools is not None:
            agent_spec["tools"] = [tool.model_dump(exclude_none=True) for tool in body.tools]

        if body.overrides is not None:
            agent_spec["overrides"] = [override.model_dump(exclude_none=True) for override in body.overrides]

        # Create the agent object
        agent = AgentV1alpha1(
            metadata={"name": body.name, "namespace": namespace},
            spec=agent_spec
        )
        
        created_agent = await ark_client.agents.a_create(agent)
        
        return agent_to_detail_response(created_agent.to_dict())


@router.get("/{agent_name}", response_model=AgentDetailResponse)
@handle_k8s_errors(operation="get", resource_type="agent")
async def get_agent(agent_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> AgentDetailResponse:
    """
    Get a specific Agent CR by name.
    
    Args:
        namespace: The namespace to get the agent from
        agent_name: The name of the agent
        
    Returns:
        AgentDetailResponse: The agent details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        agent = await ark_client.agents.a_get(agent_name)
        
        return agent_to_detail_response(agent.to_dict())


@router.put("/{agent_name}", response_model=AgentDetailResponse)
@handle_k8s_errors(operation="update", resource_type="agent")
async def update_agent(agent_name: str, body: AgentUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> AgentDetailResponse:
    """
    Update an Agent CR by name.
    
    Args:
        namespace: The namespace containing the agent
        agent_name: The name of the agent
        body: The agent update request
        
    Returns:
        AgentDetailResponse: The updated agent details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get the existing agent first
        existing_agent = await ark_client.agents.a_get(agent_name)
        existing_spec = existing_agent.to_dict()["spec"]
        
        # Update only the fields that are provided
        if body.description is not None:
            existing_spec["description"] = body.description
        
        if body.executionEngine is not None:
            existing_spec["executionEngine"] = body.executionEngine.model_dump(exclude_none=True)
        
        if body.modelRef is not None:
            existing_spec["modelRef"] = body.modelRef.model_dump(exclude_none=True)
        
        if body.parameters is not None:
            existing_spec["parameters"] = [param.model_dump(exclude_none=True) for param in body.parameters]
        
        if body.prompt is not None:
            existing_spec["prompt"] = body.prompt
        
        if body.tools is not None:
            existing_spec["tools"] = [tool.model_dump(exclude_none=True) for tool in body.tools]

        if body.overrides is not None:
            existing_spec["overrides"] = [override.model_dump(exclude_none=True) for override in body.overrides]
        
        # Update the agent
        # Get the full existing agent object and update its spec
        existing_agent_dict = existing_agent.to_dict()
        existing_agent_dict["spec"] = existing_spec
        
        # Create updated agent object
        updated_agent_obj = AgentV1alpha1(**existing_agent_dict)
        
        updated_agent = await ark_client.agents.a_update(updated_agent_obj)
        
        return agent_to_detail_response(updated_agent.to_dict())


@router.delete("/{agent_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="agent")
async def delete_agent(agent_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> None:
    """
    Delete an Agent CR by name.
    
    Args:
        namespace: The namespace containing the agent
        agent_name: The name of the agent
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.agents.a_delete(agent_name)
