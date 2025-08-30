from typing import Dict, List, Any, Optional, Union
from enum import Enum
from pydantic import BaseModel


class EventScope(str, Enum):
    """Event scoping levels for filtering events"""
    CURRENT = "current"    # Default: current query/session context
    SESSION = "session"    # All events within the same session
    QUERY = "query"        # All events for the specific query
    ALL = "all"           # All events in namespace


class EventType(str, Enum):
    """Common event types in the ARK system"""
    # Query Events
    RESOLVE_START = "ResolveStart"
    RESOLVE_COMPLETE = "ResolveComplete"
    RESOLVE_ERROR = "ResolveError"
    
    # Agent Events
    AGENT_EXECUTION_START = "AgentExecutionStart"
    AGENT_EXECUTION_COMPLETE = "AgentExecutionComplete"
    AGENT_EXECUTION_ERROR = "AgentExecutionError"
    
    # Tool Events
    TOOL_CALL_START = "ToolCallStart"
    TOOL_CALL_COMPLETE = "ToolCallComplete"
    TOOL_CALL_ERROR = "ToolCallError"
    
    # Team Events
    TEAM_EXECUTION_START = "TeamExecutionStart"
    TEAM_EXECUTION_COMPLETE = "TeamExecutionComplete"
    TEAM_MEMBER = "TeamMember"
    
    # LLM Events
    LLM_CALL_START = "LLMCallStart"
    LLM_CALL_COMPLETE = "LLMCallComplete"
    
    # Other Events
    A2A_CALL = "A2ACall"


class Component(str, Enum):
    """System components that generate events"""
    QUERY = "query"
    AGENT = "agent"
    TEAM = "team"
    TOOL = "tool"
    LLM = "llm"
    MODEL = "model"


class EventMetadata(BaseModel):
    """Structured metadata from event messages"""
    queryId: Optional[str] = None
    sessionId: Optional[str] = None
    agentName: Optional[str] = None
    teamName: Optional[str] = None
    toolName: Optional[str] = None
    modelName: Optional[str] = None
    component: Optional[str] = None
    duration: Optional[str] = None
    error: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    additionalContext: Optional[Dict[str, Any]] = None


class ParsedEvent(BaseModel):
    """Parsed Kubernetes event with structured metadata"""
    name: str
    namespace: str
    reason: str
    message: str
    first_timestamp: Optional[str] = None
    last_timestamp: Optional[str] = None
    count: int = 1
    type: str = "Normal"
    involved_object: Dict[str, str]
    metadata: Optional[EventMetadata] = None
    
    @classmethod
    def from_k8s_event(cls, event_dict: Dict[str, Any]) -> "ParsedEvent":
        """Create ParsedEvent from Kubernetes event dictionary"""
        # Try to parse JSON metadata from message
        metadata = None
        try:
            import json
            message_data = json.loads(event_dict.get('message', '{}'))
            if isinstance(message_data, dict) and 'Metadata' in message_data:
                metadata_dict = message_data.get('Metadata', {})
                metadata = EventMetadata(**metadata_dict)
        except (json.JSONDecodeError, TypeError, ValueError):
            # Message is not JSON or doesn't contain expected metadata
            pass
        
        return cls(
            name=event_dict.get('name', ''),
            namespace=event_dict.get('namespace', ''),
            reason=event_dict.get('reason', ''),
            message=event_dict.get('message', ''),
            first_timestamp=event_dict.get('firstTimestamp'),
            last_timestamp=event_dict.get('lastTimestamp'),
            count=event_dict.get('count', 1),
            type=event_dict.get('type', 'Normal'),
            involved_object=event_dict.get('involvedObject', {}),
            metadata=metadata
        )


class EventFilter(BaseModel):
    """Filter criteria for event queries"""
    event_types: Optional[List[EventType]] = None
    components: Optional[List[Component]] = None
    agent_names: Optional[List[str]] = None
    tool_names: Optional[List[str]] = None
    session_ids: Optional[List[str]] = None
    query_ids: Optional[List[str]] = None
    has_errors: Optional[bool] = None
    min_duration: Optional[float] = None
    max_duration: Optional[float] = None
    time_range: Optional[tuple[str, str]] = None