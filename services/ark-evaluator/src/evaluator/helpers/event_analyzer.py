import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from kubernetes import client, config
from kubernetes.client.rest import ApiException

from .types import (
    EventScope, EventType, Component, ParsedEvent, EventFilter, EventMetadata
)

logger = logging.getLogger(__name__)


class EventAnalyzer:
    """
    Core event analysis class that fetches and processes Kubernetes events
    for AI evaluation tasks. Provides semantic filtering and metadata parsing.
    """
    
    def __init__(self, namespace: str, query_name: str = None, session_id: str = None):
        """
        Initialize EventAnalyzer with context information.
        
        Args:
            namespace: Kubernetes namespace to search in
            query_name: Name of the query for scoped event filtering
            session_id: Session ID for scoped event filtering
        """
        self.namespace = namespace
        self.query_name = query_name
        self.session_id = session_id
        self.k8s_client = self._initialize_k8s_client()
        
    def _initialize_k8s_client(self) -> Optional[client.CoreV1Api]:
        """Initialize Kubernetes client with appropriate configuration"""
        try:
            config.load_incluster_config()
            logger.info("Loaded in-cluster Kubernetes configuration")
        except:
            try:
                config.load_kube_config()
                logger.info("Loaded local Kubernetes configuration")
            except Exception as e:
                logger.warning(f"Could not load Kubernetes config: {e}")
                return None
        
        return client.CoreV1Api()
    
    async def get_events(
        self,
        scope: EventScope = EventScope.CURRENT,
        event_filter: Optional[EventFilter] = None,
        limit: Optional[int] = None
    ) -> List[ParsedEvent]:
        """
        Fetch events based on scope and filtering criteria.
        
        Args:
            scope: Event scoping level (current, session, query, all)
            event_filter: Additional filtering criteria
            limit: Maximum number of events to return
            
        Returns:
            List of parsed events matching the criteria
        """
        if not self.k8s_client:
            logger.warning("Kubernetes client not available")
            return []
        
        field_selector = self._build_field_selector(scope)
        raw_events = await self._fetch_k8s_events(field_selector)
        
        # Parse and filter events
        parsed_events = []
        for event_dict in raw_events:
            parsed_event = ParsedEvent.from_k8s_event(event_dict)
            
            # Apply scope-based filtering
            if not self._matches_scope(parsed_event, scope):
                continue
                
            # Apply additional filtering
            if event_filter and not self._matches_filter(parsed_event, event_filter):
                continue
                
            parsed_events.append(parsed_event)
        
        # Sort by timestamp (newest first)
        parsed_events.sort(
            key=lambda e: e.last_timestamp or e.first_timestamp or "",
            reverse=True
        )
        
        # Apply limit
        if limit:
            parsed_events = parsed_events[:limit]
            
        logger.info(f"Returned {len(parsed_events)} events for scope {scope}")
        return parsed_events
    
    def _build_field_selector(self, scope: EventScope) -> Optional[str]:
        """Build Kubernetes field selector based on scope"""
        if scope == EventScope.ALL:
            return None
        elif scope in [EventScope.CURRENT, EventScope.SESSION, EventScope.QUERY]:
            if self.query_name:
                return f"involvedObject.name={self.query_name},involvedObject.kind=Query"
        return None
    
    async def _fetch_k8s_events(self, field_selector: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch raw Kubernetes events"""
        try:
            events = self.k8s_client.list_namespaced_event(
                namespace=self.namespace,
                field_selector=field_selector
            )
            return [self._event_to_dict(event) for event in events.items]
        except ApiException as e:
            logger.error(f"Failed to fetch Kubernetes events: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error fetching events: {e}")
            return []
    
    def _event_to_dict(self, event) -> Dict[str, Any]:
        """Convert Kubernetes event to dictionary"""
        message = event.message or ""

        # Check for structured event data in annotations (new eventing system)
        if event.metadata and event.metadata.annotations:
            event_data_json = event.metadata.annotations.get("ark.mckinsey.com/event-data")
            if event_data_json:
                # Replace message with the structured JSON data
                message = event_data_json

        return {
            "name": event.metadata.name if event.metadata else "",
            "namespace": event.metadata.namespace if event.metadata else "",
            "reason": event.reason or "",
            "message": message,
            "firstTimestamp": event.first_timestamp.isoformat() if event.first_timestamp else "",
            "lastTimestamp": event.last_timestamp.isoformat() if event.last_timestamp else "",
            "count": event.count or 1,
            "type": event.type or "",
            "involvedObject": {
                "kind": event.involved_object.kind if event.involved_object else "",
                "name": event.involved_object.name if event.involved_object else "",
                "namespace": event.involved_object.namespace if event.involved_object else ""
            }
        }
    
    def _matches_scope(self, event: ParsedEvent, scope: EventScope) -> bool:
        """Check if event matches the specified scope"""
        if scope == EventScope.ALL:
            return True
        elif scope == EventScope.QUERY:
            return True  # Already filtered by field selector
        elif scope == EventScope.SESSION:
            if self.session_id and event.metadata:
                return event.metadata.sessionId == self.session_id
            return True  # If no session context, include all
        elif scope == EventScope.CURRENT:
            if self.session_id and event.metadata:
                return event.metadata.sessionId == self.session_id
            return True  # Default behavior
        return True
    
    def _matches_filter(self, event: ParsedEvent, event_filter: EventFilter) -> bool:
        """Check if event matches additional filtering criteria"""
        # Filter by event types
        if event_filter.event_types:
            if not any(event.reason == et.value for et in event_filter.event_types):
                return False
        
        # Filter by components
        if event_filter.components and event.metadata:
            if not any(event.metadata.component == comp.value for comp in event_filter.components):
                return False
        
        # Filter by agent names
        if event_filter.agent_names and event.metadata:
            if event.metadata.agentName not in event_filter.agent_names:
                return False
        
        # Filter by tool names
        if event_filter.tool_names and event.metadata:
            if event.metadata.toolName not in event_filter.tool_names:
                return False
        
        # Filter by session IDs
        if event_filter.session_ids and event.metadata:
            if event.metadata.sessionId not in event_filter.session_ids:
                return False
        
        # Filter by query IDs
        if event_filter.query_ids and event.metadata:
            if event.metadata.queryId not in event_filter.query_ids:
                return False
        
        # Filter by error presence
        if event_filter.has_errors is not None:
            has_error = bool(event.metadata and event.metadata.error)
            if has_error != event_filter.has_errors:
                return False
        
        # Filter by duration
        if event.metadata and event.metadata.duration:
            try:
                duration = self._parse_duration(event.metadata.duration)
                if event_filter.min_duration and duration < event_filter.min_duration:
                    return False
                if event_filter.max_duration and duration > event_filter.max_duration:
                    return False
            except ValueError:
                pass  # Skip duration filtering if can't parse
        
        return True
    
    def _parse_duration(self, duration_str: str) -> float:
        """Parse duration string (e.g., '1.234s') to float seconds"""
        if duration_str.endswith('s'):
            return float(duration_str[:-1])
        elif duration_str.endswith('ms'):
            return float(duration_str[:-2]) / 1000.0
        else:
            return float(duration_str)
    
    # Convenience methods for common queries
    
    async def get_tool_events(
        self,
        tool_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """Get all tool-related events"""
        event_filter = EventFilter(
            event_types=[EventType.TOOL_CALL_START, EventType.TOOL_CALL_COMPLETE, EventType.TOOL_CALL_ERROR],
            tool_names=[tool_name] if tool_name else None
        )
        return await self.get_events(scope=scope, event_filter=event_filter)
    
    async def get_agent_events(
        self,
        agent_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """Get all agent-related events"""
        event_filter = EventFilter(
            event_types=[EventType.AGENT_EXECUTION_START, EventType.AGENT_EXECUTION_COMPLETE, EventType.AGENT_EXECUTION_ERROR],
            agent_names=[agent_name] if agent_name else None
        )
        return await self.get_events(scope=scope, event_filter=event_filter)
    
    async def get_team_events(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """Get all team-related events"""
        event_filter = EventFilter(
            event_types=[EventType.TEAM_EXECUTION_START, EventType.TEAM_EXECUTION_COMPLETE, EventType.TEAM_MEMBER],
            # Note: team_name would go in a team_names field if we add it to EventFilter
        )
        return await self.get_events(scope=scope, event_filter=event_filter)
    
    async def get_llm_events(
        self,
        model_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """Get all LLM-related events"""
        event_filter = EventFilter(
            event_types=[EventType.LLM_CALL_START, EventType.LLM_CALL_COMPLETE],
            # Note: model filtering would need additional fields in EventFilter
        )
        return await self.get_events(scope=scope, event_filter=event_filter)
    
    async def get_error_events(self, scope: EventScope = EventScope.CURRENT) -> List[ParsedEvent]:
        """Get all error events"""
        event_filter = EventFilter(has_errors=True)
        return await self.get_events(scope=scope, event_filter=event_filter)
    
    async def count_events_by_type(self, scope: EventScope = EventScope.CURRENT) -> Dict[str, int]:
        """Count events by type/reason"""
        events = await self.get_events(scope=scope)
        counts = {}
        for event in events:
            counts[event.reason] = counts.get(event.reason, 0) + 1
        return counts