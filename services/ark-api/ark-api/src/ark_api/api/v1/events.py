"""Kubernetes events API endpoints."""
import logging
from typing import Optional

from fastapi import APIRouter, Query
from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.rest import ApiException
from ark_sdk.k8s import get_context

from ...models.events import EventListResponse, EventResponse, event_to_response
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


def _matches_type_filter(event_dict: dict, type_filter: Optional[str]) -> bool:
    """Check if event matches type filter."""
    return not type_filter or event_dict.get("type") == type_filter


def _matches_kind_filter(event_dict: dict, kind_filter: Optional[str]) -> bool:
    """Check if event matches kind filter."""
    if not kind_filter:
        return True
    involved_object = event_dict.get("involved_object", {})
    return involved_object.get("kind") == kind_filter


def _matches_name_filter(event_dict: dict, name_filter: Optional[str]) -> bool:
    """Check if event matches name filter."""
    if not name_filter:
        return True
    involved_object = event_dict.get("involved_object", {})
    object_name = involved_object.get("name", "").lower()
    return name_filter.lower() in object_name


def _should_include_event(event_dict: dict, type_filter: Optional[str], 
                         kind_filter: Optional[str], name_filter: Optional[str]) -> bool:
    """Check if event should be included based on all filters."""
    return (_matches_type_filter(event_dict, type_filter) and
            _matches_kind_filter(event_dict, kind_filter) and
            _matches_name_filter(event_dict, name_filter))


def _paginate_events(events: list, page_num: int, limit_num: int) -> tuple[list, int]:
    """Apply pagination to events list and return paginated events with total count."""
    total_count = len(events)
    start_index = (page_num - 1) * limit_num
    end_index = start_index + limit_num
    paginated_events = events[start_index:end_index]
    return paginated_events, total_count


@router.get("", response_model=EventListResponse)
@handle_k8s_errors(operation="list", resource_type="event")
async def list_events(
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)"),
    type_filter: Optional[str] = Query(None, alias="type", description="Filter by event type (Normal, Warning)"),
    kind_filter: Optional[str] = Query(None, alias="kind", description="Filter by involved object kind"),
    name_filter: Optional[str] = Query(None, alias="name", description="Filter by involved object name"),
    limit: Optional[int] = Query(500, description="Maximum number of events to return"),
    page: Optional[int] = Query(1, description="Page number for pagination (1-based)")
) -> EventListResponse:
    """
    List all Kubernetes events in a namespace with optional filtering.

    Args:
        namespace: The namespace to list events from
        type_filter: Filter by event type (Normal, Warning)
        kind_filter: Filter by involved object kind (Agent, Team, Query, etc.)
        name_filter: Filter by involved object name
        limit: Maximum number of events to return (default: 500)
        page: Page number for pagination (1-based, default: 1)

    Returns:
        EventListResponse: List of events in the namespace
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    async with ApiClient() as api_client:
        v1 = client.CoreV1Api(api_client)
        
        try:
            page_num = page or 1
            limit_num = limit or 200
                        
            events = await v1.list_namespaced_event(namespace=namespace)
                        
            filtered_events = []
            for event in events.items:
                event_dict = event.to_dict()
                
                if _should_include_event(event_dict, type_filter, kind_filter, name_filter):
                    filtered_events.append(event_to_response(event_dict))
                        
            filtered_events.sort(key=lambda x: x.creation_timestamp, reverse=True)
            
            paginated_events, total_count = _paginate_events(filtered_events, page_num, limit_num)
                        
            return EventListResponse(
                items=paginated_events,
                total=total_count
            )
            
        except ApiException as e:
            logger.error(f"Failed to list events: {e}")
            raise


@router.get("/{event_name}", response_model=EventResponse)
@handle_k8s_errors(operation="get", resource_type="event")
async def get_event(
    event_name: str,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> EventResponse:
    """
    Get a specific Kubernetes event by name.

    Args:
        namespace: The namespace containing the event
        event_name: The name of the event to retrieve

    Returns:
        EventResponse: The requested event details
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    async with ApiClient() as api_client:
        v1 = client.CoreV1Api(api_client)
        
        try:
            # Get the specific event
            event = await v1.read_namespaced_event(
                name=event_name,
                namespace=namespace
            )
            
            # Convert to dict and then to response
            event_dict = event.to_dict()
            return event_to_response(event_dict)
            
        except ApiException as e:
            logger.error(f"Failed to get event {event_name}: {e}")
            raise
