"""Kubernetes teams API endpoints."""
import logging

from fastapi import APIRouter, Query
from typing import Optional
from ark_sdk.models.team_v1alpha1 import TeamV1alpha1
from kubernetes import client
from kubernetes.client.exceptions import ApiException

from ark_sdk.client import with_ark_client

from ...models.teams import (
    TeamResponse,
    TeamListResponse,
    TeamCreateRequest,
    TeamUpdateRequest,
    TeamDetailResponse
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/teams", tags=["teams"])

# CRD configuration
VERSION = "v1alpha1"


def get_configmap_name(team_name: str) -> str:
    """Generate ConfigMap name for a team's prompt."""
    return f"team-{team_name}-prompt"


async def create_prompt_configmap(team_name: str, namespace: str, prompt: str) -> str:
    """Create a ConfigMap to store team prompt."""
    v1 = client.CoreV1Api()
    configmap_name = get_configmap_name(team_name)

    configmap = client.V1ConfigMap(
        metadata=client.V1ObjectMeta(name=configmap_name),
        data={"prompt": prompt}
    )

    try:
        await v1.create_namespaced_config_map(namespace=namespace, body=configmap)
        logger.info(f"Created ConfigMap {configmap_name} for team {team_name}")
        return configmap_name
    except ApiException as e:
        logger.error(f"Failed to create ConfigMap {configmap_name}: {e}")
        raise


async def get_prompt_from_configmap(configmap_ref: str, namespace: str) -> Optional[str]:
    """Fetch prompt from ConfigMap."""
    v1 = client.CoreV1Api()

    try:
        configmap = await v1.read_namespaced_config_map(name=configmap_ref, namespace=namespace)
        if configmap.data and "prompt" in configmap.data:
            return configmap.data["prompt"]
        return None
    except ApiException as e:
        if e.status == 404:
            logger.warning(f"ConfigMap {configmap_ref} not found in namespace {namespace}")
            return None
        logger.error(f"Failed to read ConfigMap {configmap_ref}: {e}")
        raise


async def update_prompt_configmap(configmap_ref: str, namespace: str, prompt: str) -> None:
    """Update existing ConfigMap with new prompt."""
    v1 = client.CoreV1Api()

    try:
        configmap = await v1.read_namespaced_config_map(name=configmap_ref, namespace=namespace)
        configmap.data = {"prompt": prompt}
        await v1.replace_namespaced_config_map(name=configmap_ref, namespace=namespace, body=configmap)
        logger.info(f"Updated ConfigMap {configmap_ref}")
    except ApiException as e:
        logger.error(f"Failed to update ConfigMap {configmap_ref}: {e}")
        raise


async def delete_prompt_configmap(configmap_ref: str, namespace: str) -> None:
    """Delete ConfigMap containing team prompt."""
    v1 = client.CoreV1Api()

    try:
        await v1.delete_namespaced_config_map(name=configmap_ref, namespace=namespace)
        logger.info(f"Deleted ConfigMap {configmap_ref}")
    except ApiException as e:
        if e.status == 404:
            logger.warning(f"ConfigMap {configmap_ref} not found, skipping deletion")
            return
        logger.error(f"Failed to delete ConfigMap {configmap_ref}: {e}")
        raise


def team_to_response(team: dict) -> TeamResponse:
    """Convert a Kubernetes Team CR to a response model."""
    metadata = team.get("metadata", {})
    spec = team.get("spec", {})
    status = team.get("status", {})
    
    # Count members if they exist
    members_count = None
    if spec.get("members"):
        members_count = len(spec["members"])
    
    return TeamResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        strategy=spec.get("strategy"),
        members_count=members_count,
        status=status.get("phase")
    )


def team_to_detail_response(team: dict) -> TeamDetailResponse:
    """Convert a Kubernetes Team CR to a detailed response model."""
    metadata = team.get("metadata", {})
    spec = team.get("spec", {})
    status = team.get("status", {})
    
    return TeamDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        members=spec.get("members", []),
        strategy=spec.get("strategy", ""),
        graph=spec.get("graph"),
        maxTurns=spec.get("maxTurns"),
        selector=spec.get("selector"),
        status=status
    )


