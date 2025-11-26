"""Kubernetes teams API endpoints."""
import logging

from fastapi import APIRouter, Query
from typing import Optional
from ark_sdk.models.team_v1alpha1 import TeamV1alpha1

from ark_sdk.client import with_ark_client

from ...models.teams import (
    TeamResponse,
    TeamListResponse,
    TeamCreateRequest,
    TeamUpdateRequest,
    TeamDetailResponse
)
from ...models.common import extract_availability_from_conditions
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/teams", tags=["teams"])

# CRD configuration
VERSION = "v1alpha1"


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

    conditions = status.get("conditions", [])
    availability = extract_availability_from_conditions(conditions, "Available")

    return TeamDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        description=spec.get("description"),
        members=spec.get("members", []),
        strategy=spec.get("strategy", ""),
        graph=spec.get("graph"),
        maxTurns=spec.get("maxTurns"),
        selector=spec.get("selector"),
        available=availability,
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
            team_list.append(team_to_response(team.to_dict()))
        
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
        
        return team_to_detail_response(team.to_dict())


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
        
        # Update the team
        # Get the full existing team object and update its spec
        existing_team_dict = existing_team.to_dict()
        existing_team_dict["spec"] = existing_spec
        
        # Create updated team object
        updated_team_obj = TeamV1alpha1(**existing_team_dict)
        
        updated_team = await ark_client.teams.a_update(updated_team_obj)
        
        return team_to_detail_response(updated_team.to_dict())


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
        await ark_client.teams.a_delete(team_name)
