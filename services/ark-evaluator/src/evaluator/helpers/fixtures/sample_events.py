"""
Sample Kubernetes events for testing helper classes
"""

from datetime import datetime, timedelta

# Base timestamp for event sequence
BASE_TIME = datetime(2024, 1, 15, 10, 0, 0)

SAMPLE_EVENTS = [
    # Query resolution start
    {
        "name": "query-1-resolve-start",
        "namespace": "default",
        "reason": "ResolveStart",
        "message": '{"Metadata": {"queryId": "query-123", "sessionId": "session-456", "component": "query"}}',
        "firstTimestamp": (BASE_TIME).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "test-query",
            "namespace": "default"
        }
    },
    
    # Agent execution start
    {
        "name": "query-1-agent-start",
        "namespace": "default", 
        "reason": "AgentExecutionStart",
        "message": '{"Metadata": {"queryId": "query-123", "sessionId": "session-456", "component": "agent", "agentName": "web-agent"}}',
        "firstTimestamp": (BASE_TIME + timedelta(seconds=1)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(seconds=1)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "test-query",
            "namespace": "default"
        }
    },
    
    # Tool call start
    {
        "name": "query-1-tool-start",
        "namespace": "default",
        "reason": "ToolCallStart", 
        "message": '{"Metadata": {"queryId": "query-123", "sessionId": "session-456", "component": "tool", "toolName": "web-search", "agentName": "web-agent"}}',
        "firstTimestamp": (BASE_TIME + timedelta(seconds=2)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(seconds=2)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "test-query",
            "namespace": "default"
        }
    },
    
    # LLM call start
    {
        "name": "query-1-llm-start",
        "namespace": "default",
        "reason": "LLMCallStart",
        "message": '{"Metadata": {"queryId": "query-123", "sessionId": "session-456", "component": "llm", "modelName": "gpt-4", "agentName": "web-agent"}}',
        "firstTimestamp": (BASE_TIME + timedelta(seconds=3)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(seconds=3)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "test-query",
            "namespace": "default"
        }
    },
    
    # LLM call complete
    {
        "name": "query-1-llm-complete",
        "namespace": "default",
        "reason": "LLMCallComplete",
        "message": '{"Metadata": {"queryId": "query-123", "sessionId": "session-456", "component": "llm", "modelName": "gpt-4", "agentName": "web-agent", "duration": "2.5s"}}',
        "firstTimestamp": (BASE_TIME + timedelta(seconds=5, milliseconds=500)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(seconds=5, milliseconds=500)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "test-query",
            "namespace": "default"
        }
    },
    
    # Tool call complete
    {
        "name": "query-1-tool-complete",
        "namespace": "default",
        "reason": "ToolCallComplete",
        "message": '{"Metadata": {"queryId": "query-123", "sessionId": "session-456", "component": "tool", "toolName": "web-search", "agentName": "web-agent", "duration": "1.2s"}}',
        "firstTimestamp": (BASE_TIME + timedelta(seconds=6)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(seconds=6)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "test-query",
            "namespace": "default"
        }
    },
    
    # Second tool call
    {
        "name": "query-1-tool2-start",
        "namespace": "default",
        "reason": "ToolCallStart",
        "message": '{"Metadata": {"queryId": "query-123", "sessionId": "session-456", "component": "tool", "toolName": "file-reader", "agentName": "web-agent"}}',
        "firstTimestamp": (BASE_TIME + timedelta(seconds=7)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(seconds=7)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "test-query",
            "namespace": "default"
        }
    },
    
    # Second tool call complete
    {
        "name": "query-1-tool2-complete",
        "namespace": "default",
        "reason": "ToolCallComplete",
        "message": '{"Metadata": {"queryId": "query-123", "sessionId": "session-456", "component": "tool", "toolName": "file-reader", "agentName": "web-agent", "duration": "0.8s"}}',
        "firstTimestamp": (BASE_TIME + timedelta(seconds=8)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(seconds=8)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "test-query",
            "namespace": "default"
        }
    },
    
    # Agent execution complete
    {
        "name": "query-1-agent-complete",
        "namespace": "default",
        "reason": "AgentExecutionComplete",
        "message": '{"Metadata": {"queryId": "query-123", "sessionId": "session-456", "component": "agent", "agentName": "web-agent", "duration": "8.5s"}}',
        "firstTimestamp": (BASE_TIME + timedelta(seconds=9, milliseconds=500)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(seconds=9, milliseconds=500)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "test-query",
            "namespace": "default"
        }
    },
    
    # Query resolution complete
    {
        "name": "query-1-resolve-complete",
        "namespace": "default",
        "reason": "ResolveComplete",
        "message": '{"Metadata": {"queryId": "query-123", "sessionId": "session-456", "component": "query", "duration": "10.0s"}}',
        "firstTimestamp": (BASE_TIME + timedelta(seconds=10)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(seconds=10)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "test-query",
            "namespace": "default"
        }
    }
]