@router.get("", response_model=TeamListResponse)
@handle_k8s_errors(operation="list", resource_type="team")
async def list_teams(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> TeamListResponse:
    """
    List all Team CRs in a namespace.

    Args:
        namespace: The namespace to list teams from

    Returns:
        TeamListResponse: List of all teams in the namespace
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        teams = await ark_client.teams.a_list()

        team_list = []
        for team in teams:
            team_dict = team.to_dict()
            team_response = team_to_response(team_dict)

            # Fetch prompt from ConfigMap if reference exists
            spec = team_dict.get("spec", {})
            if spec.get("promptConfigMapRef"):
                team_response.prompt = await get_prompt_from_configmap(spec["promptConfigMapRef"], namespace)

            team_list.append(team_response)

        return TeamListResponse(
            items=team_list,
            count=len(team_list)
        )


@router.post("", response_model=TeamDetailResponse)
@handle_k8s_errors(operation="create", resource_type="team")
async def create_team(body: TeamCreateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> TeamDetailResponse:
    """
    Create a new Team CR.
    
    Supports various execution strategies:
    - sequential: Members execute in order
    - round-robin: Members take turns
    - graph: Custom workflow defined by graph edges
    - selector: AI-powered member selection (can be combined with graph constraints)
    
    Args:
        namespace: The namespace to create the team in
        body: The team creation request
        
    Returns:
        TeamDetailResponse: The created team details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Build the team spec
        team_spec = {
            "members": [member.model_dump(exclude_none=True) for member in body.members],
            "strategy": body.strategy
        }
        
        # Add optional fields if provided
        if body.description is not None:
            team_spec["description"] = body.description
        
        if body.graph is not None:
            # Handle graph edges with from_ field conversion
            graph_dict = body.graph.model_dump(exclude_none=True, by_alias=True)
            team_spec["graph"] = graph_dict
        
        if body.maxTurns is not None:
            team_spec["maxTurns"] = body.maxTurns
        
        if body.selector is not None:
            team_spec["selector"] = body.selector.model_dump(exclude_none=True)

        # Handle prompt ConfigMap creation
        if body.prompt is not None:
            configmap_name = await create_prompt_configmap(body.name, namespace, body.prompt)
            team_spec["promptConfigMapRef"] = configmap_name

        # Create the team object
        team = TeamV1alpha1(
            metadata={"name": body.name, "namespace": namespace},
            spec=team_spec
        )

        created_team = await ark_client.teams.a_create(team)

        return team_to_detail_response(created_team.to_dict())


@router.get("/{team_name}", response_model=TeamDetailResponse)
@handle_k8s_errors(operation="get", resource_type="team")
async def get_team(team_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> TeamDetailResponse:
    """
    Get a specific Team CR by name.

    Args:
        namespace: The namespace to get the team from
        team_name: The name of the team

    Returns:
        TeamDetailResponse: The team details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        team = await ark_client.teams.a_get(team_name)
        team_dict = team.to_dict()

        # Fetch prompt from ConfigMap if reference exists
        prompt = None
        spec = team_dict.get("spec", {})
        if spec.get("promptConfigMapRef"):
            prompt = await get_prompt_from_configmap(spec["promptConfigMapRef"], namespace)

        response = team_to_detail_response(team_dict)
        response.prompt = prompt

        return response


@router.put("/{team_name}", response_model=TeamDetailResponse)
@handle_k8s_errors(operation="update", resource_type="team")
async def update_team(team_name: str, body: TeamUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> TeamDetailResponse:
    """
    Update a Team CR by name.
    
    Args:
        namespace: The namespace containing the team
        team_name: The name of the team
        body: The team update request
        
    Returns:
        TeamDetailResponse: The updated team details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get the existing team first
        existing_team = await ark_client.teams.a_get(team_name)
        existing_spec = existing_team.to_dict()["spec"]
        
        # Update only the fields that are provided
        if body.description is not None:
            existing_spec["description"] = body.description
        
        if body.members is not None:
            existing_spec["members"] = [member.model_dump(exclude_none=True) for member in body.members]
        
        if body.strategy is not None:
            existing_spec["strategy"] = body.strategy
        
        if body.graph is not None:
            # Handle graph edges with from_ field conversion
            graph_dict = body.graph.model_dump(exclude_none=True, by_alias=True)
            existing_spec["graph"] = graph_dict
        
        if body.maxTurns is not None:
            existing_spec["maxTurns"] = body.maxTurns
        
        if body.selector is not None:
            existing_spec["selector"] = body.selector.model_dump(exclude_none=True)

        # Handle prompt ConfigMap update/creation
        if body.prompt is not None:
            if existing_spec.get("promptConfigMapRef"):
                # Update existing ConfigMap
                await update_prompt_configmap(existing_spec["promptConfigMapRef"], namespace, body.prompt)
            else:
                # Create new ConfigMap
                configmap_name = await create_prompt_configmap(team_name, namespace, body.prompt)
                existing_spec["promptConfigMapRef"] = configmap_name

        # Update the team
        # Get the full existing team object and update its spec
        existing_team_dict = existing_team.to_dict()
        existing_team_dict["spec"] = existing_spec

        # Create updated team object
        updated_team_obj = TeamV1alpha1(**existing_team_dict)

        updated_team = await ark_client.teams.a_update(updated_team_obj)
        updated_team_dict = updated_team.to_dict()

        # Fetch prompt from ConfigMap if reference exists
        prompt = None
        updated_spec = updated_team_dict.get("spec", {})
        if updated_spec.get("promptConfigMapRef"):
            prompt = await get_prompt_from_configmap(updated_spec["promptConfigMapRef"], namespace)

        response = team_to_detail_response(updated_team_dict)
        response.prompt = prompt

        return response


@router.delete("/{team_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="team")
async def delete_team(team_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> None:
    """
    Delete a Team CR by name.

    Args:
        namespace: The namespace containing the team
        team_name: The name of the team
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get the team first to check for ConfigMap reference
        team = await ark_client.teams.a_get(team_name)
        team_dict = team.to_dict()
        spec = team_dict.get("spec", {})

        # Delete associated ConfigMap if it exists
        if spec.get("promptConfigMapRef"):
            await delete_prompt_configmap(spec["promptConfigMapRef"], namespace)

        # Delete the team
        await ark_client.teams.a_delete(team_name)