# Error scenario events
SAMPLE_ERROR_EVENTS = [
    # Query start
    {
        "name": "query-2-resolve-start",
        "namespace": "default",
        "reason": "ResolveStart", 
        "message": '{"Metadata": {"queryId": "query-456", "sessionId": "session-789", "component": "query"}}',
        "firstTimestamp": (BASE_TIME + timedelta(minutes=1)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(minutes=1)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "error-query",
            "namespace": "default"
        }
    },
    
    # Agent start
    {
        "name": "query-2-agent-start",
        "namespace": "default",
        "reason": "AgentExecutionStart",
        "message": '{"Metadata": {"queryId": "query-456", "sessionId": "session-789", "component": "agent", "agentName": "failing-agent"}}',
        "firstTimestamp": (BASE_TIME + timedelta(minutes=1, seconds=1)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(minutes=1, seconds=1)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "error-query",
            "namespace": "default"
        }
    },
    
    # Tool error
    {
        "name": "query-2-tool-error",
        "namespace": "default",
        "reason": "ToolCallError",
        "message": '{"Metadata": {"queryId": "query-456", "sessionId": "session-789", "component": "tool", "toolName": "broken-tool", "agentName": "failing-agent", "error": "Connection timeout"}}',
        "firstTimestamp": (BASE_TIME + timedelta(minutes=1, seconds=5)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(minutes=1, seconds=5)).isoformat() + "Z",
        "count": 1,
        "type": "Warning",
        "involvedObject": {
            "kind": "Query",
            "name": "error-query",
            "namespace": "default"
        }
    },
    
    # Agent error
    {
        "name": "query-2-agent-error",
        "namespace": "default",
        "reason": "AgentExecutionError",
        "message": '{"Metadata": {"queryId": "query-456", "sessionId": "session-789", "component": "agent", "agentName": "failing-agent", "error": "Tool execution failed"}}',
        "firstTimestamp": (BASE_TIME + timedelta(minutes=1, seconds=6)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(minutes=1, seconds=6)).isoformat() + "Z",
        "count": 1,
        "type": "Warning", 
        "involvedObject": {
            "kind": "Query",
            "name": "error-query",
            "namespace": "default"
        }
    },
    
    # Query error
    {
        "name": "query-2-resolve-error",
        "namespace": "default",
        "reason": "ResolveError",
        "message": '{"Metadata": {"queryId": "query-456", "sessionId": "session-789", "component": "query", "error": "Agent execution failed"}}',
        "firstTimestamp": (BASE_TIME + timedelta(minutes=1, seconds=7)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(minutes=1, seconds=7)).isoformat() + "Z",
        "count": 1,
        "type": "Warning",
        "involvedObject": {
            "kind": "Query",
            "name": "error-query", 
            "namespace": "default"
        }
    }
]

# Team execution events
SAMPLE_TEAM_EVENTS = [
    # Team execution start
    {
        "name": "query-3-team-start",
        "namespace": "default",
        "reason": "TeamExecutionStart",
        "message": '{"Metadata": {"queryId": "query-789", "sessionId": "session-999", "component": "team", "teamName": "research-team"}}',
        "firstTimestamp": (BASE_TIME + timedelta(minutes=2)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(minutes=2)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "team-query",
            "namespace": "default"
        }
    },
    
    # First team member
    {
        "name": "query-3-member1",
        "namespace": "default",
        "reason": "TeamMember",
        "message": '{"Metadata": {"queryId": "query-789", "sessionId": "session-999", "component": "team", "teamName": "research-team", "agentName": "researcher-1"}}',
        "firstTimestamp": (BASE_TIME + timedelta(minutes=2, seconds=1)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(minutes=2, seconds=1)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "team-query",
            "namespace": "default"
        }
    },
    
    # Second team member (parallel execution)
    {
        "name": "query-3-member2",
        "namespace": "default",
        "reason": "TeamMember",
        "message": '{"Metadata": {"queryId": "query-789", "sessionId": "session-999", "component": "team", "teamName": "research-team", "agentName": "researcher-2"}}',
        "firstTimestamp": (BASE_TIME + timedelta(minutes=2, seconds=1)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(minutes=2, seconds=1)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "team-query",
            "namespace": "default"
        }
    },
    
    # Team execution complete
    {
        "name": "query-3-team-complete",
        "namespace": "default",
        "reason": "TeamExecutionComplete",
        "message": '{"Metadata": {"queryId": "query-789", "sessionId": "session-999", "component": "team", "teamName": "research-team", "duration": "15.5s"}}',
        "firstTimestamp": (BASE_TIME + timedelta(minutes=2, seconds=15, milliseconds=500)).isoformat() + "Z",
        "lastTimestamp": (BASE_TIME + timedelta(minutes=2, seconds=15, milliseconds=500)).isoformat() + "Z",
        "count": 1,
        "type": "Normal",
        "involvedObject": {
            "kind": "Query",
            "name": "team-query",
            "namespace": "default"
        }
    }
]

# Combined sample events for comprehensive testing
ALL_SAMPLE_EVENTS = SAMPLE_EVENTS + SAMPLE_ERROR_EVENTS + SAMPLE_TEAM_EVENTS


def create_sample_events(
    query_id: str = "query-123",
    session_id: str = "session-456", 
    include_tools: bool = True,
    include_agents: bool = True,
    include_teams: bool = False,
    include_errors: bool = False,
    include_sequence: bool = True
):
    """
    Create sample events for testing with customizable parameters.
    
    Args:
        query_id: Query ID to use in events
        session_id: Session ID to use in events
        include_tools: Include tool call events
        include_agents: Include agent execution events
        include_teams: Include team execution events
        include_errors: Include error events
        include_sequence: Include full sequence events
        
    Returns:
        List of mock Kubernetes event objects
    """
    from unittest.mock import MagicMock
    import json
    
    events = []
    
    # Base event creation function
    def create_event(name, reason, message_data, timestamp_offset=0):
        return MagicMock(
            metadata=MagicMock(name=name, namespace="default"),
            reason=reason,
            message=json.dumps({"Metadata": message_data}),
            first_timestamp=MagicMock(
                isoformat=lambda: (BASE_TIME + timedelta(seconds=timestamp_offset)).isoformat() + "Z"
            ),
            last_timestamp=MagicMock(
                isoformat=lambda: (BASE_TIME + timedelta(seconds=timestamp_offset)).isoformat() + "Z"
            ),
            count=1,
            type="Normal",
            involved_object=MagicMock(kind="Query", name="test-query", namespace="default")
        )
    
    # Query resolution events
    if include_sequence:
        events.append(create_event(
            "resolve-start",
            "ResolveStart",
            {"queryId": query_id, "sessionId": session_id, "component": "query"},
            0
        ))
    
    # Agent execution events
    if include_agents:
        events.append(create_event(
            "agent-start",
            "AgentExecutionStart", 
            {"queryId": query_id, "sessionId": session_id, "component": "agent", "agentName": "researcher"},
            1
        ))
        
        events.append(create_event(
            "agent-complete",
            "AgentExecutionComplete",
            {"queryId": query_id, "sessionId": session_id, "component": "agent", "agentName": "researcher", "duration": 5.0},
            8
        ))
    
    # Tool call events
    if include_tools:
        events.append(create_event(
            "tool-start",
            "ToolCallStart",
            {"queryId": query_id, "sessionId": session_id, "component": "tool", "toolName": "search", "agentName": "researcher"},
            2
        ))
        
        events.append(create_event(
            "tool-complete", 
            "ToolCallComplete",
            {"queryId": query_id, "sessionId": session_id, "component": "tool", "toolName": "search", "agentName": "researcher", "duration": 1.5},
            4
        ))
    
    # Team execution events
    if include_teams:
        events.append(create_event(
            "team-start",
            "TeamExecutionStart",
            {"queryId": query_id, "sessionId": session_id, "component": "team", "teamName": "research-team"},
            1
        ))
        
        events.append(create_event(
            "team-complete",
            "TeamExecutionComplete", 
            {"queryId": query_id, "sessionId": session_id, "component": "team", "teamName": "research-team", "duration": 10.0},
            12
        ))
    
    # Error events
    if include_errors:
        events.append(create_event(
            "tool-error",
            "ToolCallError",
            {"queryId": query_id, "sessionId": session_id, "component": "tool", "toolName": "broken-tool", "error": "Connection failed"},
            5
        ))
    
    # Query completion
    if include_sequence:
        events.append(create_event(
            "resolve-complete",
            "ResolveComplete",
            {"queryId": query_id, "sessionId": session_id, "component": "query", "duration": 10.0},
            10
        ))
    
    return events